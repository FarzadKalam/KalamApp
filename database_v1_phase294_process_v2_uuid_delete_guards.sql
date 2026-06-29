-- Phase 294: Process V2 UUID and delete guards
-- Fixes invalid empty-UUID failures in process auto-assignment and stage deletion.

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
  v_link record;
  v_link_record_id uuid;
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
      is_primary = public.process_run_links.is_primary or excluded.is_primary;

  for v_stage in
    select value
    from jsonb_array_elements(
      case when jsonb_typeof(p_stages) = 'array' then p_stages else '[]'::jsonb end
    )
  loop
    v_metadata := coalesce(v_stage -> 'metadata', '{}'::jsonb);
    v_draft_stage_id := coalesce(
      nullif(btrim(coalesce(v_stage ->> 'draft_stage_id', '')), ''),
      nullif(btrim(coalesce(v_metadata ->> 'draft_stage_id', '')), ''),
      nullif(btrim(coalesce(v_metadata ->> 'draft_stage_key', '')), '')
    );
    v_template_stage_id := public.kalam_try_uuid(v_stage ->> 'template_stage_id');
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
    v_metadata := v_metadata
      || jsonb_build_object(
        'draft_stage_id', v_draft_stage_id,
        'draft_stage_key', v_draft_stage_id,
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
        coalesce(
          case
            when coalesce(v_stage ->> 'wage', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
              then (v_stage ->> 'wage')::numeric
            else null
          end,
          0
        ),
        nullif(btrim(coalesce(v_stage ->> 'process_node_key', '')), ''),
        coalesce(nullif(btrim(coalesce(v_stage ->> 'process_lane_key', '')), ''), 'lane_1'),
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
          wage = coalesce(
            case
              when coalesce(v_stage ->> 'wage', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
                then (v_stage ->> 'wage')::numeric
              else null
            end,
            0
          ),
          process_node_key = nullif(btrim(coalesce(v_stage ->> 'process_node_key', '')), ''),
          process_lane_key = coalesce(nullif(btrim(coalesce(v_stage ->> 'process_lane_key', '')), ''), 'lane_1'),
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
          v_link.key,
          v_link_record_id,
          v_link.key = p_module_id and v_link_record_id = p_record_id
        )
        on conflict (process_run_id, module_id, record_id) do update
        set org_id = excluded.org_id,
            is_primary = public.process_run_links.is_primary or excluded.is_primary;
      end if;
    end loop;

    v_stage_rows := v_stage_rows || jsonb_build_array(jsonb_build_object(
      'id', v_stage_id,
      'draft_stage_id', v_draft_stage_id,
      'template_stage_id', v_template_stage_id,
      'stage_name', v_stage_name,
      'sort_order', v_sort_order,
      'process_node_key', nullif(btrim(coalesce(v_stage ->> 'process_node_key', '')), '')
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

create table if not exists public.process_v2_deleted_stage_marks (
  org_id uuid not null,
  process_run_stage_id uuid not null,
  deleted_by uuid,
  deleted_by_name text,
  deleted_at timestamptz not null default now(),
  primary key (org_id, process_run_stage_id)
);

alter table public.process_v2_deleted_stage_marks enable row level security;

drop policy if exists p_process_v2_deleted_stage_marks_org_all on public.process_v2_deleted_stage_marks;
create policy p_process_v2_deleted_stage_marks_org_all
on public.process_v2_deleted_stage_marks
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

create index if not exists idx_process_v2_deleted_stage_marks_stage
  on public.process_v2_deleted_stage_marks(process_run_stage_id);

grant select, insert, update, delete on public.process_v2_deleted_stage_marks to authenticated;

create or replace function public.delete_process_run_stages_v2_safe(
  p_stage_ids uuid[],
  p_deleted_by uuid default auth.uid(),
  p_deleted_by_name text default null,
  p_org_id uuid default public.current_org_id()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_org_id uuid := public.current_org_id();
  v_effective_org_id uuid := coalesce(p_org_id, public.current_org_id());
  v_stage record;
  v_deleted integer := 0;
begin
  if auth.uid() is null
    or v_effective_org_id is null
    or v_current_org_id is null
    or v_effective_org_id <> v_current_org_id then
    raise exception 'دسترسی حذف مرحله فرآیند برای این سازمان وجود ندارد.' using errcode = '42501';
  end if;

  for v_stage in
    select s.*, r.org_id
    from public.process_run_stages s
    join public.process_runs r on r.id = s.process_run_id
    where s.id = any(coalesce(p_stage_ids, array[]::uuid[]))
      and r.org_id = v_effective_org_id
  loop
    insert into public.process_v2_deleted_stage_marks (
      org_id,
      process_run_stage_id,
      deleted_by,
      deleted_by_name,
      deleted_at
    )
    values (
      v_effective_org_id,
      v_stage.id,
      p_deleted_by,
      nullif(btrim(coalesce(p_deleted_by_name, '')), ''),
      now()
    )
    on conflict (org_id, process_run_stage_id) do update
    set deleted_by = excluded.deleted_by,
        deleted_by_name = excluded.deleted_by_name,
        deleted_at = excluded.deleted_at;

    v_deleted := v_deleted + 1;
  end loop;

  return v_deleted;
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
) from public, anon;

grant execute on function public.ensure_process_run_for_draft_group(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid,
  jsonb
) to authenticated, service_role;

revoke all on function public.delete_process_run_stages_v2_safe(uuid[], uuid, text, uuid) from public, anon;
grant execute on function public.delete_process_run_stages_v2_safe(uuid[], uuid, text, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
