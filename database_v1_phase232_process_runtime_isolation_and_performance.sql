-- TazeSystem - Phase 232
-- Additive process runtime isolation, assignee guards, indexes, and read API.
-- Existing templates, runs, stages, tasks, and assignees are not modified.

begin;

create index if not exists idx_tasks_org_source_record_sort
  on public.tasks(org_id, source_module_id, source_record_id, sort_order)
  where source_module_id is not null and source_record_id is not null;

create index if not exists idx_tasks_recurrence_info_path_gin
  on public.tasks using gin (recurrence_info jsonb_path_ops);

create index if not exists idx_process_runs_org_record_group_created
  on public.process_runs(org_id, module_id, record_id, process_group_id, created_at desc);

create index if not exists idx_process_run_stages_run_task_sort
  on public.process_run_stages(process_run_id, task_id, sort_order);

create index if not exists idx_process_run_links_org_record_run
  on public.process_run_links(org_id, module_id, record_id, process_run_id);

alter table public.process_templates enable row level security;
drop policy if exists p_process_templates_org_all on public.process_templates;
drop policy if exists p_process_templates_auth_all on public.process_templates;
create policy p_process_templates_org_all
on public.process_templates
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

alter table public.process_template_stages enable row level security;
drop policy if exists p_process_template_stages_org_all on public.process_template_stages;
drop policy if exists p_process_template_stages_auth_all on public.process_template_stages;
create policy p_process_template_stages_org_all
on public.process_template_stages
for all
to authenticated
using (
  exists (
    select 1
    from public.process_templates t
    where t.id = process_template_stages.template_id
      and t.org_id = public.current_org_id()
  )
)
with check (
  exists (
    select 1
    from public.process_templates t
    where t.id = process_template_stages.template_id
      and t.org_id = public.current_org_id()
  )
);

alter table public.process_runs enable row level security;
drop policy if exists p_process_runs_org_all on public.process_runs;
drop policy if exists p_process_runs_auth_all on public.process_runs;
create policy p_process_runs_org_all
on public.process_runs
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

alter table public.process_run_stages enable row level security;
drop policy if exists p_process_run_stages_org_all on public.process_run_stages;
drop policy if exists p_process_run_stages_auth_all on public.process_run_stages;
create policy p_process_run_stages_org_all
on public.process_run_stages
for all
to authenticated
using (
  exists (
    select 1
    from public.process_runs r
    where r.id = process_run_stages.process_run_id
      and r.org_id = public.current_org_id()
  )
)
with check (
  exists (
    select 1
    from public.process_runs r
    where r.id = process_run_stages.process_run_id
      and r.org_id = public.current_org_id()
  )
);

alter table public.process_run_links enable row level security;
drop policy if exists p_process_run_links_org_all on public.process_run_links;
create policy p_process_run_links_org_all
on public.process_run_links
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

