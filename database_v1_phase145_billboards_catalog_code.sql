-- Goal: align billboards schema with module config by adding catalog_code

alter table public.billboards
  add column if not exists catalog_code text;

create index if not exists idx_billboards_org_catalog_code
  on public.billboards(org_id, catalog_code)
  where catalog_code is not null and btrim(catalog_code) <> '';
