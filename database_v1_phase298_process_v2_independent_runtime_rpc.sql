-- Phase 298: Independent Process V2 runtime RPC
-- Keeps V2 auto-assignment away from legacy UUID casts in the old process RPC.

begin;

create or replace function public.kalam_try_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_value text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if v_value is null then
    return null;
  end if;

  v_value := regexp_replace(
    v_value,
    '^(process_run_stage|process_run|process_template_stage|process_template|task|user|role)[_:]',
    '',
    'i'
  );

  if v_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;

  return v_value::uuid;
exception when others then
  return null;
end;
$$;

alter table public.process_v2_deleted_stage_marks
  add column if not exists process_run_id uuid,
  add column if not exists process_group_id text,
  add column if not exists template_stage_id uuid,
  add column if not exists draft_stage_key text,
  add column if not exists process_node_key text,
  add column if not exists process_lane_key text;

update public.process_v2_deleted_stage_marks m
set process_run_id = coalesce(m.process_run_id, s.process_run_id),
    process_group_id = coalesce(nullif(btrim(coalesce(m.process_group_id, '')), ''), nullif(btrim(coalesce(r.process_group_id, '')), '')),
    template_stage_id = coalesce(m.template_stage_id, s.template_stage_id),
    draft_stage_key = coalesce(
      nullif(btrim(coalesce(m.draft_stage_key, '')), ''),
      nullif(btrim(coalesce(s.metadata ->> 'draft_stage_key', '')), ''),
      nullif(btrim(coalesce(s.metadata ->> 'draft_stage_id', '')), '')
    ),
    process_node_key = coalesce(
      nullif(btrim(coalesce(m.process_node_key, '')), ''),
      nullif(btrim(coalesce(s.process_node_key, '')), ''),
      nullif(btrim(coalesce(s.metadata ->> 'process_node_key', '')), '')
    ),
    process_lane_key = coalesce(
      nullif(btrim(coalesce(m.process_lane_key, '')), ''),
      nullif(btrim(coalesce(s.process_lane_key, '')), ''),
      nullif(btrim(coalesce(s.metadata ->> 'process_lane_key', '')), '')
    )
from public.process_run_stages s
join public.process_runs r on r.id = s.process_run_id
where m.process_run_stage_id = s.id
  and m.org_id = r.org_id;

