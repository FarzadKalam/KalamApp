-- =====================================================
-- KalamApp - Phase 431
-- Attendance: calculate daily presence from consecutive entry/exit pairs
-- =====================================================

begin;

create or replace function public.recalculate_attendance_daily_presence(
  p_org_id uuid,
  p_employee_id uuid,
  p_related_profile_id uuid,
  p_assignee_id uuid,
  p_attendance_date date
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_presence_minutes integer;
  v_presence_hours numeric(10, 2);
  v_final_check_out_id uuid;
begin
  if p_attendance_date is null then
    return;
  end if;

  with scoped_logs as (
    select
      id,
      coalesce(log_type, 'check_in') as normalized_log_type,
      attendance_date,
      check_in_time,
      check_out_time,
      manual_check_in_time,
      manual_check_out_time,
      actual_check_in_time,
      actual_check_out_time,
      occurred_at
    from public.attendance_logs
    where attendance_date = p_attendance_date
      and org_id is not distinct from p_org_id
      and (
        (p_employee_id is not null and employee_id is not distinct from p_employee_id)
        or (
          p_employee_id is null
          and p_related_profile_id is not null
          and employee_id is null
          and related_profile_id is not distinct from p_related_profile_id
        )
        or (
          p_employee_id is null
          and p_related_profile_id is null
          and p_assignee_id is not null
          and employee_id is null
          and related_profile_id is null
          and assignee_id is not distinct from p_assignee_id
        )
        or (
          p_employee_id is null
          and p_related_profile_id is null
          and p_assignee_id is null
          and employee_id is null
          and related_profile_id is null
          and assignee_id is null
        )
      )
  ),
  normalized_events as (
    select
      id,
      normalized_log_type,
      case
        when normalized_log_type = 'check_in' then coalesce(
          manual_check_in_time,
          actual_check_in_time,
          public.combine_attendance_date_time(attendance_date, check_in_time),
          occurred_at
        )
        when normalized_log_type = 'check_out' then coalesce(
          manual_check_out_time,
          actual_check_out_time,
          public.combine_attendance_date_time(attendance_date, check_out_time),
          occurred_at
        )
        else null
      end as occurred_at
    from scoped_logs
  ),
  ordered_events as (
    select
      id,
      normalized_log_type,
      occurred_at,
      lead(id) over (order by occurred_at asc, id asc) as next_id,
      lead(normalized_log_type) over (order by occurred_at asc, id asc) as next_log_type,
      lead(occurred_at) over (order by occurred_at asc, id asc) as next_occurred_at
    from normalized_events
    where occurred_at is not null
  ),
  paired_intervals as (
    select
      id as check_in_id,
      next_id as check_out_id,
      occurred_at as check_in_at,
      next_occurred_at as check_out_at
    from ordered_events
    where normalized_log_type = 'check_in'
      and next_log_type = 'check_out'
      and next_occurred_at > occurred_at
      and next_occurred_at - occurred_at < interval '1 day'
  )
  select
    coalesce(sum(floor(extract(epoch from (check_out_at - check_in_at)) / 60)::integer), 0),
    (array_agg(check_out_id order by check_out_at desc, check_out_id desc))[1]
  into v_presence_minutes, v_final_check_out_id
  from paired_intervals;

  if v_final_check_out_id is null then
    v_presence_minutes := null;
    v_presence_hours := null;
  else
    v_presence_hours := round((v_presence_minutes::numeric / 60), 2);
  end if;

  -- مجموع روز فقط روی خروجِ پایانی نگهداری می‌شود تا در فهرست ترددها دوباره شمرده نشود.
  update public.attendance_logs
  set
    presence_minutes = case when id = v_final_check_out_id then v_presence_minutes else null end,
    presence_hours = case when id = v_final_check_out_id then v_presence_hours else null end,
    updated_at = now()
  where attendance_date = p_attendance_date
    and org_id is not distinct from p_org_id
    and (
      (p_employee_id is not null and employee_id is not distinct from p_employee_id)
      or (
        p_employee_id is null
        and p_related_profile_id is not null
        and employee_id is null
        and related_profile_id is not distinct from p_related_profile_id
      )
      or (
        p_employee_id is null
        and p_related_profile_id is null
        and p_assignee_id is not null
        and employee_id is null
        and related_profile_id is null
        and assignee_id is not distinct from p_assignee_id
      )
      or (
        p_employee_id is null
        and p_related_profile_id is null
        and p_assignee_id is null
        and employee_id is null
        and related_profile_id is null
        and assignee_id is null
      )
    )
    and (
      presence_minutes is distinct from case when id = v_final_check_out_id then v_presence_minutes else null end
      or presence_hours is distinct from case when id = v_final_check_out_id then v_presence_hours else null end
    );
end;
$$;

do $$
declare
  v_group record;
begin
  for v_group in
    select distinct org_id, employee_id, related_profile_id, assignee_id, attendance_date
    from public.attendance_logs
    where attendance_date is not null
  loop
    perform public.recalculate_attendance_daily_presence(
      v_group.org_id,
      v_group.employee_id,
      v_group.related_profile_id,
      v_group.assignee_id,
      v_group.attendance_date
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
