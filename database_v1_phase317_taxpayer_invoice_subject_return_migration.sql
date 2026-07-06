-- Goal: align taxpayer invoice return handling with the official invoice subject codes.

alter table if exists public.invoices
  add column if not exists taxpayer_invoice_subject text default '1';

alter table if exists public.purchase_invoices
  add column if not exists taxpayer_invoice_subject text default '1';

alter table if exists public.invoices
  alter column taxpayer_invoice_subject set default '1';

alter table if exists public.purchase_invoices
  alter column taxpayer_invoice_subject set default '1';

alter table if exists public.invoices
  alter column taxpayer_invoice_pattern set default '1';

alter table if exists public.purchase_invoices
  alter column taxpayer_invoice_pattern set default '1';

update public.invoices
set taxpayer_invoice_subject = '1'
where coalesce(btrim(taxpayer_invoice_subject), '') = '';

update public.purchase_invoices
set taxpayer_invoice_subject = '1'
where coalesce(btrim(taxpayer_invoice_subject), '') = '';

update public.invoices
set taxpayer_invoice_subject = '4',
    taxpayer_invoice_pattern = '1'
where taxpayer_invoice_pattern = '2'
  and source_invoice_id is not null;

update public.purchase_invoices
set taxpayer_invoice_subject = '4',
    taxpayer_invoice_pattern = '1'
where taxpayer_invoice_pattern = '2'
  and source_invoice_id is not null;

create index if not exists invoices_org_taxpayer_invoice_subject_idx
  on public.invoices (org_id, taxpayer_invoice_subject);

create index if not exists purchase_invoices_org_taxpayer_invoice_subject_idx
  on public.purchase_invoices (org_id, taxpayer_invoice_subject);
