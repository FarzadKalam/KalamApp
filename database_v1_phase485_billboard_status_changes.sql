-- مدیریت tenant-safe درخواست‌های تغییر وضعیت تبلیغات محیطی.
-- هر تغییر فقط از مسیر توابع کنترل‌شده اعمال می‌شود تا سابقه و وضعیت جاری همواره هم‌راستا بمانند.

begin;

create table if not exists public.billboard_status_changes (
  id uuid primary key default gen_random_uuid()
);

alter table public.billboard_status_changes
  add column if not exists org_id uuid references public.organizations(id) on delete restrict default public.current_org_id(),
  add column if not exists system_code text,
  add column if not exists title text not null default '',
  add column if not exists billboard_id uuid not null references public.billboards(id) on delete restrict,
  add column if not exists source_status text not null default 'free',
  add column if not exists target_status text not null default 'free',
  add column if not exists request_status text not null default 'pending_approval',
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists block_reason text,
  add column if not exists description text,
  add column if not exists approval_note text,
  add column if not exists requested_by uuid references auth.users(id) on delete set null,
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists batch_id uuid,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists process_template_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists process_run_id uuid references public.process_runs(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.billboard_status_changes
set org_id = public.current_org_id()
where org_id is null and public.current_org_id() is not null;

alter table public.billboard_status_changes alter column org_id set not null;

create index if not exists idx_billboard_status_changes_org_billboard_created
  on public.billboard_status_changes(org_id, billboard_id, requested_at desc);
create index if not exists idx_billboard_status_changes_org_request_status
  on public.billboard_status_changes(org_id, request_status, requested_at desc);
create index if not exists idx_billboard_status_changes_org_batch
  on public.billboard_status_changes(org_id, batch_id) where batch_id is not null;
create index if not exists idx_billboard_status_changes_process_template
  on public.billboard_status_changes(org_id, process_template_id) where process_template_id is not null;

alter table public.billboard_status_changes enable row level security;
drop policy if exists billboard_status_changes_select_org on public.billboard_status_changes;
create policy billboard_status_changes_select_org
  on public.billboard_status_changes for select to authenticated
  using (org_id = public.current_org_id());

-- عملیات تغییر وضعیت هرگز با update مستقیم نباید قابل دورزدن باشد.
create or replace function public.guard_billboard_operational_status_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.billboard_status_change_authorized', true) = 'on' then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.related_customer is distinct from old.related_customer
     or new.related_invoice is distinct from old.related_invoice
     or new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date then
    raise exception 'تغییر وضعیت و اطلاعات رزرو تابلو فقط از طریق درخواست تغییر وضعیت مجاز است.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_billboard_operational_status_change on public.billboards;
create trigger trg_guard_billboard_operational_status_change
  before update on public.billboards
  for each row execute function public.guard_billboard_operational_status_change();

drop trigger if exists trg_billboard_status_changes_system_code_autogen on public.billboard_status_changes;
create trigger trg_billboard_status_changes_system_code_autogen
  before insert or update on public.billboard_status_changes
  for each row execute function public.assign_system_code_from_module_settings();

create or replace function public.can_manage_billboard_status_change(p_action text default 'request')
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_permissions jsonb := '{}'::jsonb;
  v_module_permission jsonb := '{}'::jsonb;
  v_fields jsonb := '{}'::jsonb;
  v_action text := lower(coalesce(trim(p_action), 'request'));
begin
  if auth.uid() is null or public.current_org_id() is null then return false; end if;
  select coalesce(role_row.permissions, '{}'::jsonb)
    into v_permissions
  from public.profiles profile_row
  left join public.org_roles role_row
    on role_row.id = profile_row.role_id and role_row.org_id = profile_row.org_id
  where profile_row.id = auth.uid() and profile_row.org_id = public.current_org_id()
  limit 1;
  v_module_permission := coalesce(v_permissions -> 'billboard_status_changes', '{}'::jsonb);
  v_fields := coalesce(v_module_permission -> 'fields', '{}'::jsonb);
  if coalesce((v_module_permission ->> 'view')::boolean, true) is false then return false; end if;
  if v_action = 'approve' then
    return coalesce((v_fields ->> '__action_approve_billboard_status_change')::boolean,
                    (v_module_permission ->> 'edit')::boolean, true);
  end if;
  return coalesce((v_module_permission ->> 'edit')::boolean, true);
end;
$$;

create or replace function public.request_billboard_status_change(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_billboard public.billboards%rowtype;
  v_id uuid;
  v_billboard_id uuid := nullif(trim(coalesce(p_input ->> 'billboard_id', '')), '')::uuid;
  v_target_status text := nullif(trim(coalesce(p_input ->> 'target_status', '')), '');
  v_customer_id uuid := nullif(trim(coalesce(p_input ->> 'customer_id', '')), '')::uuid;
  v_invoice_id uuid := nullif(trim(coalesce(p_input ->> 'invoice_id', '')), '')::uuid;
  v_template_id uuid := nullif(trim(coalesce(p_input ->> 'process_template_id', '')), '')::uuid;
  v_batch_id uuid := nullif(trim(coalesce(p_input ->> 'batch_id', '')), '')::uuid;
  v_template_snapshot jsonb := '{}'::jsonb;
  v_title text;
begin
  if v_org_id is null or auth.uid() is null then raise exception 'سازمان یا کاربر جاری معتبر نیست.'; end if;
  if not public.current_org_has_plan_feature('billboard_status_management', true) then raise exception 'قابلیت مدیریت تغییر وضعیت تابلوها در پلن سازمان فعال نیست.'; end if;
  if not public.can_manage_billboard_status_change('request') then raise exception 'اجازه ثبت درخواست تغییر وضعیت ندارید.'; end if;
  if v_target_status not in ('free','oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue','inactive','blocked') then raise exception 'وضعیت مقصد معتبر نیست.'; end if;
  if v_target_status = 'blocked' and nullif(trim(coalesce(p_input ->> 'block_reason', '')), '') is null then raise exception 'دلیل مسدودسازی الزامی است.'; end if;
  if v_target_status in ('oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue')
     and (v_customer_id is null or nullif(trim(coalesce(p_input ->> 'start_date', '')), '') is null or nullif(trim(coalesce(p_input ->> 'end_date', '')), '') is null) then
    raise exception 'برای این وضعیت، مشتری و بازه اکران الزامی است.';
  end if;
  select * into v_billboard from public.billboards where id = v_billboard_id and org_id = v_org_id for share;
  if not found then raise exception 'تابلوی انتخاب‌شده در سازمان جاری پیدا نشد.'; end if;
  if v_customer_id is not null and not exists (select 1 from public.customers where id = v_customer_id and org_id = v_org_id) then raise exception 'مشتری انتخاب‌شده معتبر نیست.'; end if;
  if v_invoice_id is not null and not exists (select 1 from public.invoices where id = v_invoice_id and org_id = v_org_id) then raise exception 'فاکتور انتخاب‌شده معتبر نیست.'; end if;
  if v_template_id is not null then
    if not exists (
      select 1 from public.process_templates
      where id = v_template_id
        and org_id = v_org_id
        and ('billboard_status_changes' = module_id or 'billboard_status_changes' = any(coalesce(module_ids, '{}'::text[])))
    ) then raise exception 'الگوی فرآیند انتخاب‌شده برای درخواست تغییر وضعیت تابلو سازگار نیست.'; end if;
    select jsonb_build_object('template', to_jsonb(template_row), 'stages', coalesce((select jsonb_agg(to_jsonb(stage_row) order by stage_row.sort_order) from public.process_template_stages stage_row where stage_row.template_id = template_row.id), '[]'::jsonb))
      into v_template_snapshot
    from public.process_templates template_row where template_row.id = v_template_id and template_row.org_id = v_org_id;
  end if;
  v_title := concat('تغییر وضعیت ', coalesce(nullif(trim(v_billboard.name), ''), 'تابلو'), ' به ', case v_target_status
    when 'free' then 'آزاد' when 'oral_reserve' then 'رزرو شفاهی' when 'final_reserve' then 'رزرو قطعی'
    when 'in_line' then 'در صف نصب' when 'opening' then 'در حال اکران' when 'near_finish' then 'نزدیک به اتمام'
    when 'opening_deadline_ended' then 'پایان مهلت اکران' when 'pickup_queue' then 'در صف جمع‌آوری'
    when 'inactive' then 'غیرفعال' when 'blocked' then 'مسدود' else v_target_status end);
  insert into public.billboard_status_changes (
    org_id, title, billboard_id, source_status, target_status, customer_id, invoice_id, start_date, end_date,
    block_reason, description, requested_by, batch_id, process_template_id, process_template_snapshot
  ) values (
    v_org_id, v_title, v_billboard.id, v_billboard.status, v_target_status, v_customer_id, v_invoice_id,
    nullif(trim(coalesce(p_input ->> 'start_date', '')), '')::date, nullif(trim(coalesce(p_input ->> 'end_date', '')), '')::date,
    nullif(trim(coalesce(p_input ->> 'block_reason', '')), ''), nullif(trim(coalesce(p_input ->> 'description', '')), ''), auth.uid(), v_batch_id, v_template_id, v_template_snapshot
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.request_billboard_status_changes_bulk(p_billboard_ids uuid[], p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_billboard_id uuid;
  v_batch_id uuid := gen_random_uuid();
  v_created_ids uuid[] := array[]::uuid[];
begin
  if coalesce(array_length(p_billboard_ids, 1), 0) = 0 then raise exception 'حداقل یک تابلو انتخاب کنید.'; end if;
  for v_billboard_id in select distinct unnest(p_billboard_ids) loop
    v_created_ids := array_append(v_created_ids, public.request_billboard_status_change(coalesce(p_input, '{}'::jsonb) || jsonb_build_object('billboard_id', v_billboard_id, 'batch_id', v_batch_id)));
  end loop;
  return jsonb_build_object('batch_id', v_batch_id, 'request_ids', to_jsonb(v_created_ids), 'created_count', coalesce(array_length(v_created_ids, 1), 0));
end;
$$;

-- اجرای فرآیند از snapshot درخواست ساخته می‌شود، نه از الگوی قابل‌ویرایش فعلی.
create or replace function public.create_billboard_status_change_process_run(p_change_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_change public.billboard_status_changes%rowtype;
  v_run_id uuid;
  v_template jsonb;
  v_stage jsonb;
  v_template_id uuid;
begin
  if v_org_id is null or auth.uid() is null then raise exception 'سازمان یا کاربر جاری معتبر نیست.'; end if;
  select * into v_change from public.billboard_status_changes where id = p_change_id and org_id = v_org_id for update;
  if not found then raise exception 'درخواست تغییر وضعیت پیدا نشد.'; end if;
  if v_change.process_run_id is not null then return v_change.process_run_id; end if;
  v_template := coalesce(v_change.process_template_snapshot -> 'template', '{}'::jsonb);
  if v_template = '{}'::jsonb then return null; end if;
  v_template_id := nullif(v_template ->> 'id', '')::uuid;
  insert into public.process_runs (
    org_id, template_id, module_id, record_id, process_name, status, copied_mode, started_at, created_by, updated_by
  ) values (
    v_org_id, case when exists (select 1 from public.process_templates where id = v_template_id and org_id = v_org_id) then v_template_id else null end, 'billboard_status_changes', v_change.id,
    coalesce(nullif(v_template ->> 'name', ''), 'فرآیند تغییر وضعیت تابلو'), 'active', 'auto', now(), auth.uid(), auth.uid()
  ) returning id into v_run_id;
  insert into public.process_run_links (org_id, process_run_id, module_id, record_id, is_primary)
  values (v_org_id, v_run_id, 'billboard_status_changes', v_change.id, true)
  on conflict (process_run_id, module_id, record_id) do update set org_id = excluded.org_id, is_primary = true;
  for v_stage in select value from jsonb_array_elements(coalesce(v_change.process_template_snapshot -> 'stages', '[]'::jsonb)) loop
    insert into public.process_run_stages (
      process_run_id, template_stage_id, stage_name, sort_order, status, assignee_user_id, assignee_role_id, wage,
      process_node_key, process_lane_key, metadata
    ) values (
      v_run_id,
      case when exists (select 1 from public.process_template_stages where id = nullif(v_stage ->> 'id', '')::uuid) then nullif(v_stage ->> 'id', '')::uuid else null end,
      coalesce(nullif(v_stage ->> 'stage_name', ''), 'مرحله بدون عنوان'),
      coalesce(nullif(v_stage ->> 'sort_order', '')::integer, 0),
      coalesce(nullif(v_stage ->> 'default_status', ''), 'pending'),
      nullif(v_stage ->> 'default_assignee_id', '')::uuid,
      nullif(v_stage ->> 'default_assignee_role_id', '')::uuid,
      coalesce(nullif(v_stage ->> 'wage', '')::numeric, 0),
      coalesce(nullif(v_stage ->> 'process_node_key', ''), nullif(v_stage -> 'metadata' ->> 'process_node_key', '')),
      coalesce(nullif(v_stage ->> 'process_lane_key', ''), nullif(v_stage -> 'metadata' ->> 'process_lane_key', ''), 'lane_1'),
      coalesce(v_stage -> 'metadata', '{}'::jsonb)
    );
  end loop;
  update public.billboard_status_changes set process_run_id = v_run_id where id = v_change.id;
  return v_run_id;
end;
$$;

create or replace function public.decide_billboard_status_change(p_change_id uuid, p_decision text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_change public.billboard_status_changes%rowtype;
  v_billboard public.billboards%rowtype;
  v_run_id uuid;
  v_initial_nodes text[];
begin
  if v_org_id is null or auth.uid() is null then raise exception 'سازمان یا کاربر جاری معتبر نیست.'; end if;
  if not public.current_org_has_plan_feature('billboard_status_management', true) then raise exception 'قابلیت مدیریت تغییر وضعیت تابلوها در پلن سازمان فعال نیست.'; end if;
  if not public.can_manage_billboard_status_change('approve') then raise exception 'اجازه تأیید تغییر وضعیت ندارید.'; end if;
  select * into v_change from public.billboard_status_changes where id = p_change_id and org_id = v_org_id for update;
  if not found then raise exception 'درخواست تغییر وضعیت پیدا نشد.'; end if;
  if v_change.request_status <> 'pending_approval' then raise exception 'این درخواست قبلاً تعیین تکلیف شده است.'; end if;
  if lower(trim(coalesce(p_decision, ''))) = 'reject' then
    if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'دلیل رد درخواست الزامی است.'; end if;
    update public.billboard_status_changes set request_status = 'rejected', approved_by = auth.uid(), approved_at = now(), approval_note = trim(p_note) where id = v_change.id;
    return v_change.id;
  end if;
  if lower(trim(coalesce(p_decision, ''))) <> 'approve' then raise exception 'تصمیم معتبر نیست.'; end if;
  select * into v_billboard from public.billboards where id = v_change.billboard_id and org_id = v_org_id for update;
  if not found then raise exception 'تابلوی مرتبط پیدا نشد.'; end if;
  if v_billboard.status is distinct from v_change.source_status then
    update public.billboard_status_changes set request_status = 'needs_review', approved_by = auth.uid(), approved_at = now(), approval_note = coalesce(nullif(trim(p_note), ''), 'وضعیت تابلو پس از ثبت درخواست تغییر کرده است.') where id = v_change.id;
    -- این تصمیم باید پایدار بماند؛ exception در این نقطه transaction را rollback می‌کند.
    return v_change.id;
  end if;
  perform set_config('app.billboard_status_change_authorized', 'on', true);
  update public.billboards set
    status = v_change.target_status,
    related_customer = case when v_change.target_status in ('oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue') then v_change.customer_id else null end,
    related_invoice = case when v_change.target_status in ('oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue') then v_change.invoice_id else null end,
    start_date = case when v_change.target_status in ('oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue') then v_change.start_date else null end,
    end_date = case when v_change.target_status in ('oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue') then v_change.end_date else null end,
    updated_by = auth.uid()
  where id = v_billboard.id and org_id = v_org_id;
  if jsonb_typeof(v_change.process_template_snapshot -> 'template') = 'object'
     and v_change.process_template_snapshot -> 'template' <> '{}'::jsonb then
    v_run_id := public.create_billboard_status_change_process_run(v_change.id);
    select array_agg(process_node_key) into v_initial_nodes from (
      select distinct on (coalesce(process_lane_key, 'lane_1')) process_node_key
      from public.process_run_stages
      where process_run_id = v_run_id
      order by coalesce(process_lane_key, 'lane_1'), sort_order asc
    ) initial_stages;
    if coalesce(array_length(v_initial_nodes, 1), 0) > 0 then
      perform public.activate_process_run_nodes(v_org_id, v_run_id, v_initial_nodes, auth.uid());
    end if;
  end if;
  update public.billboard_status_changes set request_status = 'approved', approved_by = auth.uid(), approved_at = now(), approval_note = nullif(trim(coalesce(p_note, '')), ''), process_run_id = v_run_id where id = v_change.id;
  return v_change.id;
end;
$$;

revoke all on function public.request_billboard_status_change(jsonb) from public;
revoke all on function public.request_billboard_status_changes_bulk(uuid[], jsonb) from public;
revoke all on function public.decide_billboard_status_change(uuid, text, text) from public;
revoke all on function public.create_billboard_status_change_process_run(uuid) from public;
revoke all on function public.can_manage_billboard_status_change(text) from public;
grant execute on function public.request_billboard_status_change(jsonb) to authenticated;
grant execute on function public.request_billboard_status_changes_bulk(uuid[], jsonb) to authenticated;
grant execute on function public.decide_billboard_status_change(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
