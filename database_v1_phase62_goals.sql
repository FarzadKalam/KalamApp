-- KalamApp - Phase 62
-- Goals / target setting for module lists and dashboard cards

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  module_id text not null,
  name text not null,
  description text,
  goal_scope text not null default 'personal',
  period_unit text not null default 'month',
  subperiod_unit text not null default 'week',
  metric_type text not null default 'count',
  metric_field_key text,
  date_field_key text default 'created_at',
  target_value numeric,
  levels_enabled boolean not null default false,
  bronze_value numeric,
  silver_value numeric,
  gold_value numeric,
  assignee_user_ids jsonb not null default '[]'::jsonb,
  assignee_role_ids jsonb not null default '[]'::jsonb,
  conditions_all jsonb not null default '[]'::jsonb,
  conditions_any jsonb not null default '[]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_goals_scope check (goal_scope in ('personal', 'team')),
  constraint chk_goals_period_unit check (period_unit in ('day', 'week', 'month', 'quarter', 'half_year', 'year')),
  constraint chk_goals_subperiod_unit check (subperiod_unit in ('day', 'week', 'month', 'quarter', 'half_year', 'year')),
  constraint chk_goals_metric_type check (metric_type in ('count', 'sum', 'avg')),
  constraint chk_goals_name check (length(trim(name)) > 0)
);

alter table public.goals
  add column if not exists description text,
  add column if not exists goal_scope text default 'personal',
  add column if not exists period_unit text default 'month',
  add column if not exists subperiod_unit text default 'week',
  add column if not exists metric_type text default 'count',
  add column if not exists metric_field_key text,
  add column if not exists date_field_key text default 'created_at',
  add column if not exists target_value numeric,
  add column if not exists levels_enabled boolean not null default false,
  add column if not exists bronze_value numeric,
  add column if not exists silver_value numeric,
  add column if not exists gold_value numeric,
  add column if not exists assignee_user_ids jsonb not null default '[]'::jsonb,
  add column if not exists assignee_role_ids jsonb not null default '[]'::jsonb,
  add column if not exists conditions_all jsonb not null default '[]'::jsonb,
  add column if not exists conditions_any jsonb not null default '[]'::jsonb,
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.goals
set goal_scope = 'personal'
where goal_scope is null
   or trim(goal_scope) = '';

update public.goals
set period_unit = 'month'
where period_unit is null
   or trim(period_unit) = '';

update public.goals
set subperiod_unit = 'week'
where subperiod_unit is null
   or trim(subperiod_unit) = '';

update public.goals
set metric_type = 'count'
where metric_type is null
   or trim(metric_type) = '';

update public.goals
set date_field_key = 'created_at'
where date_field_key is null
   or trim(date_field_key) = '';

update public.goals
set assignee_user_ids = '[]'::jsonb
where assignee_user_ids is null
   or jsonb_typeof(assignee_user_ids) is distinct from 'array';

update public.goals
set assignee_role_ids = '[]'::jsonb
where assignee_role_ids is null
   or jsonb_typeof(assignee_role_ids) is distinct from 'array';

update public.goals
set conditions_all = '[]'::jsonb
where conditions_all is null
   or jsonb_typeof(conditions_all) is distinct from 'array';

update public.goals
set conditions_any = '[]'::jsonb
where conditions_any is null
   or jsonb_typeof(conditions_any) is distinct from 'array';

update public.goals
set config = '{}'::jsonb
where config is null
   or jsonb_typeof(config) is distinct from 'object';

update public.goals
set is_active = true
where is_active is null;

update public.goals
set levels_enabled = false
where levels_enabled is null;

alter table public.goals alter column goal_scope set default 'personal';
alter table public.goals alter column period_unit set default 'month';
alter table public.goals alter column subperiod_unit set default 'week';
alter table public.goals alter column metric_type set default 'count';
alter table public.goals alter column date_field_key set default 'created_at';
alter table public.goals alter column assignee_user_ids set default '[]'::jsonb;
alter table public.goals alter column assignee_role_ids set default '[]'::jsonb;
alter table public.goals alter column conditions_all set default '[]'::jsonb;
alter table public.goals alter column conditions_any set default '[]'::jsonb;
alter table public.goals alter column config set default '{}'::jsonb;
alter table public.goals alter column is_active set default true;
alter table public.goals alter column created_at set default now();
alter table public.goals alter column updated_at set default now();

alter table public.goals drop constraint if exists chk_goals_scope;
alter table public.goals drop constraint if exists chk_goals_period_unit;
alter table public.goals drop constraint if exists chk_goals_subperiod_unit;
alter table public.goals drop constraint if exists chk_goals_metric_type;
alter table public.goals drop constraint if exists chk_goals_name;

alter table public.goals
  add constraint chk_goals_scope check (goal_scope in ('personal', 'team'));

alter table public.goals
  add constraint chk_goals_period_unit check (period_unit in ('day', 'week', 'month', 'quarter', 'half_year', 'year'));

alter table public.goals
  add constraint chk_goals_subperiod_unit check (subperiod_unit in ('day', 'week', 'month', 'quarter', 'half_year', 'year'));

alter table public.goals
  add constraint chk_goals_metric_type check (metric_type in ('count', 'sum', 'avg'));

alter table public.goals
  add constraint chk_goals_name check (length(trim(name)) > 0);

create index if not exists idx_goals_org_module_active
  on public.goals(org_id, module_id, is_active);

create index if not exists idx_goals_org_updated
  on public.goals(org_id, updated_at desc);

drop trigger if exists trg_goals_updated_at on public.goals;
create trigger trg_goals_updated_at
before update on public.goals
for each row execute function public.set_updated_at();

alter table public.goals enable row level security;

drop policy if exists p_goals_org_all on public.goals;
create policy p_goals_org_all
on public.goals
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());
