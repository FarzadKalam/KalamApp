-- =====================================================
-- KalamApp - Phase 117 Projects Alignment Multiselect
-- Date: 2026-04-21
-- Type: Additive / focused migration
-- Goal: add dynamic multiselect field storage for project alignment
-- =====================================================

begin;

alter table public.projects
  add column if not exists project_alignment jsonb not null default '[]'::jsonb;

update public.projects
set project_alignment = coalesce(project_alignment, '[]'::jsonb)
where project_alignment is null;

alter table public.projects
  alter column project_alignment set default '[]'::jsonb,
  alter column project_alignment set not null;

commit;
