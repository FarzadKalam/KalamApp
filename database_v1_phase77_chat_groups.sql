-- =====================================================
-- KalamApp - Phase 77 Chat Groups
-- Date: 2026-04-10
-- Type: Additive / non-breaking migration
-- Goal: support internal group conversations in notifications
-- =====================================================

begin;

create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  user_ids uuid[] not null default '{}'::uuid[],
  role_ids uuid[] not null default '{}'::uuid[],
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_groups_org_id on public.chat_groups(org_id);
create index if not exists idx_chat_groups_created_by on public.chat_groups(created_by);
create index if not exists idx_chat_groups_user_ids on public.chat_groups using gin(user_ids);
create index if not exists idx_chat_groups_role_ids on public.chat_groups using gin(role_ids);

alter table if exists public.chat_groups enable row level security;

drop policy if exists p_chat_groups_auth_all on public.chat_groups;
create policy p_chat_groups_auth_all on public.chat_groups
for all
to authenticated
using (true)
with check (true);

drop trigger if exists trg_chat_groups_updated_at on public.chat_groups;
create trigger trg_chat_groups_updated_at
before update on public.chat_groups
for each row execute function public.set_updated_at();

commit;
