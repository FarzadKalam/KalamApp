-- =====================================================
-- KalamApp - Phase 158 runtime schema repair + diagnostics
-- Date: 2026-05-19
-- Type: Additive / idempotent repair migration
-- Goal:
--   1) Diagnose schema/runtime contract mismatches seen in production logs
--   2) Repair only the required tables/columns/indexes/policies
--   3) Reload PostgREST schema cache after DDL
-- Notes:
--   - This script intentionally does NOT add process columns to public.instructions.
--   - It focuses on the minimum database contract used by current app/runtime code.
-- =====================================================

begin;

create temporary table if not exists tmp_runtime_repair_diagnostics (
  area text not null,
  object_type text not null,
  object_name text not null,
  exists_table boolean,
  exists_column boolean,
  exists_index boolean,
  exists_policy boolean,
  repair_applied boolean not null default false,
  notes text,
  checked_at timestamptz not null default now()
) on commit drop;

create or replace function public.__runtime_repair_log(
  p_area text,
  p_object_type text,
  p_object_name text,
  p_exists_table boolean default null,
  p_exists_column boolean default null,
  p_exists_index boolean default null,
  p_exists_policy boolean default null,
  p_repair_applied boolean default false,
  p_notes text default null
)
returns void
language plpgsql
as $$
begin
  insert into tmp_runtime_repair_diagnostics (
    area,
    object_type,
    object_name,
    exists_table,
    exists_column,
    exists_index,
    exists_policy,
    repair_applied,
    notes
  )
  values (
    p_area,
    p_object_type,
    p_object_name,
    p_exists_table,
    p_exists_column,
    p_exists_index,
    p_exists_policy,
    p_repair_applied,
    p_notes
  );
end;
$$;

create table if not exists public.personas (
  id uuid primary key default gen_random_uuid()
);

alter table public.personas
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists image_url text,
  add column if not exists name text not null default '',
  add column if not exists display_name text not null default '',
  add column if not exists persona_type text not null default 'customer',
  add column if not exists financial_status text,
  add column if not exists traits text,
  add column if not exists preferences text,
  add column if not exists pain_points text,
  add column if not exists basket text,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'personas_persona_type_check'
      and conrelid = 'public.personas'::regclass
  ) then
    alter table public.personas
      add constraint personas_persona_type_check
      check (persona_type in ('customer', 'supplier', 'employee'));
  end if;
end $$;

create index if not exists idx_personas_org_type_updated
  on public.personas(org_id, persona_type, updated_at desc);

alter table if exists public.customers
  add column if not exists persona_id uuid references public.personas(id) on delete set null;

alter table if exists public.suppliers
  add column if not exists persona_id uuid references public.personas(id) on delete set null;

alter table if exists public.employees
  add column if not exists persona_id uuid references public.personas(id) on delete set null;

alter table if exists public.marketing_leads
  add column if not exists persona_id uuid references public.personas(id) on delete set null;

create index if not exists idx_customers_persona_id on public.customers(persona_id);
create index if not exists idx_suppliers_persona_id on public.suppliers(persona_id);
create index if not exists idx_employees_persona_id on public.employees(persona_id);
create index if not exists idx_marketing_leads_persona_id on public.marketing_leads(persona_id);

alter table public.personas enable row level security;
drop policy if exists p_personas_auth_all on public.personas;
create policy p_personas_auth_all
on public.personas
for all
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

create table if not exists public.instructions (
  id uuid primary key default gen_random_uuid()
);

alter table public.instructions
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists image_url text,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists status text not null default 'draft',
  add column if not exists department text,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists module_ids text[] not null default '{}'::text[],
  add column if not exists visible_to_user_ids uuid[] not null default '{}'::uuid[],
  add column if not exists visible_to_role_ids uuid[] not null default '{}'::uuid[],
  add column if not exists goal text,
  add column if not exists body text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'instructions_status_check'
      and conrelid = 'public.instructions'::regclass
  ) then
    alter table public.instructions
      add constraint instructions_status_check
      check (status in ('draft', 'approved', 'published', 'expired'));
  end if;
end $$;

create index if not exists idx_instructions_org_status
  on public.instructions(org_id, status, updated_at desc);

create index if not exists idx_instructions_module_ids
  on public.instructions using gin(module_ids);

create index if not exists idx_instructions_visible_users
  on public.instructions using gin(visible_to_user_ids);

create index if not exists idx_instructions_visible_roles
  on public.instructions using gin(visible_to_role_ids);

alter table public.instructions enable row level security;
drop policy if exists p_instructions_auth_all on public.instructions;
create policy p_instructions_auth_all
on public.instructions
for all
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

create table if not exists public.process_template_stage_instructions (
  id uuid primary key default gen_random_uuid()
);

