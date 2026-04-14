-- KalamApp - Phase 60
-- Dynamic web forms for public inquiry and module-scoped intake

create table if not exists public.web_forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  name text not null,
  description text,
  route_slug text not null,
  target_module_id text not null,
  access_scope text not null default 'public',
  form_type text not null default 'record_create',
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_web_forms_access_scope check (access_scope in ('public', 'internal')),
  constraint chk_web_forms_form_type check (form_type in ('record_create')),
  constraint chk_web_forms_route_slug check (length(trim(route_slug)) > 0)
);

alter table public.web_forms
  add column if not exists description text,
  add column if not exists route_slug text,
  add column if not exists target_module_id text,
  add column if not exists access_scope text default 'public',
  add column if not exists form_type text default 'record_create',
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'web_forms'
      and column_name = 'module_id'
  ) then
    execute $sql$
      update public.web_forms
      set target_module_id = coalesce(target_module_id, module_id)
      where target_module_id is null
         or trim(target_module_id) = ''
    $sql$;
  end if;
end;
$$;

update public.web_forms
set route_slug = regexp_replace(lower(coalesce(nullif(trim(name), ''), id::text)), '\s+', '-', 'g')
where route_slug is null
   or trim(route_slug) = '';

update public.web_forms
set access_scope = 'public'
where access_scope is null
   or trim(access_scope) = '';

update public.web_forms
set form_type = 'record_create'
where form_type is null
   or trim(form_type) = '';

update public.web_forms
set config = '{}'::jsonb
where config is null;

update public.web_forms
set is_active = true
where is_active is null;

alter table public.web_forms alter column access_scope set default 'public';
alter table public.web_forms alter column form_type set default 'record_create';
alter table public.web_forms alter column config set default '{}'::jsonb;
alter table public.web_forms alter column is_active set default true;
alter table public.web_forms alter column created_at set default now();
alter table public.web_forms alter column updated_at set default now();

alter table public.web_forms drop constraint if exists chk_web_forms_access_scope;
alter table public.web_forms drop constraint if exists chk_web_forms_form_type;
alter table public.web_forms drop constraint if exists chk_web_forms_route_slug;

alter table public.web_forms
  add constraint chk_web_forms_access_scope check (access_scope in ('public', 'internal'));

alter table public.web_forms
  add constraint chk_web_forms_form_type check (form_type in ('record_create'));

alter table public.web_forms
  add constraint chk_web_forms_route_slug check (length(trim(route_slug)) > 0);

create unique index if not exists idx_web_forms_org_slug_unique
  on public.web_forms(org_id, lower(route_slug));

create index if not exists idx_web_forms_org_module
  on public.web_forms(org_id, target_module_id, is_active);

create table if not exists public.web_form_fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  web_form_id uuid not null references public.web_forms(id) on delete cascade,
  field_key text not null,
  label text not null,
  target_field_key text,
  field_type text not null default 'text',
  placeholder text,
  help_text text,
  default_value jsonb,
  config jsonb not null default '{}'::jsonb,
  sort_order integer not null default 10,
  is_required boolean not null default false,
  is_hidden boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_web_form_fields_type check (field_type in ('text', 'long_text', 'number', 'phone', 'date', 'datetime', 'checkbox', 'select'))
);

alter table public.web_form_fields
  add column if not exists target_field_key text,
  add column if not exists placeholder text,
  add column if not exists help_text text,
  add column if not exists default_value jsonb,
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists sort_order integer not null default 10,
  add column if not exists is_required boolean not null default false,
  add column if not exists is_hidden boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.web_form_fields
set config = '{}'::jsonb
where config is null;

update public.web_form_fields
set sort_order = 10
where sort_order is null;

update public.web_form_fields
set is_required = false
where is_required is null;

update public.web_form_fields
set is_hidden = false
where is_hidden is null;

update public.web_form_fields
set is_active = true
where is_active is null;

alter table public.web_form_fields alter column config set default '{}'::jsonb;
alter table public.web_form_fields alter column sort_order set default 10;
alter table public.web_form_fields alter column is_required set default false;
alter table public.web_form_fields alter column is_hidden set default false;
alter table public.web_form_fields alter column is_active set default true;
alter table public.web_form_fields alter column created_at set default now();
alter table public.web_form_fields alter column updated_at set default now();

alter table public.web_form_fields drop constraint if exists chk_web_form_fields_type;

alter table public.web_form_fields
  add constraint chk_web_form_fields_type check (field_type in ('text', 'long_text', 'number', 'phone', 'date', 'datetime', 'checkbox', 'select'));

