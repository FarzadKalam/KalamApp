-- Phase 292: Process parent module-list invalidation
-- Keeps ModuleList views fresh when process runs, run stages, or process tasks change.

begin;

create or replace function public.kalam_emit_process_parent_module_list_invalidation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_action text := lower(tg_op);
  v_updated_at timestamptz;
  v_org_id uuid;
  v_module_id text;
  v_record_id text;
  v_process_run_id text;
  v_process_run_stage_id text;
  v_task_id text;
  v_scope_hint jsonb;
begin
  v_row := case
    when tg_op = 'DELETE' then to_jsonb(old)
    else to_jsonb(new)
  end;

  v_updated_at := coalesce(
    nullif(v_row ->> 'updated_at', '')::timestamptz,
    nullif(v_row ->> 'created_at', '')::timestamptz,
    now()
  );

  if tg_table_name = 'process_runs' then
    v_org_id := nullif(v_row ->> 'org_id', '')::uuid;
    v_module_id := nullif(trim(coalesce(v_row ->> 'module_id', '')), '');
    v_record_id := nullif(trim(coalesce(v_row ->> 'record_id', '')), '');
    v_process_run_id := nullif(trim(coalesce(v_row ->> 'id', '')), '');
  elsif tg_table_name = 'process_run_stages' then
    v_process_run_stage_id := nullif(trim(coalesce(v_row ->> 'id', '')), '');
    v_process_run_id := nullif(trim(coalesce(v_row ->> 'process_run_id', '')), '');
    if v_process_run_id is not null then
      select pr.org_id, nullif(trim(coalesce(pr.module_id, '')), ''), nullif(trim(coalesce(pr.record_id, '')), '')
      into v_org_id, v_module_id, v_record_id
      from public.process_runs pr
      where pr.id::text = v_process_run_id
      limit 1;
    end if;
  elsif tg_table_name = 'tasks' then
    v_task_id := nullif(trim(coalesce(v_row ->> 'id', '')), '');
    v_process_run_id := nullif(trim(coalesce(v_row ->> 'process_run_id', '')), '');
    v_process_run_stage_id := nullif(trim(coalesce(v_row ->> 'process_run_stage_id', '')), '');
    if v_process_run_id is null and v_process_run_stage_id is not null then
      select prs.process_run_id::text
      into v_process_run_id
      from public.process_run_stages prs
      where prs.id::text = v_process_run_stage_id
      limit 1;
    end if;
    if v_process_run_id is not null then
      select pr.org_id, nullif(trim(coalesce(pr.module_id, '')), ''), nullif(trim(coalesce(pr.record_id, '')), '')
      into v_org_id, v_module_id, v_record_id
      from public.process_runs pr
      where pr.id::text = v_process_run_id
      limit 1;
    end if;
  end if;

  v_scope_hint := jsonb_strip_nulls(jsonb_build_object(
    'source', 'process_v2',
    'process_run_id', v_process_run_id,
    'process_run_stage_id', v_process_run_stage_id,
    'task_id', v_task_id,
    'assignee_user_id', nullif(v_row ->> 'assignee_id', ''),
    'assignee_role_id', nullif(v_row ->> 'assignee_role_id', '')
  ));

  if v_org_id is not null and v_module_id is not null and v_record_id is not null then
    perform public.kalam_broadcast_module_list_invalidation(
      v_org_id,
      v_module_id,
      v_record_id,
      v_action,
      v_updated_at,
      coalesce(v_scope_hint, '{}'::jsonb)
    );
  end if;

  if v_org_id is not null and v_process_run_id is not null then
    perform public.kalam_broadcast_module_list_invalidation(
      v_org_id,
      'process_runs',
      v_process_run_id,
      v_action,
      v_updated_at,
      coalesce(v_scope_hint, '{}'::jsonb)
    );
  end if;

  return coalesce(new, old);
end;
$$;

do $$
begin
  if to_regclass('public.process_runs') is not null then
    drop trigger if exists trg_process_runs_parent_module_list_invalidation on public.process_runs;
    create trigger trg_process_runs_parent_module_list_invalidation
      after insert or update or delete on public.process_runs
      for each row execute function public.kalam_emit_process_parent_module_list_invalidation();
  end if;

  if to_regclass('public.process_run_stages') is not null then
    drop trigger if exists trg_process_run_stages_parent_module_list_invalidation on public.process_run_stages;
    create trigger trg_process_run_stages_parent_module_list_invalidation
      after insert or update or delete on public.process_run_stages
      for each row execute function public.kalam_emit_process_parent_module_list_invalidation();
  end if;

  if to_regclass('public.tasks') is not null then
    drop trigger if exists trg_tasks_process_parent_module_list_invalidation on public.tasks;
    create trigger trg_tasks_process_parent_module_list_invalidation
      after insert or update or delete on public.tasks
      for each row execute function public.kalam_emit_process_parent_module_list_invalidation();
  end if;
end $$;

revoke all on function public.kalam_emit_process_parent_module_list_invalidation() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
