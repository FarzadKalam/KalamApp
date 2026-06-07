-- =====================================================
-- KalamApp - Phase 234
-- Survey templates, related survey context, and tokenized web-form links
-- =====================================================

begin;

create extension if not exists pgcrypto;

alter table if exists public.surveys
  add column if not exists survey_template_id uuid,
  add column if not exists related_module_id text,
  add column if not exists related_record_id uuid,
  add column if not exists template_field_values jsonb not null default '{}'::jsonb,
  add column if not exists template_schema_snapshot jsonb not null default '{}'::jsonb;

update public.surveys
set
  template_field_values = coalesce(template_field_values, '{}'::jsonb),
  template_schema_snapshot = coalesce(template_schema_snapshot, '{}'::jsonb)
where template_field_values is null
   or template_schema_snapshot is null;

alter table if exists public.surveys
  alter column template_field_values set default '{}'::jsonb,
  alter column template_field_values set not null,
  alter column template_schema_snapshot set default '{}'::jsonb,
  alter column template_schema_snapshot set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'surveys_survey_template_id_fkey'
      and conrelid = 'public.surveys'::regclass
  ) then
    alter table public.surveys
      add constraint surveys_survey_template_id_fkey
      foreign key (survey_template_id)
      references public.web_forms(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists idx_surveys_org_template
  on public.surveys(org_id, survey_template_id);

create index if not exists idx_surveys_org_related
  on public.surveys(org_id, related_module_id, related_record_id);

alter table if exists public.web_forms
  drop constraint if exists chk_web_forms_form_type;

alter table if exists public.web_forms
  add constraint chk_web_forms_form_type
  check (form_type in ('record_create', 'survey'));

update public.web_forms
set form_type = 'survey'
where target_module_id = 'surveys'
  and coalesce(trim(form_type), '') in ('', 'record_create');

create table if not exists public.web_form_link_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  web_form_id uuid not null references public.web_forms(id) on delete cascade,
  target_module_id text,
  related_module_id text,
  related_record_id uuid,
  access_token text not null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chk_web_form_link_tokens_access_token
    check (access_token ~ '^[0-9a-f]{48}$')
);

create unique index if not exists web_form_link_tokens_access_token_uidx
  on public.web_form_link_tokens(access_token);

create index if not exists idx_web_form_link_tokens_org_form
  on public.web_form_link_tokens(org_id, web_form_id, expires_at desc);

create index if not exists idx_web_form_link_tokens_org_related
  on public.web_form_link_tokens(org_id, related_module_id, related_record_id);

grant select, insert, update, delete on public.web_form_link_tokens to authenticated, service_role;

alter table public.web_form_link_tokens enable row level security;

drop policy if exists p_web_form_link_tokens_org_all on public.web_form_link_tokens;
create policy p_web_form_link_tokens_org_all
on public.web_form_link_tokens
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

create or replace function public._resolve_web_form_link_context(
  p_access_token text,
  p_web_form_id uuid default null,
  p_org_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := lower(trim(coalesce(p_access_token, '')));
  v_row public.web_form_link_tokens%rowtype;
begin
  if v_token = '' then
    return '{}'::jsonb;
  end if;

  select *
    into v_row
  from public.web_form_link_tokens
  where access_token = v_token
  limit 1;

  if v_row.id is null then
    raise exception 'WEB_FORM_TOKEN_INVALID';
  end if;

  if v_row.expires_at <= now() then
    raise exception 'WEB_FORM_TOKEN_EXPIRED';
  end if;

  if p_web_form_id is not null and v_row.web_form_id is distinct from p_web_form_id then
    raise exception 'WEB_FORM_TOKEN_MISMATCH';
  end if;

  if p_org_id is not null and v_row.org_id is distinct from p_org_id then
    raise exception 'WEB_FORM_TOKEN_ORG_MISMATCH';
  end if;

  return jsonb_build_object(
    'token_id', v_row.id,
    'org_id', v_row.org_id,
    'web_form_id', v_row.web_form_id,
    'target_module_id', v_row.target_module_id,
    'related_module_id', v_row.related_module_id,
    'related_record_id', v_row.related_record_id,
    'expires_at', v_row.expires_at
  );
end;
$$;

revoke all on function public._resolve_web_form_link_context(text, uuid, uuid) from public, anon, authenticated;

create or replace function public.create_web_form_link_token(
  p_web_form_id uuid,
  p_target_module_id text default null,
  p_related_module_id text default null,
  p_related_record_id uuid default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_form public.web_forms%rowtype;
  v_token text;
  v_row public.web_form_link_tokens%rowtype;
begin
  if auth.uid() is null then
    raise exception 'WEB_FORM_LINK_AUTH_REQUIRED';
  end if;

  if v_org_id is null then
    raise exception 'WEB_FORM_LINK_ORG_REQUIRED';
  end if;

  select *
    into v_form
  from public.web_forms
  where id = p_web_form_id
    and org_id = v_org_id
  limit 1;

  if v_form.id is null then
    raise exception 'WEB_FORM_NOT_FOUND';
  end if;

  v_token := substr(
    encode(sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)), 'hex'),
    1,
    48
  );

  insert into public.web_form_link_tokens (
    org_id,
    web_form_id,
    target_module_id,
    related_module_id,
    related_record_id,
    access_token,
    expires_at,
    created_by
  )
  values (
    v_org_id,
    v_form.id,
    nullif(trim(coalesce(p_target_module_id, v_form.target_module_id, '')), ''),
    nullif(trim(coalesce(p_related_module_id, '')), ''),
    p_related_record_id,
    v_token,
    coalesce(p_expires_at, now() + interval '30 days'),
    auth.uid()
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'token', v_row.access_token,
    'expires_at', v_row.expires_at,
    'web_form_id', v_row.web_form_id,
    'target_module_id', v_row.target_module_id,
    'related_module_id', v_row.related_module_id,
    'related_record_id', v_row.related_record_id
  );
end;
$$;

revoke all on function public.create_web_form_link_token(uuid, text, text, uuid, timestamptz) from public;
grant execute on function public.create_web_form_link_token(uuid, text, text, uuid, timestamptz) to authenticated, service_role;

drop function if exists public.get_public_web_form(text, text, text);
create or replace function public.get_public_web_form(
  p_slug text default 'inquiry',
  p_hostname text default null,
  p_access_token text default null
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
  p_submission jsonb default '{}'::jsonb,
  p_meta jsonb default '{}'::jsonb,
  p_hostname text default null,
  p_access_token text default null
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
