-- =====================================================
-- KalamApp - Phase 178: org_stories INSERT via column defaults (drop trigger)
-- Date: 2026-05-22
-- Type: Bug fix / idempotent
-- Problem:
--   All trigger-based approaches (phases 173, 176) for setting creator_id
--   and org_id server-side have consistently failed with 42501.
--   The trigger security context (with or without SECURITY DEFINER) appears
--   unreliable for auth.uid() in this Supabase setup.
--
-- Fix:
--   Drop the trigger entirely. Use PostgreSQL column defaults instead:
--     creator_id DEFAULT auth.uid()
--     org_id     DEFAULT current_org_id()  (already set in Phase 170)
--   Column defaults run in the authenticated user's session context and
--   are applied before RLS WITH CHECK — auth.uid() works reliably here.
--   The frontend must NOT send creator_id or org_id in the INSERT payload.
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- ۱. حذف trigger
-- ─────────────────────────────────────────────
drop trigger if exists trg_set_org_story_auth_fields      on public.org_stories;
drop trigger if exists trg_set_current_org_id_org_stories on public.org_stories;

-- ─────────────────────────────────────────────
-- ۲. column default برای creator_id
--    org_id default قبلاً از Phase 170 ست شده
-- ─────────────────────────────────────────────
alter table public.org_stories
  alter column creator_id set default auth.uid();

-- ─────────────────────────────────────────────
-- ۳. policy INSERT ساده‌ترین حالت ممکن
--    چون defaults مقادیر را ست می‌کنند، فقط non-null بودن را چک می‌کنیم
--    به‌علاوه محدودیت SaaS wide از Phase 177
-- ─────────────────────────────────────────────
drop policy if exists p_org_stories_insert_own on public.org_stories;

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

do $$
begin
  raise notice 'Phase 178: trigger removed. INSERT now uses column defaults.';
  raise notice 'creator_id DEFAULT auth.uid() — no trigger needed.';
  raise notice 'Frontend must NOT send creator_id or org_id in INSERT payload.';
end;
$$;

notify pgrst, 'reload schema';

commit;
