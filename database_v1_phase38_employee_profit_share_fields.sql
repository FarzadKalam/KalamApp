-- =====================================================
-- KalamApp - Phase 38 Employee Profit Share Fields
-- Date: 2026-03-24
-- Type: Additive / non-breaking migration
-- Goal: add base fields for employee profit-share payroll mode
-- =====================================================

begin;

alter table public.employees
  add column if not exists profit_share_percentage numeric(8,4) not null default 0,
  add column if not exists profit_share_basis text not null default 'net_profit',
  add column if not exists profit_share_cost_center_id uuid references public.cost_centers(id) on delete set null;

update public.employees
set
  profit_share_percentage = coalesce(profit_share_percentage, 0),
  profit_share_basis = coalesce(nullif(profit_share_basis, ''), 'net_profit')
where
  profit_share_percentage is null
  or profit_share_basis is null
  or profit_share_basis = '';

alter table public.employees
  alter column profit_share_percentage set default 0,
  alter column profit_share_percentage set not null,
  alter column profit_share_basis set default 'net_profit',
  alter column profit_share_basis set not null;

create index if not exists idx_employees_profit_share_cost_center
  on public.employees(profit_share_cost_center_id)
  where profit_share_cost_center_id is not null;

commit;
