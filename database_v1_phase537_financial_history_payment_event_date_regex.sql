-- =====================================================
-- KalamApp - Phase 537 Financial History Payment Event Date Regex
-- Date: 2026-10-13
-- Type: Additive / idempotent migration
-- Goal: اعتبارسنجی درست تاریخ رویداد دریافت و پرداخت
-- =====================================================

begin;

-- الگوی قبلی با escape نامناسب، تاریخ ISO را تشخیص نمی‌داد. این تعریف فقط
-- تاریخ خود رویداد مالی را می‌پذیرد و همچنان هیچ fallbackی به تاریخ سند پایه
-- ندارد.
create or replace function public.financial_history_payment_event_date(p_payment jsonb)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value text;
begin
  if p_payment is null then
    return null;
  end if;

  v_value := nullif(btrim(coalesce(
    p_payment ->> 'payment_date',
    p_payment ->> 'receipt_date',
    p_payment ->> 'operation_date',
    p_payment ->> 'paid_at',
    p_payment ->> 'received_at',
    p_payment ->> 'settled_at',
    p_payment ->> 'date',
    ''
  )), '');

  if v_value is null then
    return null;
  end if;

  if v_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return v_value::date;
  end if;

  if v_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T[:space:]]' then
    return left(v_value, 10)::date;
  end if;

  return null;
exception
  when others then
    return null;
end;
$$;

revoke all on function public.financial_history_payment_event_date(jsonb) from public, anon, authenticated;

commit;
