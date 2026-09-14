-- =====================================================
-- TazeSystem - Phase 501: Notification source lookup fast path
-- UUID-backed responsibility notifications use source-table primary-key indexes.
-- Legacy/non-UUID source identifiers retain the existing text lookup path.
-- =====================================================

begin;

create or replace function public.kalam_notification_source_exists(
  p_org_id uuid,
  p_source_table text,
  p_source_id text,
  p_record_id text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_source_table text := lower(trim(coalesce(p_source_table, '')));
  v_source_id text := nullif(trim(coalesce(p_source_id, p_record_id, '')), '');
  v_is_uuid boolean := false;
  v_exists boolean := false;
begin
  if p_org_id is null or v_source_table = '' or v_source_id is null then
    return false;
  end if;

  v_is_uuid := v_source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  if v_is_uuid then
    -- Current recycle-bin data uses normalized table names and UUID identifiers.
    -- This exact lookup uses its existing unique/indexed key.
    if exists (
      select 1
      from public.recycle_bin_records record_row
      where record_row.org_id = p_org_id
        and record_row.source_table = v_source_table
        and record_row.source_record_id = v_source_id::uuid
    ) then
      return false;
    end if;
  elsif exists (
    -- Preserve support for historical non-UUID identifiers without broadening access.
    select 1
    from public.recycle_bin_records record_row
    where record_row.org_id = p_org_id
      and lower(trim(coalesce(record_row.source_table, ''))) = v_source_table
      and trim(coalesce(record_row.source_record_id::text, '')) = v_source_id
  ) then
    return false;
  end if;

  if to_regclass(format('public.%I', v_source_table)) is null then
    return false;
  end if;

  if v_is_uuid then
    execute format(
      'select exists (
        select 1
        from public.%I source_row
        where source_row.org_id = $1
          and source_row.id = $2::uuid
      )',
      v_source_table
    )
    into v_exists
    using p_org_id, v_source_id;
  else
    execute format(
      'select exists (
        select 1
        from public.%I source_row
        where source_row.org_id = $1
          and source_row.id::text = $2
      )',
      v_source_table
    )
    into v_exists
    using p_org_id, v_source_id;
  end if;

  return coalesce(v_exists, false);
exception
  when undefined_table or undefined_column or invalid_text_representation then
    return false;
end;
$$;

grant execute on function public.kalam_notification_source_exists(uuid, text, text, text) to authenticated;
revoke all on function public.kalam_notification_source_exists(uuid, text, text, text) from public, anon;

notify pgrst, 'reload schema';

commit;
