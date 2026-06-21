-- TazeSystem - Phase 272
-- Per-organization manager title used across settings and print surfaces.

begin;

alter table if exists public.company_settings
  add column if not exists manager_title text;

update public.company_settings
set manager_title = 'مدیرعامل'
where nullif(btrim(manager_title), '') is null;

alter table if exists public.company_settings
  alter column manager_title set default 'مدیرعامل',
  alter column manager_title set not null;

notify pgrst, 'reload schema';

commit;
