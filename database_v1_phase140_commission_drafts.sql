-- =====================================================
-- KalamApp - Phase 140 Commission Draft Review Workflow
-- Date: 2026-05-02
-- Type: Additive / idempotent migration
-- Goal: persist commission review drafts before payroll posting
-- =====================================================

begin;

create table if not exists public.commission_drafts (
  id uuid primary key default gen_random_uuid()
);

alter table public.commission_drafts
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists employee_id uuid references public.employees(id) on delete cascade,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists period_start date not null default current_date,
  add column if not exists period_end date not null default current_date,
  add column if not exists source_basis text not null default 'prepaid_and_settled_invoices',
  add column if not exists percent_mode text not null default 'product_default',
  add column if not exists eligibility_event_type text,
  add column if not exists eligibility_event_at timestamptz,
  add column if not exists invoice_id uuid references public.invoices(id) on delete cascade,
  add column if not exists invoice_item_key text,
  add column if not exists entitled_amount numeric not null default 0,
  add column if not exists posted_amount numeric not null default 0,
  add column if not exists remaining_amount numeric not null default 0,
  add column if not exists decision_status text not null default 'auto',
  add column if not exists decision_reason text,
  add column if not exists deferred_from_period date,
  add column if not exists deferred_to_period date,
  add column if not exists manual_decision_by uuid references auth.users(id) on delete set null,
  add column if not exists manual_decision_at timestamptz,
  add column if not exists draft_status text not null default 'draft',
  add column if not exists source_key text,
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_commission_drafts_source_key
  on public.commission_drafts(source_key)
  where source_key is not null;

create index if not exists idx_commission_drafts_employee_period
  on public.commission_drafts(org_id, employee_id, period_start, period_end, draft_status);

create index if not exists idx_commission_drafts_invoice_item
  on public.commission_drafts(org_id, invoice_id, invoice_item_key);

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_commission_drafts_updated_at on public.commission_drafts;
    create trigger trg_commission_drafts_updated_at
      before update on public.commission_drafts
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.commission_drafts enable row level security;

drop policy if exists p_commission_drafts_org_all on public.commission_drafts;
create policy p_commission_drafts_org_all
on public.commission_drafts
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

commit;