create unique index if not exists idx_web_form_fields_form_key_unique
  on public.web_form_fields(web_form_id, field_key);

create index if not exists idx_web_form_fields_org_sort
  on public.web_form_fields(org_id, web_form_id, sort_order, is_active);

create table if not exists public.web_form_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  web_form_id uuid references public.web_forms(id) on delete set null,
  target_module_id text,
  target_record_id uuid,
  status text not null default 'submitted',
  submission_data jsonb not null default '{}'::jsonb,
  record_payload jsonb not null default '{}'::jsonb,
  source_context jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_web_form_submissions_status check (status in ('submitted', 'failed'))
);

alter table public.web_form_submissions
  add column if not exists target_module_id text,
  add column if not exists target_record_id uuid,
  add column if not exists record_payload jsonb not null default '{}'::jsonb,
  add column if not exists source_context jsonb not null default '{}'::jsonb,
  add column if not exists error_message text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.web_form_submissions
set record_payload = '{}'::jsonb
where record_payload is null;

update public.web_form_submissions
set source_context = '{}'::jsonb
where source_context is null;

alter table public.web_form_submissions alter column record_payload set default '{}'::jsonb;
alter table public.web_form_submissions alter column source_context set default '{}'::jsonb;
alter table public.web_form_submissions alter column created_at set default now();
alter table public.web_form_submissions alter column updated_at set default now();

alter table public.web_form_submissions drop constraint if exists chk_web_form_submissions_status;

alter table public.web_form_submissions
  add constraint chk_web_form_submissions_status check (status in ('submitted', 'failed'));

create index if not exists idx_web_form_submissions_form_created
  on public.web_form_submissions(web_form_id, created_at desc);

create index if not exists idx_web_form_submissions_org_module
  on public.web_form_submissions(org_id, target_module_id, created_at desc);

drop trigger if exists trg_web_forms_updated_at on public.web_forms;
create trigger trg_web_forms_updated_at
before update on public.web_forms
for each row execute function public.set_updated_at();

drop trigger if exists trg_web_form_fields_updated_at on public.web_form_fields;
create trigger trg_web_form_fields_updated_at
before update on public.web_form_fields
for each row execute function public.set_updated_at();

drop trigger if exists trg_web_form_submissions_updated_at on public.web_form_submissions;
create trigger trg_web_form_submissions_updated_at
before update on public.web_form_submissions
for each row execute function public.set_updated_at();

alter table public.web_forms enable row level security;
alter table public.web_form_fields enable row level security;
alter table public.web_form_submissions enable row level security;

drop policy if exists p_web_forms_org_all on public.web_forms;
create policy p_web_forms_org_all
on public.web_forms
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists p_web_form_fields_org_all on public.web_form_fields;
create policy p_web_form_fields_org_all
on public.web_form_fields
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists p_web_form_submissions_org_all on public.web_form_submissions;
create policy p_web_form_submissions_org_all
on public.web_form_submissions
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

create or replace function public.get_public_web_form(
  p_slug text default 'inquiry',
  p_hostname text default null
)
returns table (
  org_id uuid,
  form_id uuid,
  web_form jsonb,
  fields jsonb,
  company_settings jsonb,
  branding_settings jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, 'inquiry')));
  v_org_id uuid;
  v_company_settings jsonb := '{}'::jsonb;
  v_branding_settings jsonb := '{}'::jsonb;
begin
  select
    b.org_id,
    coalesce(b.company_settings, '{}'::jsonb),
    coalesce(b.branding_settings, '{}'::jsonb)
  into
    v_org_id,
    v_company_settings,
    v_branding_settings
  from public.get_public_branding(p_hostname) b
  limit 1;

  return query
  select
    v_org_id,
    wf.id,
    to_jsonb(wf.*),
    coalesce(
      (
        select jsonb_agg(to_jsonb(wff.*) order by wff.sort_order asc, wff.created_at asc)
        from public.web_form_fields wff
        where wff.web_form_id = wf.id
          and wff.is_active = true
      ),
      '[]'::jsonb
    ),
    v_company_settings,
    v_branding_settings
  from public.web_forms wf
  where wf.org_id = v_org_id
    and wf.is_active = true
    and lower(wf.route_slug) = v_slug
  order by wf.updated_at desc nulls last, wf.created_at desc nulls last
  limit 1;
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

revoke all on function public.get_public_web_form(text, text) from public;
grant execute on function public.get_public_web_form(text, text) to anon, authenticated, service_role;

revoke all on function public.submit_public_web_form(text, jsonb, jsonb, text) from public;
grant execute on function public.submit_public_web_form(text, jsonb, jsonb, text) to anon, authenticated, service_role;
