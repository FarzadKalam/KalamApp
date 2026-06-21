-- TazeSystem V1 Phase 275
-- Process work-item summary RPC.
-- Keeps tenant isolation fail-closed and avoids client-side multi-module scans.

begin;

create index if not exists idx_process_run_stages_assignee_user_runtime
  on public.process_run_stages(assignee_user_id, updated_at desc)
  where assignee_user_id is not null;

create index if not exists idx_process_run_stages_assignee_role_runtime
  on public.process_run_stages(assignee_role_id, updated_at desc)
  where assignee_role_id is not null;

create or replace function public.get_process_work_items_v1(
  p_module_specs jsonb default '[]'::jsonb,
  p_limit integer default 15
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
  v_permissions jsonb := '{}'::jsonb;
  v_allowed_role_ids uuid[] := '{}'::uuid[];
  v_allowed_role_texts text[] := '{}'::text[];
  v_allowed_user_ids uuid[] := '{}'::uuid[];
  v_allowed_user_texts text[] := '{}'::text[];
  v_limit integer := greatest(1, least(coalesce(p_limit, 15), 80));
  v_items jsonb := '[]'::jsonb;
  v_task_items jsonb := '[]'::jsonb;
  v_stage_items jsonb := '[]'::jsonb;
  v_module_items jsonb := '[]'::jsonb;
  v_spec jsonb;
  v_module_id text;
  v_table_name text;
  v_draft_field text;
  v_table_regclass regclass;
  v_module_perm jsonb;
  v_record_scope text;
  v_scope_user_texts text[] := '{}'::text[];
  v_scope_role_texts text[] := '{}'::text[];
  v_has_process_template_id boolean;
  v_has_updated_at boolean;
  v_has_created_at boolean;
  v_has_assignee_id boolean;
  v_has_assignee_role_id boolean;
  v_has_assignee_type boolean;
  v_record_assignee_condition text := 'false';
  v_sql text;
begin
  if v_org_id is null or v_user_id is null then
    return '[]'::jsonb;
  end if;

  select p.role_id, coalesce(r.permissions, '{}'::jsonb)
    into v_role_id, v_permissions
  from public.profiles p
  left join public.org_roles r
    on r.id = p.role_id
   and r.org_id = p.org_id
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  if not found then
    return '[]'::jsonb;
  end if;

  v_allowed_role_ids := array_remove(array[v_role_id], null);
  if v_role_id is not null then
    select array(
      select distinct role_id
      from (
        select v_role_id as role_id
        union all
        select r.id
        from public.org_roles r
        where r.org_id = v_org_id
          and r.parent_id = v_role_id
      ) roles
      where role_id is not null
    )
    into v_allowed_role_ids;
  end if;

  select array(
    select distinct p.id
    from public.profiles p
    where p.org_id = v_org_id
      and (
        p.id = v_user_id
        or (p.role_id is not null and p.role_id = any(v_allowed_role_ids))
      )
  )
  into v_allowed_user_ids;

  v_allowed_role_texts := array(select item::text from unnest(coalesce(v_allowed_role_ids, '{}'::uuid[])) item);
  v_allowed_user_texts := array(select item::text from unnest(coalesce(v_allowed_user_ids, '{}'::uuid[])) item);

  with task_rows as (
    select
      t.id,
      t.production_line_id,
      t.source_template_id,
      t.process_group_id,
      t.recurrence_info,
      t.updated_at,
      t.created_at,
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
      ) as record_id
    from public.tasks t
    where t.org_id = v_org_id
      and lower(coalesce(t.status, '')) not in ('done', 'completed', 'confirmed', 'final', 'settled', 'canceled')
      and (
        (t.assignee_type = 'user' and t.assignee_id = any(v_allowed_user_ids))
        or (t.assignee_type = 'role' and t.assignee_role_id = any(v_allowed_role_ids))
        or (t.assignee_type is null and t.assignee_id = any(v_allowed_user_ids))
        or (t.assignee_type is null and t.assignee_id = any(v_allowed_role_ids))
      )
    order by t.updated_at desc nulls last, t.created_at desc nulls last
    limit greatest(120, v_limit * 12)
  ),
  permitted_task_rows as (
    select tr.*
    from task_rows tr
    where tr.module_id is not null
      and tr.record_id is not null
      and lower(coalesce(v_permissions -> tr.module_id ->> 'view', 'true')) not in ('false', '0', 'no', 'off')
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', module_id || ':' || record_id::text || ':' || coalesce(nullif(process_group_id::text, ''), nullif(source_template_id::text, ''), 'default_process_group'),
        'moduleId', module_id,
        'recordId', record_id,
        'lineId', production_line_id,
        'groupId', process_group_id,
        'templateId', coalesce(source_template_id::text, recurrence_info -> 'process_group' ->> 'template_id'),
        'templateName', recurrence_info -> 'process_group' ->> 'template_name',
        'updatedAt', coalesce(updated_at, created_at),
        'reason', 'task'
      )
    ),
    '[]'::jsonb
  )
  into v_task_items
  from permitted_task_rows;

  v_items := v_items || coalesce(v_task_items, '[]'::jsonb);

  with stage_rows as (
    select
      r.module_id,
      r.record_id,
      r.template_id,
      r.process_group_id,
      r.process_name,
      coalesce(s.process_lane_key, s.metadata ->> 'process_lane_key') as line_id,
      coalesce(s.updated_at, r.updated_at, r.created_at) as updated_at
    from public.process_run_stages s
    join public.process_runs r
      on r.id = s.process_run_id
     and r.org_id = v_org_id
    where lower(coalesce(s.status, '')) not in ('done', 'completed', 'confirmed', 'final', 'settled', 'canceled')
      and (
        (s.assignee_user_id is not null and s.assignee_user_id = any(v_allowed_user_ids))
        or (s.assignee_role_id is not null and s.assignee_role_id = any(v_allowed_role_ids))
      )
    order by coalesce(s.updated_at, r.updated_at, r.created_at) desc nulls last
    limit greatest(120, v_limit * 12)
  ),
  permitted_stage_rows as (
    select sr.*
    from stage_rows sr
    where sr.module_id is not null
      and sr.record_id is not null
      and lower(coalesce(v_permissions -> sr.module_id ->> 'view', 'true')) not in ('false', '0', 'no', 'off')
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', module_id || ':' || record_id::text || ':' || coalesce(nullif(process_group_id::text, ''), nullif(template_id::text, ''), 'default_process_group'),
        'moduleId', module_id,
        'recordId', record_id,
        'lineId', null,
        'groupId', process_group_id,
        'templateId', template_id,
        'templateName', process_name,
        'updatedAt', updated_at,
        'reason', 'draft_stage'
      )
    ),
    '[]'::jsonb
  )
  into v_stage_items
  from permitted_stage_rows;

  v_items := v_items || coalesce(v_stage_items, '[]'::jsonb);

  for v_spec in
    select value
    from jsonb_array_elements(case when jsonb_typeof(p_module_specs) = 'array' then p_module_specs else '[]'::jsonb end)
  loop
    v_module_id := btrim(coalesce(v_spec ->> 'moduleId', ''));
    v_table_name := btrim(coalesce(v_spec ->> 'tableName', ''));
    v_draft_field := btrim(coalesce(v_spec ->> 'draftField', ''));

    if v_module_id !~ '^[a-zA-Z0-9_]+$'
       or v_table_name !~ '^[a-zA-Z0-9_]+$'
       or v_draft_field !~ '^[a-zA-Z0-9_]+$' then
      continue;
    end if;

    v_module_perm := coalesce(v_permissions -> v_module_id, '{}'::jsonb);
    if lower(coalesce(v_module_perm ->> 'view', 'true')) in ('false', '0', 'no', 'off') then
      continue;
    end if;
    v_record_scope := lower(coalesce(v_module_perm ->> 'record_scope', 'all'));
    if v_record_scope = 'own' then
      v_scope_user_texts := array[v_user_id::text];
      v_scope_role_texts := '{}'::text[];
    elsif v_record_scope = 'team' then
      v_scope_user_texts := array[v_user_id::text];
      v_scope_role_texts := case when v_role_id is null then '{}'::text[] else array[v_role_id::text] end;
    else
      v_scope_user_texts := v_allowed_user_texts;
      v_scope_role_texts := v_allowed_role_texts;
    end if;

    v_table_regclass := to_regclass(format('public.%I', v_table_name));
    if v_table_regclass is null then
      continue;
    end if;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_table_name and column_name = 'process_template_id'
    ) into v_has_process_template_id;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_table_name and column_name = 'updated_at'
    ) into v_has_updated_at;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_table_name and column_name = 'created_at'
    ) into v_has_created_at;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_table_name and column_name = 'assignee_id'
    ) into v_has_assignee_id;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_table_name and column_name = 'assignee_role_id'
    ) into v_has_assignee_role_id;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_table_name and column_name = 'assignee_type'
    ) into v_has_assignee_type;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_table_name and column_name in ('id', 'org_id', v_draft_field)
      group by table_name
      having count(distinct column_name) = 3
    ) then
      continue;
    end if;

    v_record_assignee_condition := 'false';
    if v_has_assignee_type and v_has_assignee_id then
      v_record_assignee_condition := v_record_assignee_condition || format(
        ' or (%1$I = ''user'' and %2$I::text = any($2)) or (%1$I is null and %2$I::text = any($2))',
        'assignee_type',
        'assignee_id'
      );
    elsif v_has_assignee_id then
      v_record_assignee_condition := v_record_assignee_condition || format(' or (%I::text = any($2))', 'assignee_id');
    end if;

    if v_has_assignee_type and v_has_assignee_role_id then
      v_record_assignee_condition := v_record_assignee_condition || format(
        ' or (%1$I = ''role'' and %2$I::text = any($3))',
        'assignee_type',
        'assignee_role_id'
      );
    elsif v_has_assignee_role_id then
      v_record_assignee_condition := v_record_assignee_condition || format(' or (%I::text = any($3))', 'assignee_role_id');
    end if;

    v_sql := format($fmt$
      with record_rows as (
        select
          id,
          %1$s as template_id,
          %2$s as updated_at,
          %3$I as draft_rows
        from %4$s
        where org_id = $1
          and %3$I is not null
          and jsonb_typeof(%3$I) = 'array'
          and jsonb_array_length(%3$I) > 0
          and (
            $4 = 'all'
            or (%5$s)
            or exists (
              select 1
              from jsonb_array_elements(%3$I) stage
              where coalesce(stage ->> 'default_assignee_id', stage ->> 'assignee_id', stage -> 'metadata' ->> 'default_assignee_id') = any($2)
                 or coalesce(stage ->> 'default_assignee_role_id', stage ->> 'assignee_role_id', stage -> 'metadata' ->> 'default_assignee_role_id') = any($3)
            )
          )
        order by %2$s desc nulls last
        limit $5
      ),
      expanded as (
        select
          id,
          template_id,
          updated_at,
          stage,
          coalesce(
            nullif(stage ->> 'process_group_id', ''),
            nullif(stage ->> 'source_template_id', ''),
            nullif(template_id::text, ''),
            'default_process_group'
          ) as group_key
        from record_rows
        cross join lateral jsonb_array_elements(draft_rows) stage
      ),
      grouped as (
        select
          id,
          max(template_id::text) as template_id,
          max(updated_at) as updated_at,
          group_key,
          max(nullif(stage ->> 'process_group_id', '')) as group_id,
          max(nullif(stage ->> 'source_template_id', '')) as stage_template_id,
          max(nullif(stage ->> 'source_template_name', '')) as template_name
        from expanded
        group by id, group_key
      )
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'key', $6 || ':' || id::text || ':' || group_key,
            'moduleId', $6,
            'recordId', id,
            'lineId', null,
            'groupId', group_id,
            'templateId', coalesce(stage_template_id, template_id),
            'templateName', template_name,
            'updatedAt', updated_at,
            'reason', 'record'
          )
        ),
        '[]'::jsonb
      )
      from grouped
    $fmt$,
      case when v_has_process_template_id then 'process_template_id' else 'null::uuid' end,
      case
        when v_has_updated_at then 'updated_at'
        when v_has_created_at then 'created_at'
        else 'now()'
      end,
      v_draft_field,
      v_table_regclass,
      v_record_assignee_condition
    );

    execute v_sql
      into v_module_items
      using v_org_id, v_scope_user_texts, v_scope_role_texts, v_record_scope, greatest(40, v_limit * 4), v_module_id;

    v_items := v_items || coalesce(v_module_items, '[]'::jsonb);
  end loop;

  return coalesce((
    with raw_items as (
      select value as item
      from jsonb_array_elements(v_items)
    ),
    normalized as (
      select
        item,
        item ->> 'key' as key,
        case
          when nullif(item ->> 'templateId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then nullif(item ->> 'templateId', '')::uuid
          else null
        end as template_id,
        nullif(item ->> 'updatedAt', '')::timestamptz as updated_at
      from raw_items
      where nullif(item ->> 'moduleId', '') is not null
        and nullif(item ->> 'recordId', '') is not null
        and nullif(item ->> 'key', '') is not null
    ),
    deduped as (
      select distinct on (key)
        item,
        template_id,
        updated_at
      from normalized
      order by key, updated_at desc nulls last
    ),
    sorted as (
      select
        d.item,
        d.updated_at,
        pt.name as template_name
      from deduped d
      left join public.process_templates pt
        on pt.id = d.template_id
       and pt.org_id = v_org_id
      order by d.updated_at desc nulls last
      limit v_limit + 1
    )
    select jsonb_agg(
      jsonb_set(
        item,
        '{templateName}',
        coalesce(to_jsonb(coalesce(nullif(item ->> 'templateName', ''), template_name)), 'null'::jsonb)
      )
      order by updated_at desc nulls last
    )
    from sorted
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_process_work_items_v1(jsonb, integer) from public;
grant execute on function public.get_process_work_items_v1(jsonb, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
