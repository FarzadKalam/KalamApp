-- =====================================================
-- TazeSystem - Phase 573: Story Studio & Lifecycle Enhancements
-- Date: 2026-11-10
-- Type: Feature / security / idempotent
-- Goals:
--   1. Add delete_media_on_expire, media_cleaned_at, and settings columns to org_stories.
--   2. Update create_org_story() & create_workflow_org_story() so is_saas_wide stories
--      always publish as "تازه سیستم" with official logo and store lifecycle settings.
--   3. Update record_story_view() so tenant users can also mark visible is_saas_wide
--      stories as viewed while keeping org_story_views strictly org-isolated.
--   4. Add controlled expired story media cleanup helpers for scheduled server cleanup
--      and org-scoped fallback cleanup (fail-closed tenant isolation).
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- ۱. ستون‌های جدید روی org_stories
-- ─────────────────────────────────────────────
alter table public.org_stories
  add column if not exists delete_media_on_expire boolean not null default false,
  add column if not exists media_cleaned_at       timestamptz,
  add column if not exists settings               jsonb not null default '{}'::jsonb;

create index if not exists idx_org_stories_expired_media_cleanup
  on public.org_stories (expires_at, id)
  where delete_media_on_expire = true
    and media_cleaned_at is null
    and expires_at is not null;

-- ─────────────────────────────────────────────
-- ۲. بروزرسانی create_org_story() با تنظیمات استوری و برندینگ تازه سیستم
-- ─────────────────────────────────────────────
drop function if exists public.create_org_story(
  text, jsonb, text, boolean, boolean, boolean, uuid[], uuid[], uuid[], timestamptz
);
drop function if exists public.create_org_story(
  text, jsonb, text, boolean, boolean, boolean, uuid[], uuid[], uuid[], uuid[], timestamptz, boolean, jsonb
);

create or replace function public.create_org_story(
  p_creator_name           text,
  p_slides                 jsonb,
  p_creator_avatar         text        default null,
  p_is_org_wide            boolean     default true,
  p_is_saas_wide           boolean     default false,
  p_is_saas_admins_only    boolean     default false,
  p_viewer_user_ids        uuid[]      default '{}',
  p_viewer_role_ids        uuid[]      default '{}',
  p_mention_user_ids       uuid[]      default '{}',
  p_mention_role_ids       uuid[]      default '{}',
  p_expires_at             timestamptz default null,
  p_delete_media_on_expire boolean     default false,
  p_settings               jsonb       default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id     uuid;
  v_org_id         uuid;
  v_story_id       uuid;
  v_is_saas_wide   boolean := coalesce(p_is_saas_wide, false);
  v_creator_name   text;
  v_creator_avatar text;
  v_settings       jsonb;
begin
  v_creator_id := auth.uid();
  if v_creator_id is null then
    raise exception 'احراز هویت لازم است' using errcode = 'P0001';
  end if;

  v_org_id := public.current_org_id();
  if v_org_id is null then
    raise exception 'کاربر به سازمانی متصل نیست' using errcode = 'P0001';
  end if;

  if not public.current_user_has_story_permission('publish') then
    raise exception 'دسترسی انتشار استوری وجود ندارد' using errcode = 'P0001';
  end if;

  if v_is_saas_wide then
    if not (
      public.current_user_has_saas_admin_permission('publish_saas_story')
      or public.current_user_has_saas_admin_permission('publish_saas_admin_story')
    ) then
      raise exception 'دسترسی انتشار استوری SaaS وجود ندارد' using errcode = 'P0001';
    end if;

    if coalesce(p_is_saas_admins_only, false)
       and not public.current_user_has_saas_admin_permission('publish_saas_admin_story') then
      raise exception 'دسترسی انتشار استوری ویژه مدیران SaaS وجود ندارد' using errcode = 'P0001';
    end if;

    v_creator_name := 'تازه سیستم';
    v_creator_avatar := '/brand/taze-system-logo-f01.webp';
  else
    v_creator_name := nullif(btrim(coalesce(p_creator_name, '')), '');
    v_creator_avatar := nullif(btrim(coalesce(p_creator_avatar, '')), '');
  end if;

  if p_slides is null or jsonb_typeof(p_slides) <> 'array' or jsonb_array_length(p_slides) = 0 then
    raise exception 'حداقل یک اسلاید لازم است' using errcode = 'P0001';
  end if;

  v_settings := case
    when jsonb_typeof(coalesce(p_settings, '{}'::jsonb)) = 'object'
      then coalesce(p_settings, '{}'::jsonb)
    else '{}'::jsonb
  end;

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
    mention_role_ids,
    expires_at,
    delete_media_on_expire,
    settings,
    published_at,
    updated_at
  ) values (
    v_creator_id,
    v_org_id,
    v_creator_name,
    v_creator_avatar,
    p_slides,
    coalesce(p_is_org_wide, true),
    v_is_saas_wide,
    coalesce(p_is_saas_admins_only, false) and v_is_saas_wide,
    coalesce(p_viewer_user_ids, '{}'),
    coalesce(p_viewer_role_ids, '{}'),
    coalesce(p_mention_user_ids, '{}'),
    coalesce(p_mention_role_ids, '{}'),
    p_expires_at,
    coalesce(p_delete_media_on_expire, false),
    v_settings,
    now(),
    now()
  )
  returning id into v_story_id;

  return v_story_id;
