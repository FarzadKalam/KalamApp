-- Phase 335: server-side propagation of process stage schedule dependencies.

begin;

create or replace function public.recalculate_process_run_schedules(
  p_org_id uuid,
  p_process_run_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_org_id uuid;
  v_run public.process_runs%rowtype;
  v_stage public.process_run_stages%rowtype;
  v_reference_stage public.process_run_stages%rowtype;
  v_metadata jsonb;
  v_graph jsonb;
  v_anchor_type text;
  v_anchor_node_key text;
  v_reference_node_key text;
  v_parent_trigger_key text;
  v_anchor_at timestamptz;
  v_due_at timestamptz;
  v_duration_value numeric;
  v_duration_unit text;
  v_pass integer;
  v_stage_count integer;
  v_pass_changes integer;
  v_total_changes integer := 0;
begin
  v_current_org_id := public.current_org_id();
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null
      or p_org_id is null
      or v_current_org_id is null
      or p_org_id <> v_current_org_id then
      raise exception 'دسترسی محاسبه موعدهای فرآیند وجود ندارد.' using errcode = '42501';
    end if;
  end if;

  -- Updates belonging to the same process run are serialized, while different
  -- organizations/runs can still be recalculated concurrently.
  perform pg_advisory_xact_lock(hashtextextended(p_process_run_id::text, 0));

  select *
  into v_run
  from public.process_runs r
  where r.id = p_process_run_id
    and r.org_id = p_org_id;

  if v_run.id is null then
    return 0;
  end if;

  select count(*)::integer
  into v_stage_count
  from public.process_run_stages s
  where s.process_run_id = p_process_run_id;

  -- Repeated passes cover reverse and cross-lane dependencies as well as
  -- ordinary forward chains. Stable values stop the loop immediately.
  for v_pass in 1..greatest(v_stage_count, 1) loop
    v_pass_changes := 0;

    for v_stage in
      select s.*
      from public.process_run_stages s
      where s.process_run_id = p_process_run_id
      order by coalesce(s.process_lane_key, s.metadata ->> 'process_lane_key', 'lane_1'),
               s.sort_order,
               s.created_at
    loop
      v_metadata := coalesce(v_stage.metadata, '{}'::jsonb);
      -- موعد دستی متعلق به کاربر است و نباید توسط dependency engine بازنویسی شود.
      if coalesce(v_metadata ->> 'due_schedule_mode', 'system') = 'manual' then
        continue;
      end if;
      v_graph := coalesce(v_metadata -> 'process_graph', '{}'::jsonb);
      v_anchor_type := coalesce(
        nullif(v_metadata ->> 'due_anchor_type', ''),
        case coalesce(v_metadata ->> 'duration_from', '')
          when 'project_start' then 'process_start'
          when 'previous_stage_end' then 'previous_stage_due'
          else null
        end,
        'process_start'
      );
      v_anchor_node_key := nullif(v_metadata ->> 'due_anchor_stage_node_key', '');
      v_reference_node_key := null;
      v_parent_trigger_key := null;
      v_anchor_at := null;

      if v_anchor_type like 'specific_stage_%' then
        v_reference_node_key := v_anchor_node_key;
      elsif v_anchor_type like 'previous_stage_%' then
        select coalesce(s.process_node_key, s.metadata ->> 'process_node_key')
        into v_reference_node_key
        from public.process_run_stages s
        where s.process_run_id = p_process_run_id
          and coalesce(s.process_lane_key, s.metadata ->> 'process_lane_key', 'lane_1')
            = coalesce(v_stage.process_lane_key, v_metadata ->> 'process_lane_key', 'lane_1')
          and s.sort_order < v_stage.sort_order
        order by s.sort_order desc, s.created_at desc
        limit 1;

        if v_reference_node_key is null and jsonb_typeof(v_graph -> 'lanes') = 'array' then
          select nullif(lane ->> 'parentTriggerKey', '')
          into v_parent_trigger_key
          from jsonb_array_elements(v_graph -> 'lanes') lane
          where lane ->> 'key' = coalesce(v_stage.process_lane_key, v_metadata ->> 'process_lane_key', 'lane_1')
          limit 1;

          if v_parent_trigger_key is not null and jsonb_typeof(v_graph -> 'triggers') = 'array' then
            select nullif(trigger_row ->> 'sourceNodeKey', '')
            into v_reference_node_key
            from jsonb_array_elements(v_graph -> 'triggers') trigger_row
            where trigger_row ->> 'key' = v_parent_trigger_key
            limit 1;
          end if;
        end if;
      elsif v_anchor_type like 'next_stage_%' then
        select coalesce(s.process_node_key, s.metadata ->> 'process_node_key')
        into v_reference_node_key
        from public.process_run_stages s
        where s.process_run_id = p_process_run_id
          and coalesce(s.process_lane_key, s.metadata ->> 'process_lane_key', 'lane_1')
            = coalesce(v_stage.process_lane_key, v_metadata ->> 'process_lane_key', 'lane_1')
          and s.sort_order > v_stage.sort_order
        order by s.sort_order, s.created_at
        limit 1;

        if v_reference_node_key is null and jsonb_typeof(v_graph -> 'triggers') = 'array' then
          select coalesce(target_stage.process_node_key, target_stage.metadata ->> 'process_node_key')
          into v_reference_node_key
          from jsonb_array_elements(v_graph -> 'triggers') trigger_row
          cross join lateral jsonb_array_elements_text(
            case when jsonb_typeof(trigger_row -> 'targetLaneKeys') = 'array'
              then trigger_row -> 'targetLaneKeys'
              else '[]'::jsonb
            end
          ) target_lane(lane_key)
          join lateral (
            select candidate.*
            from public.process_run_stages candidate
            where candidate.process_run_id = p_process_run_id
              and coalesce(candidate.process_lane_key, candidate.metadata ->> 'process_lane_key', 'lane_1') = target_lane.lane_key
            order by candidate.sort_order, candidate.created_at
            limit 1
          ) target_stage on true
          where trigger_row ->> 'sourceNodeKey' = coalesce(v_stage.process_node_key, v_metadata ->> 'process_node_key')
          limit 1;
        end if;
      end if;

      -- SELECT INTO clears every field when no reference exists; this prevents
      -- a reference from the previous loop iteration leaking into this stage.
      select s.*
      into v_reference_stage
      from public.process_run_stages s
      where s.process_run_id = p_process_run_id
        and coalesce(s.process_node_key, s.metadata ->> 'process_node_key') = v_reference_node_key
      limit 1;

      if v_anchor_type = 'process_start' then
        v_anchor_at := coalesce(v_run.started_at, v_run.created_at);
      elsif v_anchor_type = 'current_stage_created' then
        select coalesce(t.created_at, v_stage.created_at)
        into v_anchor_at
        from (select 1) seed
        left join public.tasks t on t.id = v_stage.task_id;
      elsif v_anchor_type in ('previous_stage_created', 'next_stage_created', 'specific_stage_created') then
        select coalesce(t.created_at, v_reference_stage.created_at)
        into v_anchor_at
        from (select 1) seed
        left join public.tasks t on t.id = v_reference_stage.task_id;
      elsif v_anchor_type in ('previous_stage_start', 'next_stage_start', 'specific_stage_start') then
        select coalesce(t.actual_start_at, t.start_date, v_reference_stage.started_at)
        into v_anchor_at
        from (select 1) seed
        left join public.tasks t on t.id = v_reference_stage.task_id;
      elsif v_anchor_type in ('previous_stage_due', 'next_stage_due', 'specific_stage_due') then
        select coalesce(t.due_date, v_reference_stage.planned_due_at)
        into v_anchor_at
        from (select 1) seed
        left join public.tasks t on t.id = v_reference_stage.task_id;
      elsif v_anchor_type in ('previous_stage_completed', 'next_stage_completed', 'specific_stage_completed') then
        select coalesce(t.actual_end_at, t.completed_at, v_reference_stage.completed_at)
        into v_anchor_at
        from (select 1) seed
        left join public.tasks t on t.id = v_reference_stage.task_id;
      end if;

      v_duration_value := case
        when coalesce(v_metadata ->> 'duration_value', '') ~ '^\s*\d+(\.\d+)?\s*$'
          then greatest(0, (v_metadata ->> 'duration_value')::numeric)
        else 0
      end;
      v_duration_unit := case when v_metadata ->> 'duration_unit' = 'hour' then 'hour' else 'day' end;
      v_due_at := case
        when v_anchor_at is null then null
        when v_duration_value <= 0 then v_anchor_at
        when v_duration_unit = 'hour' then v_anchor_at + make_interval(secs => (v_duration_value * 3600)::double precision)
        else v_anchor_at + make_interval(secs => (v_duration_value * 86400)::double precision)
      end;

      if v_stage.planned_due_at is distinct from v_due_at then
        update public.process_run_stages
        set planned_due_at = v_due_at,
            updated_at = now()
        where id = v_stage.id;
        v_pass_changes := v_pass_changes + 1;
        v_total_changes := v_total_changes + 1;
      end if;

      if v_stage.task_id is not null then
        update public.tasks t
        set due_date = v_due_at,
            schedule_variance_hours = case
              when coalesce(t.actual_end_at, t.completed_at) is null or v_due_at is null then null
              else extract(epoch from (coalesce(t.actual_end_at, t.completed_at) - v_due_at)) / 3600
            end,
            updated_at = now()
        where t.id = v_stage.task_id
          and t.org_id = p_org_id
          and t.due_date is distinct from v_due_at;
        if found then
          v_pass_changes := v_pass_changes + 1;
          v_total_changes := v_total_changes + 1;
        end if;
      end if;
    end loop;

    exit when v_pass_changes = 0;
  end loop;

  return v_total_changes;
end;
$$;

revoke all on function public.recalculate_process_run_schedules(uuid, uuid) from public;
grant execute on function public.recalculate_process_run_schedules(uuid, uuid) to authenticated, service_role;

create or replace function public.recalculate_process_schedule_from_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 or new.process_run_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and
     new.due_date is not distinct from old.due_date and
     new.start_date is not distinct from old.start_date and
     new.actual_start_at is not distinct from old.actual_start_at and
     new.completed_at is not distinct from old.completed_at and
     new.actual_end_at is not distinct from old.actual_end_at and
     new.process_node_key is not distinct from old.process_node_key and
     new.process_lane_key is not distinct from old.process_lane_key and
     new.sort_order is not distinct from old.sort_order then
    return new;
  end if;
  perform public.recalculate_process_run_schedules(new.org_id, new.process_run_id);
  return new;
end;
$$;

revoke all on function public.recalculate_process_schedule_from_task() from public;
drop trigger if exists process_schedule_recalculate_from_task on public.tasks;
create trigger process_schedule_recalculate_from_task
  after insert or update of due_date, start_date, actual_start_at, completed_at, actual_end_at,
    process_run_id, process_node_key, process_lane_key, sort_order
  on public.tasks
  for each row execute function public.recalculate_process_schedule_from_task();

create or replace function public.recalculate_process_schedule_from_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'UPDATE' and
     new.metadata is not distinct from old.metadata and
     new.sort_order is not distinct from old.sort_order and
     new.process_node_key is not distinct from old.process_node_key and
     new.process_lane_key is not distinct from old.process_lane_key and
     new.task_id is not distinct from old.task_id then
    return new;
  end if;
  select r.org_id into v_org_id from public.process_runs r where r.id = new.process_run_id;
  if v_org_id is not null then
    perform public.recalculate_process_run_schedules(v_org_id, new.process_run_id);
  end if;
  return new;
end;
$$;

revoke all on function public.recalculate_process_schedule_from_stage() from public;
drop trigger if exists process_schedule_recalculate_from_stage on public.process_run_stages;
create trigger process_schedule_recalculate_from_stage
  after insert or update of metadata, sort_order, process_node_key, process_lane_key, task_id
  on public.process_run_stages
  for each row execute function public.recalculate_process_schedule_from_stage();

create or replace function public.recalculate_process_schedule_from_run()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 or new.started_at is not distinct from old.started_at then
    return new;
  end if;
  perform public.recalculate_process_run_schedules(new.org_id, new.id);
  return new;
end;
$$;

revoke all on function public.recalculate_process_schedule_from_run() from public;
drop trigger if exists process_schedule_recalculate_from_run on public.process_runs;
create trigger process_schedule_recalculate_from_run
  after update of started_at on public.process_runs
  for each row execute function public.recalculate_process_schedule_from_run();

commit;
