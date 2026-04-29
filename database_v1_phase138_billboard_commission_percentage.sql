-- KalamApp - Phase 138 Billboard commission percentage
-- Adds default commission percent support for environmental advertising items.

begin;

alter table if exists public.billboards
  add column if not exists commission_percentage numeric(8,4) not null default 0;

comment on column public.billboards.commission_percentage is
  'Default commission percent used when a billboard/environmental advertising item is included in an invoice.';

commit;