alter table public.process_template_stage_instructions
  add column if not exists template_id uuid references public.process_templates(id) on delete cascade,
  add column if not exists template_stage_id uuid references public.process_template_stages(id) on delete cascade,
  add column if not exists instruction_id uuid references public.instructions(id) on delete cascade,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_process_template_stage_instruction_unique
  on public.process_template_stage_instructions(template_stage_id, instruction_id);

create index if not exists idx_process_template_stage_instruction_template
  on public.process_template_stage_instructions(template_id, sort_order);

alter table public.process_template_stage_instructions enable row level security;
drop policy if exists p_process_template_stage_instructions_auth_all on public.process_template_stage_instructions;
create policy p_process_template_stage_instructions_auth_all
on public.process_template_stage_instructions
for all
using (
  exists (
    select 1
    from public.process_templates t
    where t.id = process_template_stage_instructions.template_id
      and t.org_id = public.current_org_id()
  )
)
with check (
  exists (
    select 1
    from public.process_templates t
    where t.id = process_template_stage_instructions.template_id
      and t.org_id = public.current_org_id()
  )
);

alter table if exists public.profiles
  add column if not exists voip_operator_code text,
  add column if not exists voip_extension text,
  add column if not exists voip_service_id text,
  add column if not exists voip_enabled boolean not null default false,
  add column if not exists voip_dial_mode text not null default 'telefonchy_smartcall';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_voip_dial_mode_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      drop constraint profiles_voip_dial_mode_check;
  end if;

  alter table public.profiles
    add constraint profiles_voip_dial_mode_check
    check (voip_dial_mode in ('telefonchy_smartcall', 'sip_link', 'tel_link'));
end $$;

create table if not exists public.saas_org_settings (
  id uuid primary key default gen_random_uuid()
);

alter table public.saas_org_settings
  add column if not exists org_id uuid references public.organizations(id) on delete cascade,
  add column if not exists slug text,
  add column if not exists status text not null default 'draft',
  add column if not exists plan_code text,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists is_demo boolean not null default false,
  add column if not exists is_readonly boolean not null default false,
  add column if not exists module_overrides jsonb not null default '{}'::jsonb,
  add column if not exists feature_overrides jsonb not null default '{}'::jsonb,
  add column if not exists requested_subdomain text,
  add column if not exists resolved_host text,
  add column if not exists provisioning_source text not null default 'manual',
  add column if not exists dns_status text not null default 'pending',
  add column if not exists dns_last_error text,
  add column if not exists primary_contact_mobile text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists arvan_record_id text,
  add column if not exists dns_last_attempt_at timestamptz,
  add column if not exists dns_attempt_count integer not null default 0;

create unique index if not exists idx_saas_org_settings_org_unique
  on public.saas_org_settings (org_id);

create unique index if not exists idx_saas_org_settings_slug_unique
  on public.saas_org_settings (lower(slug))
  where slug is not null;

create table if not exists public.saas_onboarding_requests (
  id uuid primary key default gen_random_uuid()
);

alter table public.saas_onboarding_requests
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists full_name text not null default '',
  add column if not exists mobile text not null default '',
  add column if not exists business_name text,
  add column if not exists employee_count_band text,
  add column if not exists discovery_source text,
  add column if not exists requested_slug text,
  add column if not exists status text not null default 'draft',
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists notes text,
  add column if not exists is_demo_request boolean not null default true,
  add column if not exists provision_attempts integer not null default 0,
  add column if not exists approved_demo_count_snapshot integer not null default 0,
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists organization_name text,
  add column if not exists industry text,
  add column if not exists approx_user_count integer,
  add column if not exists logo_url text;

create index if not exists idx_saas_onboarding_requests_mobile
  on public.saas_onboarding_requests (mobile, created_at desc);

create index if not exists idx_saas_onboarding_requests_status
  on public.saas_onboarding_requests (status, created_at desc);

create index if not exists idx_saas_onboarding_requests_email
  on public.saas_onboarding_requests (email)
  where email is not null;

create table if not exists public.demo_seed_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  pack_key text not null default 'general_v1',
  industry_key text,
  status text not null default 'seeding',
  seeded_records_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  seeded_by uuid references auth.users(id) on delete set null,
  cleared_by uuid references auth.users(id) on delete set null,
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_demo_seed_batches_status'
      and conrelid = 'public.demo_seed_batches'::regclass
  ) then
    alter table public.demo_seed_batches
      add constraint chk_demo_seed_batches_status
      check (status in ('seeding', 'seeded', 'clearing', 'cleared', 'failed'));
  end if;
end $$;

create index if not exists idx_demo_seed_batches_org_status
  on public.demo_seed_batches(org_id, status, created_at desc);

