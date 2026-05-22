-- =====================================================
-- KalamApp - Phase 185: fix create_org_story() — add missing p_creator_avatar param
-- Date: 2026-05-22
-- Problem:
--   Production DB has create_org_story() without p_creator_avatar parameter.
--   Phase 179 migration was not applied to production.
--   Frontend sends p_creator_avatar causing PGRST202 error.
-- Fix:
--   Re-apply the function with correct signature including p_creator_avatar.
-- =====================================================

begin;

-- اطمینان از وجود ستون creator_avatar در جدول
alter table public.org_stories
  add column if not exists creator_avatar text;

-- اطمینان از وجود ستون‌های saas (در صورتی که phase 179 اجرا نشده)
alter table public.org_stories
  add column if not exists is_saas_wide         boolean not null default false,
  add column if not exists is_saas_admins_only  boolean not null default false;

-- بازنویسی function با پارامتر p_creator_avatar
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
  v_creator_id := auth.uid();
  if v_creator_id is null then
    raise exception 'احراز هویت لازم است' using errcode = 'P0001';
  end if;

  v_org_id := public.current_org_id();
  if v_org_id is null then
    raise exception 'کاربر به سازمانی متصل نیست' using errcode = 'P0001';
  end if;

  if p_is_saas_wide then
    if not (
      public.current_user_has_saas_admin_permission('publish_saas_story')
      or public.current_user_has_saas_admin_permission('publish_saas_admin_story')
    ) then
      raise exception 'دسترسی انتشار استوری SaaS وجود ندارد' using errcode = 'P0001';
    end if;
  end if;

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

notify pgrst, 'reload schema';

do $$
begin
  raise notice 'Phase 185: create_org_story() fixed — p_creator_avatar param added.';
end;
$$;

commit;
