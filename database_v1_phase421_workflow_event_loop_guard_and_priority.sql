-- Phase 421: جلوگیری از حلقهٔ خودکار گردش‌کار و اولویت اجرای رویدادهای تازه
-- اجرای خودکار گردش‌کارها و اتوماسیون‌هایی را که در همان زنجیره قبلاً اجرا شده‌اند
-- دوباره اجرا نمی‌کند؛ سایر گردش‌کارهای مستقل همچنان رویداد را دریافت می‌کنند.

begin;

alter table public.workflow_event_queue
  add column if not exists priority smallint not null default 0,
  add column if not exists origin_execution_key text null;

alter table public.workflow_event_queue
  drop constraint if exists workflow_event_queue_priority_check;
alter table public.workflow_event_queue
  add constraint workflow_event_queue_priority_check check (priority between 0 and 100);

create index if not exists idx_workflow_event_queue_priority_pending
  on public.workflow_event_queue (priority desc, available_at asc, created_at asc)
  where status = 'pending';

-- با تأیید صریح کاربر، backlog موجود پیش از فعال شدن اولویت و محافظ حلقه اجرا
-- نمی‌شود؛ ارسال دیرهنگام پیام‌ها و actionهای قدیمی می‌تواند اثر نادرست داشته باشد.
-- eventهای جدید trigger جدید priority بالاتر می‌گیرند و تحت تأثیر این پاکسازی نیستند.
update public.workflow_event_queue
set
  status = 'failed',
  completed_at = now(),
  last_error = 'لغو کنترل‌شدهٔ رویداد معوق پیش از فعال‌سازی محافظ حلقه؛ برای جلوگیری از اجرای دیرهنگام دوباره اجرا نمی‌شود.'
where status in ('pending', 'processing')
  and priority = 0;

-- مسیر واحد update برای actionهای خودکار: اگر مقدار واقعی تغییر نکند، UPDATE و
-- در نتیجه event تازه‌ای ثبت نمی‌شود. در تغییر واقعی، کلید اجرای مبدأ در همان
-- transaction به trigger منتقل می‌شود.
create or replace function public.update_workflow_record(
  p_table_name text,
  p_org_id uuid,
  p_record_id uuid,
  p_patch jsonb,
  p_origin_execution_key text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_write_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_key text;
  v_value jsonb;
  v_set_clause text;
  v_has_business_change boolean := false;
  v_has_updated_at boolean := false;
  v_rows integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'دسترسی بروزرسانی خودکار وجود ندارد.' using errcode = '42501';
  end if;
  if p_table_name !~ '^[a-z][a-z0-9_]*$' or p_org_id is null or p_record_id is null then
    raise exception 'پارامتر بروزرسانی خودکار نامعتبر است.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_write_patch) <> 'object' or v_write_patch = '{}'::jsonb then
    raise exception 'فیلد قابل بروزرسانی ارسال نشده است.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = p_table_name and c.column_name = 'id'
  ) or not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = p_table_name and c.column_name = 'org_id'
  ) then
    raise exception 'ماژول مقصد برای بروزرسانی خودکار معتبر نیست.' using errcode = '22023';
  end if;

  for v_key, v_value in select key, value from jsonb_each(v_write_patch) loop
    if v_key in ('id', 'org_id', 'created_at') or not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = p_table_name and c.column_name = v_key
    ) then
      raise exception 'فیلد بروزرسانی خودکار معتبر نیست.' using errcode = '22023';
    end if;
  end loop;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1 and t.org_id = $2', p_table_name)
    into v_existing using p_record_id, p_org_id;
  if v_existing is null then
    raise exception 'رکورد مقصد در سازمان جاری پیدا نشد.' using errcode = 'P0002';
  end if;

  for v_key, v_value in select key, value from jsonb_each(v_write_patch) loop
    if v_key not in ('updated_at', 'updated_by')
       and (v_existing -> v_key) is distinct from v_value then
      v_has_business_change := true;
      exit;
    end if;
  end loop;
  if not v_has_business_change then
    return false;
  end if;

  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = p_table_name and c.column_name = 'updated_at'
  ) into v_has_updated_at;
  if v_has_updated_at then
    v_write_patch := v_write_patch || jsonb_build_object('updated_at', to_jsonb(now()));
  end if;

  select string_agg(format('%1$I = src.%1$I', key), ', ' order by key)
    into v_set_clause
  from jsonb_object_keys(v_write_patch) as key;
  if coalesce(v_set_clause, '') = '' then
    raise exception 'فیلد قابل بروزرسانی ارسال نشده است.' using errcode = '22023';
  end if;

  perform set_config('app.workflow_origin_execution_key', coalesce(nullif(trim(p_origin_execution_key), ''), ''), true);
  execute format(
    'update public.%I as t set %s from jsonb_populate_record(null::public.%I, $1) as src where t.id = $2 and t.org_id = $3',
    p_table_name, v_set_clause, p_table_name
  ) using v_write_patch, p_record_id, p_org_id;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.update_workflow_record(text, uuid, uuid, jsonb, text) from public, authenticated;
grant execute on function public.update_workflow_record(text, uuid, uuid, jsonb, text) to service_role;

create or replace function public.enqueue_workflow_event_from_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_previous jsonb;
  v_org_id uuid;
  v_origin_execution_key text;
begin
  if tg_op = 'INSERT' then
    v_row := to_jsonb(new);
    v_previous := null;
  else
    if (to_jsonb(new) - 'updated_at' - 'last_seen_at')
       is not distinct from (to_jsonb(old) - 'updated_at' - 'last_seen_at') then
      return new;
    end if;
    v_row := to_jsonb(new);
    v_previous := to_jsonb(old);
  end if;

  v_org_id := nullif(v_row ->> 'org_id', '')::uuid;
  if v_org_id is null or nullif(v_row ->> 'id', '') is null then
    return new;
  end if;
  if tg_table_name <> 'tasks' and not exists (
    select 1
    from public.workflows w
    cross join lateral unnest(array_prepend(coalesce(w.module_id, ''), coalesce(w.module_ids, '{}'::text[]))) module_ref(module_id)
    where w.org_id = v_org_id and w.is_active = true and w.trigger_type in ('on_create', 'on_upsert')
      and lower(regexp_replace(module_ref.module_id, '([a-z0-9])([A-Z])', '\1_\2', 'g')) = tg_table_name
    limit 1
  ) then
    return new;
  end if;

  v_origin_execution_key := nullif(current_setting('app.workflow_origin_execution_key', true), '');
  insert into public.workflow_event_queue (
    org_id, source_table, record_id, event_type, record_snapshot, previous_snapshot,
    actor_user_id, priority, origin_execution_key
  ) values (
    v_org_id, tg_table_name, (v_row ->> 'id')::uuid,
    case when tg_op = 'INSERT' then 'create' else 'upsert' end,
    v_row, v_previous, auth.uid(),
    case when v_origin_execution_key is null then 100 else 50 end,
    v_origin_execution_key
  );
  return new;
end;
$$;

commit;
