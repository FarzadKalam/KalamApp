-- =====================================================
-- KalamApp - Phase 313
-- Web forms: preserve target table insert defaults
-- =====================================================

begin;

create extension if not exists pgcrypto;

alter table if exists public.recruitment_applicants
  add column if not exists image_url text;

create or replace function public.submit_public_web_form(
  p_slug text,
  p_submission jsonb default '{}'::jsonb,
  p_meta jsonb default '{}'::jsonb,
  p_hostname text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_org_id uuid;
  v_form public.web_forms%rowtype;
  v_field record;
  v_submission jsonb := coalesce(p_submission, '{}'::jsonb);
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_defaults jsonb := '{}'::jsonb;
  v_record_payload jsonb := '{}'::jsonb;
  v_insert_payload jsonb := '{}'::jsonb;
  v_submission_record_payload jsonb := '{}'::jsonb;
  v_record_files jsonb := '[]'::jsonb;
  v_field_value jsonb;
  v_target_record jsonb := '{}'::jsonb;
  v_existing_record jsonb := '{}'::jsonb;
  v_target_record_id uuid;
  v_existing_record_id uuid;
  v_submission_id uuid;
  v_generated_title text;
  v_duplicate_match_field text := '';
  v_duplicate_strategy text := 'allow';
  v_target_has_org_id boolean := false;
  v_duplicate_column_exists boolean := false;
  v_record_action text := 'created';
  v_update_assignments text := '';
  v_insert_columns text := '';
  v_insert_select_columns text := '';
  v_match_value_text text := '';
  v_first_upload_url text := '';
  v_target_record_id_text text := '';
begin
  if v_slug = '' then
    raise exception 'WEB_FORM_SLUG_REQUIRED';
  end if;

  select b.org_id
    into v_org_id
  from public.get_public_branding(p_hostname) b
  limit 1;

  select *
    into v_form
  from public.web_forms wf
  where wf.org_id = v_org_id
    and wf.is_active = true
    and lower(wf.route_slug) = v_slug
  order by wf.updated_at desc nulls last, wf.created_at desc nulls last
  limit 1;

  if v_form.id is null then
    raise exception 'WEB_FORM_NOT_FOUND';
  end if;

  if coalesce(v_form.access_scope, 'public') = 'internal' and auth.uid() is null then
    raise exception 'WEB_FORM_AUTH_REQUIRED';
  end if;

  if trim(coalesce(v_form.target_module_id, '')) = '' then
    raise exception 'WEB_FORM_TARGET_REQUIRED';
  end if;

  if v_form.target_module_id = any(array[
    'organizations','org_roles','profiles','company_settings','integration_settings','dynamic_options',
    'saved_views','tags','record_tags','changelogs','user_login_events','notes','sidebar_unread',
    'workflows','workflow_logs','report_definitions','report_widgets','report_data_sources',
    'web_forms','web_form_fields','web_form_submissions','fiscal_years','chart_of_accounts',
    'accounting_event_rules','cost_centers','cash_boxes','bank_accounts','cheques',
    'cash_bank_operations','barters','journal_entries'
  ]) then
    raise exception 'WEB_FORM_TARGET_NOT_ALLOWED';
  end if;

  if not exists (
    select 1
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name = v_form.target_module_id
  ) then
    raise exception 'WEB_FORM_TARGET_INVALID';
  end if;

  v_defaults := coalesce(v_form.config->'default_record_values', '{}'::jsonb);
  if jsonb_typeof(v_defaults) is distinct from 'object' then
    v_defaults := '{}'::jsonb;
  end if;

  v_record_payload := v_defaults || jsonb_build_object('org_id', v_org_id);

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_form.target_module_id
      and c.column_name = 'org_id'
  )
  into v_target_has_org_id;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_form.target_module_id
      and c.column_name = 'lead_source'
  ) and not (v_record_payload ? 'lead_source') then
    v_record_payload := v_record_payload || jsonb_build_object('lead_source', 'web_form');
  end if;

  for v_field in
    select *
    from public.web_form_fields
    where web_form_id = v_form.id
      and is_active = true
    order by sort_order asc, created_at asc
  loop
    v_field_value := v_submission -> v_field.field_key;
    if v_field_value is null and v_field.default_value is not null then
      v_field_value := v_field.default_value;
    end if;
    if v_field_value is null then
      continue;
    end if;

    if coalesce(v_field.field_type, '') in ('image', 'file') then
      select coalesce(item->>'url', '')
        into v_first_upload_url
      from jsonb_array_elements(
        case when jsonb_typeof(v_field_value) = 'array' then v_field_value else '[]'::jsonb end
      ) item
      where trim(coalesce(item->>'url', '')) <> ''
      limit 1;

      v_record_files := v_record_files || (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'url', trim(coalesce(item->>'url', '')),
              'name', nullif(trim(coalesce(item->>'name', '')), ''),
              'mime_type', nullif(trim(coalesce(item->>'mimeType', item->>'mime_type', '')), ''),
              'file_type', case when v_field.field_type = 'image' then 'image' else 'file' end,
              'field_key', v_field.field_key,
              'target_field_key', nullif(trim(coalesce(v_field.target_field_key, '')), '')
            )
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(
          case when jsonb_typeof(v_field_value) = 'array' then v_field_value else '[]'::jsonb end
        ) item
        where trim(coalesce(item->>'url', '')) <> ''
      );

      if v_field.field_type = 'image'
         and trim(coalesce(v_field.target_field_key, '')) <> ''
         and v_field.target_field_key <> '__record_image__'
         and v_field.target_field_key <> '__record_files__'
         and trim(coalesce(v_first_upload_url, '')) <> '' then
        v_record_payload := v_record_payload || jsonb_build_object(v_field.target_field_key, v_first_upload_url);
      end if;
      continue;
    end if;

    if trim(coalesce(v_field.target_field_key, '')) = '' then
      continue;
    end if;

    v_record_payload := v_record_payload || jsonb_build_object(v_field.target_field_key, v_field_value);
  end loop;

  if v_form.target_module_id = 'attendance_logs' then
    if nullif(coalesce(v_record_payload->>'log_type', ''), '') is null then
      v_record_payload := v_record_payload || jsonb_build_object('log_type', 'check_in');
    end if;

    if nullif(coalesce(v_record_payload->>'source_type', ''), '') is null then
      v_record_payload := v_record_payload || jsonb_build_object('source_type', 'web_form');
    end if;

    if nullif(coalesce(v_record_payload->>'occurred_at', ''), '') is null then
      if nullif(coalesce(v_record_payload->>'manual_check_in_time', ''), '') is not null then
        v_record_payload := v_record_payload || jsonb_build_object('occurred_at', v_record_payload->>'manual_check_in_time');
      elsif nullif(coalesce(v_record_payload->>'manual_check_out_time', ''), '') is not null then
        v_record_payload := v_record_payload || jsonb_build_object('occurred_at', v_record_payload->>'manual_check_out_time');
      else
        v_record_payload := v_record_payload || jsonb_build_object('occurred_at', now());
      end if;
    end if;

    if nullif(coalesce(v_record_payload->>'assignee_type', ''), '') is null then
      v_record_payload := v_record_payload || jsonb_build_object('assignee_type', 'user');
    end if;
  end if;

  v_duplicate_match_field := trim(coalesce(v_form.config->>'duplicate_match_field', ''));
  v_duplicate_strategy := case
    when coalesce(v_form.config->>'duplicate_strategy', '') in ('allow', 'update', 'skip') then (v_form.config->>'duplicate_strategy')
    else 'allow'
  end;

  if v_duplicate_match_field <> '' then
    select exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_form.target_module_id
        and c.column_name = v_duplicate_match_field
    )
    into v_duplicate_column_exists;

    v_match_value_text := trim(coalesce(v_record_payload->>v_duplicate_match_field, ''));
  end if;

  if v_duplicate_column_exists and v_match_value_text <> '' then
    if v_target_has_org_id then
      execute format(
        'select to_jsonb(t)
         from public.%1$I t
         cross join lateral jsonb_populate_record(null::public.%1$I, $2) as src
         where t.org_id = $1
           and t.%2$I is not distinct from src.%2$I
         limit 1',
        v_form.target_module_id,
        v_duplicate_match_field
      )
      into v_existing_record
      using v_org_id, v_record_payload;
    else
      execute format(
        'select to_jsonb(t)
         from public.%1$I t
         cross join lateral jsonb_populate_record(null::public.%1$I, $1) as src
         where t.%2$I is not distinct from src.%2$I
         limit 1',
        v_form.target_module_id,
        v_duplicate_match_field
      )
      into v_existing_record
      using v_record_payload;
    end if;

    if nullif(coalesce(v_existing_record->>'id', ''), '') is not null then
      v_existing_record_id := (v_existing_record->>'id')::uuid;
    end if;
  end if;

  if v_existing_record_id is not null and v_duplicate_strategy = 'skip' then
    v_target_record := v_existing_record;
    v_target_record_id := v_existing_record_id;
    v_record_action := 'skipped';
    v_submission_record_payload := v_record_payload;
  elsif v_existing_record_id is not null and v_duplicate_strategy = 'update' then
    select string_agg(format('%1$I = src.%1$I', c.column_name), ', ')
      into v_update_assignments
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_form.target_module_id
      and c.column_name not in ('id', 'org_id', 'created_at', 'created_by', 'updated_at', 'updated_by')
      and exists (
        select 1
        from jsonb_object_keys(v_record_payload) as payload_key(key)
        where payload_key.key = c.column_name
      );

    if coalesce(v_update_assignments, '') <> '' then
      execute format(
        'update public.%1$I as t
         set %2$s
         from (select * from jsonb_populate_record(null::public.%1$I, $2)) as src
         where t.id = $1
         returning to_jsonb(t)',
        v_form.target_module_id,
        v_update_assignments
      )
      into v_target_record
      using v_existing_record_id, v_record_payload;
    else
      v_target_record := v_existing_record;
    end if;

    v_target_record_id := v_existing_record_id;
    v_record_action := 'updated';
    v_submission_record_payload := v_record_payload;
  else
    v_insert_payload := v_record_payload;

    v_generated_title := coalesce(
      nullif(trim(coalesce(v_insert_payload->>'title', '')), ''),
      nullif(trim(coalesce(v_insert_payload->>'name', '')), ''),
      nullif(trim(coalesce(v_insert_payload->>'full_name', '')), ''),
      nullif(trim(coalesce(v_insert_payload->>'subject', '')), ''),
      nullif(trim(coalesce(v_insert_payload->>'business_name', '')), ''),
      nullif(trim(concat_ws(' ', v_insert_payload->>'first_name', v_insert_payload->>'last_name')), ''),
      nullif(trim(coalesce(v_form.name, '')), ''),
      'Web form ' || to_char(now(), 'YYYY-MM-DD HH24:MI')
    );

    if exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_form.target_module_id
        and c.column_name = 'title'
        and c.is_nullable = 'NO'
    ) and nullif(coalesce(v_insert_payload->>'title', ''), '') is null then
      v_insert_payload := jsonb_build_object('title', v_generated_title) || v_insert_payload;
    end if;

    if exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_form.target_module_id
        and c.column_name = 'name'
        and c.is_nullable = 'NO'
    ) and nullif(coalesce(v_insert_payload->>'name', ''), '') is null then
      v_insert_payload := jsonb_build_object('name', v_generated_title) || v_insert_payload;
    end if;

    if exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_form.target_module_id
        and c.column_name = 'full_name'
        and c.is_nullable = 'NO'
    ) and nullif(coalesce(v_insert_payload->>'full_name', ''), '') is null then
      v_insert_payload := jsonb_build_object('full_name', v_generated_title) || v_insert_payload;
    end if;

    if exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_form.target_module_id
        and c.column_name = 'subject'
        and c.is_nullable = 'NO'
    ) and nullif(coalesce(v_insert_payload->>'subject', ''), '') is null then
      v_insert_payload := jsonb_build_object('subject', v_generated_title) || v_insert_payload;
    end if;

    if exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_form.target_module_id
        and c.column_name = 'id'
        and c.data_type = 'uuid'
        and c.is_nullable = 'NO'
    ) and nullif(coalesce(v_insert_payload->>'id', ''), '') is null then
      v_insert_payload := jsonb_build_object('id', gen_random_uuid()) || v_insert_payload;
    end if;

    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position),
           string_agg(format('src.%I', c.column_name), ', ' order by c.ordinal_position)
      into v_insert_columns, v_insert_select_columns
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_form.target_module_id
      and exists (
        select 1
        from jsonb_each(v_insert_payload) payload
        where payload.key = c.column_name
      );

    if coalesce(v_insert_columns, '') = '' then
      raise exception 'WEB_FORM_EMPTY_INSERT_PAYLOAD';
    end if;

    execute format(
      'insert into public.%1$I as t (%2$s)
       select %3$s
       from jsonb_populate_record(null::public.%1$I, $1) as src
       returning to_jsonb(t)',
      v_form.target_module_id,
      v_insert_columns,
      v_insert_select_columns
    )
    into v_target_record
    using v_insert_payload;

    if nullif(v_target_record->>'id', '') is not null then
      v_target_record_id := (v_target_record->>'id')::uuid;
    end if;

    v_record_action := 'created';
    v_submission_record_payload := v_insert_payload;
  end if;

  v_target_record_id_text := trim(coalesce(v_target_record->>'id', ''));
  if v_target_record_id_text = '' and v_target_record_id is not null then
    v_target_record_id_text := v_target_record_id::text;
  end if;

  if jsonb_typeof(v_record_files) = 'array' and jsonb_array_length(v_record_files) > 0 then
    if not exists (
      select 1
      from information_schema.tables t
      where t.table_schema = 'public'
        and t.table_name = 'record_files'
    ) then
      raise exception 'WEB_FORM_RECORD_FILES_TABLE_REQUIRED';
    end if;

    if v_target_record_id_text = '' then
      raise exception 'WEB_FORM_FILE_TARGET_ID_REQUIRED';
    end if;

    insert into public.record_files (
      org_id,
      module_id,
      record_id,
      file_url,
      file_type,
      file_name,
      mime_type,
      sort_order,
      source_module_id,
      source_record_id,
      source_record_title
    )
    select
      v_org_id,
      v_form.target_module_id,
      v_target_record_id_text,
      item.value->>'url',
      coalesce(nullif(item.value->>'file_type', ''), 'file'),
      nullif(item.value->>'name', ''),
      nullif(item.value->>'mime_type', ''),
      greatest(item.ordinality - 1, 0),
      'web_forms',
      v_form.id::text,
      nullif(trim(coalesce(v_form.name, '')), '')
    from jsonb_array_elements(v_record_files) with ordinality as item(value, ordinality)
    where trim(coalesce(item.value->>'url', '')) <> '';
  end if;

  insert into public.web_form_submissions (
    org_id, web_form_id, target_module_id, target_record_id, status,
    submission_data, record_payload, source_context
  )
  values (
    v_org_id,
    v_form.id,
    v_form.target_module_id,
    v_target_record_id,
    'submitted',
    v_submission,
    coalesce(v_submission_record_payload, v_record_payload, '{}'::jsonb),
    coalesce(v_meta, '{}'::jsonb) || jsonb_build_object(
      'record_action', v_record_action,
      'duplicate_strategy', v_duplicate_strategy,
      'duplicate_match_field', nullif(v_duplicate_match_field, ''),
      'uploaded_files_count', case when jsonb_typeof(v_record_files) = 'array' then jsonb_array_length(v_record_files) else 0 end
    )
  )
  returning id into v_submission_id;

  return jsonb_build_object(
    'submission_id', v_submission_id,
    'web_form_id', v_form.id,
    'target_module_id', v_form.target_module_id,
    'target_record_id', v_target_record_id,
    'target_record', coalesce(v_target_record, '{}'::jsonb),
    'record_action', v_record_action,
    'duplicate_strategy', v_duplicate_strategy,
    'duplicate_match_field', nullif(v_duplicate_match_field, ''),
    'uploaded_files_count', case when jsonb_typeof(v_record_files) = 'array' then jsonb_array_length(v_record_files) else 0 end,
    'success_message', coalesce(v_form.config->>'success_message', '')
  );
exception
  when others then
    if v_form.id is not null then
      insert into public.web_form_submissions (
        org_id, web_form_id, target_module_id, status,
        submission_data, record_payload, source_context, error_message
      )
      values (
        v_org_id,
        v_form.id,
        v_form.target_module_id,
        'failed',
        coalesce(v_submission, '{}'::jsonb),
        coalesce(v_submission_record_payload, v_record_payload, '{}'::jsonb),
        coalesce(v_meta, '{}'::jsonb) || jsonb_build_object(
          'record_action', v_record_action,
          'duplicate_strategy', v_duplicate_strategy,
          'duplicate_match_field', nullif(v_duplicate_match_field, ''),
          'uploaded_files_count', case when jsonb_typeof(v_record_files) = 'array' then jsonb_array_length(v_record_files) else 0 end
        ),
        sqlerrm
      );
    end if;
    raise;
end;
$$;

revoke all on function public.submit_public_web_form(text, jsonb, jsonb, text) from public;
grant execute on function public.submit_public_web_form(text, jsonb, jsonb, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
