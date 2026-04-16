-- =====================================================
-- KalamApp - Phase 79
-- Attendance: manual check-in/out time + actual auto times
-- Web Forms: support `time` field type
-- =====================================================

begin;

alter table public.attendance_logs
  add column if not exists actual_check_in_time time,
  add column if not exists actual_check_out_time time,
  add column if not exists manual_check_in_time timestamptz,
  add column if not exists manual_check_out_time timestamptz;

create or replace function public.sync_attendance_actual_times()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.log_type, '') = 'check_in' then
    new.actual_check_in_time := coalesce(new.actual_check_in_time, (new.occurred_at at time zone 'Asia/Tehran')::time);
    if tg_op = 'UPDATE' and new.actual_check_out_time is null and old.actual_check_out_time is not null then
      new.actual_check_out_time := old.actual_check_out_time;
    end if;
  elsif coalesce(new.log_type, '') = 'check_out' then
    new.actual_check_out_time := coalesce(new.actual_check_out_time, (new.occurred_at at time zone 'Asia/Tehran')::time);
    if tg_op = 'UPDATE' and new.actual_check_in_time is null and old.actual_check_in_time is not null then
      new.actual_check_in_time := old.actual_check_in_time;
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

update public.attendance_logs
set
  actual_check_in_time = case
    when log_type = 'check_in' and actual_check_in_time is null then (occurred_at at time zone 'Asia/Tehran')::time
    else actual_check_in_time
  end,
  actual_check_out_time = case
    when log_type = 'check_out' and actual_check_out_time is null then (occurred_at at time zone 'Asia/Tehran')::time
    else actual_check_out_time
  end;

alter table public.web_form_fields drop constraint if exists chk_web_form_fields_type;
alter table public.web_form_fields
  add constraint chk_web_form_fields_type check (
    field_type in ('text', 'long_text', 'number', 'phone', 'date', 'time', 'datetime', 'image', 'file', 'multi_select', 'location', 'checkbox', 'select', 'relation')
  );

notify pgrst, 'reload schema';

commit;
