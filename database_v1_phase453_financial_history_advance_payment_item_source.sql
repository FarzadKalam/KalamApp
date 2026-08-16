-- =====================================================
-- KalamApp - Phase 453 Financial History Advance Payment Item Source
-- Date: 2026-08-17
-- Type: Additive / idempotent migration
-- Goal: نام‌گذاری صحیح خروجی jsonb_array_elements در پرداخت مساعده
-- =====================================================

begin;

-- خروجی پیش‌فرض jsonb_array_elements «value» است. نسخهٔ قدیمی زیرquery آن را
-- با نام item می‌خواند، بدون آن‌که alias داده باشد؛ در نتیجه با وجود alias
-- بیرونی صحیح، خود query با «column item does not exist» خطا می‌داد.
do $$
declare
  v_function_definition text;
  v_legacy_source_pattern text := $pattern$(from[[:space:]]+jsonb_array_elements\(coalesce\(advance\.payments,[[:space:]]*'\[\]'::jsonb\)\)[[:space:]]+with[[:space:]]+ordinality)([[:space:]]+union[[:space:]]+all)$pattern$;
  v_fixed_source text := 'with ordinality payment_source(item, ordinality)';
begin
  if to_regprocedure('public._get_operational_financial_history(uuid,text,uuid)') is null then
    raise exception 'تابع مرکزی گردش مالی برای اصلاح منبع پرداخت مساعده پیدا نشد.';
  end if;

  select pg_get_functiondef('public._get_operational_financial_history(uuid,text,uuid)'::regprocedure)
    into v_function_definition;

  if position(v_fixed_source in v_function_definition) = 0 then
    if v_function_definition !~ v_legacy_source_pattern then
      raise exception 'نسخهٔ تابع مرکزی گردش مالی برای اصلاح منبع پرداخت مساعده شناخته‌شده نیست.';
    end if;

    v_function_definition := regexp_replace(
      v_function_definition,
      v_legacy_source_pattern,
      $replacement$\1 payment_source(item, ordinality)\2$replacement$,
      'g'
    );

    if v_function_definition ~ v_legacy_source_pattern
      or position(v_fixed_source in v_function_definition) = 0 then
      raise exception 'نام‌گذاری منبع پرداخت مساعده در تابع مرکزی انجام نشد.';
    end if;

    execute v_function_definition;
  end if;
end;
$$;

commit;
