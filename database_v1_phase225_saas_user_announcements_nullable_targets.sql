-- =====================================================
-- KalamApp - Phase 225: SaaS user announcements nullable target arrays compatibility
-- Date: 2026-06-01
-- Type: Additive / idempotent
-- =====================================================

begin;

alter table if exists public.saas_user_announcements
  add column if not exists target_org_ids uuid[],
  add column if not exists target_user_ids uuid[],
  add column if not exists target_role_ids uuid[];

update public.saas_user_announcements
set
  target_org_ids = coalesce(target_org_ids, '{}'),
  target_user_ids = coalesce(target_user_ids, '{}'),
  target_role_ids = coalesce(target_role_ids, '{}')
where target_org_ids is null
   or target_user_ids is null
   or target_role_ids is null;

alter table if exists public.saas_user_announcements
  alter column target_org_ids set default '{}',
  alter column target_user_ids set default '{}',
  alter column target_role_ids set default '{}';

alter table if exists public.saas_user_announcements
  alter column target_org_ids drop not null,
  alter column target_user_ids drop not null,
  alter column target_role_ids drop not null;

notify pgrst, 'reload schema';

commit;
