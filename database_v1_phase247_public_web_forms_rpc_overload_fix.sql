-- KalamApp - Phase 247
-- Remove defaulted overload ambiguity for public web form RPCs
-- ===========================================================

begin;

drop function if exists public.get_public_web_form(text, text, text);

create or replace function public.get_public_web_form(
  p_slug text,
  p_hostname text,
  p_access_token text
)
returns table (
  org_id uuid,
  form_id uuid,
  web_form jsonb,
  fields jsonb,
  company_settings jsonb,
  branding_settings jsonb,
  conditional_display jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_token_context jsonb := '{}'::jsonb;
  v_token_form_id uuid;
begin
  if nullif(trim(coalesce(p_access_token, '')), '') is not null then
    v_token_context := public._resolve_web_form_link_context(p_access_token, null, null);
    if nullif(coalesce(v_token_context->>'web_form_id', ''), '') is not null then
      v_token_form_id := (v_token_context->>'web_form_id')::uuid;
    end if;
  end if;

  select *
    into v_row
  from public.get_public_web_form(p_slug, p_hostname)
  limit 1;

  if v_row.form_id is null then
    return;
  end if;

  if v_token_form_id is not null and v_row.form_id is distinct from v_token_form_id then
    raise exception 'WEB_FORM_TOKEN_MISMATCH';
  end if;

  org_id := v_row.org_id;
  form_id := v_row.form_id;
  web_form := v_row.web_form;
  fields := v_row.fields;
  company_settings := v_row.company_settings;
  branding_settings := v_row.branding_settings;
  conditional_display := v_row.conditional_display;
  return next;
end;
$$;

revoke all on function public.get_public_web_form(text, text, text) from public;
grant execute on function public.get_public_web_form(text, text, text) to anon, authenticated, service_role;

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

  if coalesce(v_form.form_type, 'record_create') <> 'survey'
     and v_form.target_module_id <> 'surveys' then
    v_result := public.submit_public_web_form(p_slug, v_submission, v_meta, p_hostname);
    v_submission_id := nullif(coalesce(v_result->>'submission_id', ''), '')::uuid;

    if v_submission_id is not null and v_source_context <> coalesce(v_meta, '{}'::jsonb) then
      update public.web_form_submissions
      set source_context = coalesce(source_context, '{}'::jsonb) || v_source_context,
          updated_at = now()
      where id = v_submission_id
        and org_id = v_org_id;
    end if;

    return v_result;
  end if;

  v_result := public.submit_public_web_form(p_slug, v_submission, v_meta, p_hostname);
  v_target_record_id := nullif(coalesce(v_result->>'target_record_id', ''), '')::uuid;
  v_submission_id := nullif(coalesce(v_result->>'submission_id', ''), '')::uuid;

  if v_target_record_id is null then
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

  v_snapshot := jsonb_build_object(
    'template_id', v_form.id,
    'template_name', coalesce(nullif(trim(coalesce(v_form.name, '')), ''), nullif(trim(coalesce(v_form.route_slug, '')), '')),
    'fields', v_snapshot_fields
  );

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
exception
  when others then
    raise;
end;
$$;

revoke all on function public.submit_public_web_form(text, jsonb, jsonb, text, text) from public;
grant execute on function public.submit_public_web_form(text, jsonb, jsonb, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
