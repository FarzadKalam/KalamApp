-- KalamApp - Phase 411 Payroll Slip Employee Identity Snapshot
-- مشخصات هویتی کارمند برای چاپ رسمی فیش حقوقی

begin;

alter table public.payroll_slips
  add column if not exists employee_national_code text,
  add column if not exists employee_father_name text,
  add column if not exists employee_marital_status text,
  add column if not exists employee_military_service_status text,
  add column if not exists employee_children_count integer,
  add column if not exists employee_insurance_number text;

create or replace function public.sync_payroll_slip_employee_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.employee_id is null then
    new.employee_national_code := null;
    new.employee_father_name := null;
    new.employee_marital_status := null;
    new.employee_military_service_status := null;
    new.employee_children_count := null;
    new.employee_insurance_number := null;
    return new;
  end if;

  select
    employee.national_code,
    employee.father_name,
    employee.marital_status,
    employee.military_service_status,
    employee.children_count,
    employee.insurance_number
  into
    new.employee_national_code,
    new.employee_father_name,
    new.employee_marital_status,
    new.employee_military_service_status,
    new.employee_children_count,
    new.employee_insurance_number
  from public.employees as employee
  where employee.id = new.employee_id
    and employee.org_id = new.org_id;

  return new;
end;
$$;

drop trigger if exists trg_payroll_slips_sync_employee_identity on public.payroll_slips;
create trigger trg_payroll_slips_sync_employee_identity
before insert or update of employee_id on public.payroll_slips
for each row execute function public.sync_payroll_slip_employee_identity();

update public.payroll_slips as slip
set
  employee_national_code = employee.national_code,
  employee_father_name = employee.father_name,
  employee_marital_status = employee.marital_status,
  employee_military_service_status = employee.military_service_status,
  employee_children_count = employee.children_count,
  employee_insurance_number = employee.insurance_number
from public.employees as employee
where employee.id = slip.employee_id
  and employee.org_id = slip.org_id;

commit;
