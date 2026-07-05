-- =====================================================
-- KalamApp - Phase 209 Job Descriptions Module
-- Date: 2026-07-05
-- Type: Additive / non-breaking migration
-- Goal: add HR job descriptions as a standalone tenant-owned module
-- =====================================================

begin;

create table if not exists public.job_descriptions (
  id uuid primary key default gen_random_uuid()
);

alter table public.job_descriptions
  add column if not exists org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists image_url text,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists job_goal text,
  add column if not exists job_responsibilities text,
  add column if not exists job_duties text,
  add column if not exists job_requirements text,
  add column if not exists behavioral_traits text,
  add column if not exists career_path text,
  add column if not exists performance_kpi text,
  add column if not exists competency_ksa text,
  add column if not exists role_relationships text,
  add column if not exists salary_calculation_notes text,
  add column if not exists job_description_notes text,
  add column if not exists use_for_ai boolean not null default false,
  add column if not exists ai_index_status text not null default 'not_built',
  add column if not exists ai_index_updated_at timestamptz,
  add column if not exists ai_index_error text,
  add column if not exists ai_content_hash text,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.employees
  add column if not exists job_description_id uuid references public.job_descriptions(id) on delete set null;

create index if not exists idx_job_descriptions_org_name
  on public.job_descriptions(org_id, name);

create unique index if not exists idx_job_descriptions_org_system_code
  on public.job_descriptions(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_job_descriptions_org_assignee
  on public.job_descriptions(org_id, assignee_id);

create index if not exists idx_job_descriptions_org_ai
  on public.job_descriptions(org_id, use_for_ai, ai_index_status)
  where use_for_ai is true;

create index if not exists idx_employees_org_job_description
  on public.employees(org_id, job_description_id)
  where job_description_id is not null;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_job_descriptions_updated_at on public.job_descriptions;
    create trigger trg_job_descriptions_updated_at
      before update on public.job_descriptions
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.job_descriptions enable row level security;

drop policy if exists p_job_descriptions_org_all on public.job_descriptions;
create policy p_job_descriptions_org_all on public.job_descriptions
  for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

grant select, insert, update, delete on public.job_descriptions to authenticated;

notify pgrst, 'reload schema';

commit;
