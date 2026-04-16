-- =====================================================
-- KalamApp - Phase 104
-- Web forms runtime alignment and attendance datetime repair
-- =====================================================

begin;

create extension if not exists pgcrypto;

alter table if exists public.attendance_logs
  alter column id set default gen_random_uuid();

do $$
declare
  v_data_type text;
begin
  select c.data_type
    into v_data_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'attendance_logs'
    and c.column_name = 'manual_check_in_time';

  if v_data_type = 'time without time zone' then
    execute $sql$
      alter table public.attendance_logs
        alter column manual_check_in_time type timestamptz
        using case
          when manual_check_in_time is null then null
          else timezone(
            'Asia/Tehran',
            ((coalesce(occurred_at, now()) at time zone 'Asia/Tehran')::date + manual_check_in_time)
          )
        end
    $sql$;
  elsif v_data_type = 'timestamp without time zone' then
    execute $sql$
      alter table public.attendance_logs
        alter column manual_check_in_time type timestamptz
        using case
          when manual_check_in_time is null then null
          else timezone('Asia/Tehran', manual_check_in_time)
        end
    $sql$;
  end if;
end;
$$;

do $$
declare
  v_data_type text;
begin
  select c.data_type
    into v_data_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'attendance_logs'
    and c.column_name = 'manual_check_out_time';

  if v_data_type = 'time without time zone' then
    execute $sql$
      alter table public.attendance_logs
        alter column manual_check_out_time type timestamptz
        using case
          when manual_check_out_time is null then null
          else timezone(
            'Asia/Tehran',
            ((coalesce(occurred_at, now()) at time zone 'Asia/Tehran')::date + manual_check_out_time)
          )
        end
    $sql$;
  elsif v_data_type = 'timestamp without time zone' then
    execute $sql$
      alter table public.attendance_logs
        alter column manual_check_out_time type timestamptz
        using case
          when manual_check_out_time is null then null
          else timezone('Asia/Tehran', manual_check_out_time)
        end
    $sql$;
  end if;
end;
$$;

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
  v_field_value jsonb;
  v_target_record jsonb := '{}'::jsonb;
  v_target_record_id uuid;
  v_submission_id uuid;
  v_generated_title text;
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
    'organizations',
    'org_roles',
    'profiles',
    'company_settings',
    'integration_settings',
    'dynamic_options',
    'saved_views',
    'tags',
    'record_tags',
    'changelogs',
    'user_login_events',
    'notes',
    'sidebar_unread',
    'workflows',
    'workflow_logs',
    'report_definitions',
    'report_widgets',
    'report_data_sources',
    'web_forms',
    'web_form_fields',
    'web_form_submissions',
    'fiscal_years',
    'chart_of_accounts',
    'accounting_event_rules',
    'cost_centers',
    'cash_boxes',
    'bank_accounts',
    'cheques',
    'cash_bank_operations',
    'barters',
    'journal_entries'
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
    if trim(coalesce(v_field.target_field_key, '')) = '' then
      continue;
    end if;

    v_field_value := v_submission -> v_field.field_key;
    if v_field_value is null and v_field.default_value is not null then
      v_field_value := v_field.default_value;
    end if;
    if v_field_value is null then
      continue;
    end if;

    v_record_payload := v_record_payload || jsonb_build_object(v_field.target_field_key, v_field_value);
  end loop;

  v_generated_title := coalesce(
    nullif(trim(coalesce(v_record_payload->>'title', '')), ''),
    nullif(trim(coalesce(v_record_payload->>'name', '')), ''),
    nullif(trim(coalesce(v_record_payload->>'full_name', '')), ''),
    nullif(trim(coalesce(v_record_payload->>'subject', '')), ''),
    nullif(trim(coalesce(v_record_payload->>'business_name', '')), ''),
    nullif(trim(concat_ws(' ', v_record_payload->>'first_name', v_record_payload->>'last_name')), ''),
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
  ) and nullif(coalesce(v_record_payload->>'title', ''), '') is null then
    v_record_payload := jsonb_build_object('title', v_generated_title) || v_record_payload;
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_form.target_module_id
      and c.column_name = 'name'
      and c.is_nullable = 'NO'
  ) and nullif(coalesce(v_record_payload->>'name', ''), '') is null then
    v_record_payload := jsonb_build_object('name', v_generated_title) || v_record_payload;
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_form.target_module_id
      and c.column_name = 'full_name'
      and c.is_nullable = 'NO'
  ) and nullif(coalesce(v_record_payload->>'full_name', ''), '') is null then
    v_record_payload := jsonb_build_object('full_name', v_generated_title) || v_record_payload;
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_form.target_module_id
      and c.column_name = 'subject'
      and c.is_nullable = 'NO'
  ) and nullif(coalesce(v_record_payload->>'subject', ''), '') is null then
    v_record_payload := jsonb_build_object('subject', v_generated_title) || v_record_payload;
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_form.target_module_id
      and c.column_name = 'id'
      and c.data_type = 'uuid'
      and c.is_nullable = 'NO'
  ) and nullif(coalesce(v_record_payload->>'id', ''), '') is null then
    v_record_payload := jsonb_build_object('id', gen_random_uuid()) || v_record_payload;
  end if;

  execute format(
    'insert into public.%I as t select * from jsonb_populate_record(null::public.%I, $1) returning to_jsonb(t)',
    v_form.target_module_id,
    v_form.target_module_id
  )
  into v_target_record
  using v_record_payload;

  if nullif(v_target_record->>'id', '') is not null then
    v_target_record_id := (v_target_record->>'id')::uuid;
  end if;

  insert into public.web_form_submissions (
    org_id,
    web_form_id,
    target_module_id,
    target_record_id,
    status,
    submission_data,
    record_payload,
    source_context
  )
  values (
    v_org_id,
    v_form.id,
    v_form.target_module_id,
    v_target_record_id,
    'submitted',
    v_submission,
    v_record_payload,
    v_meta
  )
  returning id into v_submission_id;

  return jsonb_build_object(
    'submission_id', v_submission_id,
    'web_form_id', v_form.id,
    'target_module_id', v_form.target_module_id,
    'target_record', coalesce(v_target_record, '{}'::jsonb),
    'success_message', coalesce(v_form.config->>'success_message', '')
  );
exception
  when others then
    if v_form.id is not null then
      insert into public.web_form_submissions (
        org_id,
        web_form_id,
        target_module_id,
        status,
        submission_data,
        record_payload,
        source_context,
        error_message
      )
      values (
        v_org_id,
        v_form.id,
        v_form.target_module_id,
        'failed',
        coalesce(v_submission, '{}'::jsonb),
        coalesce(v_record_payload, '{}'::jsonb),
        coalesce(v_meta, '{}'::jsonb),
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
