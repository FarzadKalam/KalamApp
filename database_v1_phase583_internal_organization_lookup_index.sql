-- Avoid repeatedly detoasting large role permission documents during RLS identity
-- resolution. This predicate exactly matches phase553/582 internal-host routing.
-- The index stores organization IDs only; it changes no routing rule or grant.
begin;
create index if not exists idx_org_roles_internal_admin_org
on public.org_roles(org_id)
where lower(coalesce(permissions->'__saas_admin'->>'view','false'))='true'
   or lower(coalesce(permissions->'__saas_admin'->>'edit','false'))='true';
commit;
