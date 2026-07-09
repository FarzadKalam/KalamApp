-- Phase 321: AI per-user usage policies and SaaS gift credit grants

create table if not exists public.org_ai_usage_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  subject_type text not null,
  subject_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  ai_enabled boolean not null default true,
  daily_token_limit integer not null default 80000,
  daily_irt_limit numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_ai_usage_policies_subject_type_check check (subject_type in ('default', 'role', 'user')),
  constraint org_ai_usage_policies_daily_token_limit_check check (daily_token_limit >= 0),
  constraint org_ai_usage_policies_daily_irt_limit_check check (daily_irt_limit is null or daily_irt_limit >= 0)
);

create unique index if not exists idx_org_ai_usage_policies_subject
  on public.org_ai_usage_policies(org_id, subject_type, subject_id);

create index if not exists idx_org_ai_usage_policies_org_type
  on public.org_ai_usage_policies(org_id, subject_type);

alter table public.org_ai_usage_policies enable row level security;

drop policy if exists p_org_ai_usage_policies_org_read on public.org_ai_usage_policies;
create policy p_org_ai_usage_policies_org_read
on public.org_ai_usage_policies
for select to authenticated
using (org_id = public.current_org_id());

grant select on public.org_ai_usage_policies to authenticated, service_role;
grant insert, update, delete on public.org_ai_usage_policies to service_role;

insert into public.org_ai_usage_policies (org_id, subject_type, subject_id, ai_enabled, daily_token_limit, metadata)
select o.id, 'default', '00000000-0000-0000-0000-000000000000'::uuid, true, 80000, '{"source":"phase321_default"}'::jsonb
from public.organizations o
where not exists (
  select 1
  from public.org_ai_usage_policies p
  where p.org_id = o.id
    and p.subject_type = 'default'
    and p.subject_id = '00000000-0000-0000-0000-000000000000'::uuid
);

create table if not exists public.org_ai_credit_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  amount_irt numeric not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint org_ai_credit_grants_amount_check check (amount_irt > 0)
);

create index if not exists idx_org_ai_credit_grants_org_created
  on public.org_ai_credit_grants(org_id, created_at desc);

alter table public.org_ai_credit_grants enable row level security;

drop policy if exists p_org_ai_credit_grants_org_read on public.org_ai_credit_grants;
create policy p_org_ai_credit_grants_org_read
on public.org_ai_credit_grants
for select to authenticated
using (org_id = public.current_org_id());

grant select on public.org_ai_credit_grants to authenticated, service_role;
grant insert, update, delete on public.org_ai_credit_grants to service_role;
