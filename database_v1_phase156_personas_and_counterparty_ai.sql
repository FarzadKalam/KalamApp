create table if not exists public.personas (
  id uuid primary key default gen_random_uuid()
);

alter table public.personas
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists image_url text,
  add column if not exists name text not null default '',
  add column if not exists display_name text not null default '',
  add column if not exists persona_type text not null default 'customer',
  add column if not exists financial_status text,
  add column if not exists traits text,
  add column if not exists preferences text,
  add column if not exists pain_points text,
  add column if not exists basket text,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'personas_persona_type_check') then
    alter table public.personas
      add constraint personas_persona_type_check
      check (persona_type in ('customer', 'supplier', 'employee'));
  end if;
end $$;

create index if not exists idx_personas_org_type_updated
  on public.personas(org_id, persona_type, updated_at desc);

alter table public.customers
  add column if not exists persona_id uuid references public.personas(id) on delete set null;

alter table public.suppliers
  add column if not exists persona_id uuid references public.personas(id) on delete set null;

alter table public.employees
  add column if not exists persona_id uuid references public.personas(id) on delete set null;

alter table public.marketing_leads
  add column if not exists persona_id uuid references public.personas(id) on delete set null;

create index if not exists idx_customers_persona_id on public.customers(persona_id);
create index if not exists idx_suppliers_persona_id on public.suppliers(persona_id);
create index if not exists idx_employees_persona_id on public.employees(persona_id);
create index if not exists idx_marketing_leads_persona_id on public.marketing_leads(persona_id);

alter table public.counterparty_bot_groups
  add column if not exists ai_auto_reply_enabled boolean not null default false,
  add column if not exists ai_counterparty_guide text;

update public.counterparty_bot_groups
set
  ai_auto_reply_enabled = coalesce((metadata ->> 'ai_auto_reply_enabled')::boolean, false),
  ai_counterparty_guide = nullif(trim(coalesce(metadata ->> 'ai_counterparty_guide', '')), '')
where
  (metadata ? 'ai_auto_reply_enabled')
  or (metadata ? 'ai_counterparty_guide');

alter table public.personas enable row level security;
drop policy if exists p_personas_auth_all on public.personas;
create policy p_personas_auth_all
on public.personas
for all
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());
