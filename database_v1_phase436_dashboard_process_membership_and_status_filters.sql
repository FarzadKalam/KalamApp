-- TazeSystem V1 Phase 436
-- Dashboard process membership is determined only by a matching stage assignee or creator.

begin;

create index if not exists idx_process_run_stages_creator_runtime
  on public.process_run_stages (created_by, updated_at desc)
  where created_by is not null;

create index if not exists idx_tasks_process_work_items_creator
  on public.tasks (org_id, created_by, updated_at desc)
  where process_group_id is not null or source_template_id is not null;

create or replace function public.get_process_work_items_v3(
  p_module_specs jsonb default '[]'::jsonb,
  p_limit integer default 15,
  p_status text default 'all'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_user_id uuid := auth.uid();
  v_role_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 15), 80));
  v_status text := case lower(btrim(coalesce(p_status, 'all')))
    when 'in_progress' then 'in_progress'
    when 'completed' then 'completed'
    else 'all'
  end;
  v_module_specs jsonb := case
    when jsonb_typeof(p_module_specs) = 'array' then p_module_specs
    else '[]'::jsonb
  end;
  v_spec jsonb;
  v_module_id text;
  v_table_name text;
  v_draft_field text;
  v_table_regclass regclass;
  v_has_process_template_id boolean;
  v_template_id_expression text;
  v_items jsonb := '[]'::jsonb;
  v_module_items jsonb := '[]'::jsonb;
  v_sql text;
