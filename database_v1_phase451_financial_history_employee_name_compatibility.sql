-- =====================================================
-- KalamApp - Phase 451 Financial History Employee Name Compatibility
-- Date: 2026-08-16
-- Type: Additive / idempotent migration
-- Goal: حذف ارجاع نسخه‌های قدیمی گردش مالی به employees.name
-- =====================================================

begin;

-- نسخه‌های قدیمی تابع گردش مالی ممکن است پیش از اضافه‌شدن نام کامل کارمند
-- اجرا شده باشند. وجود ستون مقصد را مستقل از ترتیب اجرای migration تضمین می‌کنیم.
alter table if exists public.employees
  add column if not exists full_name text;

-- فقط ارجاع دقیق «employees.name» در تعریف توابع موجود جایگزین می‌شود؛
-- هیچ alias عمومی مانند e.name تغییر نمی‌کند تا ستون name ماژول‌های دیگر
-- (مثل هزینه و فاکتور) به‌اشتباه دست‌کاری نشود.
do $$
declare
  v_procedure regprocedure;
  v_function_definition text;
  v_previous_definition text;
begin
  foreach v_procedure in array array[
    to_regprocedure('public._get_operational_financial_history(uuid,text,uuid)'),
    to_regprocedure('public.get_operational_financial_history(text,uuid)'),
    to_regprocedure('public.get_public_online_account_card(text)')
  ]
  loop
    continue when v_procedure is null;

    select pg_get_functiondef(v_procedure) into v_function_definition;
    v_previous_definition := v_function_definition;

    v_function_definition := regexp_replace(
      v_function_definition,
      '\memployees\M[[:space:]]*\.[[:space:]]*\mname\M',
      'employees.full_name',
      'g'
    );
    v_function_definition := regexp_replace(
      v_function_definition,
      '\memployees\M[[:space:]]*\.[[:space:]]*"name"',
      'employees.full_name',
      'g'
    );

    -- نسخهٔ بسیار قدیمی کارت حساب، جدول کارکنان را بدون alias می‌خواند.
    v_function_definition := replace(
      v_function_definition,
      $old$coalesce(name, first_name || ' ' || last_name, system_code, 'کارمند')$old$,
      $new$coalesce(nullif(btrim(full_name), ''), nullif(btrim(concat_ws(' ', first_name, last_name)), ''), system_code, 'کارمند')$new$
    );

    if v_function_definition is distinct from v_previous_definition then
      execute v_function_definition;
    end if;
  end loop;
end;
$$;

commit;
