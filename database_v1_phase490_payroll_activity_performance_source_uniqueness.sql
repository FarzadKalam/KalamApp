-- =====================================================
-- KalamApp - Phase 490 Payroll Activity Performance Source Uniqueness
-- Date: 2026-09-09
-- Type: Additive / idempotent migration
-- هدف: ثبت مستقل هر قاعده یا معیار عملکرد، بدون تعارض با قید قدیمی فعالیت.
-- =====================================================

begin;

-- ایندکس عمومیِ قدیمی برای هر فعالیت فقط یک source_record_id می‌پذیرد؛
-- در حالی که یک فعالیت می‌تواند چند معیار عملکرد داشته باشد. مسیر V2
-- یکتایی را با source_key تخصصی حفظ می‌کند و شناسه فعالیت را در details
-- نگه می‌دارد تا وارد شدن چند معیار، به مالکیت ایندکس وابسته نباشد.
create or replace function public.sync_activity_performance_entries_v2(
  p_period_start date,
  p_period_end date,
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_entry jsonb;
  v_employee_id uuid;
  v_task_id uuid;
  v_source_key text;
  v_existing public.payroll_calculation_entries%rowtype;
  v_result jsonb := '[]'::jsonb;
begin
  if v_org_id is null then raise exception 'organization_context_required'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'invalid_payroll_period';
  end if;
  if jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_activity_performance_entries';
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries) as item(value) loop
    v_employee_id := nullif(trim(v_entry->>'employee_id'), '')::uuid;
    v_task_id := nullif(trim(v_entry->>'task_id'), '')::uuid;
    v_source_key := nullif(trim(v_entry->>'source_key'), '');
    if v_employee_id is null or v_task_id is null or v_source_key is null
      or v_source_key !~ '^activity_performance:[^:]+:[^:]+:[^:]+:[^:]+$' then
      raise exception 'invalid_activity_performance_entry';
    end if;
    if not exists (select 1 from public.employees where id = v_employee_id and org_id = v_org_id) then
      raise exception 'activity_performance_employee_not_found';
    end if;
    if not exists (select 1 from public.tasks where id = v_task_id and org_id = v_org_id) then
      raise exception 'activity_performance_task_not_found';
    end if;

    perform pg_advisory_xact_lock(hashtext('activity-performance:' || v_org_id::text || ':' || v_source_key));
    select * into v_existing
    from public.payroll_calculation_entries
    where org_id = v_org_id
      and employee_id = v_employee_id
      and source_type = 'activity_performance'
      and source_key = v_source_key
      and status <> 'voided'
    for update;

    if found and v_existing.status = 'included_in_payroll' then
      v_result := v_result || jsonb_build_array(jsonb_build_object('id', v_existing.id, 'source_key', v_source_key, 'status', 'included_in_payroll'));
      continue;
    end if;

    if found then
      update public.payroll_calculation_entries
      set
        period_start = p_period_start,
        period_end = p_period_end,
        entry_type = coalesce(nullif(trim(v_entry->>'entry_type'), ''), 'activity_performance'),
        source_module_id = 'tasks',
        title = coalesce(nullif(v_entry->>'title', ''), 'محاسبه عملکرد'),
        amount = coalesce((v_entry->>'amount')::numeric, 0),
        quantity = nullif(trim(v_entry->>'quantity'), '')::numeric,
        rate = nullif(trim(v_entry->>'rate'), '')::numeric,
        status = 'proposed',
        assignee_id = nullif(trim(v_entry->>'assignee_id'), '')::uuid,
        details = coalesce(v_entry->'details', '{}'::jsonb),
        updated_at = now()
      where id = v_existing.id and org_id = v_org_id;
      v_result := v_result || jsonb_build_array(jsonb_build_object('id', v_existing.id, 'source_key', v_source_key, 'status', 'proposed'));
    else
      insert into public.payroll_calculation_entries (
        org_id, employee_id, period_start, period_end, entry_type, source_type,
        source_key, source_module_id, source_record_id, title, amount, quantity,
        rate, status, assignee_id, details
      ) values (
        v_org_id, v_employee_id, p_period_start, p_period_end,
        coalesce(nullif(trim(v_entry->>'entry_type'), ''), 'activity_performance'),
        'activity_performance', v_source_key, 'tasks', null,
        coalesce(nullif(v_entry->>'title', ''), 'محاسبه عملکرد'),
        coalesce((v_entry->>'amount')::numeric, 0),
        nullif(trim(v_entry->>'quantity'), '')::numeric,
        nullif(trim(v_entry->>'rate'), '')::numeric,
        'proposed', nullif(trim(v_entry->>'assignee_id'), '')::uuid,
        coalesce(v_entry->'details', '{}'::jsonb)
      ) returning id into v_existing.id;
      v_result := v_result || jsonb_build_array(jsonb_build_object('id', v_existing.id, 'source_key', v_source_key, 'status', 'proposed'));
    end if;
  end loop;
  return v_result;
end;
$$;

revoke all on function public.sync_activity_performance_entries_v2(date, date, jsonb) from public, anon;
grant execute on function public.sync_activity_performance_entries_v2(date, date, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
