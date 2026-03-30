-- =====================================================
-- KalamApp - Phase 44 Profile Org Repair
-- Date: 2026-03-25
-- Type: Additive / repair migration
-- Goal: backfill missing org_id for profiles/invites and prevent phone-login org mismatches
-- =====================================================

begin;

with role_org_map as (
  select r.id as role_id, r.org_id
  from public.org_roles r
  where r.org_id is not null
),
fallback_org as (
  select id as org_id
  from public.organizations
  order by created_at asc
  limit 1
)
update public.profiles p
set org_id = coalesce(
  (
    select rom.org_id
    from role_org_map rom
    where rom.role_id = p.role_id
    limit 1
  ),
  fo.org_id
)
from fallback_org fo
where p.org_id is null
  and coalesce(
    (
      select rom.org_id
      from role_org_map rom
      where rom.role_id = p.role_id
      limit 1
    ),
    fo.org_id
  ) is not null;

with role_org_map as (
  select r.id as role_id, r.org_id
  from public.org_roles r
  where r.org_id is not null
),
fallback_org as (
  select id as org_id
  from public.organizations
  order by created_at asc
  limit 1
)
update public.phone_signup_invites i
set org_id = coalesce(
  (
    select rom.org_id
    from role_org_map rom
    where rom.role_id = i.role_id
    limit 1
  ),
  fo.org_id
)
from fallback_org fo
where i.org_id is null
  and coalesce(
    (
      select rom.org_id
      from role_org_map rom
      where rom.role_id = i.role_id
      limit 1
    ),
    fo.org_id
  ) is not null;

commit;
