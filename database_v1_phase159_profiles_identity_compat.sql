-- =====================================================
-- KalamApp - Phase 159 profiles identity compatibility
-- Date: 2026-05-19
-- Type: Additive / idempotent repair migration
-- Goal:
--   Ensure legacy/runtime profile identity columns exist on environments
--   where profile directory queries still hit schema mismatch.
-- =====================================================

begin;

alter table if exists public.profiles
  add column if not exists full_name text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists mobile_1 text,
  add column if not exists avatar_url text,
  add column if not exists role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists org_id uuid references public.organizations(id) on delete set null;

create index if not exists idx_profiles_org_id on public.profiles(org_id);
create index if not exists idx_profiles_role_id on public.profiles(role_id);
create index if not exists idx_profiles_full_name on public.profiles(full_name);

notify pgrst, 'reload schema';

commit;
