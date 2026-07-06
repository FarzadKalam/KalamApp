-- =====================================================
-- KalamApp - Phase 315
-- Web forms: only attach template snapshots when template fields exist
-- =====================================================

begin;

drop function if exists public.submit_public_web_form(text, jsonb, jsonb, text, text);

create or replace function public.submit_public_web_form(
  p_slug text,
  p_submission jsonb,
  p_meta jsonb,
  p_hostname text,
  p_access_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_submission jsonb := coalesce(p_submission, '{}'::jsonb);
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_org_id uuid;
  v_form public.web_forms%rowtype;
  v_result jsonb := '{}'::jsonb;
  v_token_context jsonb := '{}'::jsonb;
  v_field record;
  v_binding_type text;
  v_template_values jsonb := '{}'::jsonb;
  v_snapshot_fields jsonb := '[]'::jsonb;
  v_snapshot jsonb := '{}'::jsonb;
  v_target_record_id uuid;
  v_target_record jsonb := '{}'::jsonb;
  v_submission_id uuid;
  v_source_context jsonb := '{}'::jsonb;
  v_supports_template_target boolean := false;
  v_has_template_fields boolean := false;
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

  if nullif(trim(coalesce(p_access_token, '')), '') is not null then
    v_token_context := public._resolve_web_form_link_context(p_access_token, v_form.id, v_org_id);
  end if;

  v_source_context := coalesce(v_meta, '{}'::jsonb);
  if v_token_context <> '{}'::jsonb then
    v_source_context := v_source_context
      || jsonb_build_object(
        'access_token', lower(trim(coalesce(p_access_token, ''))),
        'link_context', v_token_context
      );
  end if;

  v_supports_template_target := coalesce(v_form.target_module_id, '') in (
    'surveys',
    'marketing_leads',
    'recruitment_applicants',
    'employees'
  );

  if v_form.target_module_id = 'attendance_logs' then
    if nullif(coalesce(v_submission->>'assignee_type', ''), '') is null then
      v_submission := v_submission || jsonb_build_object('assignee_type', 'user');
    end if;

    if nullif(coalesce(v_submission->>'log_type', ''), '') is null then
      v_submission := v_submission || jsonb_build_object('log_type', 'check_in');
    end if;

    if nullif(coalesce(v_submission->>'source_type', ''), '') is null then
      v_submission := v_submission || jsonb_build_object('source_type', 'web_form');
    end if;
  end if;

  v_result := public.submit_public_web_form(p_slug, v_submission, v_meta, p_hostname);
  v_target_record_id := nullif(coalesce(v_result->>'target_record_id', ''), '')::uuid;
  v_submission_id := nullif(coalesce(v_result->>'submission_id', ''), '')::uuid;

  if not v_supports_template_target or v_target_record_id is null then
    if v_submission_id is not null and v_source_context <> coalesce(v_meta, '{}'::jsonb) then
      update public.web_form_submissions
      set source_context = coalesce(source_context, '{}'::jsonb) || v_source_context,
          updated_at = now()
      where id = v_submission_id
        and org_id = v_org_id;
    end if;

    return v_result;
  end if;

  for v_field in
    select *
    from public.web_form_fields
    where web_form_id = v_form.id
      and is_active = true
    order by sort_order asc, created_at asc
  loop
    v_binding_type := case
      when coalesce(v_field.config->>'binding_type', '') = 'template_field' then 'template_field'
      when nullif(trim(coalesce(v_field.target_field_key, '')), '') is null then 'template_field'
      else 'record_field'
    end;

    if v_binding_type = 'template_field' then
      v_has_template_fields := true;

      if v_submission ? v_field.field_key then
        v_template_values := v_template_values || jsonb_build_object(v_field.field_key, v_submission -> v_field.field_key);
      elsif v_field.default_value is not null then
        v_template_values := v_template_values || jsonb_build_object(v_field.field_key, v_field.default_value);
      end if;
    end if;

    v_snapshot_fields := v_snapshot_fields || jsonb_build_array(
      jsonb_build_object(
        'field_key', v_field.field_key,
        'label', v_field.label,
        'target_field_key', nullif(trim(coalesce(v_field.target_field_key, '')), ''),
        'field_type', v_field.field_type,
        'placeholder', v_field.placeholder,
        'help_text', v_field.help_text,
        'default_value', v_field.default_value,
        'is_required', coalesce(v_field.is_required, false),
        'is_hidden', coalesce(v_field.is_hidden, false),
        'sort_order', coalesce(v_field.sort_order, 10),
        'binding_type', v_binding_type,
        'config', coalesce(v_field.config, '{}'::jsonb)
      )
    );
  end loop;

  if v_form.target_module_id <> 'surveys' and not v_has_template_fields then
    if v_submission_id is not null then
      update public.web_form_submissions
      set source_context = coalesce(source_context, '{}'::jsonb) || v_source_context,
          updated_at = now()
      where id = v_submission_id
        and org_id = v_org_id;
    end if;

    return v_result;
  end if;

  v_snapshot := jsonb_build_object(
    'template_id', v_form.id,
    'template_name', coalesce(nullif(trim(coalesce(v_form.name, '')), ''), nullif(trim(coalesce(v_form.route_slug, '')), '')),
    'fields', v_snapshot_fields
  );

  if v_form.target_module_id = 'surveys' then
    update public.surveys s
    set survey_template_id = v_form.id,
        related_module_id = nullif(trim(coalesce(v_token_context->>'related_module_id', '')), ''),
        related_record_id = nullif(coalesce(v_token_context->>'related_record_id', ''), '')::uuid,
        template_field_values = coalesce(v_template_values, '{}'::jsonb),
        template_schema_snapshot = v_snapshot,
        updated_at = now()
    where s.id = v_target_record_id
      and s.org_id = v_org_id
    returning to_jsonb(s) into v_target_record;
  else
    execute format(
      'with updated as (
         update public.%1$I
            set survey_template_id = $1,
                template_field_values = $2,
                template_schema_snapshot = $3,
                updated_at = now()
          where id = $4
            and org_id = $5
          returning *
       )
       select to_jsonb(updated) from updated',
      v_form.target_module_id
    )
    using
      v_form.id,
      coalesce(v_template_values, '{}'::jsonb),
      v_snapshot,
      v_target_record_id,
      v_org_id
    into v_target_record;
  end if;

  if v_submission_id is not null then
    update public.web_form_submissions
    set source_context = coalesce(source_context, '{}'::jsonb) || v_source_context,
        record_payload = coalesce(record_payload, '{}'::jsonb)
          || jsonb_build_object(
            'survey_template_id', v_form.id,
            'template_field_values', coalesce(v_template_values, '{}'::jsonb),
            'template_schema_snapshot', v_snapshot,
            'related_module_id', nullif(trim(coalesce(v_token_context->>'related_module_id', '')), ''),
            'related_record_id', nullif(coalesce(v_token_context->>'related_record_id', ''), '')::uuid
          ),
        updated_at = now()
    where id = v_submission_id
      and org_id = v_org_id;
  end if;

  return v_result || jsonb_build_object(
    'target_record', coalesce(v_target_record, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.submit_public_web_form(text, jsonb, jsonb, text, text) from public;
grant execute on function public.submit_public_web_form(text, jsonb, jsonb, text, text) to anon, authenticated, service_role;

update public.employees e
set survey_template_id = null,
    template_field_values = '{}'::jsonb,
    template_schema_snapshot = '{}'::jsonb,
    updated_at = now()
where e.survey_template_id is not null
  and not exists (
    select 1
    from public.web_form_fields wff
    where wff.web_form_id = e.survey_template_id
      and wff.is_active = true
      and (
        coalesce(wff.config->>'binding_type', '') = 'template_field'
        or nullif(trim(coalesce(wff.target_field_key, '')), '') is null
      )
  );

notify pgrst, 'reload schema';

commit;
