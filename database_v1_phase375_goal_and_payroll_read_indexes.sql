-- بهینه‌سازی واکشی هدف‌ها و اقلام آمادهٔ فیش حقوقی
-- این ایندکس‌ها queryهای tenant-safe موجود را سریع‌تر می‌کنند و تغییری در داده یا دسترسی ایجاد نمی‌کنند.

begin;

create index if not exists idx_goals_org_active_updated_at
  on public.goals (org_id, is_active, updated_at desc);

create index if not exists idx_calculation_formulas_org_context_active
  on public.calculation_formulas (org_id, context_type, is_active);

create index if not exists idx_payroll_calculation_entries_org_employee_period_source
  on public.payroll_calculation_entries (org_id, employee_id, period_start, period_end, source_type);

commit;
