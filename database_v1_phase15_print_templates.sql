-- =====================================================
-- KalamApp - Phase 15 Print Templates Integration Settings
-- Date: 2026-03-19
-- Type: Safe migration / backward compatible
-- Prerequisite: database_v1_phase6_module_settings.sql
-- =====================================================

alter table if exists public.integration_settings
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists connection_type text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.integration_settings'::regclass
      and conname = 'integration_settings_connection_type_check'
  ) then
    alter table public.integration_settings
      drop constraint integration_settings_connection_type_check;
  end if;

  alter table public.integration_settings
    add constraint integration_settings_connection_type_check
    check (connection_type in ('sms', 'email', 'site', 'module_settings', 'print_templates'));
end $$;

create unique index if not exists idx_integration_settings_org_connection_type
  on public.integration_settings(org_id, connection_type);

create index if not exists idx_integration_settings_org
  on public.integration_settings(org_id, connection_type);
