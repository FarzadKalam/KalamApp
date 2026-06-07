-- TazeSystem - Phase 235
-- جدول توکن‌های API اختصاصی هر سازمان برای یکپارچه‌سازی خارجی

begin;

create extension if not exists pgcrypto;

create table if not exists public.org_api_tokens (
  id           uuid        primary key default gen_random_uuid(),
  org_id       uuid        not null references public.organizations(id) on delete cascade,
  token        text        not null unique,
  name         text,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.org_api_tokens enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'org_api_tokens' and policyname = 'org_members_manage_api_tokens'
  ) then
    create policy "org_members_manage_api_tokens" on public.org_api_tokens
      using (org_id = public.current_org_id())
      with check (org_id = public.current_org_id());
  end if;
end $$;

create index if not exists org_api_tokens_token_idx
  on public.org_api_tokens(token) where is_active = true;

create index if not exists org_api_tokens_org_idx
  on public.org_api_tokens(org_id);

-- فقط authenticated و service_role دسترسی دارند
grant select, insert, update, delete on public.org_api_tokens to authenticated;
grant select, insert, update, delete on public.org_api_tokens to service_role;

commit;
