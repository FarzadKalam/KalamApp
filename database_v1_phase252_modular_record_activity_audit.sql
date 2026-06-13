begin;

create or replace function public.kalam_safe_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;
  if value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.kalam_record_audit_title(row_data jsonb)
returns text
language sql
stable
set search_path = public
as $$
  select nullif(
    btrim(coalesce(
      row_data ->> 'system_code',
      row_data ->> 'manual_code',
      row_data ->> 'legacy_contact_code',
      row_data ->> 'legacy_system_code',
      row_data ->> 'legacy_invoice_number',
      row_data ->> 'accounting_code',
      row_data ->> 'full_name',
      row_data ->> 'business_name',
      row_data ->> 'legal_name',
      row_data ->> 'name',
      row_data ->> 'title',
      '[بدون عنوان]'
    )),
    ''
  );
$$;

create or replace function public.kalam_record_activity_action(field_name text, old_value jsonb, new_value jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when field_name = 'process_template_id' then 'process_template_applied'
    when field_name ~* '(^|_)process(_|$)|process_draft|execution_process_draft|marketing_process_draft|sub_process_draft' then 'process_updated'
    else 'update'
  end;
$$;

create or replace function public.kalam_record_activity_summary(action_name text, field_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select case action_name
    when 'create' then 'رکورد ایجاد شد'
    when 'delete' then 'رکورد حذف شد'
    when 'task_created' then 'فعالیت مرتبط ایجاد شد'
    when 'process_template_applied' then 'الگوی فرآیند رکورد تغییر کرد'
    when 'process_updated' then 'فرآیند رکورد تغییر کرد'
    else 'یکی از فیلدهای رکورد تغییر کرد'
  end;
$$;

create or replace function public.kalam_record_audit_fields_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := to_jsonb(new);
  v_actor uuid;
  v_patch jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    v_actor := coalesce(
      public.kalam_safe_uuid(v_new ->> 'created_by'),
      public.kalam_safe_uuid(v_new ->> 'updated_by'),
      auth.uid()
    );
    if v_actor is not null and nullif(coalesce(v_new ->> 'created_by', ''), '') is null then
      v_patch := v_patch || jsonb_build_object('created_by', v_actor);
    end if;
    if v_actor is not null and nullif(coalesce(v_new ->> 'updated_by', ''), '') is null then
      v_patch := v_patch || jsonb_build_object('updated_by', v_actor);
    end if;
    if nullif(coalesce(v_new ->> 'created_at', ''), '') is null then
      v_patch := v_patch || jsonb_build_object('created_at', now());
    end if;
    if nullif(coalesce(v_new ->> 'updated_at', ''), '') is null then
      v_patch := v_patch || jsonb_build_object('updated_at', now());
    end if;
  elsif tg_op = 'UPDATE' then
    v_actor := case
      when (v_new ->> 'updated_by') is distinct from (v_old ->> 'updated_by')
        then public.kalam_safe_uuid(v_new ->> 'updated_by')
      else auth.uid()
    end;
    v_patch := v_patch || jsonb_build_object('updated_at', now());
    if v_actor is not null then
      v_patch := v_patch || jsonb_build_object('updated_by', v_actor);
    end if;
  end if;

  if v_patch <> '{}'::jsonb then
    new := jsonb_populate_record(new, v_patch);
  end if;
  return new;
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
  v_org_id uuid := public.kalam_safe_uuid(coalesce(v_row ->> 'org_id', ''));
  v_record_id text := coalesce(v_row ->> 'id', '');
  v_actor uuid := coalesce(
    public.kalam_safe_uuid(v_new ->> 'updated_by'),
    public.kalam_safe_uuid(v_new ->> 'created_by'),
    public.kalam_safe_uuid(v_old ->> 'updated_by'),
    public.kalam_safe_uuid(v_old ->> 'created_by'),
    auth.uid()
  );
  v_title text := public.kalam_record_audit_title(v_row);
  v_key text;
  v_old_value jsonb;
  v_new_value jsonb;
  v_action text;
  v_is_complex boolean;
  v_hide_value boolean;
  v_parent_module_id text;
  v_parent_record_id text;
  v_excluded_fields text[] := array[
    'id',
    'org_id',
    'created_at',
    'updated_at',
    'created_by',
    'updated_by',
    'created_by_name',
    'updated_by_name',
    'created_by_label',
    'updated_by_label'
  ];
begin
  if tg_table_name = any(array[
    'changelogs',
    'notes',
    'record_files',
    'record_tags',
    'sidebar_unread',
    'workflow_logs',
    'user_login_events',
    'notification_inbox_items',
    'notification_read_states',
    'outbound_messages',
    'ai_action_logs',
    'ai_messages',
    'ai_threads',
    'org_ai_usage_ledger'
  ]) then
    return null;
  end if;

  if v_org_id is null or nullif(v_record_id, '') is null then
    return null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.changelogs (
      org_id,
      module_id,
      record_id,
      action,
      user_id,
      record_title,
      metadata
    )
    values (
      v_org_id,
      tg_table_name,
      v_record_id,
      'create',
      v_actor,
      v_title,
      jsonb_build_object(
        'source', 'db_trigger',
        'summary', public.kalam_record_activity_summary('create', null),
        'table_name', tg_table_name
      )
    );

    if tg_table_name = 'tasks' then
      v_parent_module_id := nullif(coalesce(v_new ->> 'source_module_id', v_new ->> 'related_to_module', ''), '');
      v_parent_record_id := nullif(coalesce(v_new ->> 'source_record_id', ''), '');

      if v_parent_module_id is not null
        and v_parent_record_id is not null
        and (v_parent_module_id is distinct from tg_table_name or v_parent_record_id is distinct from v_record_id)
      then
        insert into public.changelogs (
          org_id,
          module_id,
          record_id,
          action,
          new_value,
          user_id,
          record_title,
          metadata
        )
        values (
          v_org_id,
          v_parent_module_id,
          v_parent_record_id,
          'task_created',
          v_title,
          v_actor,
          v_title,
          jsonb_build_object(
            'source', 'db_trigger',
            'summary', public.kalam_record_activity_summary('task_created', null),
            'table_name', tg_table_name,
            'task_id_present', true
          )
        );
      end if;
    end if;
    return null;
  end if;

  if tg_op = 'DELETE' then
    insert into public.changelogs (
      org_id,
      module_id,
      record_id,
      action,
      user_id,
      record_title,
      metadata
    )
    values (
      v_org_id,
      tg_table_name,
      v_record_id,
      'delete',
      v_actor,
      v_title,
      jsonb_build_object(
        'source', 'db_trigger',
        'summary', public.kalam_record_activity_summary('delete', null),
        'table_name', tg_table_name
      )
    );
    return null;
  end if;

  for v_key, v_new_value in
    select key, value
    from jsonb_each(v_new)
  loop
    if v_key = any(v_excluded_fields) then
      continue;
    end if;

    v_old_value := v_old -> v_key;
    if v_old_value is not distinct from v_new_value then
      continue;
    end if;

    v_action := public.kalam_record_activity_action(v_key, v_old_value, v_new_value);
    v_is_complex := jsonb_typeof(v_old_value) in ('object', 'array') or jsonb_typeof(v_new_value) in ('object', 'array');
    v_hide_value := v_is_complex
      or v_key ~* '(^id$|_id$|_ids$)'
      or public.kalam_safe_uuid(v_old_value #>> '{}') is not null
      or public.kalam_safe_uuid(v_new_value #>> '{}') is not null;

    insert into public.changelogs (
      org_id,
      module_id,
      record_id,
      action,
      field_name,
      old_value,
      new_value,
      user_id,
      record_title,
      metadata
    )
    values (
      v_org_id,
      tg_table_name,
      v_record_id,
      v_action,
      v_key,
      case when v_hide_value then null else nullif(v_old_value #>> '{}', '') end,
      case when v_hide_value then null else nullif(v_new_value #>> '{}', '') end,
      v_actor,
      v_title,
      jsonb_build_object(
        'source', 'db_trigger',
        'summary', public.kalam_record_activity_summary(v_action, v_key),
        'table_name', tg_table_name,
        'value_kind', case when v_is_complex then 'complex' when v_hide_value then 'hidden' else 'scalar' end
      )
    );
  end loop;

  return null;
end;
$$;

do $$
begin
  if to_regclass('public.process_run_stages') is not null then
    alter table public.process_run_stages
      add column if not exists created_by uuid references auth.users(id) on delete set null,
      add column if not exists updated_by uuid references auth.users(id) on delete set null;
  end if;
end $$;

do $$
declare
  tbl record;
  v_excluded_tables text[] := array[
    'app_schema_migrations',
    'system_code_counters',
    'organizations',
    'profiles',
    'company_settings',
    'integration_settings',
    'dynamic_options',
    'saved_views',
    'tags',
    'record_tags',
    'changelogs',
    'notes',
    'record_files',
    'sidebar_unread',
    'workflow_logs',
    'user_login_events',
    'notification_inbox_items',
    'notification_read_states',
    'outbound_messages',
    'ai_action_logs',
    'ai_messages',
    'ai_threads',
    'org_ai_usage_ledger',
    'web_form_submissions',
    'web_form_fields'
  ];
begin
  for tbl in
    select c.table_name
    from information_schema.columns c
    join information_schema.columns idc
      on idc.table_schema = c.table_schema
     and idc.table_name = c.table_name
     and idc.column_name = 'id'
    where c.table_schema = 'public'
      and c.column_name = 'org_id'
      and c.table_name <> all(v_excluded_tables)
      and exists (
        select 1
        from information_schema.tables t
        where t.table_schema = c.table_schema
          and t.table_name = c.table_name
          and t.table_type = 'BASE TABLE'
      )
    order by c.table_name
  loop
    execute format('drop trigger if exists trg_kalam_record_audit_fields_before on public.%I', tbl.table_name);
    execute format(
      'create trigger trg_kalam_record_audit_fields_before before insert or update on public.%I for each row execute function public.kalam_record_audit_fields_before()',
      tbl.table_name
    );

    execute format('drop trigger if exists trg_kalam_record_activity_after on public.%I', tbl.table_name);
    execute format(
      'create trigger trg_kalam_record_activity_after after insert or update or delete on public.%I for each row execute function public.kalam_record_activity_after()',
      tbl.table_name
    );
  end loop;
end $$;

revoke all on function public.kalam_safe_uuid(text) from public;
revoke all on function public.kalam_record_audit_title(jsonb) from public;
revoke all on function public.kalam_record_activity_action(text, jsonb, jsonb) from public;
revoke all on function public.kalam_record_activity_summary(text, text) from public;
revoke all on function public.kalam_record_audit_fields_before() from public;
revoke all on function public.kalam_record_activity_after() from public;

grant execute on function public.kalam_safe_uuid(text) to authenticated, service_role;
grant execute on function public.kalam_record_audit_title(jsonb) to authenticated, service_role;
grant execute on function public.kalam_record_activity_action(text, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.kalam_record_activity_summary(text, text) to authenticated, service_role;

commit;
