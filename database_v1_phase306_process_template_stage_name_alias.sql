-- Phase 306: Backward-compatible stage name alias
-- Some older clients may still select process_template_stages.name. The canonical
-- column is stage_name; this generated column keeps read compatibility without
-- introducing a second writable source of truth.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'process_template_stages'
      and column_name = 'name'
  ) then
    alter table public.process_template_stages
      add column name text generated always as (stage_name) stored;
  end if;
end $$;

create index if not exists idx_process_template_stages_template_name
  on public.process_template_stages(template_id, name);
