-- Phase 555: اعمال کنترل‌شدهٔ وضعیت یا برچسبِ تابلو و ثبت اجرای خودکار گردش‌کار
-- این تغییر، رفتار درخواست دستی را از اجرای خودکار گردش‌کار جدا نگه می‌دارد.

begin;

alter table public.billboard_status_changes
  add column if not exists application_mode text not null default 'main_status',
  add column if not exists execution_source text not null default 'manual',
  add column if not exists applied_tag_id uuid references public.tags(id) on delete set null;

alter table public.billboard_status_changes
  drop constraint if exists billboard_status_changes_application_mode_check;
alter table public.billboard_status_changes
  add constraint billboard_status_changes_application_mode_check
  check (application_mode in ('main_status', 'add_tag'));

alter table public.billboard_status_changes
  drop constraint if exists billboard_status_changes_execution_source_check;
alter table public.billboard_status_changes
  add constraint billboard_status_changes_execution_source_check
  check (execution_source in ('manual', 'workflow'));

create index if not exists idx_billboard_status_changes_org_application
  on public.billboard_status_changes(org_id, application_mode, requested_at desc);

create or replace function public.normalize_billboard_status_change_record()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_billboard_name text;
  v_action_title text;
begin
  select coalesce(nullif(trim(name), ''), 'تابلو')
    into v_billboard_name
  from public.billboards
  where id = new.billboard_id and org_id = new.org_id;

  new.application_mode := case
    when lower(trim(coalesce(new.application_mode, ''))) = 'add_tag' then 'add_tag'
    else 'main_status'
  end;
  new.execution_source := case
    when lower(trim(coalesce(new.execution_source, ''))) = 'workflow' then 'workflow'
    else 'manual'
  end;
  v_action_title := case when new.application_mode = 'add_tag' then 'افزودن برچسب' else 'تغییر وضعیت' end;
  new.title := concat(v_action_title, ' ', coalesce(v_billboard_name, 'تابلو'), ' به ', public.billboard_operational_status_label(new.target_status));
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, new.requested_by, auth.uid());
  end if;
  new.assignee_id := coalesce(new.assignee_id, new.created_by, new.requested_by, auth.uid());
  new.assignee_type := case when new.assignee_id is null then null else 'user' end;
  new.updated_by := coalesce(auth.uid(), new.updated_by, new.requested_by);
  return new;
end;
$$;

