-- KalamApp V1 - Phase 87
-- Operational expenses, employee advances, payroll slips, contracts, applicants, and user-employee relation.

begin;

alter table if exists public.profiles
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

create table if not exists public.expense_documents (
  id uuid primary key default gen_random_uuid()
);

alter table public.expense_documents
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists expense_date date not null default current_date,
  add column if not exists status text not null default 'draft',
  add column if not exists expense_type text not null default 'general',
  add column if not exists counterparty_type text not null default 'other',
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists cost_center_id uuid references public.cost_centers(id) on delete set null,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists payments jsonb not null default '[]'::jsonb,
  add column if not exists total_amount numeric(18,2) not null default 0,
  add column if not exists paid_amount numeric(18,2) not null default 0,
  add column if not exists remaining_amount numeric(18,2) not null default 0,
  add column if not exists related_module_id text,
  add column if not exists related_record_id uuid,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.employee_advances (
  id uuid primary key default gen_random_uuid()
);

alter table public.employee_advances
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists request_date date not null default current_date,
  add column if not exists due_date date,
  add column if not exists status text not null default 'draft',
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists amount numeric(18,2) not null default 0,
  add column if not exists paid_amount numeric(18,2) not null default 0,
  add column if not exists remaining_amount numeric(18,2) not null default 0,
  add column if not exists payments jsonb not null default '[]'::jsonb,
  add column if not exists reason text,
  add column if not exists related_payroll_slip_id uuid,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.payroll_slips (
  id uuid primary key default gen_random_uuid()
);

alter table public.payroll_slips
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists period_start date not null,
  add column if not exists period_end date not null,
  add column if not exists status text not null default 'draft',
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists base_salary numeric(18,2) not null default 0,
  add column if not exists task_wage_total numeric(18,2) not null default 0,
  add column if not exists bonus_total numeric(18,2) not null default 0,
  add column if not exists deduction_total numeric(18,2) not null default 0,
  add column if not exists insurance_employee_amount numeric(18,2) not null default 0,
  add column if not exists insurance_employer_amount numeric(18,2) not null default 0,
  add column if not exists gross_amount numeric(18,2) not null default 0,
  add column if not exists net_amount numeric(18,2) not null default 0,
  add column if not exists lines jsonb not null default '[]'::jsonb,
  add column if not exists payments jsonb not null default '[]'::jsonb,
  add column if not exists performance_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists task_ids jsonb not null default '[]'::jsonb,
  add column if not exists related_module_id text,
  add column if not exists related_record_id uuid,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employee_advances_related_payroll_slip_id_fkey') then
    alter table public.employee_advances
      add constraint employee_advances_related_payroll_slip_id_fkey
      foreign key (related_payroll_slip_id) references public.payroll_slips(id) on delete set null
      not valid;
  end if;
end $$;

create table if not exists public.employee_contracts (
  id uuid primary key default gen_random_uuid()
);

alter table public.employee_contracts
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists contract_type text not null default 'employment',
  add column if not exists status text not null default 'draft',
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists applicant_id uuid,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists base_salary numeric(18,2) not null default 0,
  add column if not exists work_location text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists terms jsonb not null default '[]'::jsonb,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.recruitment_applicants (
  id uuid primary key default gen_random_uuid()
);

