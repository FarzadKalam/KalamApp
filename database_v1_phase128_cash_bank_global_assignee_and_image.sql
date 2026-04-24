-- =====================================================
-- KalamApp - Phase 128 Cash/Bank Global Assignee & Image
-- Date: 2026-04-24
-- Type: Additive / non-breaking migration
-- Prerequisite: database_v1_phase127_cash_bank_payment_type_credit_alignment.sql
-- =====================================================

alter table if exists public.cash_bank_operations
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists image_url text;

update public.cash_bank_operations
set assignee_id = coalesce(assignee_id, employee_id),
    assignee_type = case
      when assignee_role_id is not null then 'role'
      when coalesce(assignee_id, employee_id) is not null then 'user'
      else nullif(assignee_type, '')
    end,
    image_url = coalesce(nullif(image_url, ''), nullif(attachment_url, ''))
where assignee_id is null
   or coalesce(assignee_type, '') = ''
   or coalesce(nullif(image_url, ''), '') = '';

create index if not exists idx_cash_bank_operations_assignee_scope
  on public.cash_bank_operations(assignee_id, assignee_role_id);
