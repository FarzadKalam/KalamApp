begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'org_stories'
      and column_name = 'creator_id'
      and is_nullable = 'NO'
  ) then
    alter table public.org_stories
      alter column creator_id drop not null;
  end if;
end;
$$;

create or replace function public.current_user_has_role_permission_entry(
  p_module_key text,
  p_root_action text default null,
  p_field_key text default null,
  p_missing_default boolean default true
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current_org uuid;
  v_permissions jsonb;
  v_module_permission jsonb;
  v_fields jsonb;
  v_module_key text := nullif(btrim(coalesce(p_module_key, '')), '');
  v_root_action text := nullif(btrim(coalesce(p_root_action, '')), '');
  v_field_key text := nullif(btrim(coalesce(p_field_key, '')), '');
  v_default_text text := case when coalesce(p_missing_default, true) then 'true' else 'false' end;
begin
  if v_module_key is null then
    return false;
  end if;

  v_current_org := public.current_org_id();
  if v_current_org is null or auth.uid() is null then
    return false;
  end if;

  select r.permissions
    into v_permissions
  from public.profiles p
  join public.org_roles r
    on r.id = p.role_id
   and r.org_id = p.org_id
  where p.id = auth.uid()
    and p.org_id = v_current_org
  limit 1;

  if v_permissions is null then
    return false;
  end if;

  v_module_permission := coalesce(v_permissions -> v_module_key, '{}'::jsonb);
  if jsonb_typeof(v_module_permission) <> 'object' then
    return coalesce(p_missing_default, true);
  end if;

  if v_root_action is not null
     and lower(coalesce(v_module_permission ->> v_root_action, v_default_text)) <> 'true' then
    return false;
  end if;

  if v_field_key is null then
    return true;
  end if;

  v_fields := coalesce(v_module_permission -> 'fields', '{}'::jsonb);
  if jsonb_typeof(v_fields) <> 'object' then
    return coalesce(p_missing_default, true);
  end if;

  return lower(coalesce(v_fields ->> v_field_key, v_default_text)) = 'true';
end;
$$;

grant execute on function public.current_user_has_role_permission_entry(text, text, text, boolean) to authenticated;

create or replace function public.current_user_has_story_permission(required_field text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  field_name text := nullif(btrim(coalesce(required_field, '')), '');
begin
  if not public.current_user_has_role_permission_entry('__stories', 'view', null, true) then
    return false;
  end if;

  if field_name is null then
    return true;
  end if;

  if field_name in ('publish', 'edit_own', 'edit_others', 'pin') then
    return public.current_user_has_role_permission_entry('__stories', 'edit', field_name, true);
  end if;

  if field_name in ('delete_own', 'delete_others') then
    return public.current_user_has_role_permission_entry('__stories', 'delete', field_name, true);
  end if;

  return public.current_user_has_role_permission_entry('__stories', 'view', field_name, true);
end;
$$;

grant execute on function public.current_user_has_story_permission(text) to authenticated;

create or replace function public.current_user_can_edit_story(p_creator_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_org_id() is null then
    return false;
  end if;

  if p_creator_id is not null and p_creator_id = auth.uid() then
    return public.current_user_has_story_permission('edit_own');
  end if;

  return public.current_user_has_story_permission('edit_others');
end;
$$;

grant execute on function public.current_user_can_edit_story(uuid) to authenticated;

create or replace function public.current_user_can_delete_story(p_creator_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_org_id() is null then
    return false;
  end if;

  if p_creator_id is not null and p_creator_id = auth.uid() then
    return public.current_user_has_story_permission('delete_own');
  end if;

  return public.current_user_has_story_permission('delete_others');
end;
$$;

grant execute on function public.current_user_can_delete_story(uuid) to authenticated;

create or replace function public.current_user_can_create_workflow_story(
  p_org_id uuid,
  p_creator_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_creator_exists boolean := false;
begin
  if p_org_id is null then
    return false;
  end if;

  if p_creator_id is not null then
    select exists (
      select 1
      from public.profiles
      where id = p_creator_id
        and org_id = p_org_id
    ) into v_creator_exists;

    if not v_creator_exists then
      return false;
    end if;
  end if;

  if auth.role() = 'service_role' then
    return true;
  end if;

  if auth.uid() is null or public.current_org_id() is null or public.current_org_id() <> p_org_id then
    return false;
  end if;

  return public.current_user_has_story_permission('publish')
    or public.current_user_has_role_permission_entry('__workflows', 'edit', null, true);
end;
$$;

grant execute on function public.current_user_can_create_workflow_story(uuid, uuid) to authenticated, service_role;

create or replace function public.create_workflow_org_story(
  p_org_id              uuid,
  p_creator_id          uuid        default null,
  p_creator_name        text        default null,
  p_creator_avatar      text        default null,
  p_slides              jsonb       default '[]'::jsonb,
  p_is_org_wide         boolean     default true,
  p_viewer_user_ids     uuid[]      default '{}',
  p_viewer_role_ids     uuid[]      default '{}',
  p_mention_user_ids    uuid[]      default '{}',
  p_mention_role_ids    uuid[]      default '{}',
  p_expires_at          timestamptz default null,
  p_is_saas_wide        boolean     default false,
  p_is_saas_admins_only boolean     default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_profile record;
  v_creator_name text;
  v_creator_avatar text;
  v_story_id uuid;
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
  end if;

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
    now(),
    now()
  )
  returning id into v_story_id;

  return v_story_id;
end;
$$;

revoke all on function public.create_workflow_org_story(
  uuid, uuid, text, text, jsonb, boolean, uuid[], uuid[], uuid[], uuid[], timestamptz, boolean, boolean
) from public;

grant execute on function public.create_workflow_org_story(
  uuid, uuid, text, text, jsonb, boolean, uuid[], uuid[], uuid[], uuid[], timestamptz, boolean, boolean
) to authenticated, service_role;

drop policy if exists p_org_stories_update_own on public.org_stories;
drop policy if exists p_org_stories_update_access on public.org_stories;
drop policy if exists p_org_stories_delete_own on public.org_stories;
drop policy if exists p_org_stories_delete_access on public.org_stories;

create policy p_org_stories_update_access
on public.org_stories
for update
to authenticated
using (
  public.current_user_can_edit_story(creator_id)
  and (
    org_id = public.current_org_id()
    or (is_saas_wide = true and public.current_user_can_publish_saas_story())
  )
)
with check (
  public.current_user_can_edit_story(creator_id)
  and (
    org_id = public.current_org_id()
    or (is_saas_wide = true and public.current_user_can_publish_saas_story())
  )
  and (
    is_saas_wide = false
    or public.current_user_can_publish_saas_story()
  )
  and (
    is_saas_admins_only = false
    or public.current_user_has_saas_admin_permission('publish_saas_admin_story')
  )
);

create policy p_org_stories_delete_access
on public.org_stories
for delete
to authenticated
using (
  public.current_user_can_delete_story(creator_id)
  and (
    org_id = public.current_org_id()
    or (is_saas_wide = true and public.current_user_can_publish_saas_story())
  )
);

notify pgrst, 'reload schema';

commit;
