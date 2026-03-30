-- =====================================================
-- KalamApp - Phase 52 Marketing Leads Alignment
-- Date: 2026-03-27
-- Type: Additive / idempotent migration
-- Goal: align marketing leads with customer mapping and global assignee
-- =====================================================

begin;

alter table public.marketing_leads
  add column if not exists prefix text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists mobile_2 text,
  add column if not exists assistant_phone text,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists address text,
  add column if not exists industry text,
  add column if not exists lead_source text,
  add column if not exists lead_type text not null default 'new_lead',
  add column if not exists success_percentage numeric(5,2) not null default 0,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null;

update public.marketing_leads
set
  success_percentage = coalesce(success_percentage, least(greatest(coalesce(score, 0), 0), 100)),
  assignee_id = coalesce(assignee_id, owner_id),
  assignee_type = coalesce(
    nullif(assignee_type, ''),
    case
      when assignee_role_id is not null then 'role'
      when coalesce(assignee_id, owner_id) is not null then 'user'
      else null
    end
  ),
  lead_type = coalesce(
    nullif(lead_type, ''),
    case
      when customer_id is not null then 'existing_customer'
      else 'new_lead'
    end
  )
where
  success_percentage is null
  or assignee_id is null
  or assignee_type is null
  or lead_type is null
  or lead_type = '';

alter table public.marketing_leads
  alter column success_percentage set default 0,
  alter column success_percentage set not null,
  alter column lead_type set default 'new_lead',
  alter column lead_type set not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.marketing_leads'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.marketing_leads drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.marketing_leads
  drop constraint if exists marketing_leads_status_check_v2;

update public.marketing_leads
set status = case
  when status = 'contacted' then 'in_follow_up'
  when status = 'qualified' then 'in_follow_up'
  when status = 'proposal' then 'future_follow_up'
  when status = 'archived' then 'lost'
  else status
end
where status in ('contacted', 'qualified', 'proposal', 'archived');

alter table public.marketing_leads
  add constraint marketing_leads_status_check_v2
  check (
    status in (
      'new',
      'in_follow_up',
      'overdue_follow_up',
      'future_follow_up',
      'won',
      'lost'
    )
  );

create index if not exists idx_marketing_leads_assignee_id
  on public.marketing_leads (assignee_id);

create index if not exists idx_marketing_leads_assignee_role_id
  on public.marketing_leads (assignee_role_id);

commit;
