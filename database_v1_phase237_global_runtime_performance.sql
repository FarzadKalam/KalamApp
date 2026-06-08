create index if not exists idx_projects_org_updated_id
  on public.projects(org_id, updated_at desc, id desc);

create index if not exists idx_tasks_org_project_sort
  on public.tasks(org_id, project_id, sort_order)
  where project_id is not null;

create or replace function public.get_process_runtime_batch_for_records(
  p_module_id text,
  p_record_ids uuid[]
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with requested_records as (
    select distinct record_id
    from unnest(coalesce(p_record_ids, '{}'::uuid[])) as record_id
    where record_id is not null
  ),
  matching_runs as (
    select distinct
      rr.record_id as request_record_id,
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
      r.updated_at
    from requested_records rr
    join public.process_runs r
      on r.org_id = public.current_org_id()
     and (
       (r.module_id = p_module_id and r.record_id = rr.record_id)
       or exists (
         select 1
         from public.process_run_links l
         where l.process_run_id = r.id
           and l.org_id = public.current_org_id()
           and l.module_id = p_module_id
           and l.record_id = rr.record_id
       )
     )
  ),
  stage_rows as (
    select
      mr.request_record_id,
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
    join matching_runs mr on mr.id = s.process_run_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'record_id', rr.record_id,
        'runs', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', mr.id,
              'template_id', mr.template_id,
              'process_group_id', mr.process_group_id,
              'process_name', mr.process_name,
              'status', mr.status,
              'module_id', mr.module_id,
              'record_id', mr.record_id,
              'started_at', mr.started_at,
              'completed_at', mr.completed_at,
              'created_at', mr.created_at,
              'updated_at', mr.updated_at
            )
            order by mr.created_at desc, mr.id desc
          )
          from matching_runs mr
          where mr.request_record_id = rr.record_id
        ), '[]'::jsonb),
        'stages', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', sr.id,
              'process_run_id', sr.process_run_id,
              'template_stage_id', sr.template_stage_id,
              'stage_name', sr.stage_name,
              'sort_order', sr.sort_order,
              'status', sr.status,
              'task_id', sr.task_id,
              'assignee_user_id', sr.assignee_user_id,
              'assignee_role_id', sr.assignee_role_id,
              'wage', sr.wage,
              'metadata', sr.metadata,
              'created_at', sr.created_at,
              'updated_at', sr.updated_at
            )
            order by sr.process_run_id, sr.sort_order, sr.id
          )
          from stage_rows sr
          where sr.request_record_id = rr.record_id
        ), '[]'::jsonb)
      )
      order by rr.record_id
    ),
    '[]'::jsonb
  )
  from requested_records rr;
$$;

revoke all on function public.get_process_runtime_batch_for_records(text, uuid[]) from public;
grant execute on function public.get_process_runtime_batch_for_records(text, uuid[]) to authenticated, service_role;

