-- =====================================================
-- KalamApp - Phase 226: User announcements runtime hardening
-- Date: 2026-06-02
-- Type: Additive / idempotent / behavior hardening
-- =====================================================

begin;

update public.saas_user_announcements
set
  kind = coalesce(nullif(trim(kind), ''), 'header'),
  title = coalesce(title, ''),
  body = coalesce(body, ''),
  media_items = coalesce(media_items, '[]'::jsonb),
  show_on_public_site = coalesce(show_on_public_site, false),
  show_on_user_panel = coalesce(show_on_user_panel, true),
  show_on_login = coalesce(show_on_login, false),
  allow_dismiss = coalesce(allow_dismiss, true),
  is_active = coalesce(is_active, true),
  audience_scope = coalesce(nullif(trim(audience_scope), ''), 'all'),
  target_org_ids = coalesce(target_org_ids, '{}'::uuid[]),
  target_user_ids = coalesce(target_user_ids, '{}'::uuid[]),
  target_role_ids = coalesce(target_role_ids, '{}'::uuid[]),
  target_host_patterns = coalesce(target_host_patterns, '{}'::text[]),
  target_path_patterns = coalesce(target_path_patterns, '{}'::text[]),
  conditions_all = coalesce(conditions_all, '[]'::jsonb),
  conditions_any = coalesce(conditions_any, '[]'::jsonb),
  priority = coalesce(priority, 100)
where kind is null
   or btrim(kind) = ''
   or title is null
   or body is null
   or media_items is null
   or show_on_public_site is null
   or show_on_user_panel is null
   or show_on_login is null
   or allow_dismiss is null
   or is_active is null
   or audience_scope is null
   or btrim(audience_scope) = ''
   or target_org_ids is null
   or target_user_ids is null
   or target_role_ids is null
   or target_host_patterns is null
   or target_path_patterns is null
   or conditions_all is null
   or conditions_any is null
   or priority is null;

alter table if exists public.saas_user_announcements
  alter column kind set default 'header',
  alter column title set default '',
  alter column body set default '',
  alter column media_items set default '[]'::jsonb,
  alter column show_on_public_site set default false,
  alter column show_on_user_panel set default true,
  alter column show_on_login set default false,
  alter column allow_dismiss set default true,
  alter column is_active set default true,
  alter column audience_scope set default 'all',
  alter column target_org_ids set default '{}'::uuid[],
  alter column target_user_ids set default '{}'::uuid[],
  alter column target_role_ids set default '{}'::uuid[],
  alter column target_host_patterns set default '{}'::text[],
  alter column target_path_patterns set default '{}'::text[],
  alter column conditions_all set default '[]'::jsonb,
  alter column conditions_any set default '[]'::jsonb,
  alter column priority set default 100;

alter table if exists public.saas_user_announcements
  alter column kind set not null,
  alter column title set not null,
  alter column body set not null,
  alter column media_items set not null,
  alter column show_on_public_site set not null,
  alter column show_on_user_panel set not null,
  alter column show_on_login set not null,
  alter column allow_dismiss set not null,
  alter column is_active set not null,
  alter column audience_scope set not null,
  alter column target_host_patterns set not null,
  alter column target_path_patterns set not null,
  alter column conditions_all set not null,
  alter column conditions_any set not null,
  alter column priority set not null;

create index if not exists idx_saas_user_announcement_dismissals_lookup
  on public.saas_user_announcement_dismissals (announcement_id, user_id, surface, org_id);

