-- =====================================================
-- KalamApp - Phase 536 Financial History Payment Event Dates
-- Date: 2026-10-13
-- Type: Additive / idempotent migration
-- Goal: ثبت تاریخ واقعی دریافت و پرداخت در جدول آمار مالی و سوابق
-- =====================================================

begin;

-- تاریخ ردیف نقدی/بانکی باید از خود رخداد دریافت یا پرداخت خوانده شود. تاریخ
-- فاکتور، هزینه، مساعده یا فیش فقط تاریخ سند پایه است و نباید جای تاریخ تسویه
-- در گردش مالی اشخاص نمایش داده شود.
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

  if v_value ~ '^\\d{4}-\\d{2}-\\d{2}$' then
    return v_value::date;
  end if;

  if v_value ~ '^\\d{4}-\\d{2}-\\d{2}[T[:space:]]' then
    return left(v_value, 10)::date;
  end if;

  return null;
exception
  when others then
    -- یک مقدار قدیمی یا نامعتبر نباید باعث از کار افتادن گردش کل شخص شود.
    return null;
end;
$$;

revoke all on function public.financial_history_payment_event_date(jsonb) from public, anon, authenticated;

-- تعریف هسته در نسخه‌های پیشین migrationهای تکمیلی داشته است؛ فقط دو fallback
-- شناخته‌شدهٔ تاریخ سند پایه را جایگزین می‌کنیم تا همهٔ مصرف‌کننده‌های مرکزی
-- (کارت حساب، آمار مالی و سوابق و خلاصه‌های مالی) رفتار یکسان داشته باشند.
do $$
declare
  v_function_definition text;
  v_source_document_date text := $old$case when coalesce(payment.item ->> 'date', '') ~ '^\\d{4}-\\d{2}-\\d{2}$' then (payment.item ->> 'date')::date else source.row_date end$old$;
  v_advance_document_date text := $old$case when coalesce(payment.item ->> 'date', '') ~ '^\\d{4}-\\d{2}-\\d{2}$' then (payment.item ->> 'date')::date else advance.request_date end$old$;
begin
  if to_regprocedure('public._get_operational_financial_history(uuid,text,uuid)') is null then
    raise exception 'تابع مرکزی گردش مالی برای اصلاح تاریخ دریافت و پرداخت پیدا نشد.';
  end if;

  select pg_get_functiondef('public._get_operational_financial_history(uuid,text,uuid)'::regprocedure)
    into v_function_definition;

  if position('public.financial_history_payment_event_date(payment.item)' in v_function_definition) > 0 then
    return;
  end if;

  if position(v_source_document_date in v_function_definition) = 0
    or position(v_advance_document_date in v_function_definition) = 0 then
    raise exception 'نسخهٔ تابع مرکزی گردش مالی برای اصلاح تاریخ دریافت و پرداخت شناخته‌شده نیست.';
  end if;

  v_function_definition := replace(
    v_function_definition,
    v_source_document_date,
    'public.financial_history_payment_event_date(payment.item)'
  );
  v_function_definition := replace(
    v_function_definition,
    v_advance_document_date,
    'public.financial_history_payment_event_date(payment.item)'
  );

  if position(v_source_document_date in v_function_definition) > 0
    or position(v_advance_document_date in v_function_definition) > 0
    or (
      length(v_function_definition)
      - length(replace(v_function_definition, 'public.financial_history_payment_event_date(payment.item)', ''))
    ) / length('public.financial_history_payment_event_date(payment.item)') <> 2 then
    raise exception 'جایگزینی تاریخ واقعی دریافت و پرداخت در تابع مرکزی کامل نشد.';
  end if;

  execute v_function_definition;
end;
$$;

commit;
