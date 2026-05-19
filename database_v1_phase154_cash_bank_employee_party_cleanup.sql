-- =====================================================
-- KalamApp - Phase 154 Cash/Bank Employee Party Cleanup
-- Date: 2026-05-18
-- Type: Repair / idempotent migration
-- Purpose:
--   Separate employee party from operation assignee in cash_bank_operations.
--   employee_id must only represent a real employee-side financial party,
--   not the responsible profile who handled the operation.
-- =====================================================

begin;

update public.cash_bank_operations as cbo
set employee_id = employee.related_profile_id
from public.employee_advances as ea
left join public.employees as employee on employee.id = ea.employee_id
where cbo.employee_advance_id = ea.id
  and cbo.employee_id is distinct from employee.related_profile_id;

update public.cash_bank_operations as cbo
set employee_id = employee.related_profile_id
from public.payroll_slips as ps
left join public.employees as employee on employee.id = ps.employee_id
where cbo.payroll_slip_id = ps.id
  and cbo.employee_id is distinct from employee.related_profile_id;

update public.cash_bank_operations
set employee_id = null
where employee_id is not null
  and employee_advance_id is null
  and payroll_slip_id is null;

commit;