create or replace function public.apply_billboard_status_change(
  p_change_id uuid,
  p_org_id uuid,
  p_actor_user_id uuid,
  p_is_workflow boolean default false,
  p_approval_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change public.billboard_status_changes%rowtype;
  v_billboard public.billboards%rowtype;
  v_tag_id uuid;
  v_status_label text;
begin
  if p_change_id is null or p_org_id is null or p_actor_user_id is null then
    raise exception 'اطلاعات اعمال تغییر وضعیت کامل نیست.' using errcode = '22023';
  end if;
  if not public.org_has_plan_module(p_org_id, 'billboards', false) then
    raise exception 'ماژول تبلیغات محیطی برای این سازمان فعال نیست.' using errcode = '42501';
  end if;

  select * into v_change
  from public.billboard_status_changes
  where id = p_change_id and org_id = p_org_id
  for update;
  if not found then
    raise exception 'درخواست تغییر وضعیت در سازمان جاری پیدا نشد.' using errcode = 'P0002';
  end if;

  select * into v_billboard
  from public.billboards
  where id = v_change.billboard_id and org_id = p_org_id
  for update;
  if not found then
    raise exception 'تابلوی مرتبط در سازمان جاری پیدا نشد.' using errcode = 'P0002';
  end if;

  if v_change.application_mode = 'add_tag' then
    if v_change.target_status not in ('oral_reserve', 'final_reserve', 'in_line') then
      raise exception 'این وضعیت فقط باید به‌عنوان وضعیت اصلی تابلو اعمال شود.' using errcode = '22023';
    end if;
    v_status_label := public.billboard_operational_status_label(v_change.target_status);
    select id into v_tag_id
    from public.tags
    where org_id = p_org_id and lower(title) = lower(v_status_label)
    order by created_at asc
    limit 1;
    if v_tag_id is null then
      begin
        insert into public.tags (org_id, title, color, created_by)
        values (p_org_id, v_status_label, '#1677ff', p_actor_user_id)
        returning id into v_tag_id;
      exception when unique_violation then
        select id into v_tag_id
        from public.tags
        where org_id = p_org_id and lower(title) = lower(v_status_label)
        order by created_at asc
        limit 1;
      end;
    end if;
    if v_tag_id is null then
      raise exception 'برچسب وضعیت تابلو ایجاد نشد.' using errcode = 'P0001';
    end if;
    insert into public.record_tags (org_id, module_id, record_id, tag_id, created_by)
    values (p_org_id, 'billboards', v_billboard.id::text, v_tag_id, p_actor_user_id)
    on conflict (module_id, record_id, tag_id) do nothing;
  else
    perform set_config('app.billboard_status_change_authorized', 'on', true);
    update public.billboards
    set status = v_change.target_status,
        related_customer = case
          when v_change.target_status in ('free', 'inactive', 'blocked') then null
          else coalesce(v_change.customer_id, related_customer)
        end,
        related_invoice = case
          when v_change.target_status in ('free', 'inactive', 'blocked') then null
          else coalesce(v_change.invoice_id, related_invoice)
        end,
        marketing_lead_id = case
          when v_change.target_status in ('free', 'inactive', 'blocked') then null
          else coalesce(v_change.marketing_lead_id, marketing_lead_id)
        end,
        start_date = case
          when v_change.target_status in ('free', 'inactive', 'blocked') then null
          else coalesce(v_change.start_date, start_date)
        end,
        end_date = case
          when v_change.target_status in ('free', 'inactive', 'blocked') then null
          else coalesce(v_change.end_date, end_date)
        end,
        updated_by = p_actor_user_id
    where id = v_billboard.id and org_id = p_org_id;
  end if;

  update public.billboard_status_changes
  set request_status = 'approved',
      approved_by = p_actor_user_id,
      approved_at = now(),
      approval_note = coalesce(nullif(trim(p_approval_note), ''), case when p_is_workflow then 'به‌صورت خودکار توسط گردش‌کار اعمال شد.' else null end),
      applied_tag_id = case when v_change.application_mode = 'add_tag' then v_tag_id else null end,
      execution_source = case when p_is_workflow then 'workflow' else 'manual' end,
      updated_at = now(),
      updated_by = p_actor_user_id
  where id = v_change.id and org_id = p_org_id;

  return v_change.id;
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
  v_application_mode text := lower(coalesce(nullif(trim(p_input ->> 'application_mode'), ''), 'main_status'));
  v_customer_id uuid := nullif(trim(coalesce(p_input ->> 'customer_id', '')), '')::uuid;
  v_invoice_id uuid := nullif(trim(coalesce(p_input ->> 'invoice_id', '')), '')::uuid;
  v_lead_id uuid := nullif(trim(coalesce(p_input ->> 'marketing_lead_id', '')), '')::uuid;
  v_template_id uuid := nullif(trim(coalesce(p_input ->> 'process_template_id', '')), '')::uuid;
  v_batch_id uuid := nullif(trim(coalesce(p_input ->> 'batch_id', '')), '')::uuid;
  v_template_snapshot jsonb := '{}'::jsonb;
begin
  if v_org_id is null or auth.uid() is null then raise exception 'سازمان یا کاربر جاری معتبر نیست.'; end if;
  if not public.current_org_has_plan_module('billboards', false) then raise exception 'ماژول تبلیغات محیطی برای سازمان جاری فعال نیست.' using errcode = '42501'; end if;
  if not public.current_org_has_plan_feature('billboard_status_management', true) or not public.can_manage_billboard_status_change('request') then raise exception 'اجازه ثبت درخواست تغییر وضعیت ندارید.'; end if;
  if v_target_status not in ('free','oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue','inactive','blocked') then raise exception 'وضعیت مقصد معتبر نیست.'; end if;
  if v_application_mode not in ('main_status', 'add_tag') then raise exception 'نحوه اعمال وضعیت معتبر نیست.'; end if;
  if v_application_mode = 'add_tag' and v_target_status not in ('oral_reserve','final_reserve','in_line') then raise exception 'برای این وضعیت فقط تغییر وضعیت اصلی تابلو مجاز است.'; end if;
  if v_target_status = 'blocked' and nullif(trim(coalesce(p_input ->> 'block_reason', '')), '') is null then raise exception 'دلیل مسدودسازی الزامی است.'; end if;
  if v_target_status = 'opening' and (nullif(trim(coalesce(p_input ->> 'start_date', '')), '') is null or nullif(trim(coalesce(p_input ->> 'end_date', '')), '') is null) then raise exception 'برای وضعیت در حال اکران، تاریخ شروع و پایان اکران الزامی است.'; end if;
  select * into v_billboard from public.billboards where id = v_billboard_id and org_id = v_org_id for share;
  if not found then raise exception 'تابلوی انتخاب‌شده در سازمان جاری پیدا نشد.'; end if;
  if v_customer_id is not null and not exists (select 1 from public.customers where id = v_customer_id and org_id = v_org_id) then raise exception 'مشتری انتخاب‌شده معتبر نیست.'; end if;
  if v_invoice_id is not null and not exists (select 1 from public.invoices where id = v_invoice_id and org_id = v_org_id) then raise exception 'فاکتور انتخاب‌شده معتبر نیست.'; end if;
  if v_lead_id is not null and not exists (select 1 from public.marketing_leads where id = v_lead_id and org_id = v_org_id) then raise exception 'لید انتخاب‌شده معتبر نیست.'; end if;
  if v_template_id is not null then
    if not exists (select 1 from public.process_templates where id = v_template_id and org_id = v_org_id and ('billboard_status_changes' = module_id or 'billboard_status_changes' = any(coalesce(module_ids, '{}'::text[])))) then raise exception 'الگوی فرآیند انتخاب‌شده برای درخواست تغییر وضعیت تابلو سازگار نیست.'; end if;
    select jsonb_build_object('template', to_jsonb(t), 'stages', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.process_template_stages s where s.template_id = t.id), '[]'::jsonb)) into v_template_snapshot from public.process_templates t where t.id = v_template_id and t.org_id = v_org_id;
  end if;
  insert into public.billboard_status_changes (org_id, billboard_id, source_status, target_status, application_mode, customer_id, invoice_id, marketing_lead_id, start_date, end_date, block_reason, description, requested_by, batch_id, process_template_id, process_template_snapshot)
  values (v_org_id, v_billboard.id, v_billboard.status, v_target_status, v_application_mode, v_customer_id, v_invoice_id, v_lead_id, nullif(trim(coalesce(p_input ->> 'start_date', '')), '')::date, nullif(trim(coalesce(p_input ->> 'end_date', '')), '')::date, nullif(trim(coalesce(p_input ->> 'block_reason', '')), ''), nullif(trim(coalesce(p_input ->> 'description', '')), ''), auth.uid(), v_batch_id, v_template_id, v_template_snapshot)
  returning id into v_id;
  return v_id;
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
  v_run_id uuid;
  v_initial_nodes text[];
