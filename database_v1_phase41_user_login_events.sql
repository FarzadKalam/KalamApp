-- =====================================================
-- KalamApp - Phase 41 User Login Events
-- Date: 2026-03-25
-- Type: Additive / non-breaking migration
-- Goal: store user login history for profile activity and last-login reporting
-- =====================================================

begin;

create table if not exists public.user_login_events (
  id uuid primary key default gen_random_uuid()
);

alter table public.user_login_events
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists login_method text not null default 'password',
  add column if not exists source text not null default 'web',
  add column if not exists user_agent text,
  add column if not exists created_at timestamptz not null default now();

update public.user_login_events
set
  login_method = coalesce(nullif(login_method, ''), 'password'),
  source = coalesce(nullif(source, ''), 'web'),
  created_at = coalesce(created_at, now())
where
  login_method is null
  or login_method = ''
  or source is null
  or source = ''
  or created_at is null;

alter table public.user_login_events
  alter column login_method set default 'password',
  alter column login_method set not null,
  alter column source set default 'web',
  alter column source set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists idx_user_login_events_user_created_at
  on public.user_login_events(user_id, created_at desc)
  where user_id is not null;

create index if not exists idx_user_login_events_org_created_at
  on public.user_login_events(org_id, created_at desc);

grant select, insert on public.user_login_events to authenticated, service_role;

alter table public.user_login_events enable row level security;

drop policy if exists p_user_login_events_org_all on public.user_login_events;
create policy p_user_login_events_org_all on public.user_login_events
  for all to authenticated
  using (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  )
  with check (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  );

commit;
