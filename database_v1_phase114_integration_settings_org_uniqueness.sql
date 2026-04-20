-- =====================================================
-- KalamApp - Phase 114 Integration Settings Org Uniqueness Hardening
-- Date: 2026-04-20
-- Type: Additive / idempotent migration
-- Goal: enforce integration_settings uniqueness per organization
-- =====================================================

begin;

alter table if exists public.integration_settings
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists connection_type text;

with ranked as (
  select
    ctid,
    row_number() over (
      partition by org_id, connection_type
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.integration_settings
  where org_id is not null
    and connection_type is not null
)
delete from public.integration_settings target
using ranked
where target.ctid = ranked.ctid
  and ranked.rn > 1;

with ranked as (
  select
    ctid,
    row_number() over (
      partition by connection_type
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.integration_settings
  where org_id is null
    and connection_type is not null
)
delete from public.integration_settings target
using ranked
where target.ctid = ranked.ctid
  and ranked.rn > 1;

drop index if exists public.idx_integration_settings_connection_type;

create unique index if not exists idx_integration_settings_org_connection_type
  on public.integration_settings(org_id, connection_type)
  where org_id is not null and connection_type is not null;

create unique index if not exists idx_integration_settings_global_connection_type
  on public.integration_settings(connection_type)
  where org_id is null and connection_type is not null;

create index if not exists idx_integration_settings_org
  on public.integration_settings(org_id, connection_type);

commit;
