-- =====================================================
-- KalamApp - Phase 452 Financial History Advance Payment Alias Repair
-- Date: 2026-08-17
-- Type: Additive / idempotent migration
-- Goal: رفع قطعی alias ردیف پرداخت مساعده در دفتر مالی مرکزی
-- =====================================================

begin;

-- بعضی محیط‌ها تاریخچهٔ migration را ثبت کرده‌اند، اما تعریف تابع مرکزی
-- هنوز alias قدیمی payment را دارد. در آن تعریف، payment.item خارج از
-- زیرquery قابل‌شناسی نیست و RPC با خطای «column item does not exist» رد می‌شود.
do $$
declare
  v_function_definition text;
  v_legacy_alias_pattern text := '\)[[:space:]]+payment[[:space:]]+where[[:space:]]+advance\.org_id[[:space:]]*=[[:space:]]*p_org_id';
begin
  if to_regprocedure('public._get_operational_financial_history(uuid,text,uuid)') is null then
    raise exception 'تابع مرکزی گردش مالی برای اصلاح ردیف پرداخت پیدا نشد.';
  end if;

  select pg_get_functiondef('public._get_operational_financial_history(uuid,text,uuid)'::regprocedure)
    into v_function_definition;

  if v_function_definition ~ v_legacy_alias_pattern then
    v_function_definition := regexp_replace(
      v_function_definition,
      v_legacy_alias_pattern,
      $replacement$) payment(item, ordinality)
    where advance.org_id = p_org_id$replacement$,
      'g'
    );

    if v_function_definition ~ v_legacy_alias_pattern
      or position(') payment(item, ordinality)' in v_function_definition) = 0 then
      raise exception 'نام‌گذاری ردیف پرداخت مساعده در تابع مرکزی انجام نشد.';
    end if;

    execute v_function_definition;
  elsif position('from public.employee_advances advance' in v_function_definition) > 0
    and position('payment.item' in v_function_definition) > 0
    and position(') payment(item, ordinality)' in v_function_definition) = 0
  then
    raise exception 'نسخهٔ تابع مرکزی گردش مالی برای اصلاح alias پرداخت مساعده شناخته‌شده نیست.';
  end if;
end;
$$;

commit;
