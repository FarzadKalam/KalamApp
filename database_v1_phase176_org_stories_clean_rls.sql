-- =====================================================
-- KalamApp - Phase 176: org_stories — clean RLS + proper tenant isolation
-- Date: 2026-05-22
-- Type: Bug fix / idempotent
-- Problem:
--   Despite phases 169-173, INSERT on org_stories still fails with 42501.
--   Root cause: the trigger set_org_story_auth_fields() is SECURITY DEFINER,
--   which may cause auth.uid() to behave unexpectedly in Supabase when
--   the execution context switches from 'authenticated' to 'postgres'.
--
-- Fix:
--   1. Recreate the trigger WITHOUT security definer — auth.uid() works
--      reliably in authenticated context; current_org_id() is itself
--      SECURITY DEFINER so it still bypasses RLS on profiles.
--   2. INSERT policy: just verify the trigger did its job (non-null check)
--   3. SELECT/UPDATE/DELETE: enforce strict org isolation (org_id = current_org_id())
--      → stories of two orgs never overlap.
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- ۱. trigger function بدون security definer
-- ─────────────────────────────────────────────
create or replace function public.set_org_story_auth_fields()
returns trigger
language plpgsql
volatile
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  -- همیشه server-side از JWT می‌گیریم
  new.creator_id := auth.uid();

  -- current_org_id() خودش SECURITY DEFINER است
  v_org_id := public.current_org_id();
  if v_org_id is null then
    raise exception 'کاربر به هیچ سازمانی تعلق ندارد'
      using errcode = 'P0001';
  end if;
  new.org_id := v_org_id;

  return new;
end;
$$;

-- ─────────────────────────────────────────────
-- ۲. trigger را با تعریف صحیح دوباره attach می‌کنیم
-- ─────────────────────────────────────────────
drop trigger if exists trg_set_current_org_id_org_stories on public.org_stories;
drop trigger if exists trg_set_org_story_auth_fields      on public.org_stories;

create trigger trg_set_org_story_auth_fields
  before insert on public.org_stories
  for each row
  execute function public.set_org_story_auth_fields();

-- ─────────────────────────────────────────────
-- ۳. policy های org_stories — ایزوله per-org
-- ─────────────────────────────────────────────
drop policy if exists p_org_stories_select_visible on public.org_stories;
drop policy if exists p_org_stories_insert_own     on public.org_stories;
drop policy if exists p_org_stories_update_own     on public.org_stories;
drop policy if exists p_org_stories_delete_own     on public.org_stories;

-- SELECT: فقط استوری‌های سازمان خودم، فعال، منتشرشده، و در scope دسترسی
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

-- INSERT: trigger قبلاً creator_id و org_id را server-side ست کرده
--         فقط بررسی می‌کنیم که مقادیر non-null هستند
create policy p_org_stories_insert_own
on public.org_stories
for insert
to authenticated
with check (
  creator_id is not null
  and org_id is not null
);

-- UPDATE: فقط استوری‌های خودم در سازمان خودم
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

-- DELETE: فقط استوری‌های خودم در سازمان خودم
create policy p_org_stories_delete_own
on public.org_stories
for delete
to authenticated
using (
  org_id = public.current_org_id()
  and creator_id = auth.uid()
);

-- ─────────────────────────────────────────────
-- ۴. policy های org_story_views و org_story_reactions هم reset
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

do $$
begin
  raise notice 'Phase 176: org_stories trigger rebuilt WITHOUT security definer.';
  raise notice 'auth.uid() now runs in authenticated context → reliable.';
  raise notice 'INSERT policy: non-null check (trigger sets the values).';
  raise notice 'SELECT/UPDATE/DELETE: strict org isolation via org_id = current_org_id().';
end;
$$;

notify pgrst, 'reload schema';

commit;
