-- Phase 486: مسیر امن تغییر وضعیت تابلو در اتوماسیون و همگام‌سازی رابطه‌های فعالیت با فرآیند
-- درخواست تغییر وضعیت تابلو فقط از مسیر کنترل‌شده ثبت/ویرایش می‌شود؛ و رابطه‌های
-- اختصاصیِ متصل به فرآیند، با process_links و process_run_links یک منبع حقیقت دارند.

begin;

create or replace function public.workflow_create_billboard_status_change(
  p_org_id uuid,
  p_actor_user_id uuid,
  p_input jsonb,
  p_origin_execution_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_billboard public.billboards%rowtype;
  v_id uuid;
  v_billboard_id uuid := nullif(trim(coalesce(p_input ->> 'billboard_id', '')), '')::uuid;
  v_target_status text := nullif(trim(coalesce(p_input ->> 'target_status', '')), '');
  v_customer_id uuid := nullif(trim(coalesce(p_input ->> 'customer_id', '')), '')::uuid;
  v_invoice_id uuid := nullif(trim(coalesce(p_input ->> 'invoice_id', '')), '')::uuid;
  v_template_id uuid := nullif(trim(coalesce(p_input ->> 'process_template_id', '')), '')::uuid;
  v_template_snapshot jsonb := '{}'::jsonb;
  v_title text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'دسترسی ثبت خودکار تغییر وضعیت تابلو وجود ندارد.' using errcode = '42501';
  end if;
  if p_org_id is null or p_actor_user_id is null or jsonb_typeof(coalesce(p_input, '{}'::jsonb)) <> 'object' then
    raise exception 'اطلاعات ثبت خودکار تغییر وضعیت تابلو کامل نیست.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_user_id and org_id = p_org_id) then
    raise exception 'کاربر اجرای گردش‌کار در سازمان جاری معتبر نیست.' using errcode = '42501';
  end if;
  if not public.org_has_plan_feature(p_org_id, 'billboard_status_management', true) then
    raise exception 'قابلیت مدیریت تغییر وضعیت تابلوها در پلن سازمان فعال نیست.' using errcode = '42501';
  end if;
  if v_target_status not in ('free','oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue','inactive','blocked') then
    raise exception 'وضعیت مقصد معتبر نیست.' using errcode = '22023';
  end if;
  if v_target_status = 'blocked' and nullif(trim(coalesce(p_input ->> 'block_reason', '')), '') is null then
    raise exception 'دلیل مسدودسازی الزامی است.' using errcode = '22023';
  end if;
  if v_target_status in ('oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue')
     and (v_customer_id is null or nullif(trim(coalesce(p_input ->> 'start_date', '')), '') is null or nullif(trim(coalesce(p_input ->> 'end_date', '')), '') is null) then
    raise exception 'برای این وضعیت، مشتری و بازه اکران الزامی است.' using errcode = '22023';
  end if;
  select * into v_billboard from public.billboards where id = v_billboard_id and org_id = p_org_id for share;
  if not found then raise exception 'تابلوی انتخاب‌شده در سازمان جاری پیدا نشد.' using errcode = 'P0002'; end if;
  if v_customer_id is not null and not exists (select 1 from public.customers where id = v_customer_id and org_id = p_org_id) then
    raise exception 'مشتری انتخاب‌شده معتبر نیست.' using errcode = '22023';
  end if;
  if v_invoice_id is not null and not exists (select 1 from public.invoices where id = v_invoice_id and org_id = p_org_id) then
    raise exception 'فاکتور انتخاب‌شده معتبر نیست.' using errcode = '22023';
  end if;
  if v_template_id is not null then
    if not exists (
      select 1 from public.process_templates
      where id = v_template_id and org_id = p_org_id
        and ('billboard_status_changes' = module_id or 'billboard_status_changes' = any(coalesce(module_ids, '{}'::text[])))
    ) then raise exception 'الگوی فرآیند انتخاب‌شده برای درخواست تغییر وضعیت تابلو سازگار نیست.' using errcode = '22023'; end if;
    select jsonb_build_object(
      'template', to_jsonb(template_row),
      'stages', coalesce((select jsonb_agg(to_jsonb(stage_row) order by stage_row.sort_order) from public.process_template_stages stage_row where stage_row.template_id = template_row.id), '[]'::jsonb)
    ) into v_template_snapshot
    from public.process_templates template_row where template_row.id = v_template_id and template_row.org_id = p_org_id;
  end if;
  v_title := concat('تغییر وضعیت ', coalesce(nullif(trim(v_billboard.name), ''), 'تابلو'), ' به ', case v_target_status
    when 'free' then 'آزاد' when 'oral_reserve' then 'رزرو شفاهی' when 'final_reserve' then 'رزرو قطعی'
    when 'in_line' then 'در صف نصب' when 'opening' then 'در حال اکران' when 'near_finish' then 'نزدیک به اتمام'
    when 'opening_deadline_ended' then 'پایان مهلت اکران' when 'pickup_queue' then 'در صف جمع‌آوری'
    when 'inactive' then 'غیرفعال' when 'blocked' then 'مسدود' else v_target_status end);
  perform set_config('app.workflow_origin_execution_key', coalesce(nullif(trim(p_origin_execution_key), ''), ''), true);
  insert into public.billboard_status_changes (
    org_id, title, billboard_id, source_status, target_status, customer_id, invoice_id, start_date, end_date,
    block_reason, description, requested_by, process_template_id, process_template_snapshot
  ) values (
    p_org_id, v_title, v_billboard.id, v_billboard.status, v_target_status, v_customer_id, v_invoice_id,
    nullif(trim(coalesce(p_input ->> 'start_date', '')), '')::date, nullif(trim(coalesce(p_input ->> 'end_date', '')), '')::date,
    nullif(trim(coalesce(p_input ->> 'block_reason', '')), ''), nullif(trim(coalesce(p_input ->> 'description', '')), ''), p_actor_user_id, v_template_id, v_template_snapshot
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.workflow_update_billboard_status_change(
  p_org_id uuid,
  p_actor_user_id uuid,
  p_change_id uuid,
  p_patch jsonb,
  p_origin_execution_key text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change public.billboard_status_changes%rowtype;
  v_next jsonb;
  v_target_status text;
  v_customer_id uuid;
  v_invoice_id uuid;
  v_title text;
  v_allowed_keys text[] := array['target_status','customer_id','invoice_id','start_date','end_date','block_reason','description'];
  v_key text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'دسترسی ویرایش خودکار تغییر وضعیت تابلو وجود ندارد.' using errcode = '42501'; end if;
  if p_org_id is null or p_actor_user_id is null or p_change_id is null or jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' then
    raise exception 'اطلاعات ویرایش خودکار تغییر وضعیت تابلو کامل نیست.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_user_id and org_id = p_org_id) then raise exception 'کاربر اجرای گردش‌کار در سازمان جاری معتبر نیست.' using errcode = '42501'; end if;
  if not public.org_has_plan_feature(p_org_id, 'billboard_status_management', true) then raise exception 'قابلیت مدیریت تغییر وضعیت تابلوها در پلن سازمان فعال نیست.' using errcode = '42501'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if not v_key = any(v_allowed_keys) then raise exception 'فیلد ویرایش درخواست تغییر وضعیت معتبر نیست.' using errcode = '22023'; end if;
  end loop;
  select * into v_change from public.billboard_status_changes where id = p_change_id and org_id = p_org_id for update;
  if not found then raise exception 'درخواست تغییر وضعیت در سازمان جاری پیدا نشد.' using errcode = 'P0002'; end if;
  if v_change.request_status <> 'pending_approval' then raise exception 'فقط درخواست در انتظار تأیید قابل ویرایش است.' using errcode = '22023'; end if;
  v_next := to_jsonb(v_change) || p_patch;
  v_target_status := nullif(trim(coalesce(v_next ->> 'target_status', '')), '');
  v_customer_id := nullif(trim(coalesce(v_next ->> 'customer_id', '')), '')::uuid;
  v_invoice_id := nullif(trim(coalesce(v_next ->> 'invoice_id', '')), '')::uuid;
  if v_target_status not in ('free','oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue','inactive','blocked') then raise exception 'وضعیت مقصد معتبر نیست.' using errcode = '22023'; end if;
  if v_target_status = 'blocked' and nullif(trim(coalesce(v_next ->> 'block_reason', '')), '') is null then raise exception 'دلیل مسدودسازی الزامی است.' using errcode = '22023'; end if;
  if v_target_status in ('oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue')
     and (v_customer_id is null or nullif(trim(coalesce(v_next ->> 'start_date', '')), '') is null or nullif(trim(coalesce(v_next ->> 'end_date', '')), '') is null) then raise exception 'برای این وضعیت، مشتری و بازه اکران الزامی است.' using errcode = '22023'; end if;
  if v_customer_id is not null and not exists (select 1 from public.customers where id = v_customer_id and org_id = p_org_id) then raise exception 'مشتری انتخاب‌شده معتبر نیست.' using errcode = '22023'; end if;
  if v_invoice_id is not null and not exists (select 1 from public.invoices where id = v_invoice_id and org_id = p_org_id) then raise exception 'فاکتور انتخاب‌شده معتبر نیست.' using errcode = '22023'; end if;
  if to_jsonb(v_change) @> p_patch then return false; end if;
  select concat('تغییر وضعیت ', coalesce(nullif(trim(name), ''), 'تابلو'), ' به ', case v_target_status
    when 'free' then 'آزاد' when 'oral_reserve' then 'رزرو شفاهی' when 'final_reserve' then 'رزرو قطعی'
    when 'in_line' then 'در صف نصب' when 'opening' then 'در حال اکران' when 'near_finish' then 'نزدیک به اتمام'
    when 'opening_deadline_ended' then 'پایان مهلت اکران' when 'pickup_queue' then 'در صف جمع‌آوری'
    when 'inactive' then 'غیرفعال' when 'blocked' then 'مسدود' else v_target_status end)
    into v_title
  from public.billboards where id = v_change.billboard_id and org_id = p_org_id;
  perform set_config('app.workflow_origin_execution_key', coalesce(nullif(trim(p_origin_execution_key), ''), ''), true);
  update public.billboard_status_changes set
    title = coalesce(v_title, title),
    target_status = v_target_status,
    customer_id = v_customer_id,
    invoice_id = v_invoice_id,
    start_date = nullif(trim(coalesce(v_next ->> 'start_date', '')), '')::date,
    end_date = nullif(trim(coalesce(v_next ->> 'end_date', '')), '')::date,
    block_reason = nullif(trim(coalesce(v_next ->> 'block_reason', '')), ''),
    description = nullif(trim(coalesce(v_next ->> 'description', '')), ''),
    updated_at = now()
  where id = p_change_id and org_id = p_org_id;
  return true;
end;
$$;

-- جایگزین امن RPC موجود: مقدار فیلد رابطه‌ایِ علامت‌خورده، پیوند متناظر فرآیند را نیز به‌روز می‌کند.
create or replace function public.sync_process_task_v2_custom_field_values(
  p_task_id uuid,
  p_field_values jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_task public.tasks%rowtype;
  v_recurrence jsonb;
  v_existing_values jsonb;
  v_links jsonb;
  v_field jsonb;
  v_field_key text;
  v_target_module text;
  v_record_id text;
  v_linked_module_ids text[] := array[]::text[];
  v_run_module_id text;
  v_run_record_id uuid;
begin
  if auth.uid() is null or v_org_id is null then raise exception using errcode = '42501', message = 'دسترسی سازمانی معتبر برای ذخیره فعالیت پیدا نشد.'; end if;
  if p_task_id is null or p_field_values is null or jsonb_typeof(p_field_values) <> 'object' then raise exception using errcode = '22023', message = 'مقادیر فیلدهای اختصاصی معتبر نیست.'; end if;
  select * into v_task from public.tasks where id = p_task_id and org_id = v_org_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'فعالیت موردنظر برای ذخیره پیدا نشد یا دسترسی آن وجود ندارد.'; end if;
  v_recurrence := case when jsonb_typeof(v_task.recurrence_info) = 'object' then v_task.recurrence_info else '{}'::jsonb end;
  v_existing_values := case when jsonb_typeof(v_recurrence -> 'process_task_custom_field_values') = 'object' then v_recurrence -> 'process_task_custom_field_values' else '{}'::jsonb end;
  v_links := case when jsonb_typeof(v_recurrence -> 'process_links') = 'object' then v_recurrence -> 'process_links' else '{}'::jsonb end;
  for v_field in select value from jsonb_array_elements(case when jsonb_typeof(v_recurrence -> 'process_task_custom_fields') = 'array' then v_recurrence -> 'process_task_custom_fields' else '[]'::jsonb end) loop
    v_field_key := nullif(trim(coalesce(v_field ->> 'key', '')), '');
    v_target_module := nullif(trim(coalesce(v_field -> 'relationConfig' ->> 'targetModule', '')), '');
    if v_field_key is null or v_target_module is null or coalesce(v_field ->> 'type', '') <> 'relation'
       or coalesce((v_field -> 'relationConfig' ->> 'linkToProcessRelatedRecord')::boolean, (v_field -> 'relationConfig' ->> 'link_to_process_related_record')::boolean, false) is not true
       or not (p_field_values ? v_field_key) then continue; end if;
    v_record_id := nullif(trim(coalesce(p_field_values ->> v_field_key, '')), '');
    if v_record_id is null then continue; end if;
    if v_record_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'مقدار رابطه اختصاصی معتبر نیست.';
    end if;
    v_links := v_links || jsonb_build_object(v_target_module, v_record_id);
    v_linked_module_ids := array_append(v_linked_module_ids, v_target_module);
  end loop;
  v_recurrence := jsonb_set(v_recurrence, '{process_task_custom_field_values}', v_existing_values || p_field_values, true);
  v_recurrence := jsonb_set(v_recurrence, '{process_links}', v_links, true);
  update public.tasks set recurrence_info = v_recurrence, updated_at = now() where id = v_task.id and org_id = v_org_id returning * into v_task;
  if v_task.process_run_id is not null and coalesce(array_length(v_linked_module_ids, 1), 0) > 0 then
    select module_id, record_id into v_run_module_id, v_run_record_id from public.process_runs where id = v_task.process_run_id and org_id = v_org_id;
    delete from public.process_run_links where process_run_id = v_task.process_run_id and org_id = v_org_id and module_id = any(v_linked_module_ids);
    for v_target_module, v_record_id in select key, value from jsonb_each_text(v_links) loop
      if not v_target_module = any(v_linked_module_ids) then continue; end if;
      insert into public.process_run_links (org_id, process_run_id, module_id, record_id, is_primary)
      values (v_org_id, v_task.process_run_id, v_target_module, v_record_id::uuid, v_target_module = v_run_module_id and v_record_id::uuid = v_run_record_id)
      on conflict (process_run_id, module_id, record_id) do update set org_id = excluded.org_id, is_primary = excluded.is_primary;
    end loop;
  end if;
  return jsonb_build_object('id', v_task.id, 'status', v_task.status, 'recurrence_info', v_task.recurrence_info, 'process_run_id', v_task.process_run_id, 'process_run_stage_id', v_task.process_run_stage_id, 'updated_at', v_task.updated_at);
end;
$$;

create or replace function public.workflow_patch_process_task_v2_custom_field_values(
  p_org_id uuid,
  p_task_id uuid,
  p_field_values jsonb,
  p_actor_user_id uuid default null,
  p_origin_execution_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks%rowtype;
  v_recurrence jsonb;
  v_existing_values jsonb;
  v_links jsonb;
  v_field jsonb;
  v_field_key text;
  v_target_module text;
  v_record_id text;
  v_linked_module_ids text[] := array[]::text[];
  v_run_module_id text;
  v_run_record_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'دسترسی ذخیره خودکار فیلد فعالیت وجود ندارد.' using errcode = '42501'; end if;
  if p_org_id is null or p_task_id is null or jsonb_typeof(coalesce(p_field_values, '{}'::jsonb)) <> 'object' then raise exception 'مقادیر فیلدهای اختصاصی معتبر نیست.' using errcode = '22023'; end if;
  select * into v_task from public.tasks where id = p_task_id and org_id = p_org_id for update;
  if not found then raise exception 'فعالیت موردنظر در سازمان جاری پیدا نشد.' using errcode = 'P0002'; end if;
  v_recurrence := case when jsonb_typeof(v_task.recurrence_info) = 'object' then v_task.recurrence_info else '{}'::jsonb end;
  v_existing_values := case when jsonb_typeof(v_recurrence -> 'process_task_custom_field_values') = 'object' then v_recurrence -> 'process_task_custom_field_values' else '{}'::jsonb end;
  v_links := case when jsonb_typeof(v_recurrence -> 'process_links') = 'object' then v_recurrence -> 'process_links' else '{}'::jsonb end;
  for v_field in select value from jsonb_array_elements(case when jsonb_typeof(v_recurrence -> 'process_task_custom_fields') = 'array' then v_recurrence -> 'process_task_custom_fields' else '[]'::jsonb end) loop
    v_field_key := nullif(trim(coalesce(v_field ->> 'key', '')), '');
    v_target_module := nullif(trim(coalesce(v_field -> 'relationConfig' ->> 'targetModule', '')), '');
    if v_field_key is null or v_target_module is null or coalesce(v_field ->> 'type', '') <> 'relation'
       or coalesce((v_field -> 'relationConfig' ->> 'linkToProcessRelatedRecord')::boolean, (v_field -> 'relationConfig' ->> 'link_to_process_related_record')::boolean, false) is not true
       or not (p_field_values ? v_field_key) then continue; end if;
    v_record_id := nullif(trim(coalesce(p_field_values ->> v_field_key, '')), '');
    if v_record_id is null then continue; end if;
    if v_record_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'مقدار رابطه اختصاصی معتبر نیست.' using errcode = '22023'; end if;
    v_links := v_links || jsonb_build_object(v_target_module, v_record_id);
    v_linked_module_ids := array_append(v_linked_module_ids, v_target_module);
  end loop;
  v_recurrence := jsonb_set(v_recurrence, '{process_task_custom_field_values}', v_existing_values || p_field_values, true);
  v_recurrence := jsonb_set(v_recurrence, '{process_links}', v_links, true);
  perform set_config('app.workflow_origin_execution_key', coalesce(nullif(trim(p_origin_execution_key), ''), ''), true);
  update public.tasks set recurrence_info = v_recurrence, updated_at = now(), updated_by = coalesce(p_actor_user_id, updated_by)
  where id = v_task.id and org_id = p_org_id returning * into v_task;
  if v_task.process_run_id is not null and coalesce(array_length(v_linked_module_ids, 1), 0) > 0 then
    select module_id, record_id into v_run_module_id, v_run_record_id from public.process_runs where id = v_task.process_run_id and org_id = p_org_id;
    delete from public.process_run_links where process_run_id = v_task.process_run_id and org_id = p_org_id and module_id = any(v_linked_module_ids);
    for v_target_module, v_record_id in select key, value from jsonb_each_text(v_links) loop
      if not v_target_module = any(v_linked_module_ids) then continue; end if;
      insert into public.process_run_links (org_id, process_run_id, module_id, record_id, is_primary)
      values (p_org_id, v_task.process_run_id, v_target_module, v_record_id::uuid, v_target_module = v_run_module_id and v_record_id::uuid = v_run_record_id)
      on conflict (process_run_id, module_id, record_id) do update set org_id = excluded.org_id, is_primary = excluded.is_primary;
    end loop;
  end if;
  return jsonb_build_object('id', v_task.id, 'recurrence_info', v_task.recurrence_info, 'process_run_id', v_task.process_run_id, 'process_run_stage_id', v_task.process_run_stage_id, 'updated_at', v_task.updated_at);
end;
$$;

revoke all on function public.workflow_create_billboard_status_change(uuid, uuid, jsonb, text) from public, authenticated;
revoke all on function public.workflow_update_billboard_status_change(uuid, uuid, uuid, jsonb, text) from public, authenticated;
grant execute on function public.workflow_create_billboard_status_change(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.workflow_update_billboard_status_change(uuid, uuid, uuid, jsonb, text) to service_role;
revoke all on function public.workflow_patch_process_task_v2_custom_field_values(uuid, uuid, jsonb, uuid, text) from public, authenticated;
grant execute on function public.workflow_patch_process_task_v2_custom_field_values(uuid, uuid, jsonb, uuid, text) to service_role;
revoke all on function public.sync_process_task_v2_custom_field_values(uuid, jsonb) from public;
grant execute on function public.sync_process_task_v2_custom_field_values(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