begin
  if v_org_id is null or auth.uid() is null then raise exception 'سازمان یا کاربر جاری معتبر نیست.'; end if;
  if not public.current_org_has_plan_module('billboards', false) then raise exception 'ماژول تبلیغات محیطی برای سازمان جاری فعال نیست.' using errcode = '42501'; end if;
  if not public.current_org_has_plan_feature('billboard_status_management', true) or not public.can_manage_billboard_status_change('approve') then raise exception 'اجازه تأیید تغییر وضعیت ندارید.'; end if;
  select * into v_change from public.billboard_status_changes where id = p_change_id and org_id = v_org_id for update;
  if not found then raise exception 'درخواست تغییر وضعیت پیدا نشد.'; end if;
  if v_change.request_status <> 'pending_approval' then raise exception 'این درخواست قبلاً تعیین تکلیف شده است.'; end if;
  if lower(trim(coalesce(p_decision, ''))) = 'reject' then
    if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'دلیل رد درخواست الزامی است.'; end if;
    update public.billboard_status_changes set request_status = 'rejected', approved_by = auth.uid(), approved_at = now(), approval_note = trim(p_note), updated_at = now(), updated_by = auth.uid() where id = v_change.id and org_id = v_org_id;
    return v_change.id;
  end if;
  if lower(trim(coalesce(p_decision, ''))) <> 'approve' then raise exception 'تصمیم معتبر نیست.'; end if;
  if v_change.application_mode = 'main_status' and exists (select 1 from public.billboards where id = v_change.billboard_id and org_id = v_org_id and status is distinct from v_change.source_status) then
    update public.billboard_status_changes set request_status = 'needs_review', approved_by = auth.uid(), approved_at = now(), approval_note = coalesce(nullif(trim(p_note), ''), 'وضعیت تابلو پس از ثبت درخواست تغییر کرده است.'), updated_at = now(), updated_by = auth.uid() where id = v_change.id and org_id = v_org_id;
    return v_change.id;
  end if;
  perform public.apply_billboard_status_change(v_change.id, v_org_id, auth.uid(), false, p_note);
  if jsonb_typeof(v_change.process_template_snapshot -> 'template') = 'object' and v_change.process_template_snapshot -> 'template' <> '{}'::jsonb then
    v_run_id := public.create_billboard_status_change_process_run(v_change.id);
    select array_agg(process_node_key) into v_initial_nodes from (select distinct on (coalesce(process_lane_key, 'lane_1')) process_node_key from public.process_run_stages where process_run_id = v_run_id order by coalesce(process_lane_key, 'lane_1'), sort_order asc) x;
    if coalesce(array_length(v_initial_nodes, 1), 0) > 0 then perform public.activate_process_run_nodes(v_org_id, v_run_id, v_initial_nodes, auth.uid()); end if;
    update public.billboard_status_changes set process_run_id = v_run_id where id = v_change.id and org_id = v_org_id;
  end if;
  return v_change.id;