create table if not exists public.demo_seed_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.demo_seed_batches(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  delete_order integer not null default 100,
  label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_demo_seed_records_batch_table_record
  on public.demo_seed_records(batch_id, table_name, record_id);

create index if not exists idx_demo_seed_records_org_order
  on public.demo_seed_records(org_id, delete_order desc, created_at desc);

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_updated_at'
  ) then
    drop trigger if exists trg_demo_seed_batches_updated_at on public.demo_seed_batches;
    create trigger trg_demo_seed_batches_updated_at
    before update on public.demo_seed_batches
    for each row execute function public.set_updated_at();
  end if;
end $$;

grant select, insert, update, delete on public.demo_seed_batches to authenticated, service_role;
grant select, insert, update, delete on public.demo_seed_records to authenticated, service_role;

alter table public.demo_seed_batches enable row level security;
alter table public.demo_seed_records enable row level security;

drop policy if exists p_demo_seed_batches_org_select on public.demo_seed_batches;
create policy p_demo_seed_batches_org_select
on public.demo_seed_batches
for select
to authenticated
using (org_id = public.current_org_id());

drop policy if exists p_demo_seed_records_org_select on public.demo_seed_records;
create policy p_demo_seed_records_org_select
on public.demo_seed_records
for select
to authenticated
using (org_id = public.current_org_id());

do $$
begin
  perform public.__runtime_repair_log(
    'personas',
    'table',
    'public.personas',
    to_regclass('public.personas') is not null,
    null,
    null,
    exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'personas' and policyname = 'p_personas_auth_all'),
    true,
    'personas table/columns/policy repaired or verified'
  );

  perform public.__runtime_repair_log(
    'instructions',
    'table',
    'public.instructions',
    to_regclass('public.instructions') is not null,
    null,
    exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_instructions_org_status'),
    exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'instructions' and policyname = 'p_instructions_auth_all'),
    true,
    'instructions contract repaired; process columns intentionally excluded'
  );

  perform public.__runtime_repair_log(
    'instructions',
    'table',
    'public.process_template_stage_instructions',
    to_regclass('public.process_template_stage_instructions') is not null,
    null,
    exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_process_template_stage_instruction_unique'),
    exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'process_template_stage_instructions' and policyname = 'p_process_template_stage_instructions_auth_all'),
    true,
    'join table for instruction/process template visibility repaired or verified'
  );

  perform public.__runtime_repair_log(
    'profiles',
    'table',
    'public.profiles',
    to_regclass('public.profiles') is not null,
    null,
    null,
    null,
    true,
    'voip columns repaired or verified'
  );

  perform public.__runtime_repair_log(
    'saas',
    'table',
    'public.saas_org_settings',
    to_regclass('public.saas_org_settings') is not null,
    null,
    exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_saas_org_settings_org_unique'),
    null,
    true,
    'saas org settings repaired or verified'
  );

  perform public.__runtime_repair_log(
    'saas',
    'table',
    'public.saas_onboarding_requests',
    to_regclass('public.saas_onboarding_requests') is not null,
    null,
    exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_saas_onboarding_requests_status'),
    null,
    true,
    'saas onboarding request audit/admin columns repaired or verified'
  );

  perform public.__runtime_repair_log(
    'demo',
    'table',
    'public.demo_seed_batches',
    to_regclass('public.demo_seed_batches') is not null,
    null,
    exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_demo_seed_batches_org_status'),
    exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'demo_seed_batches' and policyname = 'p_demo_seed_batches_org_select'),
    true,
    'demo seed batches repaired or verified'
  );

  perform public.__runtime_repair_log(
    'demo',
    'table',
    'public.demo_seed_records',
    to_regclass('public.demo_seed_records') is not null,
    null,
    exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_demo_seed_records_batch_table_record'),
    exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'demo_seed_records' and policyname = 'p_demo_seed_records_org_select'),
    true,
    'demo seed records repaired or verified'
  );

  if to_regclass('public.integration_settings') is not null then
    perform public.__runtime_repair_log(
      'bot_rubika',
      'table',
      'public.integration_settings',
      true,
      null,
      null,
      null,
      false,
      'integration_settings exists; use function diagnostic action for runtime config validation'
    );
  else
    perform public.__runtime_repair_log(
      'bot_rubika',
      'table',
      'public.integration_settings',
      false,
      null,
      null,
      null,
      false,
      'missing integration_settings table; Rubika bot actions cannot succeed until base integrations schema is present'
    );
  end if;
end $$;

insert into tmp_runtime_repair_diagnostics (
  area,
  object_type,
  object_name,
  exists_table,
  exists_column,
  repair_applied,
  notes
)
select
  x.area,
  'column',
  x.object_name,
  true,
  exists (
    select 1
    from information_schema.columns c
    where c.table_schema = x.table_schema
      and c.table_name = x.table_name
      and c.column_name = x.column_name
  ),
  true,
  x.notes
