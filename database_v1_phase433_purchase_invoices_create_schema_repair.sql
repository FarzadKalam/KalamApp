-- KalamApp V1 - Phase 433
-- Ensure purchase-invoice fields used during creation are available on older deployments.
-- Idempotent and safe to run after the original invoice migrations.

begin;

alter table if exists public.purchase_invoices
  add column if not exists image_url text,
  add column if not exists description text,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists estimated_invoice_amount numeric(18,2) not null default 0,
  add column if not exists notify_supplier boolean not null default false,
  add column if not exists process_template_id uuid,
  add column if not exists execution_process_draft jsonb not null default '[]'::jsonb,
  add column if not exists source_account text,
  add column if not exists public_slug text,
  add column if not exists taxpayer_invoice_pattern text not null default '1',
  add column if not exists taxpayer_invoice_subject text not null default '1',
  add column if not exists global_discount_type text not null default 'amount',
  add column if not exists global_discount_value numeric(18,2) not null default 0;

update public.purchase_invoices
set
  taxpayer_invoice_pattern = coalesce(nullif(btrim(taxpayer_invoice_pattern), ''), '1'),
  taxpayer_invoice_subject = coalesce(nullif(btrim(taxpayer_invoice_subject), ''), '1'),
  global_discount_type = case
    when lower(btrim(coalesce(global_discount_type, ''))) = 'percent' then 'percent'
    else 'amount'
  end,
  global_discount_value = greatest(0, coalesce(global_discount_value, 0))
where taxpayer_invoice_pattern is null
   or btrim(taxpayer_invoice_pattern) = ''
   or taxpayer_invoice_subject is null
   or btrim(taxpayer_invoice_subject) = ''
   or global_discount_type is null
   or btrim(global_discount_type) = ''
   or global_discount_value is null;

create index if not exists idx_purchase_invoices_org_source_account
  on public.purchase_invoices(org_id, source_account)
  where source_account is not null and btrim(source_account) <> '';

create index if not exists idx_purchase_invoices_org_taxpayer_invoice_subject
  on public.purchase_invoices(org_id, taxpayer_invoice_subject);

notify pgrst, 'reload schema';

commit;