create or replace function public.ensure_process_run_for_draft_group_v2(
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
  v_current_org_id uuid := public.current_org_id();
  v_run_id uuid;
  v_stage jsonb;
  v_stage_id uuid;
  v_existing_deleted boolean;
  v_template_stage_id uuid;
  v_draft_stage_key text;
  v_stage_name text;
  v_sort_order integer;
  v_status text;
  v_assignee_user_id uuid;
  v_assignee_role_id uuid;
  v_wage numeric;
  v_metadata jsonb;
  v_stage_rows jsonb := '[]'::jsonb;
  v_link record;
  v_link_record_id uuid;
  v_process_node_key text;
  v_process_lane_key text;
begin
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

  insert into public.process_run_links (org_id, process_run_id, module_id, record_id, is_primary)
  values (p_org_id, v_run_id, p_module_id, p_record_id, true)
  on conflict (process_run_id, module_id, record_id) do update
  set org_id = excluded.org_id,
      is_primary = public.process_run_links.is_primary or excluded.is_primary;

  for v_stage in
    select value
    from jsonb_array_elements(
      case when jsonb_typeof(p_stages) = 'array' then p_stages else '[]'::jsonb end
    )
  loop
    v_metadata := coalesce(v_stage -> 'metadata', '{}'::jsonb);
    v_template_stage_id := public.kalam_try_uuid(v_stage ->> 'template_stage_id');
    v_draft_stage_key := coalesce(
      nullif(btrim(coalesce(v_stage ->> 'draft_stage_id', '')), ''),
      nullif(btrim(coalesce(v_metadata ->> 'draft_stage_key', '')), ''),
      nullif(btrim(coalesce(v_metadata ->> 'draft_stage_id', '')), '')
    );
    v_stage_name := coalesce(nullif(btrim(coalesce(v_stage ->> 'stage_name', '')), ''), 'مرحله');
    v_sort_order := greatest(
      1,
      coalesce(
        case
          when coalesce(v_stage ->> 'sort_order', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (v_stage ->> 'sort_order')::numeric::integer
          else null
        end,
        10
      )
    );
    v_status := case lower(coalesce(v_stage ->> 'status', 'todo'))
      when 'in_progress' then 'in_progress'
      when 'done' then 'done'
      when 'blocked' then 'blocked'
      when 'canceled' then 'canceled'
      else 'todo'
    end;
    v_assignee_user_id := public.kalam_try_uuid(v_stage ->> 'assignee_user_id');
    v_assignee_role_id := public.kalam_try_uuid(v_stage ->> 'assignee_role_id');
    v_process_node_key := nullif(btrim(coalesce(v_stage ->> 'process_node_key', '')), '');
    v_process_lane_key := coalesce(nullif(btrim(coalesce(v_stage ->> 'process_lane_key', '')), ''), 'lane_1');
    v_wage := coalesce(
      case
        when coalesce(v_stage ->> 'wage', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (v_stage ->> 'wage')::numeric
        else null
      end,
      0
    );
    v_metadata := v_metadata
      || jsonb_build_object(
        'draft_stage_id', v_draft_stage_key,
        'draft_stage_key', v_draft_stage_key,
        'process_group_id', p_process_group_id,
        'process_node_key', v_process_node_key,
        'process_lane_key', v_process_lane_key
      );

    select s.id,
           exists (
             select 1
             from public.process_v2_deleted_stage_marks m
             where m.org_id = p_org_id
               and (
                 m.process_run_stage_id = s.id
                 or (
                   m.process_run_id = v_run_id
                   and coalesce(m.process_group_id, p_process_group_id) = p_process_group_id
                   and (
                     (v_template_stage_id is not null and m.template_stage_id = v_template_stage_id)
                     or (v_draft_stage_key is not null and m.draft_stage_key = v_draft_stage_key)
                     or (v_process_node_key is not null and m.process_node_key = v_process_node_key)
                   )
                 )
               )
           )
    into v_stage_id, v_existing_deleted
    from public.process_run_stages s
    where s.process_run_id = v_run_id
      and (
        (v_template_stage_id is not null and s.template_stage_id = v_template_stage_id)
        or (v_draft_stage_key is not null and s.metadata ->> 'draft_stage_id' = v_draft_stage_key)
        or (v_draft_stage_key is not null and s.metadata ->> 'draft_stage_key' = v_draft_stage_key)
        or (v_process_node_key is not null and coalesce(s.process_node_key, s.metadata ->> 'process_node_key') = v_process_node_key)
        or (s.sort_order = v_sort_order and lower(btrim(s.stage_name)) = lower(v_stage_name))
      )
    order by
      case when v_template_stage_id is not null and s.template_stage_id = v_template_stage_id then 0 else 1 end,
      case when v_process_node_key is not null and coalesce(s.process_node_key, s.metadata ->> 'process_node_key') = v_process_node_key then 0 else 1 end,
      s.created_at,
      s.id
    limit 1;

    if coalesce(v_existing_deleted, false) then
      v_stage_id := null;
      continue;
    end if;

    begin
      perform public.assert_process_assignee_org(p_org_id, v_assignee_user_id, v_assignee_role_id);
    exception when others then
      v_assignee_user_id := null;
      v_assignee_role_id := null;
    end;

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
        process_node_key,
        process_lane_key,
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
        v_wage,
        v_process_node_key,
        v_process_lane_key,
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
          wage = v_wage,
          process_node_key = v_process_node_key,
          process_lane_key = v_process_lane_key,
          metadata = v_metadata,
          updated_at = now()
      where id = v_stage_id;
    end if;

    for v_link in
      select key, value
      from jsonb_each_text(
        case
          when jsonb_typeof(v_metadata -> 'process_link_map') = 'object' then v_metadata -> 'process_link_map'
          when jsonb_typeof(v_metadata -> 'process_links') = 'object' then v_metadata -> 'process_links'
          else '{}'::jsonb
        end
      )
    loop
      v_link_record_id := public.kalam_try_uuid(v_link.value);
      if nullif(btrim(coalesce(v_link.key, '')), '') is not null
        and v_link_record_id is not null then
        insert into public.process_run_links (org_id, process_run_id, module_id, record_id, is_primary)
        values (p_org_id, v_run_id, v_link.key, v_link_record_id, v_link.key = p_module_id and v_link_record_id = p_record_id)
        on conflict (process_run_id, module_id, record_id) do update
        set org_id = excluded.org_id,
            is_primary = public.process_run_links.is_primary or excluded.is_primary;
      end if;
    end loop;

    v_stage_rows := v_stage_rows || jsonb_build_array(jsonb_build_object(
      'id', v_stage_id,
      'draft_stage_id', v_draft_stage_key,
      'template_stage_id', v_template_stage_id,
      'stage_name', v_stage_name,
      'sort_order', v_sort_order,
      'process_node_key', v_process_node_key
    ));
    v_stage_id := null;
    v_existing_deleted := false;
  end loop;

  update public.tasks
  set process_run_id = v_run_id
  where org_id = p_org_id
    and process_group_id = p_process_group_id
    and source_module_id = p_module_id
    and source_record_id = p_record_id
    and process_run_id is null;

  return jsonb_build_object('process_run_id', v_run_id, 'stages', v_stage_rows);
end;
$$;

revoke all on function public.ensure_process_run_for_draft_group_v2(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid,
  jsonb
) from public, anon;

grant execute on function public.ensure_process_run_for_draft_group_v2(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid,
  jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
