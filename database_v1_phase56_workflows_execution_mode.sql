alter table if exists public.workflows
  add column if not exists execution_mode text not null default 'first_match';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workflows_execution_mode_check'
  ) then
    alter table public.workflows
      add constraint workflows_execution_mode_check
      check (execution_mode in ('first_match', 'every_match'));
  end if;
end $$;
