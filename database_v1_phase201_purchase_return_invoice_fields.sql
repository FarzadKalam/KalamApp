-- KalamApp V1 - Phase 201
-- Purchase return invoice support: add taxpayer_invoice_pattern and source_invoice_id to purchase_invoices

begin;

-- نوع فاکتور خرید: 1=خرید، 2=برگشت از خرید
alter table if exists public.purchase_invoices
  add column if not exists taxpayer_invoice_pattern text not null default '1',
  add column if not exists source_invoice_id uuid references public.purchase_invoices(id) on delete set null;

create index if not exists idx_purchase_invoices_source_invoice_id
  on public.purchase_invoices(source_invoice_id)
  where source_invoice_id is not null;

create index if not exists idx_purchase_invoices_taxpayer_pattern
  on public.purchase_invoices(taxpayer_invoice_pattern)
  where taxpayer_invoice_pattern != '1';

commit;
