-- =====================================================
-- KalamApp - Phase 169: Fix profile RLS + story INSERT
-- Date: 2026-05-21
-- Type: Security patch / backward-compatible
-- Problem:
--   Phase 163 added RLS to profiles: org_id = current_org_id()
--   When profiles.org_id IS NULL (pre-backfill), the user cannot
--   SELECT their OWN profile row via the Supabase client, because
--   NULL = <any_uuid> evaluates to NULL (not TRUE) in RLS.
--   This means fetchSessionBootstrap returns profile=null → orgId=null.
--   On the other side, current_org_id() IS SECURITY DEFINER so it
--   CAN read the profile (bypasses RLS) and returns org_id via role.
--   Result: org_id in INSERT payload ≠ current_org_id() (one is null,
--   other is from stale cache) → org_stories INSERT RLS violation.
--
-- Fix:
--   1. Add a separate SELECT policy on profiles allowing each user
--      to always see their OWN row (id = auth.uid())
--   2. Introduce user_belongs_to_org() SECURITY DEFINER helper
--   3. Change org_stories INSERT/UPDATE/DELETE to use the helper
--      instead of current_org_id(), so it works even with null org_id
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- ۱. تابع کمکی: آیا user به این org تعلق دارد؟
--    SECURITY DEFINER → بدون RLS پروفایل را می‌خواند
-- ─────────────────────────────────────────────
create or replace function public.user_belongs_to_org(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.org_roles r on r.id = p.role_id
    where p.id = auth.uid()
      and coalesce(p.org_id, r.org_id) = p_org_id
  )
$$;

grant execute on function public.user_belongs_to_org(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ۲. اضافه کردن policy جداگانه برای SELECT پروفایل خود کاربر
--    کاربر همیشه باید بتواند پروفایل خودش را ببیند، حتی اگر org_id نداشته باشد
-- ─────────────────────────────────────────────
drop policy if exists p_profiles_select_self on public.profiles;
create policy p_profiles_select_self
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- ─────────────────────────────────────────────
-- ۳. بازنویسی policy های org_stories با استفاده از user_belongs_to_org
--    این تابع SECURITY DEFINER است و بدون وابستگی به profiles.org_id کار می‌کند
-- ─────────────────────────────────────────────
drop policy if exists p_org_stories_insert_own on public.org_stories;
create policy p_org_stories_insert_own
on public.org_stories
for insert
to authenticated
with check (
  creator_id = auth.uid()
  and public.user_belongs_to_org(org_id)
);

drop policy if exists p_org_stories_update_own on public.org_stories;
create policy p_org_stories_update_own
on public.org_stories
for update
to authenticated
using (
  creator_id = auth.uid()
  and public.user_belongs_to_org(org_id)
)
with check (
  creator_id = auth.uid()
  and public.user_belongs_to_org(org_id)
);

drop policy if exists p_org_stories_delete_own on public.org_stories;
create policy p_org_stories_delete_own
on public.org_stories
for delete
to authenticated
using (
  creator_id = auth.uid()
  and public.user_belongs_to_org(org_id)
);

-- ─────────────────────────────────────────────
-- ۴. همچنین SELECT policy استوری را با user_belongs_to_org درست می‌کنیم
--    (creator می‌تواند استوری خودش را ببیند حتی اگر منقضی شده باشد)
-- ─────────────────────────────────────────────
drop policy if exists p_org_stories_select_visible on public.org_stories;
create policy p_org_stories_select_visible
on public.org_stories
for select
to authenticated
using (
  public.user_belongs_to_org(org_id)
  and is_active = true
  and published_at <= now()
  and (expires_at is null or expires_at > now())
  and (
    creator_id = auth.uid()
    or is_org_wide = true
    or auth.uid() = any(viewer_user_ids)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role_id = any(org_stories.viewer_role_ids)
    )
  )
);

-- ─────────────────────────────────────────────
-- ۵. بررسی وضعیت
-- ─────────────────────────────────────────────
do $$
begin
  raise notice 'Phase 169: profile RLS self-select + org_stories policies updated.';
  raise notice 'Users can now always SELECT their own profile row.';
  raise notice 'org_stories INSERT/UPDATE/DELETE use user_belongs_to_org() instead of current_org_id().';
end
$$;

notify pgrst, 'reload schema';

commit;
