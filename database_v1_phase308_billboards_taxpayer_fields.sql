-- Goal: let billboard catalog items store the taxpayer-system identifiers needed for invoice submission.

alter table if exists public.billboards
  add column if not exists product_identifier text,
  add column if not exists taxpayer_measure_unit_code text;

create index if not exists idx_billboards_org_product_identifier
  on public.billboards(org_id, product_identifier)
  where product_identifier is not null and btrim(product_identifier) <> '';
