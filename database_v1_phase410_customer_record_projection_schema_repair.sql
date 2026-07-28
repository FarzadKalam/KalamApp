-- تعمیر idempotent ستون‌های مشتری که در صفحهٔ رکورد استفاده می‌شوند.
-- این migration برای نصب‌هایی است که phase 268 یا 396 در production آن‌ها
-- کامل اجرا نشده اما config فعلی این ستون‌ها را نمایش می‌دهد.

begin;

alter table if exists public.customers
  add column if not exists loyalty_credit_balance numeric(18,2) not null default 0,
  add column if not exists online_account_card_link text;

-- PostgREST باید ستون‌هایی را که همین migration ساخته فوراً در schema cache ببیند.
notify pgrst, 'reload schema';

commit;