create or replace function public.search_relation_options_v1(
  p_target_module text,
  p_target_field text default null,
  p_search text default null,
  p_exact_ids uuid[] default null,
  p_limit integer default 50
)
returns table(value uuid, label text, search_text text)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_module text := trim(coalesce(p_target_module, ''));
  v_search text := trim(coalesce(p_search, ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_like text := case when trim(coalesce(p_search, '')) = '' then null else '%' || trim(p_search) || '%' end;
begin
  if v_module = 'customers' then
    return query
    select
      c.id,
      trim(coalesce(nullif(c.full_name, ''), nullif(c.business_name, ''), nullif(c.legal_name, ''), nullif(c.system_code, ''), 'بدون نام')) as label,
      lower(trim(concat_ws(' ', c.full_name, c.business_name, c.legal_name, c.mobile_1, c.phone, c.system_code))) as search_text
    from public.customers c
    where c.org_id = public.current_org_id()
      and (p_exact_ids is null or c.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', c.full_name, c.business_name, c.legal_name, c.mobile_1, c.phone, c.system_code) ilike v_like)
    order by c.updated_at desc nulls last, c.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'projects' then
    return query
    select
      p.id,
      trim(coalesce(nullif(p.name, ''), nullif(p.title, ''), nullif(p.system_code, ''), 'بدون عنوان')) as label,
      lower(trim(concat_ws(' ', p.name, p.title, p.system_code, p.status))) as search_text
    from public.projects p
    where p.org_id = public.current_org_id()
      and (p_exact_ids is null or p.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', p.name, p.title, p.system_code, p.status) ilike v_like)
    order by p.updated_at desc nulls last, p.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'products' then
    return query
    select
      p.id,
      trim(coalesce(nullif(p.name, ''), nullif(p.title, ''), nullif(p.system_code, ''), 'بدون عنوان')) as label,
      lower(trim(concat_ws(' ', p.name, p.title, p.system_code, p.status))) as search_text
    from public.products p
    where p.org_id = public.current_org_id()
      and (p_exact_ids is null or p.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', p.name, p.title, p.system_code, p.status) ilike v_like)
    order by p.updated_at desc nulls last, p.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'suppliers' then
    return query
    select
      s.id,
      trim(coalesce(nullif(s.full_name, ''), nullif(s.business_name, ''), nullif(s.system_code, ''), 'بدون نام')) as label,
      lower(trim(concat_ws(' ', s.full_name, s.business_name, s.mobile_1, s.phone, s.system_code))) as search_text
    from public.suppliers s
    where s.org_id = public.current_org_id()
      and (p_exact_ids is null or s.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', s.full_name, s.business_name, s.mobile_1, s.phone, s.system_code) ilike v_like)
    order by s.updated_at desc nulls last, s.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'invoices' then
    return query
    select
      i.id,
      trim(coalesce(nullif(i.name, ''), nullif(i.title, ''), nullif(i.system_code, ''), 'بدون عنوان')) as label,
      lower(trim(concat_ws(' ', i.name, i.title, i.system_code, i.status))) as search_text
    from public.invoices i
    where i.org_id = public.current_org_id()
      and (p_exact_ids is null or i.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', i.name, i.title, i.system_code, i.status) ilike v_like)
    order by i.updated_at desc nulls last, i.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'purchase_invoices' then
    return query
    select
      i.id,
      trim(coalesce(nullif(i.name, ''), nullif(i.title, ''), nullif(i.system_code, ''), 'بدون عنوان')) as label,
      lower(trim(concat_ws(' ', i.name, i.title, i.system_code, i.status))) as search_text
    from public.purchase_invoices i
    where i.org_id = public.current_org_id()
      and (p_exact_ids is null or i.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', i.name, i.title, i.system_code, i.status) ilike v_like)
    order by i.updated_at desc nulls last, i.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'tasks' then
    return query
    select
      t.id,
      trim(coalesce(nullif(t.name, ''), nullif(t.title, ''), 'بدون عنوان')) as label,
      lower(trim(concat_ws(' ', t.name, t.title, t.status))) as search_text
    from public.tasks t
    where t.org_id = public.current_org_id()
      and (p_exact_ids is null or t.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', t.name, t.title, t.status) ilike v_like)
    order by t.updated_at desc nulls last, t.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'profiles' then
    return query
    select
      p.id,
      trim(coalesce(nullif(p.full_name, ''), nullif(p.email, ''), nullif(p.mobile_1, ''), 'کاربر بدون نام')) as label,
      lower(trim(concat_ws(' ', p.full_name, p.email, p.mobile_1))) as search_text
    from public.profiles p
    where p.org_id = public.current_org_id()
      and (p_exact_ids is null or p.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', p.full_name, p.email, p.mobile_1) ilike v_like)
    order by p.updated_at desc nulls last, p.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module in ('org_roles', 'roles') then
    return query
    select
      r.id,
      trim(coalesce(nullif(r.title, ''), 'بدون عنوان')) as label,
      lower(trim(coalesce(r.title, ''))) as search_text
    from public.org_roles r
    where r.org_id = public.current_org_id()
      and (p_exact_ids is null or r.id = any(p_exact_ids))
      and (v_like is null or r.title ilike v_like)
    order by r.sort_order asc nulls last, r.title asc
    limit v_limit;
    return;
  end if;

  if v_module = 'shelves' then
    return query
    select
      s.id,
      trim(coalesce(nullif(s.shelf_number, ''), nullif(s.name, ''), 'بدون عنوان')) as label,
      lower(trim(concat_ws(' ', s.shelf_number, s.name))) as search_text
    from public.shelves s
    where s.org_id = public.current_org_id()
      and (p_exact_ids is null or s.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', s.shelf_number, s.name) ilike v_like)
    order by s.updated_at desc nulls last, s.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'process_templates' then
    return query
    select
      pt.id,
      trim(coalesce(nullif(pt.name, ''), 'بدون عنوان')) as label,
      lower(trim(concat_ws(' ', pt.name, pt.module_id, array_to_string(pt.module_ids, ' ')))) as search_text
    from public.process_templates pt
    where pt.org_id = public.current_org_id()
      and (p_exact_ids is null or pt.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', pt.name, pt.module_id, array_to_string(pt.module_ids, ' ')) ilike v_like)
    order by pt.updated_at desc nulls last, pt.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  return;
end;
$$;

revoke all on function public.search_relation_options_v1(text, text, text, uuid[], integer) from public;
grant execute on function public.search_relation_options_v1(text, text, text, uuid[], integer) to authenticated, service_role;

create or replace function public.get_dashboard_snapshot_v1(
  p_recent_limit integer default 12
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with current_profile as (
    select id, role_id, org_id
    from public.profiles
    where id = auth.uid()
      and org_id = public.current_org_id()
    limit 1
  ),
  active_tasks as (
    select count(*) as count_all
    from public.tasks t
    cross join current_profile cp
    where t.org_id = public.current_org_id()
      and coalesce(t.status, '') not in ('done', 'completed', 'confirmed', 'final', 'settled')
      and (
        t.assignee_id = cp.id
        or (cp.role_id is not null and t.assignee_role_id = cp.role_id)
      )
  ),
  overdue_tasks as (
    select count(*) as count_all
    from public.tasks t
    cross join current_profile cp
    where t.org_id = public.current_org_id()
      and t.due_date is not null
      and t.due_date::date < now()::date
      and coalesce(t.status, '') not in ('done', 'completed', 'confirmed', 'final', 'settled')
      and (
        t.assignee_id = cp.id
        or (cp.role_id is not null and t.assignee_role_id = cp.role_id)
      )
  ),
  process_runs_recent as (
    select jsonb_agg(
      jsonb_build_object(
        'id', pr.id,
        'module_id', pr.module_id,
        'record_id', pr.record_id,
        'process_name', pr.process_name,
        'status', pr.status,
        'updated_at', pr.updated_at
      )
      order by pr.updated_at desc nulls last
    ) as rows
    from (
      select *
      from public.process_runs
      where org_id = public.current_org_id()
      order by updated_at desc nulls last
      limit greatest(1, least(coalesce(p_recent_limit, 12), 30))
    ) pr
  )
  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'active_task_count', coalesce((select count_all from active_tasks), 0),
      'overdue_task_count', coalesce((select count_all from overdue_tasks), 0),
      'active_process_run_count', (
        select count(*)
        from public.process_runs
        where org_id = public.current_org_id()
          and coalesce(status, '') not in ('done', 'completed', 'canceled', 'cancelled')
      )
    ),
    'recent_process_runs', coalesce((select rows from process_runs_recent), '[]'::jsonb)
  );
$$;

revoke all on function public.get_dashboard_snapshot_v1(integer) from public;
grant execute on function public.get_dashboard_snapshot_v1(integer) to authenticated, service_role;
