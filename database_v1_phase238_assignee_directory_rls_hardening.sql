-- =====================================================
-- KalamApp - Phase 238: Assignee Directory RLS Hardening
-- Date: 2026-06-08
-- Type: Security hardening / backward-compatible migration
-- Goal:
--   1. Enforce fail-closed tenant RLS on profiles and org_roles
--   2. Keep explicit self-profile select for bootstrap flows
--   3. Preserve SaaS admin read access where the helper exists
-- =====================================================

begin;

alter table if exists public.profiles enable row level security;
alter table if exists public.org_roles enable row level security;

drop policy if exists p_profiles_org_all on public.profiles;
drop policy if exists p_profiles_select_self on public.profiles;
drop policy if exists p_profiles_select_admin on public.profiles;
drop policy if exists p_org_roles_org_all on public.org_roles;
drop policy if exists p_org_roles_select_admin on public.org_roles;

create policy p_profiles_org_all
on public.profiles
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

create policy p_profiles_select_self
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy p_org_roles_org_all
on public.org_roles
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

do $$
begin
  if to_regprocedure('public.current_user_has_saas_admin_permission()') is not null then
    execute $sql$
      create policy p_profiles_select_admin
      on public.profiles
      for select
      to authenticated
      using (public.current_user_has_saas_admin_permission())
    $sql$;

    execute $sql$
      create policy p_org_roles_select_admin
      on public.org_roles
      for select
      to authenticated
      using (public.current_user_has_saas_admin_permission())
    $sql$;
  end if;
end
$$;

do $$
begin
  raise notice 'Phase 238: profiles/org_roles RLS hardened for assignee directory isolation.';
  raise notice 'profiles/org_roles now fail closed on org_id = current_org_id().';
end
$$;

notify pgrst, 'reload schema';

commit;
