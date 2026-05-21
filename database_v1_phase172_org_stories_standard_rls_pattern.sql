-- =====================================================
-- KalamApp - Phase 172: org_stories RLS — standard module pattern
-- Date: 2026-05-21
-- Type: Bug fix / idempotent
-- Problem:
--   Phase 169 introduced user_belongs_to_org() in org_stories policies.
--   Despite Phase 171 making it VOLATILE, the INSERT still fails with 42501.
--   All other module tables use the simpler, proven pattern:
--     org_id = public.current_org_id()
--   current_org_id() is now VOLATILE SECURITY DEFINER (Phase 171) and works.
--
-- Fix:
--   Replace all user_belongs_to_org() calls in org_stories policies with
--   org_id = public.current_org_id() — same as invoices, employees, tasks, etc.
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- org_stories
-- ─────────────────────────────────────────────
drop policy if exists p_org_stories_insert_own       on public.org_stories;
drop policy if exists p_org_stories_update_own       on public.org_stories;
drop policy if exists p_org_stories_delete_own       on public.org_stories;
drop policy if exists p_org_stories_select_visible   on public.org_stories;

create policy p_org_stories_select_visible
on public.org_stories
for select
to authenticated
using (
  org_id = public.current_org_id()
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

create policy p_org_stories_insert_own
on public.org_stories
for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and creator_id = auth.uid()
);

create policy p_org_stories_update_own
on public.org_stories
for update
to authenticated
using (
  org_id = public.current_org_id()
  and creator_id = auth.uid()
)
with check (
  org_id = public.current_org_id()
  and creator_id = auth.uid()
);

create policy p_org_stories_delete_own
on public.org_stories
for delete
to authenticated
using (
  org_id = public.current_org_id()
  and creator_id = auth.uid()
);

-- ─────────────────────────────────────────────
-- org_story_views
-- ─────────────────────────────────────────────
drop policy if exists p_org_story_views_select_visible on public.org_story_views;
drop policy if exists p_org_story_views_insert_own     on public.org_story_views;

create policy p_org_story_views_select_visible
on public.org_story_views
for select
to authenticated
using (org_id = public.current_org_id());

create policy p_org_story_views_insert_own
on public.org_story_views
for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and user_id = auth.uid()
);

-- ─────────────────────────────────────────────
-- org_story_reactions
-- ─────────────────────────────────────────────
drop policy if exists p_org_story_reactions_select_visible on public.org_story_reactions;
drop policy if exists p_org_story_reactions_insert_own     on public.org_story_reactions;
drop policy if exists p_org_story_reactions_update_own     on public.org_story_reactions;
drop policy if exists p_org_story_reactions_delete_own     on public.org_story_reactions;

create policy p_org_story_reactions_select_visible
on public.org_story_reactions
for select
to authenticated
using (org_id = public.current_org_id());

create policy p_org_story_reactions_insert_own
on public.org_story_reactions
for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and user_id = auth.uid()
);

create policy p_org_story_reactions_update_own
on public.org_story_reactions
for update
to authenticated
using (org_id = public.current_org_id() and user_id = auth.uid())
with check (org_id = public.current_org_id() and user_id = auth.uid());

create policy p_org_story_reactions_delete_own
on public.org_story_reactions
for delete
to authenticated
using (org_id = public.current_org_id() and user_id = auth.uid());

notify pgrst, 'reload schema';

commit;
