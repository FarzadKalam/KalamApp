-- =====================================================
-- KalamApp - Phase 177: SaaS-Wide Stories
-- Date: 2026-05-22
-- Type: Feature / idempotent
-- Goal:
--   SaaS admins can publish stories visible to all orgs (is_saas_wide).
--   Two modes:
--     is_saas_wide = true, is_saas_admins_only = false → همه کاربران همه سازمان‌ها
--     is_saas_wide = true, is_saas_admins_only = true  → فقط مدیران/صاحبان هر سازمان
--   Regular org stories remain fully isolated per-org (no change).
--
-- Permissions:
--   __saas_admin.fields.publish_saas_story       → is_saas_wide + is_saas_admins_only = false
--   __saas_admin.fields.publish_saas_admin_story → is_saas_wide + is_saas_admins_only = true
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- ۱. ستون‌های جدید
-- ─────────────────────────────────────────────
alter table public.org_stories
  add column if not exists is_saas_wide         boolean not null default false,
  add column if not exists is_saas_admins_only  boolean not null default false;

-- constraint: is_saas_admins_only فقط زمانی معنی دارد که is_saas_wide = true
alter table public.org_stories
  drop constraint if exists chk_saas_admins_only_requires_saas_wide;
alter table public.org_stories
  add constraint chk_saas_admins_only_requires_saas_wide
  check (not is_saas_admins_only or is_saas_wide);

-- ─────────────────────────────────────────────
-- ۲. تابع کمکی: آیا کاربر صاحب/مدیر اصلی سازمانش در SaaS است؟
--    (کسی که از طریق saas_demo_issuance دمو/اشتراک گرفته)
-- ─────────────────────────────────────────────
create or replace function public.current_user_is_saas_org_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result boolean;
begin
  select exists (
    select 1
    from public.saas_demo_issuance d
    where d.auth_user_id = auth.uid()
      and d.org_id = public.current_org_id()
  ) into v_result;
  return coalesce(v_result, false);
end;
$$;

grant execute on function public.current_user_is_saas_org_admin() to authenticated;

-- ─────────────────────────────────────────────
-- ۳. تابع کمکی: آیا کاربر می‌تواند استوری SaaS-wide منتشر کند؟
-- ─────────────────────────────────────────────
create or replace function public.current_user_can_publish_saas_story()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.current_user_has_saas_admin_permission('publish_saas_story')
      or public.current_user_has_saas_admin_permission('publish_saas_admin_story');
end;
$$;

grant execute on function public.current_user_can_publish_saas_story() to authenticated;

-- ─────────────────────────────────────────────
-- ۴. بازنویسی policy های org_stories
-- ─────────────────────────────────────────────
drop policy if exists p_org_stories_select_visible on public.org_stories;
drop policy if exists p_org_stories_insert_own     on public.org_stories;
drop policy if exists p_org_stories_update_own     on public.org_stories;
drop policy if exists p_org_stories_delete_own     on public.org_stories;

-- SELECT: استوری سازمان خودم + استوری‌های SaaS-wide
create policy p_org_stories_select_visible
on public.org_stories
for select
to authenticated
using (
  is_active = true
  and published_at <= now()
  and (expires_at is null or expires_at > now())
  and (
    -- استوری‌های سازمان خودم
    (
      org_id = public.current_org_id()
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
    )
    -- استوری SaaS برای همه کاربران
    or (is_saas_wide = true and is_saas_admins_only = false)
    -- استوری SaaS فقط برای مدیران سازمان
    or (is_saas_wide = true and is_saas_admins_only = true and public.current_user_is_saas_org_admin())
  )
);

-- INSERT: trigger قبلاً creator_id و org_id را ست کرده
--         اگر is_saas_wide = true → باید دسترسی publish_saas_story داشته باشد
create policy p_org_stories_insert_own
on public.org_stories
for insert
to authenticated
with check (
  creator_id is not null
  and org_id is not null
  and (
    is_saas_wide = false
    or public.current_user_can_publish_saas_story()
  )
  and (
    is_saas_admins_only = false
    or public.current_user_has_saas_admin_permission('publish_saas_admin_story')
  )
);

-- UPDATE: استوری‌های خودم در سازمان خودم (یا SaaS admin برای SaaS stories)
create policy p_org_stories_update_own
on public.org_stories
for update
to authenticated
using (
  creator_id = auth.uid()
  and (
    org_id = public.current_org_id()
    or (is_saas_wide = true and public.current_user_can_publish_saas_story())
  )
)
with check (
  creator_id = auth.uid()
  and (
    org_id = public.current_org_id()
    or (is_saas_wide = true and public.current_user_can_publish_saas_story())
  )
);

-- DELETE: مثل UPDATE
create policy p_org_stories_delete_own
on public.org_stories
for delete
to authenticated
using (
  creator_id = auth.uid()
  and (
    org_id = public.current_org_id()
    or (is_saas_wide = true and public.current_user_can_publish_saas_story())
  )
);

do $$
begin
  raise notice 'Phase 177: SaaS-wide stories enabled.';
  raise notice 'is_saas_wide=true, is_saas_admins_only=false → visible to all authenticated users';
  raise notice 'is_saas_wide=true, is_saas_admins_only=true  → visible only to saas org admins';
  raise notice 'Requires __saas_admin.fields.publish_saas_story or publish_saas_admin_story permission.';
end;
$$;

notify pgrst, 'reload schema';

commit;
