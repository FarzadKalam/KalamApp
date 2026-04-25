-- =====================================================
-- KalamApp - Phase 129
-- Attendance logs: import-friendly columns aligned with legacy Excel exports
-- =====================================================

begin;

alter table public.attendance_logs
  add column if not exists system_code text,
  add column if not exists attendance_date date,
  add column if not exists check_in_time time,
  add column if not exists check_out_time time,
  add column if not exists presence_minutes integer,
  add column if not exists presence_hours numeric(10,2),
  add column if not exists manager_approved boolean not null default false,
  add column if not exists related_employee_label text,
  add column if not exists linked_check_in_label text,
  add column if not exists payroll_reference_label text,
  add column if not exists updated_by_label text,
  add column if not exists reference_label text,
  add column if not exists created_by_label text,
  add column if not exists closure_status text;

create index if not exists idx_attendance_logs_org_attendance_date
  on public.attendance_logs(org_id, attendance_date desc);

create index if not exists idx_attendance_logs_org_system_code
  on public.attendance_logs(org_id, system_code)
  where nullif(btrim(coalesce(system_code, '')), '') is not null;

create or replace function public.combine_attendance_date_time(
  p_date date,
  p_time time
)
returns timestamptz
language sql
immutable
as $$
  select case
    when p_date is null or p_time is null then null
    else ((p_date + p_time) at time zone 'Asia/Tehran')
  end
$$;

create or replace function public.sync_attendance_actual_times()
returns trigger
language plpgsql
as $$
declare
  v_base_date date;
  v_check_in_ts timestamptz;
  v_check_out_ts timestamptz;
  v_duration_seconds numeric;
begin
  if new.attendance_date is null then
    new.attendance_date := coalesce(
      case when new.manual_check_in_time is not null then (new.manual_check_in_time at time zone 'Asia/Tehran')::date else null end,
      case when new.manual_check_out_time is not null then (new.manual_check_out_time at time zone 'Asia/Tehran')::date else null end,
      case when new.actual_check_in_time is not null then (new.actual_check_in_time at time zone 'Asia/Tehran')::date else null end,
      case when new.actual_check_out_time is not null then (new.actual_check_out_time at time zone 'Asia/Tehran')::date else null end,
      case when new.occurred_at is not null then (new.occurred_at at time zone 'Asia/Tehran')::date else null end
    );
  end if;

  if new.check_in_time is null then
    new.check_in_time := coalesce(
      case when new.manual_check_in_time is not null then (new.manual_check_in_time at time zone 'Asia/Tehran')::time else null end,
      case when new.actual_check_in_time is not null then (new.actual_check_in_time at time zone 'Asia/Tehran')::time else null end,
      case
        when coalesce(new.log_type, 'check_in') = 'check_in' and new.occurred_at is not null
          then (new.occurred_at at time zone 'Asia/Tehran')::time
        else null
      end
    );
  end if;

  if new.check_out_time is null then
    new.check_out_time := coalesce(
      case when new.manual_check_out_time is not null then (new.manual_check_out_time at time zone 'Asia/Tehran')::time else null end,
      case when new.actual_check_out_time is not null then (new.actual_check_out_time at time zone 'Asia/Tehran')::time else null end,
      case
        when coalesce(new.log_type, '') = 'check_out' and new.occurred_at is not null
          then (new.occurred_at at time zone 'Asia/Tehran')::time
        else null
      end
    );
  end if;

  v_base_date := coalesce(
    new.attendance_date,
    case
      when coalesce(new.occurred_at, new.manual_check_in_time, new.manual_check_out_time, new.actual_check_in_time, new.actual_check_out_time) is not null
        then (coalesce(new.occurred_at, new.manual_check_in_time, new.manual_check_out_time, new.actual_check_in_time, new.actual_check_out_time) at time zone 'Asia/Tehran')::date
      else null
    end,
    (now() at time zone 'Asia/Tehran')::date
  );

  if new.attendance_date is null then
    new.attendance_date := v_base_date;
  end if;

  v_check_in_ts := coalesce(
    new.manual_check_in_time,
    public.combine_attendance_date_time(v_base_date, new.check_in_time),
    new.actual_check_in_time
  );

  v_check_out_ts := coalesce(
    new.manual_check_out_time,
    public.combine_attendance_date_time(v_base_date, new.check_out_time),
    new.actual_check_out_time
  );

  if new.manual_check_in_time is null and new.check_in_time is not null then
    new.manual_check_in_time := public.combine_attendance_date_time(v_base_date, new.check_in_time);
    v_check_in_ts := coalesce(v_check_in_ts, new.manual_check_in_time);
  end if;

  if new.manual_check_out_time is null and new.check_out_time is not null then
    new.manual_check_out_time := public.combine_attendance_date_time(v_base_date, new.check_out_time);
    v_check_out_ts := coalesce(v_check_out_ts, new.manual_check_out_time);
  end if;

  if coalesce(new.log_type, 'check_in') = 'check_in' and (new.check_in_time is not null or new.manual_check_in_time is not null) then
    new.occurred_at := coalesce(v_check_in_ts, new.occurred_at, now());
  elsif coalesce(new.log_type, '') = 'check_out' and (new.check_out_time is not null or new.manual_check_out_time is not null) then
    new.occurred_at := coalesce(v_check_out_ts, new.occurred_at, now());
  end if;

  if coalesce(new.log_type, '') = 'check_in' then
    new.actual_check_in_time := coalesce(new.actual_check_in_time, new.occurred_at, v_check_in_ts, now());
    if tg_op = 'UPDATE' and new.actual_check_out_time is null and old.actual_check_out_time is not null then
      new.actual_check_out_time := old.actual_check_out_time;
    end if;
  elsif coalesce(new.log_type, '') = 'check_out' then
    new.actual_check_out_time := coalesce(new.actual_check_out_time, new.occurred_at, v_check_out_ts, now());
    if tg_op = 'UPDATE' and new.actual_check_in_time is null and old.actual_check_in_time is not null then
      new.actual_check_in_time := old.actual_check_in_time;
    end if;
  end if;

  if v_check_in_ts is not null and v_check_out_ts is not null and v_check_out_ts >= v_check_in_ts and (v_check_out_ts - v_check_in_ts) < interval '1 day' then
    v_duration_seconds := extract(epoch from (v_check_out_ts - v_check_in_ts));
  else
    v_duration_seconds := null;
  end if;

  if new.presence_minutes is null then
    if new.presence_hours is not null then
      new.presence_minutes := round((new.presence_hours * 60)::numeric)::integer;
    elsif v_duration_seconds is not null then
      new.presence_minutes := floor(v_duration_seconds / 60)::integer;
    end if;
  end if;

  if new.presence_hours is null then
    if new.presence_minutes is not null and new.presence_minutes between 0 and 1440 then
      new.presence_hours := round((new.presence_minutes::numeric / 60), 2);
    elsif v_duration_seconds is not null then
      new.presence_hours := round((v_duration_seconds / 3600)::numeric, 2);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_attendance_logs_sync_actual_times on public.attendance_logs;
create trigger trg_attendance_logs_sync_actual_times
before insert or update on public.attendance_logs
for each row
execute function public.sync_attendance_actual_times();

notify pgrst, 'reload schema';

commit;
