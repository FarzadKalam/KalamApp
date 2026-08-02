-- =====================================================
-- KalamApp - Phase 432
-- Record locks: complete tenant-table coverage and atomic bulk actions
-- =====================================================

begin;

create or replace function public.set_record_locks_state(
  p_module_id text,
  p_record_ids uuid[],
  p_locked boolean,
  p_reason text default null
)
returns table(record_id uuid, is_locked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_module_id text := btrim(coalesce(p_module_id, ''));
  v_record_ids uuid[] := array[]::uuid[];
  v_record_id uuid;
begin
  if v_org_id is null or auth.uid() is null then
    raise exception 'دسترسی سازمانی معتبر برای تغییر قفل رکوردها پیدا نشد.';
  end if;
  if v_module_id = '' then
    raise exception 'ماژول انتخاب‌شده برای تغییر قفل معتبر نیست.';
  end if;

  select coalesce(array_agg(distinct candidate.record_id), array[]::uuid[])
    into v_record_ids
  from unnest(coalesce(p_record_ids, array[]::uuid[])) as candidate(record_id)
  where candidate.record_id is not null;

  if cardinality(v_record_ids) = 0 then
    return;
  end if;
  if not public.record_lock_user_can(v_module_id, case when p_locked then 'lock' else 'unlock' end) then
    raise exception 'دسترسی تغییر قفل رکوردهای انتخاب‌شده را ندارید.';
  end if;

  foreach v_record_id in array v_record_ids loop
    if not public.record_lock_target_exists(v_module_id, v_record_id, v_org_id) then
      raise exception 'یکی از رکوردهای انتخاب‌شده در این سازمان پیدا نشد.';
    end if;
  end loop;

  if coalesce(p_locked, false) then
    insert into public.record_locks(
      org_id,
      module_id,
      record_id,
      locked_by,
      lock_reason,
      source_type,
      metadata
    )
    select
      v_org_id,
      v_module_id,
      selected_record_id,
      auth.uid(),
      nullif(btrim(coalesce(p_reason, '')), ''),
      'manual',
      jsonb_build_object('table_name', public.resolve_record_lock_table_name(v_module_id))
    from unnest(v_record_ids) as selected_record_id
    on conflict (org_id, module_id, record_id)
    do update set
      lock_reason = coalesce(public.record_locks.lock_reason, excluded.lock_reason),
      metadata = public.record_locks.metadata || excluded.metadata;
  else
    delete from public.record_locks
    where org_id = v_org_id
      and module_id = v_module_id
      and record_id = any(v_record_ids);
  end if;

  return query
  select selected_record_id, coalesce(p_locked, false)
  from unnest(v_record_ids) as selected_record_id;
end;
$$;

-- جدول‌های tenant-owned که پس از معرفی قفل رکورد افزوده شده‌اند نیز باید
-- همان محافظ UPDATE/DELETE را داشته باشند. حذف و ساخت مجدد trigger idempotent است.
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
    where c.table_schema = 'public'
      and c.column_name = 'id'
      and c.table_name not in (
        'record_locks',
        'record_files',
        'file_assets',
        'file_entries',
        'file_folders',
        'file_entry_links',
        'app_schema_migrations',
        'system_code_counters',
        'payment_transactions'
      )
      and exists (
        select 1
        from information_schema.tables t
        where t.table_schema = c.table_schema
          and t.table_name = c.table_name
          and t.table_type = 'BASE TABLE'
      )
  loop
    execute format('drop trigger if exists trg_prevent_locked_record_mutation on public.%I', v_table.table_name);
    execute format(
      'create trigger trg_prevent_locked_record_mutation before update or delete on public.%I for each row execute function public.prevent_locked_record_mutation()',
      v_table.table_name
    );
  end loop;
end;
$$;

revoke all on function public.set_record_locks_state(text, uuid[], boolean, text) from public, anon;
grant execute on function public.set_record_locks_state(text, uuid[], boolean, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
