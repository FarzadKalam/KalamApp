-- =====================================================
-- KalamApp - Phase 223: SaaS user announcements runtime and admin module
-- Date: 2026-06-01
-- Type: Additive / idempotent / security-aware
-- =====================================================

begin;

create table if not exists public.saas_user_announcements (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'header',
  title text not null default '',
  body text not null default '',
  media_items jsonb not null default '[]'::jsonb,
  show_on_public_site boolean not null default false,
  show_on_user_panel boolean not null default true,
  show_on_login boolean not null default false,
  allow_dismiss boolean not null default true,
  is_active boolean not null default true,
  starts_at timestamptz null,
  ends_at timestamptz null,
  audience_scope text not null default 'all',
  target_org_ids uuid[] not null default '{}',
  target_user_ids uuid[] not null default '{}',
  target_role_ids uuid[] not null default '{}',
  target_host_patterns text[] not null default '{}',
  target_path_patterns text[] not null default '{}',
  conditions_all jsonb not null default '[]'::jsonb,
  conditions_any jsonb not null default '[]'::jsonb,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null
);

alter table if exists public.saas_user_announcements
  add column if not exists kind text not null default 'header',
  add column if not exists title text not null default '',
  add column if not exists body text not null default '',
  add column if not exists media_items jsonb not null default '[]'::jsonb,
  add column if not exists show_on_public_site boolean not null default false,
  add column if not exists show_on_user_panel boolean not null default true,
  add column if not exists show_on_login boolean not null default false,
  add column if not exists allow_dismiss boolean not null default true,
  add column if not exists is_active boolean not null default true,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists audience_scope text not null default 'all',
  add column if not exists target_org_ids uuid[] not null default '{}',
  add column if not exists target_user_ids uuid[] not null default '{}',
  add column if not exists target_role_ids uuid[] not null default '{}',
  add column if not exists target_host_patterns text[] not null default '{}',
  add column if not exists target_path_patterns text[] not null default '{}',
  add column if not exists conditions_all jsonb not null default '[]'::jsonb,
  add column if not exists conditions_any jsonb not null default '[]'::jsonb,
  add column if not exists priority integer not null default 100,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'saas_user_announcements_kind_check'
      and conrelid = 'public.saas_user_announcements'::regclass
  ) then
    alter table public.saas_user_announcements
      add constraint saas_user_announcements_kind_check
      check (kind in ('popup', 'header'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'saas_user_announcements_audience_scope_check'
      and conrelid = 'public.saas_user_announcements'::regclass
  ) then
    alter table public.saas_user_announcements
      add constraint saas_user_announcements_audience_scope_check
      check (audience_scope in ('all', 'demo_only', 'non_demo_only'));
  end if;
end
$$;

create index if not exists idx_saas_user_announcements_active_window
  on public.saas_user_announcements (is_active, starts_at, ends_at, priority, created_at desc);
create index if not exists idx_saas_user_announcements_show_flags
  on public.saas_user_announcements (show_on_public_site, show_on_user_panel, show_on_login);
create index if not exists idx_saas_user_announcements_target_org_ids
  on public.saas_user_announcements using gin (target_org_ids);
create index if not exists idx_saas_user_announcements_target_user_ids
  on public.saas_user_announcements using gin (target_user_ids);
create index if not exists idx_saas_user_announcements_target_role_ids
  on public.saas_user_announcements using gin (target_role_ids);

create table if not exists public.saas_user_announcement_dismissals (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.saas_user_announcements(id) on delete cascade,
  org_id uuid null,
  user_id uuid not null,
  surface text not null,
  dismissed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table if exists public.saas_user_announcement_dismissals
  add column if not exists announcement_id uuid,
  add column if not exists org_id uuid,
  add column if not exists user_id uuid,
  add column if not exists surface text,
  add column if not exists dismissed_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'saas_user_announcement_dismissals_surface_check'
      and conrelid = 'public.saas_user_announcement_dismissals'::regclass
  ) then
    alter table public.saas_user_announcement_dismissals
      add constraint saas_user_announcement_dismissals_surface_check
      check (surface in ('public_site', 'user_panel', 'login_page'));
  end if;
end
$$;

create unique index if not exists idx_saas_user_announcement_dismissals_unique
  on public.saas_user_announcement_dismissals (announcement_id, user_id, surface);
create index if not exists idx_saas_user_announcement_dismissals_user_org
  on public.saas_user_announcement_dismissals (user_id, org_id, surface);

create or replace function public.normalize_announcement_surface(p_surface text)
returns text
language plpgsql
immutable
as $$
declare
  v_surface text := lower(trim(coalesce(p_surface, '')));
begin
  if v_surface = 'public' then
    return 'public_site';
  end if;
  if v_surface = 'panel' then
    return 'user_panel';
  end if;
  if v_surface = 'login' then
    return 'login_page';
  end if;
  return v_surface;
end
$$;

revoke all on function public.normalize_announcement_surface(text) from public;
grant execute on function public.normalize_announcement_surface(text) to anon, authenticated;

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
  where a.id = p_announcement_id;

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
    a.kind,
    a.title,
    a.body,
    coalesce(a.media_items, '[]'::jsonb) as media_items,
    a.allow_dismiss,
    coalesce(a.priority, 100) as priority,
    coalesce(a.conditions_all, '[]'::jsonb) as conditions_all,
    coalesce(a.conditions_any, '[]'::jsonb) as conditions_any,
    a.starts_at,
    a.ends_at
  from public.saas_user_announcements a
  where a.is_active = true
    and (a.starts_at is null or a.starts_at <= now())
    and (a.ends_at is null or a.ends_at >= now())
    and (
      (v_surface = 'public_site' and a.show_on_public_site)
      or (v_surface = 'user_panel' and a.show_on_user_panel)
      or (v_surface = 'login_page' and a.show_on_login)
    )
    and (
      coalesce(array_length(a.target_org_ids, 1), 0) = 0
      or (v_org_id is not null and v_org_id = any(a.target_org_ids))
    )
    and (
      coalesce(array_length(a.target_user_ids, 1), 0) = 0
      or (v_user_id is not null and v_user_id = any(a.target_user_ids))
    )
    and (
      coalesce(array_length(a.target_role_ids, 1), 0) = 0
      or (v_role_id is not null and v_role_id = any(a.target_role_ids))
    )
    and (
      a.audience_scope = 'all'
      or (a.audience_scope = 'demo_only' and v_is_demo)
      or (a.audience_scope = 'non_demo_only' and not v_is_demo)
    )
    and (
      coalesce(array_length(a.target_host_patterns, 1), 0) = 0
      or exists (
        select 1
        from unnest(a.target_host_patterns) as p(pattern)
        where v_host like replace(lower(trim(coalesce(p.pattern, ''))), '*', '%')
      )
    )
    and (
      coalesce(array_length(a.target_path_patterns, 1), 0) = 0
      or exists (
        select 1
        from unnest(a.target_path_patterns) as p(pattern)
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
      )
    )
  order by coalesce(a.priority, 100) asc, a.created_at desc;
end
$$;

revoke all on function public.get_active_user_announcements(text, text, text) from public;
grant execute on function public.get_active_user_announcements(text, text, text) to anon, authenticated;

drop trigger if exists trg_saas_user_announcements_updated_at on public.saas_user_announcements;
create trigger trg_saas_user_announcements_updated_at
before update on public.saas_user_announcements
for each row execute function public.set_updated_at();

alter table public.saas_user_announcements enable row level security;
alter table public.saas_user_announcement_dismissals enable row level security;

drop policy if exists p_saas_user_announcements_select on public.saas_user_announcements;
create policy p_saas_user_announcements_select
on public.saas_user_announcements
for select
to authenticated
using (public.current_user_has_saas_admin_permission());

drop policy if exists p_saas_user_announcements_modify on public.saas_user_announcements;
create policy p_saas_user_announcements_modify
on public.saas_user_announcements
for all
to authenticated
using (
  public.current_user_has_saas_admin_permission('edit')
  or public.current_user_has_saas_admin_permission('edit_user_announcements')
)
with check (
  public.current_user_has_saas_admin_permission('edit')
  or public.current_user_has_saas_admin_permission('edit_user_announcements')
);

drop policy if exists p_saas_user_announcement_dismissals_select on public.saas_user_announcement_dismissals;
create policy p_saas_user_announcement_dismissals_select
on public.saas_user_announcement_dismissals
for select
to authenticated
using (
  user_id = auth.uid()
  and org_id = public.current_org_id()
);

drop policy if exists p_saas_user_announcement_dismissals_insert on public.saas_user_announcement_dismissals;
create policy p_saas_user_announcement_dismissals_insert
on public.saas_user_announcement_dismissals
for insert
to authenticated
with check (
  user_id = auth.uid()
  and org_id = public.current_org_id()
  and surface in ('public_site', 'user_panel', 'login_page')
);

drop policy if exists p_saas_user_announcement_dismissals_update on public.saas_user_announcement_dismissals;
create policy p_saas_user_announcement_dismissals_update
on public.saas_user_announcement_dismissals
for update
to authenticated
using (
  user_id = auth.uid()
  and org_id = public.current_org_id()
)
with check (
  user_id = auth.uid()
  and org_id = public.current_org_id()
  and surface in ('public_site', 'user_panel', 'login_page')
);

drop policy if exists p_saas_user_announcement_dismissals_delete on public.saas_user_announcement_dismissals;
create policy p_saas_user_announcement_dismissals_delete
on public.saas_user_announcement_dismissals
for delete
to authenticated
using (
  user_id = auth.uid()
  and org_id = public.current_org_id()
);

revoke all on public.saas_user_announcements from public;
revoke all on public.saas_user_announcement_dismissals from public;
grant select, insert, update, delete on public.saas_user_announcements to authenticated;
grant select, insert, update, delete on public.saas_user_announcement_dismissals to authenticated;

create or replace function public.current_user_has_saas_admin_permission(required_field text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role_permissions jsonb;
  root_permission  jsonb;
  root_fields      jsonb;
  field_name       text := nullif(trim(coalesce(required_field, '')), '');
  root_edit        boolean := false;
  has_view         boolean := false;
begin
  select r.permissions
    into role_permissions
  from public.profiles p
  join public.org_roles r
    on r.id = p.role_id
  where p.id = auth.uid()
  limit 1;

  if role_permissions is null then
    return false;
  end if;

  root_permission := role_permissions -> '__saas_admin';
  if root_permission is null or jsonb_typeof(root_permission) <> 'object' then
    return false;
  end if;

  root_fields := coalesce(root_permission -> 'fields', '{}'::jsonb);
  root_edit := coalesce((root_permission ->> 'edit')::boolean, false);
  has_view := coalesce((root_permission ->> 'view')::boolean, false)
    or root_edit
    or coalesce((root_fields ->> 'edit_orgs')::boolean, false)
    or coalesce((root_fields ->> 'edit_requests')::boolean, false)
    or coalesce((root_fields ->> 'edit_user_announcements')::boolean, false)
    or coalesce((root_fields ->> 'demo_override')::boolean, false);
  if not has_view then
    return false;
  end if;

  if field_name is null or field_name = 'view' then
    return true;
  end if;

  return coalesce((root_permission ->> field_name)::boolean, false)
      or coalesce((root_fields ->> field_name)::boolean, false);
end
$$;

revoke all on function public.current_user_has_saas_admin_permission(text) from public;
grant execute on function public.current_user_has_saas_admin_permission(text) to authenticated;

notify pgrst, 'reload schema';

commit;