end;
$$;

create or replace function public.workflow_create_billboard_status_change(p_org_id uuid, p_actor_user_id uuid, p_input jsonb, p_origin_execution_key text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_input jsonb := coalesce(p_input, '{}'::jsonb);
  v_billboard public.billboards%rowtype;
  v_billboard_id uuid := nullif(trim(coalesce(v_input ->> 'billboard_id', '')), '')::uuid;
  v_status text := nullif(trim(coalesce(v_input ->> 'target_status', '')), '');
  v_mode text := lower(coalesce(nullif(trim(v_input ->> 'application_mode'), ''), 'main_status'));
  v_customer_id uuid := nullif(trim(coalesce(v_input ->> 'customer_id', '')), '')::uuid;
  v_invoice_id uuid := nullif(trim(coalesce(v_input ->> 'invoice_id', '')), '')::uuid;
  v_lead_id uuid := nullif(trim(coalesce(v_input ->> 'marketing_lead_id', '')), '')::uuid;
  v_template_id uuid := nullif(trim(coalesce(v_input ->> 'process_template_id', '')), '')::uuid;
  v_template_snapshot jsonb := '{}'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'دسترسی ثبت خودکار تغییر وضعیت تابلو وجود ندارد.' using errcode = '42501'; end if;
  if p_org_id is null or p_actor_user_id is null or jsonb_typeof(v_input) <> 'object' then raise exception 'اطلاعات ثبت خودکار تغییر وضعیت تابلو کامل نیست.' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_actor_user_id and org_id = p_org_id)
     or not public.org_has_plan_module(p_org_id, 'billboards', false)
     or not public.org_has_plan_feature(p_org_id, 'billboard_status_management', true) then raise exception 'دسترسی سازمانی معتبر برای ثبت تغییر وضعیت وجود ندارد.' using errcode = '42501'; end if;
  if v_status not in ('free','oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue','inactive','blocked') then raise exception 'وضعیت مقصد معتبر نیست.' using errcode = '22023'; end if;
  if v_mode not in ('main_status', 'add_tag') or (v_mode = 'add_tag' and v_status not in ('oral_reserve','final_reserve','in_line')) then raise exception 'نحوه اعمال وضعیت معتبر نیست.' using errcode = '22023'; end if;
  if v_status = 'opening' and (nullif(trim(coalesce(v_input ->> 'start_date', '')), '') is null or nullif(trim(coalesce(v_input ->> 'end_date', '')), '') is null) then raise exception 'برای وضعیت در حال اکران، تاریخ شروع و پایان اکران الزامی است.' using errcode = '22023'; end if;
  select * into v_billboard from public.billboards where id = v_billboard_id and org_id = p_org_id for share;
  if not found then raise exception 'تابلوی انتخاب‌شده در سازمان جاری پیدا نشد.' using errcode = 'P0002'; end if;
  if v_customer_id is not null and not exists (select 1 from public.customers where id = v_customer_id and org_id = p_org_id) then raise exception 'مشتری انتخاب‌شده معتبر نیست.' using errcode = '22023'; end if;
  if v_invoice_id is not null and not exists (select 1 from public.invoices where id = v_invoice_id and org_id = p_org_id) then raise exception 'فاکتور انتخاب‌شده معتبر نیست.' using errcode = '22023'; end if;
  if v_lead_id is not null and not exists (select 1 from public.marketing_leads where id = v_lead_id and org_id = p_org_id) then raise exception 'لید انتخاب‌شده معتبر نیست.' using errcode = '22023'; end if;
  if v_template_id is not null then
    if not exists (
      select 1 from public.process_templates
      where id = v_template_id and org_id = p_org_id
        and ('billboard_status_changes' = module_id or 'billboard_status_changes' = any(coalesce(module_ids, '{}'::text[])))
    ) then
      raise exception 'الگوی فرآیند انتخاب‌شده برای درخواست تغییر وضعیت تابلو سازگار نیست.' using errcode = '22023';
    end if;
    select jsonb_build_object(
      'template', to_jsonb(template_row),
      'stages', coalesce((
        select jsonb_agg(to_jsonb(stage_row) order by stage_row.sort_order)
        from public.process_template_stages stage_row
        where stage_row.template_id = template_row.id
      ), '[]'::jsonb)
    ) into v_template_snapshot
    from public.process_templates template_row
    where template_row.id = v_template_id and template_row.org_id = p_org_id;
  end if;
  perform set_config('app.workflow_origin_execution_key', coalesce(nullif(trim(p_origin_execution_key), ''), ''), true);
  insert into public.billboard_status_changes (org_id, billboard_id, source_status, target_status, application_mode, execution_source, customer_id, invoice_id, marketing_lead_id, start_date, end_date, block_reason, description, requested_by, process_template_id, process_template_snapshot)
  values (p_org_id, v_billboard.id, v_billboard.status, v_status, v_mode, 'workflow', v_customer_id, v_invoice_id, v_lead_id, nullif(trim(coalesce(v_input ->> 'start_date', '')), '')::date, nullif(trim(coalesce(v_input ->> 'end_date', '')), '')::date, nullif(trim(coalesce(v_input ->> 'block_reason', '')), ''), nullif(trim(coalesce(v_input ->> 'description', '')), ''), p_actor_user_id, v_template_id, v_template_snapshot)
  returning id into v_id;
  perform public.apply_billboard_status_change(v_id, p_org_id, p_actor_user_id, true);
  return v_id;
