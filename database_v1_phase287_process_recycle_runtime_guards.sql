begin;

create index if not exists idx_recycle_bin_process_run_stage_parent
  on public.recycle_bin_records ((snapshot->>'process_run_id'))
  where source_table = 'process_run_stages';

create index if not exists idx_recycle_bin_task_process_run_parent
  on public.recycle_bin_records ((snapshot->>'process_run_id'))
  where source_table = 'tasks';

create index if not exists idx_recycle_bin_task_process_run_stage_parent
  on public.recycle_bin_records ((snapshot->>'process_run_stage_id'))
  where source_table = 'tasks';

create or replace function public.move_records_to_recycle_bin(
  p_module_id text,
  p_source_table text,
  p_record_ids uuid[],
  p_deleted_by uuid default auth.uid(),
  p_deleted_by_name text default null,
  p_org_id uuid default public.current_org_id()
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_source_table text;
  v_record_id uuid;
  v_snapshot jsonb;
  v_child_snapshot jsonb;
  v_effective_org_id uuid;
  v_count integer := 0;
begin
  v_source_table := public.resolve_recycle_bin_source_table(p_source_table);
  if v_source_table is null then
    raise exception 'منبع سطل بازیافت معتبر نیست: %', p_source_table;
  end if;

  foreach v_record_id in array coalesce(p_record_ids, array[]::uuid[])
  loop
    execute format(
      'select to_jsonb(t) from public.%I t where t.id = $1',
      v_source_table
    )
    into v_snapshot
    using v_record_id;

    if v_snapshot is null then
      raise exception 'رکورد % در ماژول % پیدا نشد یا قبلا حذف شده است.', v_record_id, p_module_id;
    end if;

    v_effective_org_id := coalesce(
      p_org_id,
      nullif(v_snapshot->>'org_id', '')::uuid,
      public.current_org_id()
    );

    if v_source_table = 'process_templates' then
      for v_child_snapshot in
        select to_jsonb(s)
        from public.process_template_stages s
        where s.template_id = v_record_id
      loop
        delete from public.recycle_bin_records
        where source_table = 'process_template_stages'
          and source_record_id = (v_child_snapshot->>'id')::uuid;

        insert into public.recycle_bin_records (
          org_id, module_id, source_table, source_record_id, record_title,
          snapshot, deleted_by, deleted_by_name
        )
        values (
          v_effective_org_id,
          'process_template_stages',
          'process_template_stages',
          (v_child_snapshot->>'id')::uuid,
          public.recycle_bin_record_title(v_child_snapshot),
          v_child_snapshot,
          p_deleted_by,
          nullif(trim(coalesce(p_deleted_by_name, '')), '')
        );

        v_count := v_count + 1;
      end loop;

      for v_child_snapshot in
        select to_jsonb(w)
        from public.workflows w
        where w.process_template_id = v_record_id
          and w.scope_type = 'process_activator'
      loop
        delete from public.recycle_bin_records
        where source_table = 'workflows'
          and source_record_id = (v_child_snapshot->>'id')::uuid;

        insert into public.recycle_bin_records (
          org_id, module_id, source_table, source_record_id, record_title,
          snapshot, deleted_by, deleted_by_name
        )
        values (
          coalesce(nullif(v_child_snapshot->>'org_id', '')::uuid, v_effective_org_id),
          'workflows',
          'workflows',
          (v_child_snapshot->>'id')::uuid,
          public.recycle_bin_record_title(v_child_snapshot),
          v_child_snapshot,
          p_deleted_by,
          nullif(trim(coalesce(p_deleted_by_name, '')), '')
        );

        v_count := v_count + 1;
      end loop;

      delete from public.workflows
      where process_template_id = v_record_id
        and scope_type = 'process_activator';
      delete from public.process_template_stages
      where template_id = v_record_id;
    elsif v_source_table = 'process_runs' then
      for v_child_snapshot in
        select to_jsonb(t)
        from public.tasks t
        where t.process_run_id = v_record_id
           or t.process_run_stage_id in (
             select s.id from public.process_run_stages s where s.process_run_id = v_record_id
           )
      loop
        delete from public.recycle_bin_records
        where source_table = 'tasks'
          and source_record_id = (v_child_snapshot->>'id')::uuid;

        insert into public.recycle_bin_records (
          org_id, module_id, source_table, source_record_id, record_title,
          snapshot, deleted_by, deleted_by_name
        )
        values (
          coalesce(nullif(v_child_snapshot->>'org_id', '')::uuid, v_effective_org_id),
          'tasks',
          'tasks',
          (v_child_snapshot->>'id')::uuid,
          public.recycle_bin_record_title(v_child_snapshot),
          v_child_snapshot,
          p_deleted_by,
          nullif(trim(coalesce(p_deleted_by_name, '')), '')
        );

        v_count := v_count + 1;
      end loop;

      for v_child_snapshot in
        select to_jsonb(s)
        from public.process_run_stages s
        where s.process_run_id = v_record_id
      loop
        delete from public.recycle_bin_records
        where source_table = 'process_run_stages'
          and source_record_id = (v_child_snapshot->>'id')::uuid;

        insert into public.recycle_bin_records (
          org_id, module_id, source_table, source_record_id, record_title,
          snapshot, deleted_by, deleted_by_name
        )
        values (
          v_effective_org_id,
          'process_run_stages',
          'process_run_stages',
          (v_child_snapshot->>'id')::uuid,
          public.recycle_bin_record_title(v_child_snapshot),
          v_child_snapshot,
          p_deleted_by,
          nullif(trim(coalesce(p_deleted_by_name, '')), '')
        );

        v_count := v_count + 1;
      end loop;

      delete from public.tasks
      where process_run_id = v_record_id
         or process_run_stage_id in (
           select s.id from public.process_run_stages s where s.process_run_id = v_record_id
         );
      delete from public.process_run_stages
      where process_run_id = v_record_id;
    end if;

    delete from public.recycle_bin_records
    where source_table = v_source_table
      and source_record_id = v_record_id;

    insert into public.recycle_bin_records (
      org_id, module_id, source_table, source_record_id, record_title,
      snapshot, deleted_by, deleted_by_name
    )
    values (
      v_effective_org_id,
      trim(coalesce(p_module_id, '')),
      v_source_table,
      v_record_id,
      public.recycle_bin_record_title(v_snapshot),
      v_snapshot,
      p_deleted_by,
      nullif(trim(coalesce(p_deleted_by_name, '')), '')
    );

    execute format(
      'delete from public.%I where id = $1',
      v_source_table
    )
    using v_record_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.restore_recycle_bin_records(
  p_recycle_ids uuid[]
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_recycle_id uuid;
  v_row public.recycle_bin_records%rowtype;
  v_columns text;
  v_count integer := 0;
  v_target_exists boolean := false;
  v_parent_id uuid;
begin
  create temporary table if not exists recycle_restore_queue (
    id uuid primary key
  ) on commit drop;

  truncate table recycle_restore_queue;

  foreach v_recycle_id in array coalesce(p_recycle_ids, array[]::uuid[])
  loop
    insert into recycle_restore_queue (id)
    values (v_recycle_id)
    on conflict do nothing;

    select *
    into v_row
    from public.recycle_bin_records
    where id = v_recycle_id;

    if not found then
      raise exception 'رکورد سطل بازیافت % پیدا نشد.', v_recycle_id;
    end if;

    if v_row.source_table = 'process_templates' then
      insert into recycle_restore_queue (id)
      select r.id
      from public.recycle_bin_records r
      where (
        r.source_table = 'process_template_stages'
        and r.snapshot->>'template_id' = v_row.source_record_id::text
      ) or (
        r.source_table = 'workflows'
        and r.snapshot->>'process_template_id' = v_row.source_record_id::text
        and coalesce(r.snapshot->>'scope_type', '') = 'process_activator'
      )
      on conflict do nothing;
    elsif v_row.source_table = 'process_runs' then
      insert into recycle_restore_queue (id)
      select r.id
      from public.recycle_bin_records r
      where (
        r.source_table = 'process_run_stages'
        and r.snapshot->>'process_run_id' = v_row.source_record_id::text
      ) or (
        r.source_table = 'tasks'
        and (
          r.snapshot->>'process_run_id' = v_row.source_record_id::text
          or r.snapshot->>'process_run_stage_id' in (
            select cr.source_record_id::text
            from public.recycle_bin_records cr
            where cr.source_table = 'process_run_stages'
              and cr.snapshot->>'process_run_id' = v_row.source_record_id::text
          )
        )
      )
      on conflict do nothing;
    elsif v_row.source_table = 'process_template_stages' then
      v_parent_id := nullif(v_row.snapshot->>'template_id', '')::uuid;
      if v_parent_id is not null then
        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where r.source_table = 'process_templates'
          and r.source_record_id = v_parent_id
        on conflict do nothing;

        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where (
          r.source_table = 'process_template_stages'
          and r.snapshot->>'template_id' = v_parent_id::text
        ) or (
          r.source_table = 'workflows'
          and r.snapshot->>'process_template_id' = v_parent_id::text
          and coalesce(r.snapshot->>'scope_type', '') = 'process_activator'
        )
        on conflict do nothing;
      end if;
    elsif v_row.source_table = 'process_run_stages' then
      v_parent_id := nullif(v_row.snapshot->>'process_run_id', '')::uuid;
      if v_parent_id is not null then
        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where r.source_table = 'process_runs'
          and r.source_record_id = v_parent_id
        on conflict do nothing;

        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where (
          r.source_table = 'process_run_stages'
          and r.snapshot->>'process_run_id' = v_parent_id::text
        ) or (
          r.source_table = 'tasks'
          and (
            r.snapshot->>'process_run_id' = v_parent_id::text
            or r.snapshot->>'process_run_stage_id' in (
              select cr.source_record_id::text
              from public.recycle_bin_records cr
              where cr.source_table = 'process_run_stages'
                and cr.snapshot->>'process_run_id' = v_parent_id::text
            )
          )
        )
        on conflict do nothing;
      end if;

      insert into recycle_restore_queue (id)
      select r.id
      from public.recycle_bin_records r
      where r.source_table = 'tasks'
        and r.snapshot->>'process_run_stage_id' = v_row.source_record_id::text
      on conflict do nothing;
    elsif v_row.source_table = 'tasks' then
      v_parent_id := nullif(v_row.snapshot->>'process_run_id', '')::uuid;
      if v_parent_id is not null then
        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where r.source_table = 'process_runs'
          and r.source_record_id = v_parent_id
        on conflict do nothing;

        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where (
          r.source_table = 'process_run_stages'
          and r.snapshot->>'process_run_id' = v_parent_id::text
        ) or (
          r.source_table = 'tasks'
          and (
            r.snapshot->>'process_run_id' = v_parent_id::text
            or r.snapshot->>'process_run_stage_id' in (
              select cr.source_record_id::text
              from public.recycle_bin_records cr
              where cr.source_table = 'process_run_stages'
                and cr.snapshot->>'process_run_id' = v_parent_id::text
            )
          )
        )
        on conflict do nothing;
      end if;

      v_parent_id := nullif(v_row.snapshot->>'process_run_stage_id', '')::uuid;
      if v_parent_id is not null then
        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where r.source_table = 'process_run_stages'
          and r.source_record_id = v_parent_id
        on conflict do nothing;
      end if;
    elsif v_row.source_table = 'workflows' then
      v_parent_id := nullif(v_row.snapshot->>'process_template_id', '')::uuid;
      if v_parent_id is not null then
        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where r.source_table = 'process_templates'
          and r.source_record_id = v_parent_id
        on conflict do nothing;

        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where (
          r.source_table = 'process_template_stages'
          and r.snapshot->>'template_id' = v_parent_id::text
        ) or (
          r.source_table = 'workflows'
          and r.snapshot->>'process_template_id' = v_parent_id::text
          and coalesce(r.snapshot->>'scope_type', '') = 'process_activator'
        )
        on conflict do nothing;
      end if;
    end if;
  end loop;

  for v_recycle_id in
    select q.id
    from recycle_restore_queue q
    join public.recycle_bin_records r on r.id = q.id
    order by
      case r.source_table
        when 'process_templates' then 0
        when 'process_template_stages' then 1
        when 'workflows' then 2
        when 'process_runs' then 3
        when 'process_run_stages' then 4
        when 'tasks' then 5
        else 6
      end,
      r.deleted_at,
      r.id
  loop
    select *
    into v_row
    from public.recycle_bin_records
    where id = v_recycle_id;

    if not found then
      raise exception 'رکورد سطل بازیافت % پیدا نشد.', v_recycle_id;
    end if;

    if v_row.expires_at < now() then
      delete from public.recycle_bin_records where id = v_recycle_id;
      raise exception 'مهلت بازگردانی رکورد سطل بازیافت % تمام شده است.', v_recycle_id;
    end if;

    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into v_columns
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_row.source_table
      and v_row.snapshot ? c.column_name;

    if v_columns is null then
      raise exception 'ستون‌های لازم برای جدول % پیدا نشد.', v_row.source_table;
    end if;

    execute format(
      'select exists (select 1 from public.%I where id = $1)',
      v_row.source_table
    )
    into v_target_exists
    using v_row.source_record_id;

    if not coalesce(v_target_exists, false) then
      execute format(
        'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
        v_row.source_table,
        v_columns,
        v_columns,
        v_row.source_table
      )
      using v_row.snapshot;
    end if;

    delete from public.recycle_bin_records where id = v_recycle_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.move_records_to_recycle_bin(text, text, uuid[], uuid, text, uuid) to authenticated, service_role;
grant execute on function public.restore_recycle_bin_records(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
