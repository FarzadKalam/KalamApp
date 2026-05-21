-- =====================================================
-- KalamApp - Phase 179: create_org_story() — SECURITY DEFINER RPC
-- Date: 2026-05-22
-- Type: Bug fix / definitive solution
-- Problem:
--   All approaches for server-side creator_id/org_id assignment have failed:
--   - Trigger (phases 173, 176): auth.uid() unreliable in trigger context
--   - Column defaults (phase 178): auth.uid() returns NULL as column default
--   Root cause: Supabase PostgREST sets JWT via SET LOCAL which may not
--   be available in trigger/default evaluation contexts.
--
-- Fix:
--   SECURITY DEFINER function that explicitly calls auth.uid() and
--   current_org_id() within the function body (where they work reliably),
--   inserts with correct server-side values, and bypasses RLS entirely
--   (runs as postgres = superuser = BYPASSRLS).
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- ۰. اضافه کردن ستون‌های جدید (اگر وجود ندارند)
-- ─────────────────────────────────────────────
alter table public.org_stories
  add column if not exists is_saas_wide         boolean not null default false,
  add column if not exists is_saas_admins_only  boolean not null default false;

-- همچنین ستون org_id default را ست می‌کنیم (در صورتی که Phase 170 اجرا نشده)
do $$
begin
  if (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'org_stories'
      and column_name = 'org_id'
  ) is null then
    alter table public.org_stories
      alter column org_id set default public.current_org_id();
  end if;
end;
$$;

create or replace function public.create_org_story(
  p_creator_name        text,
  p_slides              jsonb,
  p_creator_avatar      text        default null,
  p_is_org_wide         boolean     default true,
  p_is_saas_wide        boolean     default false,
  p_is_saas_admins_only boolean     default false,
  p_viewer_user_ids     uuid[]      default '{}',
  p_viewer_role_ids     uuid[]      default '{}',
  p_mention_user_ids    uuid[]      default '{}',
  p_expires_at          timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id uuid;
  v_org_id     uuid;
  v_story_id   uuid;
begin
  -- مقادیر server-side — اینجا auth.uid() و current_org_id() قابل اطمینان هستند
  v_creator_id := auth.uid();
  if v_creator_id is null then
    raise exception 'احراز هویت لازم است' using errcode = 'P0001';
  end if;

  v_org_id := public.current_org_id();
  if v_org_id is null then
    raise exception 'کاربر به سازمانی متصل نیست' using errcode = 'P0001';
  end if;

  -- اگر SaaS-wide است، دسترسی لازم را بررسی می‌کنیم
  if p_is_saas_wide then
    if not (
      public.current_user_has_saas_admin_permission('publish_saas_story')
      or public.current_user_has_saas_admin_permission('publish_saas_admin_story')
    ) then
      raise exception 'دسترسی انتشار استوری SaaS وجود ندارد' using errcode = 'P0001';
    end if;
  end if;

  -- INSERT — چون SECURITY DEFINER است و owner آن postgres است، RLS دور زده می‌شود
  insert into public.org_stories (
    creator_id,
    org_id,
    creator_name,
    creator_avatar,
    slides,
    is_org_wide,
    is_saas_wide,
    is_saas_admins_only,
    viewer_user_ids,
    viewer_role_ids,
    mention_user_ids,
    expires_at,
    published_at,
    updated_at
  ) values (
    v_creator_id,
    v_org_id,
    p_creator_name,
    nullif(btrim(coalesce(p_creator_avatar, '')), ''),
    p_slides,
    p_is_org_wide,
    coalesce(p_is_saas_wide, false),
    coalesce(p_is_saas_admins_only, false) and coalesce(p_is_saas_wide, false),
    coalesce(p_viewer_user_ids, '{}'),
    coalesce(p_viewer_role_ids, '{}'),
    coalesce(p_mention_user_ids, '{}'),
    p_expires_at,
    now(),
    now()
  )
  returning id into v_story_id;

  return v_story_id;
end;
$$;

revoke all on function public.create_org_story(
  text, jsonb, text, boolean, boolean, boolean, uuid[], uuid[], uuid[], timestamptz
) from public;

grant execute on function public.create_org_story(
  text, jsonb, text, boolean, boolean, boolean, uuid[], uuid[], uuid[], timestamptz
) to authenticated;

do $$
begin
  raise notice 'Phase 179: create_org_story() RPC created.';
  raise notice 'auth.uid() and current_org_id() called inside SECURITY DEFINER function.';
  raise notice 'No RLS issues — function runs as postgres (BYPASSRLS).';
end;
$$;

notify pgrst, 'reload schema';

commit;