end;
$$;

create or replace function public.workflow_update_billboard_status_change(p_org_id uuid, p_actor_user_id uuid, p_change_id uuid, p_patch jsonb, p_origin_execution_key text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change public.billboard_status_changes%rowtype;
  v_next jsonb;
  v_status text;
  v_mode text;
  v_key text;
  v_allowed text[] := array['target_status','application_mode','customer_id','invoice_id','marketing_lead_id','start_date','end_date','block_reason','description'];
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'دسترسی ویرایش خودکار تغییر وضعیت تابلو وجود ندارد.' using errcode = '42501'; end if;
  if p_org_id is null or p_actor_user_id is null or p_change_id is null or jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' then raise exception 'اطلاعات ویرایش خودکار تغییر وضعیت تابلو کامل نیست.' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_actor_user_id and org_id = p_org_id)
     or not public.org_has_plan_module(p_org_id, 'billboards', false)
     or not public.org_has_plan_feature(p_org_id, 'billboard_status_management', true) then raise exception 'دسترسی سازمانی معتبر برای ویرایش تغییر وضعیت وجود ندارد.' using errcode = '42501'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop if not v_key = any(v_allowed) then raise exception 'فیلد ویرایش درخواست تغییر وضعیت معتبر نیست.' using errcode = '22023'; end if; end loop;
  select * into v_change from public.billboard_status_changes where id = p_change_id and org_id = p_org_id for update;
  if not found then raise exception 'درخواست تغییر وضعیت در سازمان جاری پیدا نشد.' using errcode = 'P0002'; end if;
  if v_change.request_status <> 'pending_approval' then raise exception 'فقط درخواست در انتظار تأیید قابل ویرایش است.' using errcode = '22023'; end if;
  v_next := to_jsonb(v_change) || p_patch;
  v_status := nullif(trim(coalesce(v_next ->> 'target_status', '')), '');
  v_mode := lower(coalesce(nullif(trim(v_next ->> 'application_mode'), ''), 'main_status'));
  if v_status not in ('free','oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue','inactive','blocked') then raise exception 'وضعیت مقصد معتبر نیست.' using errcode = '22023'; end if;
  if v_mode not in ('main_status','add_tag') or (v_mode = 'add_tag' and v_status not in ('oral_reserve','final_reserve','in_line')) then raise exception 'نحوه اعمال وضعیت معتبر نیست.' using errcode = '22023'; end if;
  if v_status = 'opening' and (nullif(trim(coalesce(v_next ->> 'start_date', '')), '') is null or nullif(trim(coalesce(v_next ->> 'end_date', '')), '') is null) then raise exception 'برای وضعیت در حال اکران، تاریخ شروع و پایان اکران الزامی است.' using errcode = '22023'; end if;
  if to_jsonb(v_change) @> p_patch then return false; end if;
  perform set_config('app.workflow_origin_execution_key', coalesce(nullif(trim(p_origin_execution_key), ''), ''), true);
  update public.billboard_status_changes set target_status = v_status, application_mode = v_mode, customer_id = nullif(trim(coalesce(v_next ->> 'customer_id', '')), '')::uuid, invoice_id = nullif(trim(coalesce(v_next ->> 'invoice_id', '')), '')::uuid, marketing_lead_id = nullif(trim(coalesce(v_next ->> 'marketing_lead_id', '')), '')::uuid, start_date = nullif(trim(coalesce(v_next ->> 'start_date', '')), '')::date, end_date = nullif(trim(coalesce(v_next ->> 'end_date', '')), '')::date, block_reason = nullif(trim(coalesce(v_next ->> 'block_reason', '')), ''), description = nullif(trim(coalesce(v_next ->> 'description', '')), ''), updated_at = now(), updated_by = p_actor_user_id where id = p_change_id and org_id = p_org_id;
  return true;
end;
$$;

revoke all on function public.apply_billboard_status_change(uuid, uuid, uuid, boolean, text) from public, authenticated;
revoke all on function public.workflow_create_billboard_status_change(uuid, uuid, jsonb, text) from public, authenticated;
revoke all on function public.workflow_update_billboard_status_change(uuid, uuid, uuid, jsonb, text) from public, authenticated;
grant execute on function public.workflow_create_billboard_status_change(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.workflow_update_billboard_status_change(uuid, uuid, uuid, jsonb, text) to service_role;

notify pgrst, 'reload schema';
commit;
