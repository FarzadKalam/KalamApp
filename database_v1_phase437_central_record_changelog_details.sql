-- Phase 437: Central, detailed and tenant-safe record activity audit.
-- The existing changelogs engine is upgraded in place.  It keeps capture in
-- PostgreSQL so changes made by the UI, automation, AI and public forms are
-- described by the same source of truth.

begin;

create index if not exists idx_changelogs_org_module_record_created_detailed
  on public.changelogs (org_id, module_id, record_id, created_at desc);

create or replace function public.kalam_record_activity_field_label(
  p_org_id uuid,
  p_module_id text,
  p_field_name text
)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select nullif(btrim(coalesce((
    select field_item #>> '{labels,fa}'
    from public.integration_settings settings_row
    cross join lateral jsonb_array_elements(
      coalesce(settings_row.settings #> array['modules', p_module_id, 'schema', 'fields'], '[]'::jsonb)
    ) field_item
    where settings_row.org_id = p_org_id
      and settings_row.connection_type = 'module_settings'
      and field_item ->> 'key' = p_field_name
    limit 1
  ), '')), '');
$$;

create or replace function public.kalam_record_activity_emit(
  p_org_id uuid,
  p_module_id text,
  p_record_id text,
  p_action text,
  p_actor uuid,
  p_record_title text,
  p_field_name text default null,
  p_field_label text default null,
  p_old_value text default null,
  p_new_value text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null
    or nullif(btrim(coalesce(p_module_id, '')), '') is null
    or nullif(btrim(coalesce(p_record_id, '')), '') is null then
    return;
  end if;

  insert into public.changelogs (
    org_id, module_id, record_id, action, field_name, field_label,
    old_value, new_value, user_id, record_title, metadata
  ) values (
    p_org_id,
    btrim(p_module_id),
    btrim(p_record_id),
    coalesce(nullif(btrim(p_action), ''), 'update'),
    nullif(btrim(coalesce(p_field_name, '')), ''),
    nullif(btrim(coalesce(p_field_label, '')), ''),
    p_old_value,
    p_new_value,
    p_actor,
    nullif(btrim(coalesce(p_record_title, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.kalam_record_activity_custom_task_changes(
  p_org_id uuid,
  p_task_id text,
  p_actor uuid,
  p_title text,
  p_old_recurrence jsonb,
  p_new_recurrence jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_values jsonb := coalesce(p_old_recurrence -> 'process_task_custom_field_values', '{}'::jsonb);
  v_new_values jsonb := coalesce(p_new_recurrence -> 'process_task_custom_field_values', '{}'::jsonb);
  v_fields jsonb := coalesce(p_new_recurrence -> 'process_task_custom_fields', p_old_recurrence -> 'process_task_custom_fields', '[]'::jsonb);
  v_key text;
  v_old jsonb;
  v_new jsonb;
  v_field jsonb;
  v_label text;
begin
  if jsonb_typeof(v_old_values) <> 'object' then v_old_values := '{}'::jsonb; end if;
  if jsonb_typeof(v_new_values) <> 'object' then v_new_values := '{}'::jsonb; end if;
  if jsonb_typeof(v_fields) <> 'array' then v_fields := '[]'::jsonb; end if;

  if v_old_values = v_new_values then
    return false;
  end if;

  for v_key in
    select key from jsonb_object_keys(v_old_values || v_new_values) key
  loop
    v_old := v_old_values -> v_key;
    v_new := v_new_values -> v_key;
    if v_old is not distinct from v_new then continue; end if;

    select item into v_field
    from jsonb_array_elements(v_fields) item
    where item ->> 'key' = v_key
    limit 1;
    v_label := nullif(btrim(coalesce(v_field #>> '{labels,fa}', v_field ->> 'labelFa', '')), '');

    perform public.kalam_record_activity_emit(
      p_org_id, 'tasks', p_task_id, 'update', p_actor, p_title,
      v_key, v_label,
      case when v_old is null or v_old = 'null'::jsonb then null when jsonb_typeof(v_old) = 'string' then v_old #>> '{}' else v_old::text end,
      case when v_new is null or v_new = 'null'::jsonb then null when jsonb_typeof(v_new) = 'string' then v_new #>> '{}' else v_new::text end,
      jsonb_strip_nulls(jsonb_build_object(
        'source', 'db_trigger',
        'changeKind', 'process_task_custom_field',
        'summary', format('«%s» تغییر کرد', coalesce(v_label, 'فیلد اختصاصی فعالیت')),
        'fieldKey', v_key,
        'fieldLabel', v_label,
        'fieldType', v_field ->> 'type',
        'processTaskCustomField', v_field
      ))
    );
  end loop;
  return true;
end;
$$;

create or replace function public.kalam_record_activity_table_changes(
  p_org_id uuid,
  p_module_id text,
  p_record_id text,
  p_actor uuid,
  p_title text,
  p_block_id text,
  p_block_label text,
  p_old_rows jsonb,
  p_new_rows jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_row jsonb;
  v_new_row jsonb;
  v_index integer;
  v_column text;
  v_old_value jsonb;
  v_new_value jsonb;
  v_has_changes boolean := false;
begin
  if jsonb_typeof(p_old_rows) <> 'array' or jsonb_typeof(p_new_rows) <> 'array' then
    return false;
  end if;
  if exists (select 1 from jsonb_array_elements(p_old_rows || p_new_rows) item where jsonb_typeof(item) <> 'object') then
    return false;
  end if;

  for v_index in 0..greatest(jsonb_array_length(p_old_rows), jsonb_array_length(p_new_rows)) - 1 loop
    v_old_row := p_old_rows -> v_index;
    v_new_row := p_new_rows -> v_index;
    if v_old_row is not null and v_old_row = 'null'::jsonb then v_old_row := null; end if;
    if v_new_row is not null and v_new_row = 'null'::jsonb then v_new_row := null; end if;

    for v_column in
      select key from jsonb_object_keys(coalesce(v_old_row, '{}'::jsonb) || coalesce(v_new_row, '{}'::jsonb)) key
    loop
      if v_column in ('id', 'row_id', 'key', 'created_at', 'updated_at') or v_column like '\_%' then continue; end if;
      v_old_value := v_old_row -> v_column;
      v_new_value := v_new_row -> v_column;
      if v_old_value is not distinct from v_new_value then continue; end if;
      v_has_changes := true;
      perform public.kalam_record_activity_emit(
        p_org_id, p_module_id, p_record_id, 'table_cell_updated', p_actor, p_title,
        p_block_id, p_block_label,
        case when v_old_value is null or v_old_value = 'null'::jsonb then null when jsonb_typeof(v_old_value) = 'string' then v_old_value #>> '{}' else v_old_value::text end,
        case when v_new_value is null or v_new_value = 'null'::jsonb then null when jsonb_typeof(v_new_value) = 'string' then v_new_value #>> '{}' else v_new_value::text end,
        jsonb_build_object(
          'source', 'db_trigger',
          'changeKind', case when v_old_row is null then 'row_added' when v_new_row is null then 'row_removed' else 'cell_updated' end,
          'summary', format('«%s» در جدول «%s» تغییر کرد', v_column, coalesce(p_block_label, 'جدول')),
          'blockId', p_block_id,
          'blockLabel', p_block_label,
          'rowIndex', v_index + 1,
          'columnKey', v_column
        )
      );
    end loop;
  end loop;
  return v_has_changes;
end;
$$;

create or replace function public.kalam_record_activity_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_row jsonb := case when tg_op = 'DELETE' then v_old else v_new end;
  v_org_id uuid := public.kalam_safe_uuid(v_row ->> 'org_id');
  v_record_id text := nullif(v_row ->> 'id', '');
  v_actor uuid := coalesce(public.kalam_safe_uuid(v_new ->> 'updated_by'), public.kalam_safe_uuid(v_new ->> 'created_by'), public.kalam_safe_uuid(v_old ->> 'updated_by'), public.kalam_safe_uuid(v_old ->> 'created_by'), auth.uid());
  v_title text := public.kalam_record_audit_title(v_row);
  v_key text;
  v_old_value jsonb;
  v_new_value jsonb;
  v_field_label text;
  v_is_table boolean;
  v_has_custom_task_changes boolean := false;
  v_parent_org_id uuid;
  v_parent_module_id text;
  v_parent_record_id text;
  v_stage_name text;
  v_stage_kind text;
  v_assignee_label text;
  v_deleted_by uuid;
  v_deleted_title text;
  v_excluded_fields text[] := array['id','org_id','created_at','updated_at','created_by','updated_by','created_by_name','updated_by_name','created_by_label','updated_by_label'];
begin
  if tg_table_name = any(array['changelogs','notes','record_files','record_tags','sidebar_unread','workflow_logs','user_login_events','notification_inbox_items','notification_read_states','outbound_messages','ai_action_logs','ai_messages','ai_threads','org_ai_usage_ledger','recycle_bin_records']) then
    return null;
  end if;
  if tg_table_name = 'process_run_stages' and v_org_id is null then
    select r.org_id into v_org_id
    from public.process_runs r
    where r.id = public.kalam_safe_uuid(v_row ->> 'process_run_id');
  end if;
  if tg_table_name = 'process_template_stages' and v_org_id is null then
    select t.org_id into v_org_id
    from public.process_templates t
    where t.id = public.kalam_safe_uuid(v_row ->> 'template_id');
  end if;
  if v_org_id is null or v_record_id is null then return null; end if;

  -- A restore inserts the original row while the recycle-bin entry is still present.
  if tg_op = 'INSERT' and exists (
    select 1 from public.recycle_bin_records rb
    where rb.org_id = v_org_id and rb.source_table = tg_table_name and rb.source_record_id::text = v_record_id
  ) then
    perform public.kalam_record_activity_emit(v_org_id, tg_table_name, v_record_id, 'restore', auth.uid(), v_title, null, null, null, null,
      jsonb_build_object('source', 'db_trigger', 'summary', 'رکورد از سطل بازیافت بازگردانی شد', 'table_name', tg_table_name));
  elsif tg_op = 'INSERT' then
    perform public.kalam_record_activity_emit(v_org_id, tg_table_name, v_record_id, 'create', v_actor, v_title, null, null, null, null,
      jsonb_build_object('source', 'db_trigger', 'summary', 'رکورد ایجاد شد', 'table_name', tg_table_name));
  elsif tg_op = 'DELETE' then
    select rb.deleted_by, rb.record_title into v_deleted_by, v_deleted_title
    from public.recycle_bin_records rb
    where rb.org_id = v_org_id and rb.source_table = tg_table_name and rb.source_record_id::text = v_record_id
    order by rb.deleted_at desc limit 1;
    perform public.kalam_record_activity_emit(v_org_id, tg_table_name, v_record_id, 'delete', coalesce(v_deleted_by, v_actor), coalesce(v_deleted_title, v_title), null, null, null, null,
      jsonb_build_object('source', 'db_trigger', 'summary', 'رکورد حذف شد', 'table_name', tg_table_name));
  end if;

  -- Process operations are logged against the business record, not only against internal tables.
  if tg_table_name = 'process_runs' then
    if tg_op = 'INSERT' then
      perform public.kalam_record_activity_emit(v_org_id, coalesce(v_new ->> 'module_id', 'process_runs'), coalesce(v_new ->> 'record_id', v_record_id),
        case when nullif(v_new ->> 'template_id', '') is null then 'process_run_created' else 'process_template_applied' end,
        v_actor, v_title, null, null, null, null,
        jsonb_build_object('source','db_trigger','summary', case when nullif(v_new ->> 'template_id','') is null then 'یک ردیف جدید فرآیند اضافه شد' else 'یک فرآیند از الگو اضافه شد' end, 'processName', v_new ->> 'process_name', 'processRunId', v_record_id));
    end if;
    return null;
  end if;

  if tg_table_name = 'process_run_stages' then
    select r.org_id, r.module_id, r.record_id::text into v_parent_org_id, v_parent_module_id, v_parent_record_id
    from public.process_runs r where r.id = public.kalam_safe_uuid(v_row ->> 'process_run_id') and r.org_id = v_org_id;
    if v_parent_org_id is not null and v_parent_module_id is not null and v_parent_record_id is not null then
      v_stage_name := coalesce(nullif(v_row ->> 'stage_name',''), 'مرحله بدون عنوان');
      v_stage_kind := case when nullif(v_row ->> 'task_id','') is null then 'مرحله پیش‌نویس' else 'فعالیت' end;
      if tg_op = 'INSERT' then
        perform public.kalam_record_activity_emit(v_parent_org_id, v_parent_module_id, v_parent_record_id, 'process_stage_added', v_actor, v_title, null, null, null, null,
          jsonb_build_object('source','db_trigger','summary',format('%s «%s» اضافه شد',v_stage_kind,v_stage_name),'stageName',v_stage_name,'stageKind',v_stage_kind,'processRunStageId',v_record_id));
      elsif tg_op = 'DELETE' then
        perform public.kalam_record_activity_emit(v_parent_org_id, v_parent_module_id, v_parent_record_id, 'process_stage_removed', v_actor, v_title, null, null, null, null,
          jsonb_build_object('source','db_trigger','summary',format('%s «%s» حذف شد',v_stage_kind,v_stage_name),'stageName',v_stage_name,'stageKind',v_stage_kind,'processRunStageId',v_record_id));
      elsif (v_old ->> 'task_id') is null and (v_new ->> 'task_id') is not null then
        select p.full_name into v_assignee_label from public.profiles p where p.id = public.kalam_safe_uuid(v_new ->> 'assignee_user_id') and p.org_id = v_parent_org_id;
        perform public.kalam_record_activity_emit(v_parent_org_id, v_parent_module_id, v_parent_record_id, 'process_stage_activated', v_actor, v_title, null, null, null, null,
          jsonb_strip_nulls(jsonb_build_object('source','db_trigger','summary',format('مرحله پیش‌نویس «%s» به فعالیت تبدیل شد%s',v_stage_name,case when v_assignee_label is null then '' else ' و به «'||v_assignee_label||'» ارجاع شد' end),'stageName',v_stage_name,'stageKind','فعالیت','assigneeLabel',v_assignee_label,'processRunStageId',v_record_id)));
      elsif (v_old ->> 'sort_order') is distinct from (v_new ->> 'sort_order') then
        perform public.kalam_record_activity_emit(v_parent_org_id, v_parent_module_id, v_parent_record_id, 'process_stage_reordered', v_actor, v_title, null, null, null, null,
          jsonb_build_object('source','db_trigger','summary',format('ترتیب %s «%s» تغییر کرد',v_stage_kind,v_stage_name),'stageName',v_stage_name,'stageKind',v_stage_kind,'oldPosition',v_old ->> 'sort_order','newPosition',v_new ->> 'sort_order','processRunStageId',v_record_id));
      end if;
    end if;
    return null;
  end if;

  if tg_table_name = 'process_template_stages' then
    select t.org_id, 'process_templates', t.id::text, public.kalam_record_audit_title(to_jsonb(t))
    into v_parent_org_id, v_parent_module_id, v_parent_record_id, v_title
    from public.process_templates t
    where t.id = public.kalam_safe_uuid(v_row ->> 'template_id') and t.org_id = v_org_id;
    if v_parent_org_id is not null then
      v_stage_name := coalesce(nullif(v_row ->> 'stage_name',''), nullif(v_row ->> 'name',''), 'مرحله بدون عنوان');
      if tg_op = 'INSERT' then
        perform public.kalam_record_activity_emit(v_parent_org_id, v_parent_module_id, v_parent_record_id, 'process_stage_added', v_actor, v_title, null, null, null, null,
          jsonb_build_object('source','db_trigger','summary',format('مرحله پیش‌نویس «%s» به الگو اضافه شد',v_stage_name),'stageName',v_stage_name,'stageKind','مرحله پیش‌نویس'));
      elsif tg_op = 'DELETE' then
        perform public.kalam_record_activity_emit(v_parent_org_id, v_parent_module_id, v_parent_record_id, 'process_stage_removed', v_actor, v_title, null, null, null, null,
          jsonb_build_object('source','db_trigger','summary',format('مرحله پیش‌نویس «%s» از الگو حذف شد',v_stage_name),'stageName',v_stage_name,'stageKind','مرحله پیش‌نویس'));
      elsif (v_old ->> 'sort_order') is distinct from (v_new ->> 'sort_order') then
        perform public.kalam_record_activity_emit(v_parent_org_id, v_parent_module_id, v_parent_record_id, 'process_stage_reordered', v_actor, v_title, null, null, null, null,
          jsonb_build_object('source','db_trigger','summary',format('ترتیب مرحله پیش‌نویس «%s» تغییر کرد',v_stage_name),'stageName',v_stage_name,'stageKind','مرحله پیش‌نویس','oldPosition',v_old ->> 'sort_order','newPosition',v_new ->> 'sort_order'));
      end if;
    end if;
    return null;
  end if;

  if tg_op <> 'UPDATE' then return null; end if;
  if tg_table_name = 'tasks' then
    v_has_custom_task_changes := public.kalam_record_activity_custom_task_changes(v_org_id, v_record_id, v_actor, v_title, coalesce(v_old -> 'recurrence_info','{}'::jsonb), coalesce(v_new -> 'recurrence_info','{}'::jsonb));
  end if;

  for v_key, v_new_value in select key, value from jsonb_each(v_new) loop
    if v_key = any(v_excluded_fields) then continue; end if;
    v_old_value := v_old -> v_key;
    if v_old_value is not distinct from v_new_value then continue; end if;
    if v_key = 'recurrence_info' and v_has_custom_task_changes then continue; end if;
    v_field_label := public.kalam_record_activity_field_label(v_org_id, tg_table_name, v_key);
    v_is_table := jsonb_typeof(v_old_value) = 'array' and jsonb_typeof(v_new_value) = 'array';
    if v_is_table and public.kalam_record_activity_table_changes(v_org_id, tg_table_name, v_record_id, v_actor, v_title, v_key, v_field_label, v_old_value, v_new_value) then continue; end if;
    if jsonb_typeof(v_old_value) in ('object','array') or jsonb_typeof(v_new_value) in ('object','array') then continue; end if;
    perform public.kalam_record_activity_emit(v_org_id, tg_table_name, v_record_id, 'update', v_actor, v_title, v_key, v_field_label,
      case when v_old_value is null or v_old_value = 'null'::jsonb then null else v_old_value #>> '{}' end,
      case when v_new_value is null or v_new_value = 'null'::jsonb then null else v_new_value #>> '{}' end,
      jsonb_build_object('source','db_trigger','summary',format('«%s» تغییر کرد',coalesce(v_field_label,'فیلد ثبت‌شده')),'table_name',tg_table_name,'fieldKey',v_key)
      || case when tg_table_name = 'tasks' and v_key = 'status' then jsonb_build_object('options', coalesce(v_new -> 'recurrence_info' -> 'process_task_status_options', '[]'::jsonb)) else '{}'::jsonb end);
  end loop;
  return null;
end;
$$;

-- Record history moved by the existing merge RPC is a reliable server-side
-- signal that a duplicate joined the surviving record.  Emit once per source.
create or replace function public.kalam_record_activity_after_changelog_move()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.record_id is distinct from new.record_id
    and old.module_id = new.module_id
    and old.org_id = new.org_id
    and not exists (
      select 1 from public.changelogs c
      where c.org_id = new.org_id and c.module_id = new.module_id and c.record_id = new.record_id
        and c.action = 'records_merged'
        and c.metadata ->> 'mergedRecordId' = old.record_id
    ) then
    perform public.kalam_record_activity_emit(new.org_id, new.module_id, new.record_id, 'records_merged', auth.uid(), new.record_title, null, null, null, null,
      jsonb_build_object('source','db_trigger','summary','یک رکورد تکراری با این رکورد ادغام شد','mergedRecordId',old.record_id));
  end if;
  return new;
end;
$$;

-- At commit time group stage conversions from one automatic activation into a
-- single outer-process event, while the row trigger above keeps the name and
-- assignee of each individual stage available.
create or replace function public.kalam_record_activity_after_process_auto_referral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_module_id text;
  v_record_id text;
  v_count integer;
  v_stage_names text;
  v_record_title text;
begin
  if old.task_id is not null or new.task_id is null then return new; end if;
  if current_setting('kalam.activity.process_auto_referral_emitted', true) = '1' then return new; end if;

  select r.org_id, r.module_id, r.record_id::text, public.kalam_record_audit_title(to_jsonb(r))
  into v_org_id, v_module_id, v_record_id, v_record_title
  from public.process_runs r
  where r.id = new.process_run_id;
  if v_org_id is null or v_module_id is null or v_record_id is null then return new; end if;

  select count(*), string_agg(s.stage_name, '، ' order by s.sort_order)
  into v_count, v_stage_names
  from public.process_run_stages s
  where s.process_run_id = new.process_run_id
    and s.task_id is not null
    and s.updated_at = transaction_timestamp();
  if coalesce(v_count, 0) = 0 then return new; end if;

  perform set_config('kalam.activity.process_auto_referral_emitted', '1', true);
  perform public.kalam_record_activity_emit(
    v_org_id, v_module_id, v_record_id, 'process_stages_auto_referred', auth.uid(), v_record_title,
    null, null, null, null,
    jsonb_build_object(
      'source', 'db_trigger',
      'summary', case when v_count = 1
        then format('مرحله «%s» به‌صورت خودکار ارجاع شد', coalesce(v_stage_names, 'فرآیند'))
        else format('%s مرحله به‌صورت خودکار ارجاع شد', v_count) end,
      'stageCount', v_count,
      'stageNames', coalesce(v_stage_names, '')
    )
  );
  return new;
end;
$$;

create or replace function public.log_module_record_merge(
  p_module_id text,
  p_survivor_id uuid,
  p_duplicate_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_module_id text := nullif(btrim(coalesce(p_module_id, '')), '');
  v_duplicate_id uuid;
begin
  if auth.uid() is null or v_org_id is null or v_module_id is null or p_survivor_id is null then
    raise exception using errcode = '42501', message = 'دسترسی ثبت تاریخچهٔ ادغام وجود ندارد.';
  end if;

  foreach v_duplicate_id in array coalesce(p_duplicate_ids, '{}'::uuid[]) loop
    if v_duplicate_id is null or v_duplicate_id = p_survivor_id then continue; end if;
    if exists (
      select 1 from public.changelogs c
      where c.org_id = v_org_id and c.module_id = v_module_id and c.record_id = p_survivor_id::text
        and c.action = 'records_merged' and c.metadata ->> 'mergedRecordId' = v_duplicate_id::text
    ) then continue; end if;
    perform public.kalam_record_activity_emit(
      v_org_id, v_module_id, p_survivor_id::text, 'records_merged', auth.uid(), null,
      null, null, null, null,
      jsonb_build_object('source','merge_rpc','summary','یک رکورد تکراری با این رکورد ادغام شد','mergedRecordId',v_duplicate_id::text)
    );
  end loop;
end;
$$;

drop trigger if exists trg_kalam_record_activity_after_changelog_move on public.changelogs;
create trigger trg_kalam_record_activity_after_changelog_move
after update of record_id on public.changelogs
for each row execute function public.kalam_record_activity_after_changelog_move();

-- Apply the upgraded existing engine to modules introduced after phase 252 as
-- well.  Internal operational tables remain explicitly outside record history.
do $$
declare
  tbl record;
  v_excluded_tables text[] := array[
    'app_schema_migrations','system_code_counters','organizations','profiles',
    'company_settings','integration_settings','dynamic_options','saved_views',
    'tags','record_tags','changelogs','notes','record_files','sidebar_unread',
    'workflow_logs','workflow_event_queue','workflow_execution_claims',
    'user_login_events','notification_inbox_items','notification_read_states',
    'outbound_messages','ai_action_logs','ai_messages','ai_threads',
    'org_ai_usage_ledger','web_form_submissions','web_form_fields',
    'recycle_bin_records','record_activities','record_locks','file_entries',
    'file_folders','notification_delivery_attempts'
  ];
begin
  for tbl in
    select c.table_name
    from information_schema.columns c
    join information_schema.columns idc
      on idc.table_schema = c.table_schema
     and idc.table_name = c.table_name
     and idc.column_name = 'id'
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name = 'org_id'
      and c.table_name <> all(v_excluded_tables)
    order by c.table_name
  loop
    execute format('drop trigger if exists trg_kalam_record_audit_fields_before on public.%I', tbl.table_name);
    execute format('create trigger trg_kalam_record_audit_fields_before before insert or update on public.%I for each row execute function public.kalam_record_audit_fields_before()', tbl.table_name);
    execute format('drop trigger if exists trg_kalam_record_activity_after on public.%I', tbl.table_name);
    execute format('create trigger trg_kalam_record_activity_after after insert or update or delete on public.%I for each row execute function public.kalam_record_activity_after()', tbl.table_name);
  end loop;
end $$;

-- process stage tables do not carry org_id on older installations, therefore
-- they are not included by the original generic trigger discovery loop.
do $$
begin
  if to_regclass('public.process_run_stages') is not null then
    execute 'drop trigger if exists trg_kalam_record_audit_fields_before on public.process_run_stages';
    execute 'create trigger trg_kalam_record_audit_fields_before before insert or update on public.process_run_stages for each row execute function public.kalam_record_audit_fields_before()';
    execute 'drop trigger if exists trg_kalam_record_activity_after on public.process_run_stages';
    execute 'create trigger trg_kalam_record_activity_after after insert or update or delete on public.process_run_stages for each row execute function public.kalam_record_activity_after()';
    execute 'drop trigger if exists trg_kalam_record_activity_after_process_auto_referral on public.process_run_stages';
    execute 'create constraint trigger trg_kalam_record_activity_after_process_auto_referral after update on public.process_run_stages deferrable initially deferred for each row execute function public.kalam_record_activity_after_process_auto_referral()';
  end if;
  if to_regclass('public.process_template_stages') is not null then
    execute 'drop trigger if exists trg_kalam_record_audit_fields_before on public.process_template_stages';
    execute 'create trigger trg_kalam_record_audit_fields_before before insert or update on public.process_template_stages for each row execute function public.kalam_record_audit_fields_before()';
    execute 'drop trigger if exists trg_kalam_record_activity_after on public.process_template_stages';
    execute 'create trigger trg_kalam_record_activity_after after insert or update or delete on public.process_template_stages for each row execute function public.kalam_record_activity_after()';
  end if;
end $$;

revoke all on function public.kalam_record_activity_field_label(uuid, text, text) from public;
revoke all on function public.kalam_record_activity_emit(uuid, text, text, text, uuid, text, text, text, text, text, jsonb) from public;
revoke all on function public.kalam_record_activity_custom_task_changes(uuid, text, uuid, text, jsonb, jsonb) from public;
revoke all on function public.kalam_record_activity_table_changes(uuid, text, text, uuid, text, text, text, jsonb, jsonb) from public;
revoke all on function public.kalam_record_activity_after() from public;
revoke all on function public.kalam_record_activity_after_changelog_move() from public;
revoke all on function public.kalam_record_activity_after_process_auto_referral() from public;
revoke all on function public.log_module_record_merge(text, uuid, uuid[]) from public;

grant execute on function public.log_module_record_merge(text, uuid, uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
