-- =====================================================
-- KalamApp - Phase 142 Employee Compensation Requests
-- Date: 2026-05-12
-- Type: Additive / non-breaking migration
-- Goal: add employee bonus and penalty request modules with payroll sync support
-- =====================================================

begin;

create table if not exists public.employee_bonus_requests (
  id uuid primary key default gen_random_uuid()
);

alter table public.employee_bonus_requests
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists title text not null default '',
  add column if not exists employee_id uuid references public.employees(id) on delete cascade,
  add column if not exists request_date date not null default current_date,
  add column if not exists effective_date date not null default current_date,
  add column if not exists amount numeric(18,2) not null default 0,
  add column if not exists status text not null default 'pending',
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists related_payroll_slip_id uuid references public.payroll_slips(id) on delete set null,
  add column if not exists reason text,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.employee_bonus_requests
  drop constraint if exists chk_employee_bonus_requests_status;
alter table public.employee_bonus_requests
  add constraint chk_employee_bonus_requests_status
    check (status in ('draft', 'pending', 'approved', 'completed', 'rejected', 'canceled'));

create index if not exists idx_employee_bonus_requests_employee_effective
  on public.employee_bonus_requests(org_id, employee_id, effective_date desc);

create table if not exists public.employee_penalty_requests (
  id uuid primary key default gen_random_uuid()
);

alter table public.employee_penalty_requests
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists title text not null default '',
  add column if not exists employee_id uuid references public.employees(id) on delete cascade,
  add column if not exists request_date date not null default current_date,
  add column if not exists effective_date date not null default current_date,
  add column if not exists amount numeric(18,2) not null default 0,
  add column if not exists status text not null default 'pending',
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists related_payroll_slip_id uuid references public.payroll_slips(id) on delete set null,
  add column if not exists reason text,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.employee_penalty_requests
  drop constraint if exists chk_employee_penalty_requests_status;
alter table public.employee_penalty_requests
  add constraint chk_employee_penalty_requests_status
    check (status in ('draft', 'pending', 'approved', 'completed', 'rejected', 'canceled'));

create index if not exists idx_employee_penalty_requests_employee_effective
  on public.employee_penalty_requests(org_id, employee_id, effective_date desc);

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_employee_bonus_requests_updated_at on public.employee_bonus_requests;
    create trigger trg_employee_bonus_requests_updated_at
      before update on public.employee_bonus_requests
      for each row execute function public.set_updated_at();

    drop trigger if exists trg_employee_penalty_requests_updated_at on public.employee_penalty_requests;
    create trigger trg_employee_penalty_requests_updated_at
      before update on public.employee_penalty_requests
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.employee_bonus_requests enable row level security;
alter table public.employee_penalty_requests enable row level security;

drop policy if exists p_employee_bonus_requests_org_all on public.employee_bonus_requests;
create policy p_employee_bonus_requests_org_all on public.employee_bonus_requests
  for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop policy if exists p_employee_penalty_requests_org_all on public.employee_penalty_requests;
create policy p_employee_penalty_requests_org_all on public.employee_penalty_requests
  for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

grant select, insert, update, delete on public.employee_bonus_requests to authenticated;
grant select, insert, update, delete on public.employee_penalty_requests to authenticated;

notify pgrst, 'reload schema';

commit;
