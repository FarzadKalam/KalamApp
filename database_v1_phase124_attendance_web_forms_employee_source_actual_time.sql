-- =====================================================
-- KalamApp - Phase 124
-- Attendance web forms: employee, source, and actual time alignment
-- =====================================================

begin;

alter table public.attendance_logs
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists related_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_id uuid,
  add column if not exists source_type text not null default 'manual',
  add column if not exists actual_check_in_time timestamptz,
  add column if not exists actual_check_out_time timestamptz,
  add column if not exists manual_check_in_time timestamptz,
  add column if not exists manual_check_out_time timestamptz;

create or replace function public.apply_web_form_attendance_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_employee_id uuid;
  v_related_profile_id uuid;
  v_submit_time timestamptz := coalesce(new.created_at, now());
  v_log_type text := '';
begin
  if coalesce(new.status, '') <> 'submitted'
     or coalesce(new.target_module_id, '') <> 'attendance_logs'
     or new.target_record_id is null then
    return new;
  end if;

  if v_auth_user_id is not null then
    select e.id, e.related_profile_id
      into v_employee_id, v_related_profile_id
    from public.employees e
    where e.related_profile_id = v_auth_user_id
      and (new.org_id is null or e.org_id = new.org_id)
    order by e.updated_at desc nulls last, e.created_at desc nulls last
    limit 1;
  end if;

  update public.attendance_logs al
  set
    source_type = 'web_form',
    employee_id = coalesce(al.employee_id, v_employee_id),
    related_profile_id = coalesce(al.related_profile_id, v_related_profile_id, v_auth_user_id),
    assignee_id = coalesce(al.assignee_id, v_related_profile_id, v_auth_user_id),
    actual_check_in_time = case
      when coalesce(al.log_type, 'check_in') = 'check_in' then v_submit_time
      else al.actual_check_in_time
    end,
    actual_check_out_time = case
      when coalesce(al.log_type, '') = 'check_out' then v_submit_time
      else al.actual_check_out_time
    end,
    updated_at = coalesce(al.updated_at, v_submit_time)
  where al.id = new.target_record_id
    and (new.org_id is null or al.org_id = new.org_id)
  returning coalesce(al.log_type, '')
    into v_log_type;

  new.record_payload := coalesce(new.record_payload, '{}'::jsonb)
    || jsonb_build_object('source_type', 'web_form');

  if v_employee_id is not null then
    new.record_payload := coalesce(new.record_payload, '{}'::jsonb)
      || jsonb_build_object('employee_id', v_employee_id);
  end if;

  if coalesce(v_log_type, 'check_in') = 'check_in' then
    new.record_payload := coalesce(new.record_payload, '{}'::jsonb)
      || jsonb_build_object('actual_check_in_time', v_submit_time);
  elsif v_log_type = 'check_out' then
    new.record_payload := coalesce(new.record_payload, '{}'::jsonb)
      || jsonb_build_object('actual_check_out_time', v_submit_time);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_web_form_submissions_attendance_defaults on public.web_form_submissions;
create trigger trg_web_form_submissions_attendance_defaults
before insert on public.web_form_submissions
for each row
execute function public.apply_web_form_attendance_defaults();

update public.attendance_logs al
set
  source_type = 'web_form',
  employee_id = coalesce(
    al.employee_id,
    (
      select e.id
      from public.employees e
      where e.related_profile_id = al.created_by
        and (al.org_id is null or e.org_id = al.org_id)
      order by e.updated_at desc nulls last, e.created_at desc nulls last
      limit 1
    )
  ),
  related_profile_id = coalesce(
    al.related_profile_id,
    (
      select e.related_profile_id
      from public.employees e
      where e.related_profile_id = al.created_by
        and (al.org_id is null or e.org_id = al.org_id)
      order by e.updated_at desc nulls last, e.created_at desc nulls last
      limit 1
    ),
    al.created_by
  ),
  assignee_id = coalesce(
    al.assignee_id,
    (
      select e.related_profile_id
      from public.employees e
      where e.related_profile_id = al.created_by
        and (al.org_id is null or e.org_id = al.org_id)
      order by e.updated_at desc nulls last, e.created_at desc nulls last
      limit 1
    ),
    al.created_by
  ),
  actual_check_in_time = case
    when coalesce(al.log_type, 'check_in') = 'check_in' then coalesce(wfs.created_at, al.created_at, al.actual_check_in_time, now())
    else al.actual_check_in_time
  end,
  actual_check_out_time = case
    when coalesce(al.log_type, '') = 'check_out' then coalesce(wfs.created_at, al.created_at, al.actual_check_out_time, now())
    else al.actual_check_out_time
  end
from public.web_form_submissions wfs
where wfs.target_module_id = 'attendance_logs'
  and wfs.status = 'submitted'
  and wfs.target_record_id = al.id;

notify pgrst, 'reload schema';

commit;
