-- =====================================================
-- KalamApp - Phase 133
-- Attendance logs: daily presence backfill and recalculation
-- =====================================================

begin;

create index if not exists idx_attendance_logs_org_employee_date
  on public.attendance_logs(org_id, employee_id, attendance_date)
  where attendance_date is not null;

create index if not exists idx_attendance_logs_org_profile_date
  on public.attendance_logs(org_id, related_profile_id, attendance_date)
  where attendance_date is not null and related_profile_id is not null;

create or replace function public.recalculate_attendance_daily_presence(
  p_org_id uuid,
  p_employee_id uuid,
  p_related_profile_id uuid,
  p_assignee_id uuid,
  p_attendance_date date
)
returns void
language plpgsql
as $$
declare
  v_check_in_at timestamptz;
  v_check_out_at timestamptz;
  v_presence_minutes integer;
  v_presence_hours numeric(10, 2);
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
  normalized_times as (
    select
      case
        when normalized_log_type = 'check_in' then coalesce(
          manual_check_in_time,
          actual_check_in_time,
          public.combine_attendance_date_time(attendance_date, check_in_time),
          occurred_at
        )
        else coalesce(
          manual_check_in_time,
          actual_check_in_time,
          public.combine_attendance_date_time(attendance_date, check_in_time)
        )
      end as check_in_at,
      case
        when normalized_log_type = 'check_out' then coalesce(
          manual_check_out_time,
          actual_check_out_time,
          public.combine_attendance_date_time(attendance_date, check_out_time),
          occurred_at
        )
        else coalesce(
          manual_check_out_time,
          actual_check_out_time,
          public.combine_attendance_date_time(attendance_date, check_out_time)
        )
      end as check_out_at
    from scoped_logs
  )
  select min(check_in_at), max(check_out_at)
  into v_check_in_at, v_check_out_at
  from normalized_times;

  if v_check_in_at is not null
    and v_check_out_at is not null
    and v_check_out_at >= v_check_in_at
    and (v_check_out_at - v_check_in_at) < interval '1 day'
  then
    v_presence_minutes := floor(extract(epoch from (v_check_out_at - v_check_in_at)) / 60)::integer;
    v_presence_hours := round((v_presence_minutes::numeric / 60), 2);
  else
    v_presence_minutes := null;
    v_presence_hours := null;
  end if;

  update public.attendance_logs
  set
    presence_minutes = case when coalesce(log_type, '') = 'check_out' then v_presence_minutes else null end,
    presence_hours = case when coalesce(log_type, '') = 'check_out' then v_presence_hours else null end,
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
      presence_minutes is distinct from case when coalesce(log_type, '') = 'check_out' then v_presence_minutes else null end
      or presence_hours is distinct from case when coalesce(log_type, '') = 'check_out' then v_presence_hours else null end
    );
end;
$$;

create or replace function public.recalculate_attendance_daily_presence_trigger()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalculate_attendance_daily_presence(
      old.org_id,
      old.employee_id,
      old.related_profile_id,
      old.assignee_id,
      old.attendance_date
    );
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalculate_attendance_daily_presence(
      new.org_id,
      new.employee_id,
      new.related_profile_id,
      new.assignee_id,
      new.attendance_date
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_attendance_logs_daily_presence on public.attendance_logs;
create trigger trg_attendance_logs_daily_presence
after insert or update or delete on public.attendance_logs
for each row
execute function public.recalculate_attendance_daily_presence_trigger();

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
