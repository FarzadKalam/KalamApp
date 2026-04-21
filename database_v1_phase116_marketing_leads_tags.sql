-- KalamApp V1 - Phase 116
-- Keep marketing lead tags aligned with modules such as sales invoices.

begin;

alter table if exists public.marketing_leads
  add column if not exists tags jsonb not null default '[]'::jsonb;

commit;