from (
  values
    ('personas', 'public', 'personas', 'org_id', 'public.personas.org_id', 'personas org ownership column'),
    ('personas', 'public', 'personas', 'display_name', 'public.personas.display_name', 'personas display field'),
    ('personas', 'public', 'personas', 'persona_type', 'public.personas.persona_type', 'personas type discriminator'),
    ('personas', 'public', 'personas', 'process_template_id', 'public.personas.process_template_id', 'personas process template relation'),
    ('personas', 'public', 'personas', 'execution_process_draft', 'public.personas.execution_process_draft', 'personas process draft payload'),
    ('instructions', 'public', 'instructions', 'module_ids', 'public.instructions.module_ids', 'instructions related modules'),
    ('instructions', 'public', 'instructions', 'visible_to_user_ids', 'public.instructions.visible_to_user_ids', 'instructions user visibility'),
    ('instructions', 'public', 'instructions', 'visible_to_role_ids', 'public.instructions.visible_to_role_ids', 'instructions role visibility'),
    ('profiles', 'public', 'profiles', 'voip_enabled', 'public.profiles.voip_enabled', 'profile voip enabled flag'),
    ('profiles', 'public', 'profiles', 'voip_operator_code', 'public.profiles.voip_operator_code', 'profile voip operator code'),
    ('profiles', 'public', 'profiles', 'voip_extension', 'public.profiles.voip_extension', 'profile voip extension'),
    ('profiles', 'public', 'profiles', 'voip_service_id', 'public.profiles.voip_service_id', 'profile voip service id'),
    ('profiles', 'public', 'profiles', 'voip_dial_mode', 'public.profiles.voip_dial_mode', 'profile voip dial mode'),
    ('saas', 'public', 'saas_onboarding_requests', 'created_by', 'public.saas_onboarding_requests.created_by', 'saas request created_by audit column'),
    ('saas', 'public', 'saas_onboarding_requests', 'updated_by', 'public.saas_onboarding_requests.updated_by', 'saas request updated_by audit column'),
    ('saas', 'public', 'saas_onboarding_requests', 'organization_name', 'public.saas_onboarding_requests.organization_name', 'saas request organization name'),
    ('saas', 'public', 'saas_org_settings', 'is_demo', 'public.saas_org_settings.is_demo', 'saas org demo flag'),
    ('demo', 'public', 'demo_seed_batches', 'status', 'public.demo_seed_batches.status', 'demo batch lifecycle status'),
    ('demo', 'public', 'demo_seed_records', 'table_name', 'public.demo_seed_records.table_name', 'demo seed record target table')
) as x(area, table_schema, table_name, column_name, object_name, notes);

insert into tmp_runtime_repair_diagnostics (
  area,
  object_type,
  object_name,
  exists_index,
  repair_applied,
  notes
)
select
  x.area,
  'index',
  x.index_name,
  exists (
    select 1
    from pg_indexes i
    where i.schemaname = 'public'
      and i.indexname = x.index_name
  ),
  true,
  x.notes
from (
  values
    ('personas', 'idx_personas_org_type_updated', 'personas list index'),
    ('instructions', 'idx_instructions_org_status', 'instructions status index'),
    ('instructions', 'idx_process_template_stage_instruction_unique', 'instruction join uniqueness index'),
    ('saas', 'idx_saas_org_settings_org_unique', 'saas org unique index'),
    ('saas', 'idx_saas_onboarding_requests_status', 'saas onboarding status index'),
    ('demo', 'idx_demo_seed_batches_org_status', 'demo seed batch index'),
    ('demo', 'idx_demo_seed_records_batch_table_record', 'demo seed record uniqueness index')
) as x(area, index_name, notes);

insert into tmp_runtime_repair_diagnostics (
  area,
  object_type,
  object_name,
  exists_policy,
  repair_applied,
  notes
)
select
  x.area,
  'policy',
  x.policy_name,
  exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = x.table_name
      and p.policyname = x.policy_name
  ),
  true,
  x.notes
from (
  values
    ('personas', 'personas', 'p_personas_auth_all', 'personas org RLS'),
    ('instructions', 'instructions', 'p_instructions_auth_all', 'instructions org RLS'),
    ('instructions', 'process_template_stage_instructions', 'p_process_template_stage_instructions_auth_all', 'instruction join org RLS'),
    ('demo', 'demo_seed_batches', 'p_demo_seed_batches_org_select', 'demo batch select RLS'),
    ('demo', 'demo_seed_records', 'p_demo_seed_records_org_select', 'demo record select RLS')
) as x(area, table_name, policy_name, notes);

notify pgrst, 'reload schema';

select
  area,
  object_type,
  object_name,
  exists_table,
  exists_column,
  exists_index,
  exists_policy,
  repair_applied,
  notes,
  checked_at
from tmp_runtime_repair_diagnostics
order by area, object_type, object_name, checked_at;

drop function if exists public.__runtime_repair_log(
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text
);

commit;
