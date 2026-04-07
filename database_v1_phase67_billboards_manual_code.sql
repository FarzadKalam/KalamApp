-- KalamApp - Phase 67
-- Goal: align billboards schema with module config by adding manual_code

alter table public.billboards
  add column if not exists manual_code text;

create index if not exists idx_billboards_org_manual_code
  on public.billboards(org_id, manual_code)
  where manual_code is not null and btrim(manual_code) <> '';
