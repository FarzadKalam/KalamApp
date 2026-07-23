-- KalamApp - Phase 345
-- تاریخ‌های چرخهٔ فاکتور برای محاسبه و گزارش دقیق پورسانت
-- همه تغییرات idempotent هستند.

begin;

alter table if exists public.invoices
  add column if not exists settled_at timestamptz,
  add column if not exists completed_at timestamptz;

comment on column public.invoices.settled_at is
  'زمان ثبت نخستین وضعیت تسویه‌شدهٔ فاکتور؛ برای گزارش‌ها و محاسبات پورسانت استفاده می‌شود.';

comment on column public.invoices.completed_at is
  'زمان ثبت نخستین وضعیت تکمیل‌شدهٔ فاکتور؛ برای گزارش‌ها و محاسبات پورسانت استفاده می‌شود.';

create or replace function public.set_invoice_lifecycle_dates()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(coalesce(new.status, '')) = 'settled'
    and (tg_op = 'INSERT' or lower(coalesce(old.status, '')) <> 'settled') then
    new.settled_at := coalesce(new.settled_at, now());
  end if;

  if lower(coalesce(new.status, '')) = 'completed'
    and (tg_op = 'INSERT' or lower(coalesce(old.status, '')) <> 'completed') then
    new.completed_at := coalesce(new.completed_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_invoices_set_lifecycle_dates on public.invoices;
create trigger trg_invoices_set_lifecycle_dates
before insert or update of status on public.invoices
for each row
execute function public.set_invoice_lifecycle_dates();

commit;