begin
  if v_org_id is null or v_user_id is null then
    return '[]'::jsonb;
  end if;

  select p.role_id
  into v_role_id
  from public.profiles p
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  if not found then
    return '[]'::jsonb;
  end if;

  -- Runtime V2: a process is included only when one of its own stages belongs to the user.
  with matched_runs as (
    select
      r.id,
      r.module_id,
      r.record_id,
      r.process_group_id,
      r.template_id,
      r.process_name,
      coalesce(max(s.updated_at), r.updated_at, r.created_at) as updated_at,
      case
        when lower(coalesce(r.status, '')) in ('done', 'completed', 'confirmed', 'final', 'settled')
          or (
            count(s.id) > 0
            and bool_and(lower(coalesce(s.status, 'todo')) in ('done', 'completed', 'confirmed', 'final', 'settled'))
          )
          then 'completed'
        else 'in_progress'
      end as process_status
    from public.process_runs r
    join public.process_run_stages s
      on s.process_run_id = r.id
    left join public.tasks stage_task
      on stage_task.id = s.task_id
     and stage_task.org_id = v_org_id
    where r.org_id = v_org_id
      and exists (
        select 1
        from jsonb_array_elements(v_module_specs) spec
        where spec ->> 'moduleId' = r.module_id
      )
      and (
        s.assignee_user_id = v_user_id
        or (v_role_id is not null and s.assignee_role_id = v_role_id)
        or s.created_by = v_user_id
        or stage_task.created_by = v_user_id
      )
    group by r.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', 'group:' || id::text,
    'moduleId', module_id,
    'recordId', record_id,
    'lineId', null,
    'groupId', coalesce(process_group_id::text, id::text),
    'templateId', template_id,
    'templateName', process_name,
    'updatedAt', updated_at,
    'processStatus', process_status,
    'reason', 'draft_stage',
    'processLinks', jsonb_build_object(module_id, record_id)
  )), '[]'::jsonb)
  into v_items
  from matched_runs
  where v_status = 'all' or process_status = v_status;

  -- Legacy task-based processes without a runtime process row.
  with matched_task_groups as (
    select
      coalesce(
        nullif(t.source_module_id, ''),
        case when t.project_id is not null then 'projects' end,
        case when t.marketing_lead_id is not null then 'marketing_leads' end,
        case when t.related_customer is not null then 'customers' end,
        case when t.related_supplier is not null then 'suppliers' end,
        case when t.related_invoice is not null then 'invoices' end,
        case when t.purchase_invoice_id is not null then 'purchase_invoices' end,
        case when t.related_production_order is not null then 'production_orders' end,
        nullif(t.related_to_module, '')
      ) as module_id,
      coalesce(
        t.source_record_id,
        t.project_id,
        t.marketing_lead_id,
        t.related_customer,
        t.related_supplier,
        t.related_invoice,
        t.purchase_invoice_id,
        t.related_production_order
      ) as record_id,
      coalesce(nullif(t.process_group_id::text, ''), nullif(t.source_template_id::text, '')) as group_id,
      max(t.source_template_id::text) as template_id,
      max(t.recurrence_info -> 'process_group' ->> 'template_name') as template_name,
      max(coalesce(t.updated_at, t.created_at)) as updated_at,
      case
        when bool_and(lower(coalesce(t.status, 'todo')) in ('done', 'completed', 'confirmed', 'final', 'settled'))
          then 'completed'
        else 'in_progress'
      end as process_status,
      bool_or(
        (t.assignee_type = 'user' and t.assignee_id = v_user_id)
        or (t.assignee_type = 'role' and v_role_id is not null and t.assignee_role_id = v_role_id)
        or (t.assignee_type is null and t.assignee_id = v_user_id)
        or t.created_by = v_user_id
      ) as has_matching_stage
    from public.tasks t
    where t.org_id = v_org_id
      and (t.process_group_id is not null or t.source_template_id is not null)
    group by 1, 2, 3
  ), task_items as (
    select *
    from matched_task_groups
    where module_id is not null
      and record_id is not null
      and group_id is not null
      and has_matching_stage
      and exists (
        select 1
        from jsonb_array_elements(v_module_specs) spec
        where spec ->> 'moduleId' = module_id
      )
  )
  select v_items || coalesce(jsonb_agg(jsonb_build_object(
    'key', 'group:' || group_id,
    'moduleId', module_id,
    'recordId', record_id,
    'lineId', null,
    'groupId', group_id,
    'templateId', template_id,
    'templateName', template_name,
    'updatedAt', updated_at,
    'processStatus', process_status,
    'reason', 'task',
    'processLinks', jsonb_build_object(module_id, record_id)
  )), '[]'::jsonb)
  into v_items
  from task_items
  where v_status = 'all' or process_status = v_status;

  -- Draft stages are read per module and still require a matching stage within the same process group.
  for v_spec in select value from jsonb_array_elements(v_module_specs)
  loop
    v_module_id := btrim(coalesce(v_spec ->> 'moduleId', ''));
    v_table_name := btrim(coalesce(v_spec ->> 'tableName', ''));
    v_draft_field := btrim(coalesce(v_spec ->> 'draftField', ''));

    if v_module_id !~ '^[a-zA-Z0-9_]+$'
      or v_table_name !~ '^[a-zA-Z0-9_]+$'
      or v_draft_field !~ '^[a-zA-Z0-9_]+$' then
      continue;
    end if;

    v_table_regclass := to_regclass(format('public.%I', v_table_name));
    if v_table_regclass is null then
      continue;
    end if;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table_name
        and column_name = 'process_template_id'
    ) into v_has_process_template_id;
    v_template_id_expression := case
      when v_has_process_template_id then 'r.process_template_id::text'
      else 'null::text'
    end;

    v_sql := format($query$
      with expanded as (
        select
          r.id as record_id,
          %3$s as template_id,
          coalesce(r.updated_at, r.created_at) as updated_at,
          stage,
          coalesce(
            nullif(stage ->> 'process_group_id', ''),
            nullif(stage ->> 'source_template_id', ''),
            nullif(%3$s, ''),
            'default_process_group'
          ) as group_id
        from %1$s r
        cross join lateral jsonb_array_elements(r.%2$I) stage
        where r.org_id = $1
          and r.%2$I is not null
          and jsonb_typeof(r.%2$I) = 'array'
      ), grouped as (
        select
          record_id,
          group_id,
          max(template_id) as template_id,
          max(nullif(stage ->> 'source_template_name', '')) as template_name,
          max(updated_at) as updated_at,
          case
            when bool_and(lower(coalesce(stage ->> 'status', 'todo')) in ('done', 'completed', 'confirmed', 'final', 'settled'))
              then 'completed'
            else 'in_progress'
          end as process_status,
          bool_or(
            coalesce(
              stage ->> 'default_assignee_id',
              stage ->> 'assignee_id',
              stage ->> 'assignee_user_id',
              stage -> 'metadata' ->> 'default_assignee_id',
              stage -> 'metadata' ->> 'assignee_id',
              stage -> 'metadata' ->> 'assignee_user_id'
            ) = $2
            or (
              $3 is not null
              and coalesce(
                stage ->> 'default_assignee_role_id',
                stage ->> 'assignee_role_id',
                stage -> 'metadata' ->> 'default_assignee_role_id',
                stage -> 'metadata' ->> 'assignee_role_id'
              ) = $3
            )
            or coalesce(
              stage ->> 'created_by',
              stage ->> 'creator_id',
              stage -> 'metadata' ->> 'created_by',
              stage -> 'metadata' ->> 'creator_id'
            ) = $2
          ) as has_matching_stage
        from expanded
        group by record_id, group_id
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', 'record:' || $4 || ':' || record_id::text || ':' || group_id,
        'moduleId', $4,
        'recordId', record_id,
        'lineId', null,
        'groupId', group_id,
        'templateId', template_id,
        'templateName', template_name,
        'updatedAt', updated_at,
        'processStatus', process_status,
        'reason', 'draft_stage',
        'processLinks', jsonb_build_object($4, record_id)
      )), '[]'::jsonb)
      from grouped
      where has_matching_stage
        and ($5 = 'all' or process_status = $5)
    $query$, v_table_regclass, v_draft_field, v_template_id_expression);

    execute v_sql
      into v_module_items
      using v_org_id, v_user_id::text, v_role_id::text, v_module_id, v_status;
    v_items := v_items || coalesce(v_module_items, '[]'::jsonb);
  end loop;

  return coalesce((
    with raw_items as (
      select value as item
      from jsonb_array_elements(v_items)
    ), normalized as (
      select
        item,
        coalesce(nullif(item ->> 'groupId', ''), item ->> 'key') as identity,
        nullif(item ->> 'updatedAt', '')::timestamptz as updated_at,
        case when item ->> 'reason' = 'draft_stage' and item ->> 'key' like 'group:%%' then 0
             when item ->> 'reason' = 'task' then 1
             else 2 end as source_priority
      from raw_items
      where nullif(item ->> 'moduleId', '') is not null
        and nullif(item ->> 'recordId', '') is not null
    ), deduped as (
      select distinct on (identity) item, updated_at
      from normalized
      order by identity, source_priority, updated_at desc nulls last
    )
    select jsonb_agg(item order by updated_at desc nulls last)
    from (
      select item, updated_at
      from deduped
      order by updated_at desc nulls last
      limit v_limit + 1
    ) limited
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_process_work_items_v3(jsonb, integer, text) from public;
grant execute on function public.get_process_work_items_v3(jsonb, integer, text) to authenticated;

notify pgrst, 'reload schema';

commit;
