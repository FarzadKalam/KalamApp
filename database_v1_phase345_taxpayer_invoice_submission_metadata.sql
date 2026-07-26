-- ثبت زمان ایجاد صورتحساب برای ارسال معتبر به سامانه مودیان.
-- This migration is idempotent and does not modify prior migrations.

begin;

alter table if exists public.invoices
  add column if not exists taxpayer_invoice_created_at timestamptz;

comment on column public.invoices.taxpayer_invoice_created_at is
  'زمان ایجاد صورتحساب که در ارسال به سامانه مودیان به indati2m نگاشت می‌شود.';

commit;
