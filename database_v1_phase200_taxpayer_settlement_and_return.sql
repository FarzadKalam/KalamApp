-- KalamApp V1 - Phase 200
-- Taxpayer: settlement auto-detection support + return invoice (برگشت از فروش) link

begin;

-- source_invoice_id برای فاکتورهای برگشت از فروش (inp=2)
-- این فیلد به فاکتور اصلی اشاره می‌کند تا orif در سامانه مودیان پر شود
alter table if exists public.invoices
  add column if not exists source_invoice_id uuid references public.invoices(id) on delete set null;

create index if not exists idx_invoices_source_invoice_id
  on public.invoices(source_invoice_id)
  where source_invoice_id is not null;

commit;