create or replace function public.assert_process_assignee_org(
  p_org_id uuid,
  p_assignee_user_id uuid,
  p_assignee_role_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null then
    raise exception 'سازمان فرآیند مشخص نیست.' using errcode = '42501';
  end if;

  if p_assignee_user_id is not null and not exists (
    select 1
    from public.profiles p
    where p.id = p_assignee_user_id
      and p.org_id = p_org_id
  ) then
    raise exception 'مسئول انتخاب‌شده متعلق به سازمان جاری نیست.' using errcode = '42501';
  end if;

  if p_assignee_role_id is not null and not exists (
    select 1
    from public.org_roles r
    where r.id = p_assignee_role_id
      and r.org_id = p_org_id
  ) then
    raise exception 'نقش انتخاب‌شده متعلق به سازمان جاری نیست.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_process_assignee_org(uuid, uuid, uuid) from public, authenticated;
grant execute on function public.assert_process_assignee_org(uuid, uuid, uuid) to service_role;

create or replace function public.guard_process_template_stage_assignee_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if tg_op = 'UPDATE'
    and new.default_assignee_id is not distinct from old.default_assignee_id
    and new.default_assignee_role_id is not distinct from old.default_assignee_role_id
    and new.template_id is not distinct from old.template_id then
    return new;
  end if;

  select t.org_id into v_org_id
  from public.process_templates t
  where t.id = new.template_id;

  perform public.assert_process_assignee_org(
    v_org_id,
    new.default_assignee_id,
    new.default_assignee_role_id
  );
  return new;
end;
$$;

drop trigger if exists trg_guard_process_template_stage_assignee_org on public.process_template_stages;
create trigger trg_guard_process_template_stage_assignee_org
before insert or update of template_id, default_assignee_id, default_assignee_role_id
on public.process_template_stages
for each row execute function public.guard_process_template_stage_assignee_org();

create or replace function public.guard_process_run_stage_assignee_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if tg_op = 'UPDATE'
    and new.assignee_user_id is not distinct from old.assignee_user_id
    and new.assignee_role_id is not distinct from old.assignee_role_id
    and new.process_run_id is not distinct from old.process_run_id then
    return new;
  end if;

  select r.org_id into v_org_id
  from public.process_runs r
  where r.id = new.process_run_id;

  perform public.assert_process_assignee_org(
    v_org_id,
    new.assignee_user_id,
    new.assignee_role_id
  );
  return new;
end;
$$;

drop trigger if exists trg_guard_process_run_stage_assignee_org on public.process_run_stages;
create trigger trg_guard_process_run_stage_assignee_org
before insert or update of process_run_id, assignee_user_id, assignee_role_id
on public.process_run_stages
for each row execute function public.guard_process_run_stage_assignee_org();

create or replace function public.guard_task_assignee_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and new.assignee_id is not distinct from old.assignee_id
    and new.assignee_role_id is not distinct from old.assignee_role_id
    and new.org_id is not distinct from old.org_id then
    return new;
  end if;

  perform public.assert_process_assignee_org(
    new.org_id,
    new.assignee_id,
    new.assignee_role_id
  );
  return new;
end;
$$;

drop trigger if exists trg_guard_task_assignee_org on public.tasks;
create trigger trg_guard_task_assignee_org
before insert or update of org_id, assignee_id, assignee_role_id
on public.tasks
for each row execute function public.guard_task_assignee_org();

create or replace function public.get_process_runtime_for_record(
  p_module_id text,
  p_record_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with matching_runs as (
    select r.*
    from public.process_runs r
    where r.org_id = public.current_org_id()
      and (
        (r.module_id = p_module_id and r.record_id = p_record_id)
        or exists (
          select 1
          from public.process_run_links l
          where l.process_run_id = r.id
            and l.org_id = public.current_org_id()
            and l.module_id = p_module_id
            and l.record_id = p_record_id
        )
      )
  ),
  run_rows as (
    select
      r.id,
      r.template_id,
      r.process_group_id,
      r.process_name,
      r.status,
      r.module_id,
      r.record_id,
      r.started_at,
      r.completed_at,
      r.created_at,
      r.updated_at,
      creator.full_name as created_by_name,
      updater.full_name as updated_by_name
    from matching_runs r
    left join public.profiles creator on creator.id = r.created_by and creator.org_id = r.org_id
    left join public.profiles updater on updater.id = r.updated_by and updater.org_id = r.org_id
  ),
  stage_rows as (
    select
      s.id,
      s.process_run_id,
      s.template_stage_id,
      s.stage_name,
      s.sort_order,
      s.status,
      s.task_id,
      s.assignee_user_id,
      s.assignee_role_id,
      s.wage,
      s.metadata,
      s.created_at,
      s.updated_at
    from public.process_run_stages s
    join matching_runs r on r.id = s.process_run_id
  )
  select jsonb_build_object(
    'runs',
    coalesce((select jsonb_agg(to_jsonb(rr) order by rr.created_at desc) from run_rows rr), '[]'::jsonb),
    'stages',
    coalesce((select jsonb_agg(to_jsonb(sr) order by sr.process_run_id, sr.sort_order) from stage_rows sr), '[]'::jsonb)
  );
$$;

revoke all on function public.get_process_runtime_for_record(text, uuid) from public;
grant execute on function public.get_process_runtime_for_record(text, uuid) to authenticated, service_role;

do $$
declare
  v_cross_org_template_assignees bigint := 0;
  v_cross_org_run_assignees bigint := 0;
  v_cross_org_task_assignees bigint := 0;
begin
  select count(*) into v_cross_org_template_assignees
  from public.process_template_stages s
  join public.process_templates t on t.id = s.template_id
  left join public.profiles p on p.id = s.default_assignee_id
  left join public.org_roles r on r.id = s.default_assignee_role_id
  where (s.default_assignee_id is not null and p.org_id is distinct from t.org_id)
     or (s.default_assignee_role_id is not null and r.org_id is distinct from t.org_id);

  select count(*) into v_cross_org_run_assignees
  from public.process_run_stages s
  join public.process_runs pr on pr.id = s.process_run_id
  left join public.profiles p on p.id = s.assignee_user_id
  left join public.org_roles r on r.id = s.assignee_role_id
  where (s.assignee_user_id is not null and p.org_id is distinct from pr.org_id)
     or (s.assignee_role_id is not null and r.org_id is distinct from pr.org_id);

  select count(*) into v_cross_org_task_assignees
  from public.tasks t
  left join public.profiles p on p.id = t.assignee_id
  left join public.org_roles r on r.id = t.assignee_role_id
  where (t.assignee_id is not null and p.org_id is distinct from t.org_id)
     or (t.assignee_role_id is not null and r.org_id is distinct from t.org_id);

  raise notice 'Cross-org assignee audit only (no data changed): template stages=%, run stages=%, tasks=%',
    v_cross_org_template_assignees,
    v_cross_org_run_assignees,
    v_cross_org_task_assignees;
end;
$$;

commit;
