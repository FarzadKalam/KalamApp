-- =====================================================
-- KalamApp - Phase 361 Payroll Slip Delete Source Release
-- Date: 2026-07-21
-- Type: Additive / idempotent migration
-- Goal: release all payroll source rows when a payroll slip is deleted
-- =====================================================

begin;

create or replace function public.release_payroll_sources_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- هر ردیف محاسباتی که فقط به‌خاطر این فیش نهایی شده بود، دوباره برای فیش بعدی آماده می‌شود.
  update public.payroll_calculation_entries
  set
    status = case when status = 'included_in_payroll' then 'proposed' else status end,
    payroll_slip_id = null,
    updated_at = now()
  where org_id = old.org_id
    and payroll_slip_id = old.id;

  -- اتصال‌های سطح درخواست نیز باید آزاد شوند؛ در غیر این صورت در ویزارد بعدی نادیده گرفته می‌شوند.
  update public.employee_bonus_requests
  set related_payroll_slip_id = null, updated_at = now()
  where org_id = old.org_id
    and related_payroll_slip_id = old.id;

  update public.employee_penalty_requests
  set related_payroll_slip_id = null, updated_at = now()
  where org_id = old.org_id
    and related_payroll_slip_id = old.id;

  update public.employee_advances
  set related_payroll_slip_id = null, updated_at = now()
  where org_id = old.org_id
    and related_payroll_slip_id = old.id;

  return old;
end;
$$;

revoke all on function public.release_payroll_sources_before_delete() from public;

drop trigger if exists trg_payroll_slips_release_sources_before_delete on public.payroll_slips;
create trigger trg_payroll_slips_release_sources_before_delete
before delete on public.payroll_slips
for each row
execute function public.release_payroll_sources_before_delete();

create index if not exists idx_payroll_calculation_entries_slip_release
  on public.payroll_calculation_entries(org_id, payroll_slip_id)
  where payroll_slip_id is not null;

create index if not exists idx_employee_bonus_requests_payroll_release
  on public.employee_bonus_requests(org_id, related_payroll_slip_id)
  where related_payroll_slip_id is not null;

create index if not exists idx_employee_penalty_requests_payroll_release
  on public.employee_penalty_requests(org_id, related_payroll_slip_id)
  where related_payroll_slip_id is not null;

create index if not exists idx_employee_advances_payroll_release
  on public.employee_advances(org_id, related_payroll_slip_id)
  where related_payroll_slip_id is not null;

notify pgrst, 'reload schema';

commit;
