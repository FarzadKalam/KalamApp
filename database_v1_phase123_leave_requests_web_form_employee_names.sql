-- =====================================================
-- KalamApp - Phase 123
-- Leave requests: keep web-form employee text fields in sync
-- =====================================================

begin;

create or replace function public.sync_leave_request_employee_names()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_name text := '';
begin
  if new.employee_id is null then
    return new;
  end if;

  select trim(coalesce(e.full_name, ''))
    into v_employee_name
  from public.employees e
  where e.id = new.employee_id
    and (new.org_id is null or e.org_id = new.org_id)
  limit 1;

  if v_employee_name = '' then
    return new;
  end if;

  if nullif(trim(coalesce(new.employee_name, '')), '') is null then
    new.employee_name := v_employee_name;
  end if;

  if nullif(trim(coalesce(new.requester_name, '')), '') is null then
    new.requester_name := v_employee_name;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_leave_requests_sync_employee_names on public.leave_requests;
create trigger trg_leave_requests_sync_employee_names
before insert or update of employee_id, employee_name, requester_name on public.leave_requests
for each row
execute function public.sync_leave_request_employee_names();

update public.leave_requests lr
set
  employee_name = coalesce(nullif(trim(lr.employee_name), ''), nullif(trim(e.full_name), '')),
  requester_name = coalesce(nullif(trim(lr.requester_name), ''), nullif(trim(e.full_name), ''))
from public.employees e
where lr.employee_id = e.id
  and (lr.org_id is null or e.org_id = lr.org_id)
  and (
    nullif(trim(coalesce(lr.employee_name, '')), '') is null
    or nullif(trim(coalesce(lr.requester_name, '')), '') is null
  );

notify pgrst, 'reload schema';

commit;
