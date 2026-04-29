-- KalamApp V1 - Phase 133
-- Scope: stable process run identity + task/run linking for process automations

begin;

alter table if exists public.process_runs
  add column if not exists system_code text,
  add column if not exists process_group_id text;

alter table if exists public.tasks
  add column if not exists process_run_id uuid;

do $$
begin
  if to_regclass('public.process_runs') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'tasks_process_run_id_fkey'
    ) then
      alter table public.tasks
        add constraint tasks_process_run_id_fkey
        foreign key (process_run_id) references public.process_runs(id) on delete set null
        not valid;
    end if;
  end if;
end $$;

create unique index if not exists idx_process_runs_org_system_code
  on public.process_runs(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_process_runs_org_process_group
  on public.process_runs(org_id, process_group_id)
  where process_group_id is not null and process_group_id <> '';

create index if not exists idx_tasks_process_run_sort
  on public.tasks(process_run_id, sort_order)
  where process_run_id is not null;

do $$
begin
  if to_regprocedure('public.assign_system_code_from_module_settings()') is not null then
    drop trigger if exists trg_process_runs_system_code_autogen on public.process_runs;
    create trigger trg_process_runs_system_code_autogen
      before insert or update on public.process_runs
      for each row
      execute function public.assign_system_code_from_module_settings();
  end if;
end $$;

update public.process_runs r
set process_group_id = nullif(t.process_group_id, '')
from (
  select
    prs.process_run_id,
    min(nullif(trim(prs.metadata ->> 'process_group_id'), '')) as process_group_id
  from public.process_run_stages prs
  where nullif(trim(prs.metadata ->> 'process_group_id'), '') is not null
  group by prs.process_run_id
) t
where r.id = t.process_run_id
  and nullif(trim(coalesce(r.process_group_id, '')), '') is null;

update public.tasks t
set process_run_id = prs.process_run_id
from public.process_run_stages prs
where t.process_run_stage_id = prs.id
  and t.process_run_id is null;

commit;
