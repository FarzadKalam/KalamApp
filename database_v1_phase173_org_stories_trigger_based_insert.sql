-- =====================================================
-- KalamApp - Phase 173: org_stories server-side auth fields via trigger
-- Date: 2026-05-21
-- Type: Bug fix / idempotent
-- Problem:
--   Despite phases 171-172, INSERT still fails (42501).
--   Root cause: the WITH CHECK policy evaluates creator_id and org_id
--   against values sent by the frontend. Any mismatch (stale cache,
--   null, type coercion) causes failure.
--
-- Fix:
--   A BEFORE INSERT SECURITY DEFINER trigger ALWAYS overwrites
--   creator_id and org_id with server-side values from auth.uid() and
--   current_org_id(). The INSERT policy then only checks these are non-null.
--   Frontend values for these fields are ignored — server is authoritative.
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- تابع trigger: همیشه creator_id و org_id رو server-side ست می‌کند
-- ─────────────────────────────────────────────
create or replace function public.set_org_story_auth_fields()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  -- creator را همیشه از JWT می‌گیریم، frontend قابل اعتماد نیست
  new.creator_id := auth.uid();

  -- org_id را همیشه server-side تعیین می‌کنیم
  v_org_id := public.current_org_id();
  if v_org_id is null then
    raise exception 'کاربر به هیچ سازمانی تعلق ندارد'
      using errcode = 'P0001';
  end if;
  new.org_id := v_org_id;

  return new;
end;
$$;

-- جایگزینی trigger قدیمی (set_current_org_id_if_missing) با trigger جدید
drop trigger if exists trg_set_current_org_id_org_stories on public.org_stories;
drop trigger if exists trg_set_org_story_auth_fields      on public.org_stories;

create trigger trg_set_org_story_auth_fields
  before insert on public.org_stories
  for each row
  execute function public.set_org_story_auth_fields();

-- ─────────────────────────────────────────────
-- policy INSERT — فقط چک می‌کند که trigger مقدار درست گذاشته
-- ─────────────────────────────────────────────
drop policy if exists p_org_stories_insert_own on public.org_stories;

create policy p_org_stories_insert_own
on public.org_stories
for insert
to authenticated
with check (
  creator_id is not null
  and org_id is not null
);

notify pgrst, 'reload schema';

commit;
