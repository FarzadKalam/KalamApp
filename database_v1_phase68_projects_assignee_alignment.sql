-- =====================================================
-- KalamApp - Phase 68 Projects Assignee Alignment
-- Date: 2026-04-15
-- Type: Additive / idempotent migration
-- Goal: align projects table with assignee-aware queries
-- =====================================================

begin;

alter table public.projects
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists assignee_type text;

update public.projects
set
  assignee_id = coalesce(assignee_id, owner_id),
  assignee_type = coalesce(
    nullif(assignee_type, ''),
    case
      when assignee_role_id is not null then 'role'
      when coalesce(assignee_id, owner_id) is not null then 'user'
      else null
    end
  )
where
  assignee_id is null
  or assignee_type is null
  or assignee_type = '';

create index if not exists idx_projects_assignee_id
  on public.projects (assignee_id);

create index if not exists idx_projects_assignee_role_id
  on public.projects (assignee_role_id);

commit;