create or replace function public.dismiss_user_announcement(
  p_announcement_id uuid,
  p_surface text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_surface text := public.normalize_announcement_surface(p_surface);
  v_org_id uuid := public.current_org_id();
  v_can_dismiss boolean := false;
begin
  if auth.uid() is null then
    raise exception 'permission denied';
  end if;

  if v_surface not in ('public_site', 'user_panel', 'login_page') then
    raise exception 'surface is invalid';
  end if;

  select coalesce(a.allow_dismiss, false)
    into v_can_dismiss
  from public.saas_user_announcements a
  where a.id = p_announcement_id
    and coalesce(a.is_active, false) = true;

  if not coalesce(v_can_dismiss, false) then
    return false;
  end if;

  insert into public.saas_user_announcement_dismissals (
    announcement_id,
    org_id,
    user_id,
    surface,
    dismissed_at
  )
  values (
    p_announcement_id,
    v_org_id,
    auth.uid(),
    v_surface,
    now()
  )
  on conflict (announcement_id, user_id, surface)
  do update set
    org_id = excluded.org_id,
    dismissed_at = now();

  return true;
end
$$;

revoke all on function public.dismiss_user_announcement(uuid, text) from public;
grant execute on function public.dismiss_user_announcement(uuid, text) to authenticated;

create or replace function public.get_active_user_announcements(
  p_surface text,
  p_path text default null,
  p_host text default null
)
returns table (
  id uuid,
  kind text,
  title text,
  body text,
  media_items jsonb,
  allow_dismiss boolean,
  priority integer,
  conditions_all jsonb,
  conditions_any jsonb,
  starts_at timestamptz,
  ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_surface text := public.normalize_announcement_surface(p_surface);
  v_path text := lower(trim(coalesce(p_path, '')));
  v_host text := lower(trim(coalesce(p_host, '')));
  v_org_id uuid := public.current_org_id();
  v_user_id uuid := auth.uid();
  v_role_id uuid := null;
  v_is_demo boolean := false;
begin
  if v_surface not in ('public_site', 'user_panel', 'login_page') then
    return;
  end if;

  if v_user_id is not null then
    select p.role_id into v_role_id
    from public.profiles p
    where p.id = v_user_id;
  end if;

  if v_org_id is not null then
    select coalesce(s.is_demo, false) into v_is_demo
    from public.saas_org_settings s
    where s.org_id = v_org_id;
  end if;

  return query
  select
    a.id,
    case when trim(coalesce(a.kind, 'header')) = 'popup' then 'popup' else 'header' end as kind,
    coalesce(a.title, '') as title,
    coalesce(a.body, '') as body,
    coalesce(a.media_items, '[]'::jsonb) as media_items,
    coalesce(a.allow_dismiss, false) as allow_dismiss,
    coalesce(a.priority, 100) as priority,
    coalesce(a.conditions_all, '[]'::jsonb) as conditions_all,
    coalesce(a.conditions_any, '[]'::jsonb) as conditions_any,
    a.starts_at,
    a.ends_at
  from public.saas_user_announcements a
  where coalesce(a.is_active, false) = true
    and (a.starts_at is null or a.starts_at <= now())
    and (a.ends_at is null or a.ends_at >= now())
    and (
      (v_surface = 'public_site' and coalesce(a.show_on_public_site, false) = true)
      or (v_surface = 'user_panel' and coalesce(a.show_on_user_panel, false) = true)
      or (v_surface = 'login_page' and coalesce(a.show_on_login, false) = true)
    )
    and (
      coalesce(array_length(coalesce(a.target_org_ids, '{}'::uuid[]), 1), 0) = 0
      or (v_org_id is not null and v_org_id = any(coalesce(a.target_org_ids, '{}'::uuid[])))
    )
    and (
      coalesce(array_length(coalesce(a.target_user_ids, '{}'::uuid[]), 1), 0) = 0
      or (v_user_id is not null and v_user_id = any(coalesce(a.target_user_ids, '{}'::uuid[])))
    )
    and (
      coalesce(array_length(coalesce(a.target_role_ids, '{}'::uuid[]), 1), 0) = 0
      or (v_role_id is not null and v_role_id = any(coalesce(a.target_role_ids, '{}'::uuid[])))
    )
    and (
      coalesce(a.audience_scope, 'all') = 'all'
      or (coalesce(a.audience_scope, 'all') = 'demo_only' and v_is_demo)
      or (coalesce(a.audience_scope, 'all') = 'non_demo_only' and not v_is_demo)
    )
    and (
      coalesce(array_length(coalesce(a.target_host_patterns, '{}'::text[]), 1), 0) = 0
      or exists (
        select 1
        from unnest(coalesce(a.target_host_patterns, '{}'::text[])) as p(pattern)
        where v_host like replace(lower(trim(coalesce(p.pattern, ''))), '*', '%')
      )
    )
    and (
      coalesce(array_length(coalesce(a.target_path_patterns, '{}'::text[]), 1), 0) = 0
      or exists (
        select 1
        from unnest(coalesce(a.target_path_patterns, '{}'::text[])) as p(pattern)
        where v_path like replace(lower(trim(coalesce(p.pattern, ''))), '*', '%')
      )
    )
    and (
      coalesce(a.allow_dismiss, false) = false
      or v_user_id is null
      or not exists (
        select 1
        from public.saas_user_announcement_dismissals d
        where d.announcement_id = a.id
          and d.user_id = v_user_id
          and d.surface = v_surface
          and d.org_id is not distinct from v_org_id
      )
    )
  order by coalesce(a.priority, 100) asc, a.created_at desc;
end
$$;

revoke all on function public.get_active_user_announcements(text, text, text) from public;
grant execute on function public.get_active_user_announcements(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
