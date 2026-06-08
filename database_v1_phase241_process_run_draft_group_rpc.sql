-- TazeSystem - Phase 241
-- Atomically creates or updates a process runtime group for draft stages.

begin;

create or replace function public.ensure_process_run_for_draft_group(
  p_org_id uuid,
  p_module_id text,
  p_record_id uuid,
  p_process_group_id text,
  p_process_name text,
  p_template_id uuid default null,
  p_stages jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_org_id uuid;
  v_run_id uuid;
  v_stage jsonb;
  v_stage_id uuid;
  v_template_stage_id uuid;
  v_draft_stage_id text;
  v_stage_name text;
  v_sort_order integer;
  v_status text;
  v_assignee_user_id uuid;
  v_assignee_role_id uuid;
  v_metadata jsonb;
  v_stage_rows jsonb := '[]'::jsonb;
begin
  v_current_org_id := public.current_org_id();

  if auth.uid() is null
    or p_org_id is null
    or v_current_org_id is null
    or p_org_id <> v_current_org_id then
    raise exception 'دسترسی ایجاد اجرای فرآیند برای این سازمان وجود ندارد.' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_module_id, '')), '') is null
    or p_record_id is null
    or nullif(btrim(coalesce(p_process_group_id, '')), '') is null then
    raise exception 'اطلاعات اجرای فرآیند کامل نیست.' using errcode = '22023';
  end if;

  if p_template_id is not null and not exists (
    select 1
    from public.process_templates t
    where t.id = p_template_id
      and t.org_id = p_org_id
  ) then
    raise exception 'الگوی فرآیند برای سازمان جاری پیدا نشد.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_org_id::text || ':' || p_module_id || ':' || p_record_id::text || ':' || p_process_group_id,
      0
    )
  );

  select r.id
  into v_run_id
  from public.process_runs r
  where r.org_id = p_org_id
    and r.module_id = p_module_id
    and r.record_id = p_record_id
    and r.process_group_id = p_process_group_id
  order by r.created_at desc, r.id desc
  limit 1;

  if v_run_id is null then
    insert into public.process_runs (
      org_id,
      template_id,
      module_id,
      record_id,
      process_name,
      status,
      copied_mode,
      started_at,
      process_group_id,
      created_by,
      updated_by
    )
    values (
      p_org_id,
      p_template_id,
      p_module_id,
      p_record_id,
      coalesce(nullif(btrim(coalesce(p_process_name, '')), ''), 'فرآیند'),
      'active',
      'manual',
      now(),
      p_process_group_id,
      auth.uid(),
      auth.uid()
    )
    returning id into v_run_id;
  end if;

  insert into public.process_run_links (
    org_id,
    process_run_id,
    module_id,
    record_id,
    is_primary
  )
  values (
    p_org_id,
    v_run_id,
    p_module_id,
    p_record_id,
    true
  )
  on conflict (process_run_id, module_id, record_id) do update
  set org_id = excluded.org_id,
      is_primary = true;

  for v_stage in
    select value
    from jsonb_array_elements(
      case when jsonb_typeof(p_stages) = 'array' then p_stages else '[]'::jsonb end
    )
  loop
    v_draft_stage_id := nullif(btrim(coalesce(v_stage ->> 'draft_stage_id', '')), '');
    v_template_stage_id := nullif(v_stage ->> 'template_stage_id', '')::uuid;
    v_stage_name := coalesce(nullif(btrim(coalesce(v_stage ->> 'stage_name', '')), ''), 'مرحله');
    v_sort_order := greatest(1, coalesce((v_stage ->> 'sort_order')::integer, 10));
    v_status := case lower(coalesce(v_stage ->> 'status', 'todo'))
      when 'in_progress' then 'in_progress'
      when 'done' then 'done'
      when 'blocked' then 'blocked'
      when 'canceled' then 'canceled'
      else 'todo'
    end;
    v_assignee_user_id := nullif(v_stage ->> 'assignee_user_id', '')::uuid;
    v_assignee_role_id := nullif(v_stage ->> 'assignee_role_id', '')::uuid;
    v_metadata := coalesce(v_stage -> 'metadata', '{}'::jsonb)
      || jsonb_build_object(
        'draft_stage_id', v_draft_stage_id,
        'process_group_id', p_process_group_id
      );

    perform public.assert_process_assignee_org(
      p_org_id,
      v_assignee_user_id,
      v_assignee_role_id
    );

    select s.id
    into v_stage_id
    from public.process_run_stages s
    where s.process_run_id = v_run_id
      and (
        (v_template_stage_id is not null and s.template_stage_id = v_template_stage_id)
        or (v_draft_stage_id is not null and s.metadata ->> 'draft_stage_id' = v_draft_stage_id)
        or (s.sort_order = v_sort_order and lower(btrim(s.stage_name)) = lower(v_stage_name))
      )
    order by
      case when v_template_stage_id is not null and s.template_stage_id = v_template_stage_id then 0 else 1 end,
      case when v_draft_stage_id is not null and s.metadata ->> 'draft_stage_id' = v_draft_stage_id then 0 else 1 end,
      s.created_at,
      s.id
    limit 1;

    if v_stage_id is null then
      insert into public.process_run_stages (
        process_run_id,
        template_stage_id,
        stage_name,
        sort_order,
        status,
        assignee_user_id,
        assignee_role_id,
        wage,
        metadata
      )
      values (
        v_run_id,
        v_template_stage_id,
        v_stage_name,
        v_sort_order,
        v_status,
        v_assignee_user_id,
        v_assignee_role_id,
        coalesce((v_stage ->> 'wage')::numeric, 0),
        v_metadata
      )
      returning id into v_stage_id;
    else
      update public.process_run_stages
      set template_stage_id = v_template_stage_id,
          stage_name = v_stage_name,
          sort_order = v_sort_order,
          status = v_status,
          assignee_user_id = v_assignee_user_id,
          assignee_role_id = v_assignee_role_id,
          wage = coalesce((v_stage ->> 'wage')::numeric, 0),
          metadata = v_metadata,
          updated_at = now()
      where id = v_stage_id;
    end if;

    v_stage_rows := v_stage_rows || jsonb_build_array(jsonb_build_object(
      'id', v_stage_id,
      'draft_stage_id', v_draft_stage_id,
      'template_stage_id', v_template_stage_id,
      'stage_name', v_stage_name,
      'sort_order', v_sort_order
    ));
    v_stage_id := null;
  end loop;

  update public.tasks
  set process_run_id = v_run_id
  where org_id = p_org_id
    and process_group_id = p_process_group_id
    and source_module_id = p_module_id
    and source_record_id = p_record_id
    and process_run_id is null;

  return jsonb_build_object(
    'process_run_id', v_run_id,
    'stages', v_stage_rows
  );
