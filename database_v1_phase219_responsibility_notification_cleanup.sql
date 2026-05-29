-- =====================================================
-- KalamApp - Phase 219: Responsibility notification cleanup and strict lifecycle
-- Date: 2026-05-29
-- Type: Runtime / Notifications / idempotent
-- =====================================================

begin;

create or replace function public.kalam_responsibility_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org_id uuid := public.kalam_try_uuid(v_row->>'org_id');
  v_record_id text := nullif(v_row->>'id', '');
  v_assignee_id uuid := public.kalam_try_uuid(v_row->>'assignee_id');
  v_assignee_role_id uuid := public.kalam_try_uuid(v_row->>'assignee_role_id');
  v_assignee_type text := lower(trim(coalesce(v_row->>'assignee_type', '')));
  v_target_users uuid[] := '{}'::uuid[];
  v_target_roles uuid[] := '{}'::uuid[];
  v_title text;
  v_module_id text;
begin
  if v_org_id is null or v_record_id is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    delete from public.notification_inbox_items
    where org_id = v_org_id
      and section = 'responsibilities'
      and source_type = tg_table_name
      and source_id = v_record_id;
    return old;
  end if;

  if v_assignee_type = 'role' then
    v_target_roles := public.kalam_distinct_uuid_array(
      case
        when v_assignee_role_id is not null then array[v_assignee_role_id]
        when v_assignee_id is not null then array[v_assignee_id]
        else '{}'::uuid[]
      end
    );
  else
    if v_assignee_id is not null then
      v_target_users := array[v_assignee_id];
    end if;
    if v_assignee_role_id is not null then
      v_target_roles := array[v_assignee_role_id];
    end if;
  end if;

  if cardinality(v_target_users) = 0 and cardinality(v_target_roles) = 0 then
    delete from public.notification_inbox_items
    where org_id = v_org_id
      and section = 'responsibilities'
      and source_type = tg_table_name
      and source_id = v_record_id;
    return new;
  end if;

  v_title := coalesce(
    nullif(v_row->>'name', ''),
    nullif(v_row->>'title', ''),
    nullif(v_row->>'full_name', ''),
    nullif(v_row->>'system_code', ''),
    tg_table_name || ':' || v_record_id
  );

  v_module_id := public.kalam_resolve_notification_module_id(tg_table_name, v_row);

  perform public.kalam_upsert_notification_item(
    v_org_id,
    tg_table_name,
    v_record_id,
    'responsibilities',
    tg_table_name,
    lower(tg_op),
    v_title,
    nullif(left(coalesce(v_row->>'description', v_row->>'summary', ''), 240), ''),
    v_module_id,
    v_record_id,
    v_target_users,
    v_target_roles,
    false,
    jsonb_build_object(
      'table', tg_table_name,
      'module_id', v_module_id
    ),
    now()
  );

  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.column_name = 'assignee_id'
      and exists (
        select 1
        from information_schema.columns idc
        where idc.table_schema = c.table_schema
          and idc.table_name = c.table_name
          and idc.column_name = 'id'
      )
      and exists (
        select 1
        from information_schema.columns orgc
        where orgc.table_schema = c.table_schema
          and orgc.table_name = c.table_name
          and orgc.column_name = 'org_id'
      )
      and c.table_name not in (
        'tasks',
        'profiles',
        'voip_call_logs',
        'outbound_messages',
        'notification_inbox_items',
        'notification_read_states'
      )
  loop
    execute format('drop trigger if exists trg_%I_notification_inbox on public.%I', r.table_name, r.table_name);
    execute format(
      'create trigger trg_%I_notification_inbox after insert or update or delete on public.%I for each row execute function public.kalam_responsibility_notification_trigger()',
      r.table_name,
      r.table_name
    );
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in
    select
      c.table_name,
      exists (
        select 1
        from information_schema.columns rolec
        where rolec.table_schema = c.table_schema
          and rolec.table_name = c.table_name
          and rolec.column_name = 'assignee_role_id'
      ) as has_assignee_role
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.column_name = 'assignee_id'
      and exists (
        select 1
        from information_schema.columns idc
        where idc.table_schema = c.table_schema
          and idc.table_name = c.table_name
          and idc.column_name = 'id'
      )
      and exists (
        select 1
        from information_schema.columns orgc
        where orgc.table_schema = c.table_schema
          and orgc.table_name = c.table_name
          and orgc.column_name = 'org_id'
      )
      and c.table_name not in (
        'tasks',
        'profiles',
        'voip_call_logs',
        'outbound_messages',
        'notification_inbox_items',
        'notification_read_states'
      )
  loop
    if r.has_assignee_role then
      execute format(
        $sql$
          delete from public.notification_inbox_items nii
          where nii.section = 'responsibilities'
            and nii.source_type = %L
            and not exists (
              select 1
              from public.%I src
              where src.org_id = nii.org_id
                and src.id::text = coalesce(nullif(trim(nii.source_id), ''), nullif(trim(nii.record_id), ''))
                and (src.assignee_id is not null or src.assignee_role_id is not null)
            )
        $sql$,
        r.table_name,
        r.table_name
      );
    else
      execute format(
        $sql$
          delete from public.notification_inbox_items nii
          where nii.section = 'responsibilities'
            and nii.source_type = %L
            and not exists (
              select 1
              from public.%I src
              where src.org_id = nii.org_id
                and src.id::text = coalesce(nullif(trim(nii.source_id), ''), nullif(trim(nii.record_id), ''))
                and src.assignee_id is not null
            )
        $sql$,
        r.table_name,
        r.table_name
      );
    end if;
  end loop;
end $$;

commit;