end;
$$;

revoke all on function public.create_org_story(
  text, jsonb, text, boolean, boolean, boolean, uuid[], uuid[], uuid[], uuid[], timestamptz, boolean, jsonb
) from public;

grant execute on function public.create_org_story(
  text, jsonb, text, boolean, boolean, boolean, uuid[], uuid[], uuid[], uuid[], timestamptz, boolean, jsonb
) to authenticated;

-- ─────────────────────────────────────────────
-- ۳. بروزرسانی create_workflow_org_story() برای همسویی برندینگ SaaS
-- ─────────────────────────────────────────────
drop function if exists public.create_workflow_org_story(
  uuid, uuid, text, text, jsonb, boolean, uuid[], uuid[], uuid[], uuid[], timestamptz, boolean, boolean
);
drop function if exists public.create_workflow_org_story(
  uuid, uuid, text, text, jsonb, boolean, uuid[], uuid[], uuid[], uuid[], timestamptz, boolean, boolean, boolean
);

create or replace function public.create_workflow_org_story(
  p_org_id                 uuid,
  p_creator_id             uuid        default null,
  p_creator_name           text        default null,
  p_creator_avatar         text        default null,
  p_slides                 jsonb       default '[]'::jsonb,
  p_is_org_wide            boolean     default true,
  p_viewer_user_ids        uuid[]      default '{}',
  p_viewer_role_ids        uuid[]      default '{}',
  p_mention_user_ids       uuid[]      default '{}',
  p_mention_role_ids       uuid[]      default '{}',
  p_expires_at             timestamptz default null,
  p_is_saas_wide           boolean     default false,
  p_is_saas_admins_only    boolean     default false,
  p_delete_media_on_expire boolean     default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_profile record;
  v_creator_name    text;
  v_creator_avatar  text;
  v_story_id        uuid;
begin
  if p_org_id is null then
    raise exception 'سازمان استوری مشخص نیست' using errcode = 'P0001';
  end if;

  if not public.current_user_can_create_workflow_story(p_org_id, p_creator_id) then
    raise exception 'اجازه انتشار استوری خودکار وجود ندارد' using errcode = 'P0001';
  end if;

  if p_slides is null or jsonb_typeof(p_slides) <> 'array' or jsonb_array_length(p_slides) = 0 then
    raise exception 'حداقل یک اسلاید لازم است' using errcode = 'P0001';
  end if;

  if p_creator_id is not null then
    select id, full_name, email, mobile_1, avatar_url
      into v_creator_profile
    from public.profiles
    where id = p_creator_id
      and org_id = p_org_id
    limit 1;

    if v_creator_profile.id is null then
      raise exception 'منتشرکننده انتخاب‌شده در این سازمان پیدا نشد' using errcode = 'P0001';
    end if;
  end if;

  if coalesce(p_is_saas_wide, false) then
    if auth.role() <> 'service_role' and not (
      public.current_user_has_saas_admin_permission('publish_saas_story')
      or public.current_user_has_saas_admin_permission('publish_saas_admin_story')
    ) then
      raise exception 'دسترسی انتشار استوری SaaS وجود ندارد' using errcode = 'P0001';
    end if;

    v_creator_name := 'تازه سیستم';
    v_creator_avatar := '/brand/taze-system-logo-f01.webp';
  else
    v_creator_name := nullif(btrim(coalesce(p_creator_name, '')), '');
    if v_creator_name is null then
      if p_creator_id is null then
        v_creator_name := 'سیستم';
      else
        v_creator_name := coalesce(
          nullif(btrim(coalesce(v_creator_profile.full_name, '')), ''),
          nullif(btrim(coalesce(v_creator_profile.email, '')), ''),
          nullif(btrim(coalesce(v_creator_profile.mobile_1, '')), ''),
          'کاربر بدون نام'
        );
      end if;
    end if;

    v_creator_avatar := nullif(btrim(coalesce(p_creator_avatar, '')), '');
    if v_creator_avatar is null and p_creator_id is not null then
      v_creator_avatar := nullif(btrim(coalesce(v_creator_profile.avatar_url, '')), '');
    end if;
  end if;

  insert into public.org_stories (
    org_id,
    creator_id,
    creator_name,
    creator_avatar,
    slides,
    is_org_wide,
    is_saas_wide,
    is_saas_admins_only,
    viewer_user_ids,
    viewer_role_ids,
    mention_user_ids,
    mention_role_ids,
    expires_at,
    delete_media_on_expire,
    published_at,
    updated_at
  ) values (
    p_org_id,
    p_creator_id,
    v_creator_name,
    v_creator_avatar,
    p_slides,
    coalesce(p_is_org_wide, true),
    coalesce(p_is_saas_wide, false),
    coalesce(p_is_saas_admins_only, false) and coalesce(p_is_saas_wide, false),
    coalesce(p_viewer_user_ids, '{}'),
    coalesce(p_viewer_role_ids, '{}'),
    coalesce(p_mention_user_ids, '{}'),
    coalesce(p_mention_role_ids, '{}'),
    p_expires_at,
    coalesce(p_delete_media_on_expire, false),
    now(),
    now()
  )
  returning id into v_story_id;

  return v_story_id;
end;
$$;

revoke all on function public.create_workflow_org_story(
  uuid, uuid, text, text, jsonb, boolean, uuid[], uuid[], uuid[], uuid[], timestamptz, boolean, boolean, boolean
) from public;

grant execute on function public.create_workflow_org_story(
  uuid, uuid, text, text, jsonb, boolean, uuid[], uuid[], uuid[], uuid[], timestamptz, boolean, boolean, boolean
) to authenticated, service_role;

-- ─────────────────────────────────────────────
-- ۴. بروزرسانی record_story_view() برای پشتیبانی از استوری‌های SaaS-wide
-- ─────────────────────────────────────────────
create or replace function public.record_story_view(
  p_story_id uuid,
  p_user_id  uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_current_org uuid := public.current_org_id();
  v_role_id     uuid;
  v_story       record;
begin
  if v_user_id is null or v_current_org is null or p_story_id is null then
    return;
  end if;

  select p.role_id
    into v_role_id
  from public.profiles p
  where p.id = v_user_id
    and p.org_id = v_current_org
  limit 1;

  select s.id, s.org_id, s.is_saas_wide
    into v_story
  from public.org_stories s
  where s.id = p_story_id
    and s.is_active = true
    and s.published_at <= now()
    and (s.expires_at is null or s.expires_at > now())
    and (
      (
        s.org_id = v_current_org
        and (
          s.creator_id = v_user_id
          or s.is_org_wide = true
          or v_user_id = any(s.viewer_user_ids)
          or (v_role_id is not null and v_role_id = any(s.viewer_role_ids))
        )
      )
      or (
        s.is_saas_wide = true
        and (
          s.is_saas_admins_only = false
          or public.current_user_is_saas_org_admin()
        )
      )
    )
  limit 1;

  if v_story.id is null then
    return;
  end if;

  insert into public.org_story_views (org_id, story_id, user_id)
  values (v_current_org, p_story_id, v_user_id)
  on conflict (story_id, user_id) do nothing;

  if found then
    update public.org_stories
    set view_count = view_count + 1, updated_at = now()
    where id = p_story_id;
  end if;
end;
$$;

revoke all on function public.record_story_view(uuid, uuid) from public;
grant execute on function public.record_story_view(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ۵. توابع کنترل‌شده برای انقضا و پاک‌سازی مدیای استوری‌های منقضی‌شده
-- ─────────────────────────────────────────────
create or replace function public.get_expired_org_stories_for_media_cleanup(
  p_limit integer default 50
)
returns table (
  id     uuid,
  org_id uuid,
  slides jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if auth.role() <> 'service_role' then
    raise exception 'دسترسی مجاز نیست' using errcode = 'P0001';
  end if;

  perform public.deactivate_expired_org_stories();

  return query
  select s.id, s.org_id, s.slides
  from public.org_stories s
  where s.delete_media_on_expire = true
    and s.media_cleaned_at is null
    and s.expires_at is not null
    and s.expires_at <= now()
  order by s.expires_at asc
  limit v_limit;
end;
$$;

revoke all on function public.get_expired_org_stories_for_media_cleanup(integer) from public, authenticated;
grant execute on function public.get_expired_org_stories_for_media_cleanup(integer) to service_role;

create or replace function public.mark_org_story_media_cleaned(
  p_story_id       uuid,
  p_cleaned_slides jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'دسترسی مجاز نیست' using errcode = 'P0001';
  end if;

  if p_story_id is null then
    return;
  end if;

  update public.org_stories
  set
    is_active = false,
    media_cleaned_at = coalesce(media_cleaned_at, now()),
    slides = coalesce(p_cleaned_slides, slides),
    updated_at = now()
  where id = p_story_id;
end;
$$;

revoke all on function public.mark_org_story_media_cleaned(uuid, jsonb) from public, authenticated;
grant execute on function public.mark_org_story_media_cleaned(uuid, jsonb) to service_role;

-- پاک‌سازی تنانت-ایمن برای زمانی که سازمان وارد داشبورد می‌شود و استوری منقضی‌شده با تیک حذف فایل دارد
create or replace function public.get_own_expired_org_stories_for_media_cleanup(
  p_limit integer default 20
)
returns table (
  id     uuid,
  org_id uuid,
  slides jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if v_user_id is null or v_org_id is null then
    return;
  end if;

  update public.org_stories s
  set is_active = false,
      updated_at = now()
  where s.org_id = v_org_id
    and s.is_active = true
    and s.expires_at is not null
    and s.expires_at <= now();

  return query
  select s.id, s.org_id, s.slides
  from public.org_stories s
  where s.org_id = v_org_id
    and s.delete_media_on_expire = true
    and s.media_cleaned_at is null
    and s.expires_at is not null
    and s.expires_at <= now()
    and (
      s.creator_id = v_user_id
      or public.current_user_can_delete_story(s.creator_id)
    )
  order by s.expires_at asc
  limit v_limit;
end;
$$;

revoke all on function public.get_own_expired_org_stories_for_media_cleanup(integer) from public;
grant execute on function public.get_own_expired_org_stories_for_media_cleanup(integer) to authenticated;

create or replace function public.mark_own_org_story_media_cleaned(
  p_story_id       uuid,
  p_cleaned_slides jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id  uuid := public.current_org_id();
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or v_org_id is null or p_story_id is null then
    return;
  end if;

  update public.org_stories s
  set
    is_active = false,
    media_cleaned_at = coalesce(s.media_cleaned_at, now()),
    slides = coalesce(p_cleaned_slides, s.slides),
    updated_at = now()
  where s.id = p_story_id
    and s.org_id = v_org_id
    and s.delete_media_on_expire = true
    and s.expires_at is not null
    and s.expires_at <= now()
    and (
      s.creator_id = v_user_id
      or public.current_user_can_delete_story(s.creator_id)
    );
end;
$$;

revoke all on function public.mark_own_org_story_media_cleaned(uuid, jsonb) from public;
grant execute on function public.mark_own_org_story_media_cleaned(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
