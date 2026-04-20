-- =====================================================
-- KalamApp - Phase 113 HR Performance Formula Payroll
-- Date: 2026-04-20
-- Type: Additive / idempotent migration
-- Goal: formula foundations, HR performance rules, payroll ledger, goal and commission tracking
-- =====================================================

begin;

alter table public.calculation_formulas
  add column if not exists scope text not null default 'general',
  add column if not exists context_type text not null default 'generic',
  add column if not exists expression_config jsonb not null default '{}'::jsonb,
  add column if not exists output_type text not null default 'number',
  add column if not exists is_active boolean not null default true,
  add column if not exists config jsonb not null default '{}'::jsonb;

update public.calculation_formulas
set
  scope = coalesce(nullif(scope, ''), 'general'),
  context_type = coalesce(nullif(context_type, ''), 'generic'),
  expression_config = case
    when expression_config is null or jsonb_typeof(expression_config) <> 'object' then '{}'::jsonb
    else expression_config
  end,
  output_type = coalesce(nullif(output_type, ''), 'number'),
  is_active = coalesce(is_active, true),
  config = case
    when config is null or jsonb_typeof(config) <> 'object' then '{}'::jsonb
    else config
  end;

create index if not exists idx_calculation_formulas_org_scope
  on public.calculation_formulas(org_id, scope, context_type, is_active);

create table if not exists public.activity_performance_rules (
  id uuid primary key default gen_random_uuid()
);

alter table public.activity_performance_rules
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists employee_id uuid references public.employees(id) on delete cascade,
  add column if not exists task_type text,
  add column if not exists formula_id uuid references public.calculation_formulas(id) on delete set null,
  add column if not exists output_type text not null default 'bonus',
  add column if not exists priority integer not null default 100,
  add column if not exists conditions_all jsonb not null default '[]'::jsonb,
  add column if not exists conditions_any jsonb not null default '[]'::jsonb,
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.activity_performance_rules
  drop constraint if exists chk_activity_performance_rules_output_type;
alter table public.activity_performance_rules
  add constraint chk_activity_performance_rules_output_type
    check (output_type in ('wage', 'bonus', 'penalty', 'score'));

create index if not exists idx_activity_performance_rules_org_active
  on public.activity_performance_rules(org_id, is_active, priority);
create index if not exists idx_activity_performance_rules_employee
  on public.activity_performance_rules(org_id, employee_id, is_active);
create index if not exists idx_activity_performance_rules_task_type
  on public.activity_performance_rules(org_id, task_type, is_active);

create table if not exists public.payroll_calculation_entries (
  id uuid primary key default gen_random_uuid()
);

alter table public.payroll_calculation_entries
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists employee_id uuid references public.employees(id) on delete cascade,
  add column if not exists period_start date not null default current_date,
  add column if not exists period_end date not null default current_date,
  add column if not exists entry_type text not null default 'manual_bonus',
  add column if not exists source_type text not null default 'manual',
  add column if not exists source_module_id text,
  add column if not exists source_record_id uuid,
  add column if not exists title text not null default '',
  add column if not exists amount numeric(18,2) not null default 0,
  add column if not exists quantity numeric(18,4),
  add column if not exists rate numeric(18,4),
  add column if not exists status text not null default 'proposed',
  add column if not exists payroll_slip_id uuid references public.payroll_slips(id) on delete set null,
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.payroll_calculation_entries
  drop constraint if exists chk_payroll_calculation_entries_status;
alter table public.payroll_calculation_entries
  add constraint chk_payroll_calculation_entries_status
    check (status in ('draft', 'proposed', 'included_in_payroll', 'voided'));

create index if not exists idx_payroll_calc_entries_employee_period
  on public.payroll_calculation_entries(org_id, employee_id, period_start, period_end, status);
create unique index if not exists idx_payroll_calc_entries_source_once
  on public.payroll_calculation_entries(org_id, employee_id, source_type, source_module_id, source_record_id, entry_type, period_start, period_end)
  where source_record_id is not null and status <> 'voided';

create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid()
);

alter table public.goal_contributions
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists goal_id uuid references public.goals(id) on delete cascade,
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists module_id text not null default '',
  add column if not exists record_id uuid,
  add column if not exists period_start date not null default current_date,
  add column if not exists period_end date not null default current_date,
  add column if not exists metric_value numeric(18,4) not null default 0,
  add column if not exists contribution_status text not null default 'active',
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_goal_contributions_source_once
  on public.goal_contributions(org_id, goal_id, module_id, record_id, employee_id, period_start, period_end)
  where record_id is not null;
create index if not exists idx_goal_contributions_employee_period
  on public.goal_contributions(org_id, employee_id, period_start, period_end, contribution_status);

create table if not exists public.goal_milestone_events (
  id uuid primary key default gen_random_uuid()
);