alter table public.recruitment_applicants
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists status text not null default 'new',
  add column if not exists source text,
  add column if not exists position_title text,
  add column if not exists department text,
  add column if not exists mobile text,
  add column if not exists email text,
  add column if not exists expected_salary numeric(18,2) not null default 0,
  add column if not exists interview_at timestamptz,
  add column if not exists score numeric(6,2),
  add column if not exists assigned_reviewer_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists related_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists resume_url text,
  add column if not exists notes text,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employee_contracts_applicant_id_fkey') then
    alter table public.employee_contracts
      add constraint employee_contracts_applicant_id_fkey
      foreign key (applicant_id) references public.recruitment_applicants(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.current_org_id()') is not null then
    alter table public.expense_documents alter column org_id set default public.current_org_id();
    alter table public.employee_advances alter column org_id set default public.current_org_id();
    alter table public.payroll_slips alter column org_id set default public.current_org_id();
    alter table public.employee_contracts alter column org_id set default public.current_org_id();
    alter table public.recruitment_applicants alter column org_id set default public.current_org_id();
  end if;
end $$;

update public.expense_documents
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else nullif(assignee_type, '')
end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> '';

update public.employee_advances
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else nullif(assignee_type, '')
end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> '';

update public.payroll_slips
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else nullif(assignee_type, '')
end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> '';

update public.employee_contracts
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else nullif(assignee_type, '')
end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> '';

update public.recruitment_applicants
set
  assignee_id = coalesce(assignee_id, assigned_reviewer_id),
  assignee_type = case
    when assignee_role_id is not null then 'role'
    when coalesce(assignee_id, assigned_reviewer_id) is not null then 'user'
    else nullif(assignee_type, '')
  end
where assignee_role_id is not null
   or assignee_id is not null
   or assigned_reviewer_id is not null
   or coalesce(assignee_type, '') <> '';

alter table public.expense_documents
  drop constraint if exists chk_expense_documents_status,
  drop constraint if exists chk_expense_documents_counterparty_type,
  drop constraint if exists chk_expense_documents_assignee_type;

alter table public.expense_documents
  add constraint chk_expense_documents_status
    check (status in ('draft', 'pending_approval', 'approved', 'paid', 'posted', 'canceled')),
  add constraint chk_expense_documents_counterparty_type
    check (counterparty_type in ('supplier', 'customer', 'employee', 'other')),
  add constraint chk_expense_documents_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role'));

alter table public.employee_advances
  drop constraint if exists chk_employee_advances_status,
  drop constraint if exists chk_employee_advances_assignee_type;
alter table public.employee_advances
  add constraint chk_employee_advances_status
    check (status in ('draft', 'requested', 'approved', 'paid', 'settled', 'posted', 'rejected', 'canceled')),
  add constraint chk_employee_advances_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role'));

alter table public.payroll_slips
  drop constraint if exists chk_payroll_slips_status,
  drop constraint if exists chk_payroll_slips_assignee_type;
alter table public.payroll_slips
  add constraint chk_payroll_slips_status
    check (status in ('draft', 'approved', 'paid', 'posted', 'canceled')),
  add constraint chk_payroll_slips_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role'));

alter table public.employee_contracts
  drop constraint if exists chk_employee_contracts_status,
  drop constraint if exists chk_employee_contracts_contract_type,
  drop constraint if exists chk_employee_contracts_assignee_type;
alter table public.employee_contracts
  add constraint chk_employee_contracts_status
    check (status in ('draft', 'pending_signature', 'active', 'expired', 'terminated', 'canceled')),
  add constraint chk_employee_contracts_contract_type
    check (contract_type in ('employment', 'consulting', 'temporary', 'probation', 'contractor', 'other')),
  add constraint chk_employee_contracts_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role'));

alter table public.recruitment_applicants
  drop constraint if exists chk_recruitment_applicants_status,
  drop constraint if exists chk_recruitment_applicants_assignee_type;
alter table public.recruitment_applicants
  add constraint chk_recruitment_applicants_status
    check (status in ('new', 'screening', 'interview', 'accepted', 'rejected', 'hired', 'archived')),
  add constraint chk_recruitment_applicants_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role'));

create unique index if not exists idx_expense_documents_org_system_code
  on public.expense_documents(org_id, system_code)
  where system_code is not null and system_code <> '';
create index if not exists idx_expense_documents_org_date on public.expense_documents(org_id, expense_date desc);
create index if not exists idx_expense_documents_status on public.expense_documents(status, expense_date desc);
create index if not exists idx_expense_documents_assignee_scope on public.expense_documents(assignee_id, assignee_role_id);

create unique index if not exists idx_employee_advances_org_system_code
  on public.employee_advances(org_id, system_code)
  where system_code is not null and system_code <> '';
create index if not exists idx_employee_advances_employee on public.employee_advances(employee_id, request_date desc);
create index if not exists idx_employee_advances_assignee_scope on public.employee_advances(assignee_id, assignee_role_id);

create unique index if not exists idx_payroll_slips_org_system_code
  on public.payroll_slips(org_id, system_code)
  where system_code is not null and system_code <> '';
create unique index if not exists idx_payroll_slips_employee_period
  on public.payroll_slips(org_id, employee_id, period_start, period_end)
  where employee_id is not null;
create index if not exists idx_payroll_slips_assignee_scope on public.payroll_slips(assignee_id, assignee_role_id);

create unique index if not exists idx_employee_contracts_org_system_code
  on public.employee_contracts(org_id, system_code)
  where system_code is not null and system_code <> '';
create index if not exists idx_employee_contracts_employee on public.employee_contracts(employee_id, start_date desc);
create index if not exists idx_employee_contracts_assignee_scope on public.employee_contracts(assignee_id, assignee_role_id);

create unique index if not exists idx_recruitment_applicants_org_system_code
  on public.recruitment_applicants(org_id, system_code)
  where system_code is not null and system_code <> '';
create index if not exists idx_recruitment_applicants_status on public.recruitment_applicants(status, created_at desc);
create index if not exists idx_recruitment_applicants_assignee_scope on public.recruitment_applicants(assignee_id, assignee_role_id);

do $$
declare
  t text;
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    foreach t in array array[
      'expense_documents',
      'employee_advances',
      'payroll_slips',
      'employee_contracts',
      'recruitment_applicants'
    ]
    loop
      execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated_at', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'trg_' || t || '_updated_at', t);
    end loop;
  end if;
end $$;

alter table public.expense_documents enable row level security;
alter table public.employee_advances enable row level security;
alter table public.payroll_slips enable row level security;
alter table public.employee_contracts enable row level security;
alter table public.recruitment_applicants enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'expense_documents',
    'employee_advances',
    'payroll_slips',
    'employee_contracts',
    'recruitment_applicants'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'p_' || t || '_org_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (to_regprocedure(''public.current_org_id()'') is null or public.current_org_id() is null or org_id is null or org_id = public.current_org_id()) with check (to_regprocedure(''public.current_org_id()'') is null or public.current_org_id() is null or org_id is null or org_id = public.current_org_id())',
      'p_' || t || '_org_all',
      t
    );
  end loop;
end $$;

grant select, insert, update, delete on public.expense_documents to authenticated;
grant select, insert, update, delete on public.employee_advances to authenticated;
grant select, insert, update, delete on public.payroll_slips to authenticated;
grant select, insert, update, delete on public.employee_contracts to authenticated;
grant select, insert, update, delete on public.recruitment_applicants to authenticated;

notify pgrst, 'reload schema';

commit;
