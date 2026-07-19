-- Phase 352: Keep record locks aligned with record lifecycle.
-- A lock is meaningful only while its tenant record exists. This removes
-- historical orphan locks and releases a lock after a successful deletion.

begin;

create or replace function public.release_record_locks_for_deleted_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.record_locks rl
  where rl.org_id = old.org_id
    and rl.record_id = old.id
    and (
      rl.module_id = tg_table_name
      or coalesce(rl.metadata ->> 'table_name', '') = tg_table_name
      or public.resolve_record_lock_table_name(rl.module_id) = tg_table_name
    );

  return old;
end;
$$;

create or replace function public.cleanup_orphan_record_locks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock record;
  v_table_name text;
  v_table_regclass regclass;
  v_target_exists boolean;
  v_deleted_count integer := 0;
begin
  for v_lock in
    select id, org_id, module_id, record_id, metadata
    from public.record_locks
  loop
    v_table_name := coalesce(
      nullif(btrim(coalesce(v_lock.metadata ->> 'table_name', '')), ''),
      nullif(btrim(coalesce(public.resolve_record_lock_table_name(v_lock.module_id), '')), '')
    );
    select to_regclass(format('public.%I', v_table_name)) into v_table_regclass;

    if v_table_regclass is null then
      delete from public.record_locks where id = v_lock.id;
      v_deleted_count := v_deleted_count + 1;
      continue;
    end if;

    begin
      execute format(
        'select exists (select 1 from public.%I where id = $1 and org_id = $2)',
        v_table_name
      ) into v_target_exists using v_lock.record_id, v_lock.org_id;
    exception
      when undefined_column then
        execute format('select exists (select 1 from public.%I where id = $1)', v_table_name)
          into v_target_exists using v_lock.record_id;
    end;

    if not coalesce(v_target_exists, false) then
      delete from public.record_locks where id = v_lock.id;
      v_deleted_count := v_deleted_count + 1;
    end if;
  end loop;

  return v_deleted_count;
end;
$$;

do $$
declare
  v_table record;
begin
  for v_table in
    select c.table_name
    from information_schema.columns c
    join information_schema.columns org_col
      on org_col.table_schema = c.table_schema
     and org_col.table_name = c.table_name
     and org_col.column_name = 'org_id'
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name = 'id'
      and c.table_name <> 'record_locks'
  loop
    execute format('drop trigger if exists trg_release_record_locks_after_delete on public.%I', v_table.table_name);
    execute format(
      'create trigger trg_release_record_locks_after_delete after delete on public.%I for each row execute function public.release_record_locks_for_deleted_record()',
      v_table.table_name
    );
  end loop;
end;
$$;

select public.cleanup_orphan_record_locks();

revoke all on function public.cleanup_orphan_record_locks() from public, anon, authenticated;

commit;