end;
$$;

revoke all on function public.ensure_process_run_for_draft_group(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid,
  jsonb
) from public;

grant execute on function public.ensure_process_run_for_draft_group(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid,
  jsonb
) to authenticated, service_role;

create or replace function public.sync_process_run_stage_from_task(
  p_process_run_stage_id uuid,
  p_task_id uuid,
  p_status text,
  p_assignee_user_id uuid default null,
  p_assignee_role_id uuid default null,
  p_planned_due_at timestamptz default null,
  p_started_at timestamptz default null,
  p_completed_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select r.org_id
  into v_org_id
  from public.process_run_stages s
  join public.process_runs r on r.id = s.process_run_id
  where s.id = p_process_run_stage_id;

  if auth.uid() is null
    or v_org_id is null
    or public.current_org_id() is null
    or v_org_id <> public.current_org_id() then
    raise exception 'دسترسی بروزرسانی مرحله فرآیند وجود ندارد.' using errcode = '42501';
  end if;

  if p_task_id is not null and not exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and t.org_id = v_org_id
  ) then
    raise exception 'فعالیت مرتبط متعلق به سازمان جاری نیست.' using errcode = '42501';
  end if;

  perform public.assert_process_assignee_org(
    v_org_id,
    p_assignee_user_id,
    p_assignee_role_id
  );

  update public.process_run_stages
  set task_id = p_task_id,
      status = case lower(coalesce(p_status, 'todo'))
        when 'in_progress' then 'in_progress'
        when 'done' then 'done'
        when 'completed' then 'done'
        when 'blocked' then 'blocked'
        when 'canceled' then 'canceled'
        else 'todo'
      end,
      assignee_user_id = p_assignee_user_id,
      assignee_role_id = p_assignee_role_id,
      planned_due_at = p_planned_due_at,
      started_at = p_started_at,
      completed_at = p_completed_at,
      updated_at = now()
  where id = p_process_run_stage_id;
end;
$$;

revoke all on function public.sync_process_run_stage_from_task(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  timestamptz
) from public;

grant execute on function public.sync_process_run_stage_from_task(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  timestamptz
) to authenticated, service_role;

commit;