alter table public.goal_milestone_events
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists goal_id uuid references public.goals(id) on delete cascade,
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists level_key text not null default 'target',
  add column if not exists threshold_value numeric(18,4) not null default 0,
  add column if not exists achieved_value numeric(18,4) not null default 0,
  add column if not exists period_start date not null default current_date,
  add column if not exists period_end date not null default current_date,
  add column if not exists occurred_at timestamptz not null default now(),
  add column if not exists reward_status text not null default 'not_configured',
  add column if not exists payroll_entry_id uuid references public.payroll_calculation_entries(id) on delete set null,
  add column if not exists details jsonb not null default '{}'::jsonb;

create unique index if not exists idx_goal_milestone_once
  on public.goal_milestone_events(org_id, goal_id, employee_id, level_key, period_start, period_end);

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid()
);

alter table public.commission_rules
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists employee_id uuid references public.employees(id) on delete cascade,
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists basis text not null default 'settled_invoice',
  add column if not exists formula_id uuid references public.calculation_formulas(id) on delete set null,
  add column if not exists percentage numeric(8,4),
  add column if not exists priority integer not null default 100,
  add column if not exists conditions_all jsonb not null default '[]'::jsonb,
  add column if not exists conditions_any jsonb not null default '[]'::jsonb,
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.commission_rules
  drop constraint if exists chk_commission_rules_basis;
alter table public.commission_rules
  add constraint chk_commission_rules_basis
    check (basis in ('approved_invoice', 'settled_invoice', 'settled_and_cleared_cheques'));

create index if not exists idx_commission_rules_org_active
  on public.commission_rules(org_id, is_active, priority);

create table if not exists public.commission_entries (
  id uuid primary key default gen_random_uuid()
);

alter table public.commission_entries
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists employee_id uuid references public.employees(id) on delete cascade,
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists payment_module_id text,
  add column if not exists payment_record_id uuid,
  add column if not exists basis text not null default 'settled_invoice',
  add column if not exists eligible_amount numeric(18,2) not null default 0,
  add column if not exists commission_amount numeric(18,2) not null default 0,
  add column if not exists period_start date not null default current_date,
  add column if not exists period_end date not null default current_date,
  add column if not exists status text not null default 'proposed',
  add column if not exists payroll_entry_id uuid references public.payroll_calculation_entries(id) on delete set null,
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.commission_entries
  drop constraint if exists chk_commission_entries_status;
alter table public.commission_entries
  add constraint chk_commission_entries_status
    check (status in ('draft', 'proposed', 'included_in_payroll', 'voided'));

create unique index if not exists idx_commission_entries_source_once
  on public.commission_entries(org_id, employee_id, invoice_id, product_id, coalesce(payment_module_id, ''), coalesce(payment_record_id, '00000000-0000-0000-0000-000000000000'::uuid), basis, period_start, period_end)
  where status <> 'voided';
create index if not exists idx_commission_entries_employee_period
  on public.commission_entries(org_id, employee_id, period_start, period_end, status);

alter table public.employees
  add column if not exists seniority_base_amount numeric(18,2) not null default 0,
  add column if not exists seniority_formula_id uuid references public.calculation_formulas(id) on delete set null;

insert into public.calculation_formulas (
  org_id,
  name,
  formula,
  description,
  scope,
  context_type,
  expression_config,
  output_type,
  is_active,
  config
)
select
  public.current_org_id(),
  'وزن ضربدر عدد ثابت',
  'weight * constant',
  'فرمول پیش‌فرض محاسبه عملکرد: وزن فعالیت ضربدر عدد ثابت',
  'activity_performance',
  'task',
  '{"type":"binary","operator":"multiply","left":{"type":"field","path":"task.weight","fallback":0},"right":{"type":"constant","key":"constant","value":1}}'::jsonb,
  'number',
  true,
  '{"seed_key":"activity_weight_times_constant_v1","constant_label":"عدد ثابت"}'::jsonb
where not exists (
  select 1
  from public.calculation_formulas f
  where coalesce(f.config->>'seed_key', '') = 'activity_weight_times_constant_v1'
);

do $$
declare
  t text;
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    foreach t in array array[
      'calculation_formulas',
      'activity_performance_rules',
      'payroll_calculation_entries',
      'goal_contributions',
      'commission_rules',
      'commission_entries'
    ]
    loop
      execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated_at', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'trg_' || t || '_updated_at', t);
    end loop;
  end if;
end $$;

alter table public.activity_performance_rules enable row level security;
alter table public.payroll_calculation_entries enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.goal_milestone_events enable row level security;
alter table public.commission_rules enable row level security;
alter table public.commission_entries enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'activity_performance_rules',
    'payroll_calculation_entries',
    'goal_contributions',
    'goal_milestone_events',
    'commission_rules',
    'commission_entries'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'p_' || t || '_org_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id())',
      'p_' || t || '_org_all',
      t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
