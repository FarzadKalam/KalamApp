-- =====================================================
-- KalamApp - Phase 538 Financial History Auto Operation Integrity
-- Date: 2026-10-13
-- Type: Additive / idempotent migration
-- Goal: جلوگیری از تکرار عملیات خودکار و مرجع خوانای اسناد مالی
-- =====================================================

begin;

-- مرجع سند باید هم شماره/کد و هم عنوان را داشته باشد. مقدار null به مصرف‌کننده
-- اجازه می‌دهد هنگام نبود هر دو، fallback مناسب خود را انتخاب کند.
create or replace function public.financial_history_document_reference(
  p_system_code text,
  p_title text
)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(concat_ws(
    ' — ',
    nullif(btrim(p_system_code), ''),
    nullif(btrim(p_title), '')
  ), '');
$$;

revoke all on function public.financial_history_document_reference(text, text) from public, anon, authenticated;

-- همهٔ مصرف‌کننده‌های «آمار مالی و سوابق» از همان تابع مرکزی استفاده می‌کنند.
-- تعریف تابع طی migrationهای قبلی تکمیل شده است، پس فقط قطعه‌های شناخته‌شدهٔ
-- نمایش مرجع را به‌صورت کنترل‌شده بازنویسی می‌کنیم.
do $$
declare
  v_function_definition text;
  v_operation_reference_old text := replace(
    $operation_reference$coalesce(
        nullif(btrim(sales.system_code), ''), nullif(btrim(sales.name), ''),
        nullif(btrim(purchase.system_code), ''), nullif(btrim(purchase.name), ''),
        nullif(btrim(expense.system_code), ''), nullif(btrim(expense.name), ''),
        nullif(btrim(advance.system_code), ''), nullif(btrim(advance.name), ''),
        nullif(btrim(payroll.system_code), ''), nullif(btrim(payroll.name), ''), '-'
      )$operation_reference$,
    chr(10),
    chr(13) || chr(10)
  );
  v_invoice_reference_pattern text := $pattern$coalesce\(nullif\(btrim\(i\.system_code\), ''\), nullif\(btrim\(i\.name\), ''\), '[^']*'\)$pattern$;
  v_payroll_reference_pattern text := $pattern$coalesce\(nullif\(btrim\(p\.system_code\), ''\), nullif\(btrim\(p\.name\), ''\), '[^']*'\)$pattern$;
  v_expense_reference_pattern text := $pattern$coalesce\(nullif\(btrim\(e\.system_code\), ''\), nullif\(btrim\(e\.name\), ''\), '[^']*'\)$pattern$;
  v_barter_reference_pattern text := $pattern$coalesce\(nullif\(btrim\(b\.system_code\), ''\), nullif\(btrim\(b\.name\), ''\), '[^']*'\)$pattern$;
  v_advance_reference_pattern text := $pattern$coalesce\(nullif\(btrim\(advance\.system_code\), ''\), nullif\(btrim\(advance\.name\), ''\), '[^']*'\)$pattern$;
  v_helper_call text := 'public.financial_history_document_reference';
begin
  if to_regprocedure('public._get_operational_financial_history(uuid,text,uuid)') is null then
    raise exception 'تابع مرکزی گردش مالی برای اصلاح مرجع اسناد پیدا نشد.';
  end if;

  select pg_get_functiondef('public._get_operational_financial_history(uuid,text,uuid)'::regprocedure)
    into v_function_definition;

  if position(v_helper_call in v_function_definition) = 0 then
    if position(v_operation_reference_old in v_function_definition) = 0
      or v_function_definition !~ v_invoice_reference_pattern
      or v_function_definition !~ v_payroll_reference_pattern
      or v_function_definition !~ v_expense_reference_pattern
      or v_function_definition !~ v_barter_reference_pattern
      or v_function_definition !~ v_advance_reference_pattern then
      raise exception 'نسخهٔ تابع مرکزی گردش مالی برای اصلاح مرجع اسناد شناخته‌شده نیست.';
    end if;

    v_function_definition := replace(
      v_function_definition,
      v_operation_reference_old,
      $replacement$coalesce(
        public.financial_history_document_reference(sales.system_code, sales.name),
        public.financial_history_document_reference(purchase.system_code, purchase.name),
        public.financial_history_document_reference(expense.system_code, expense.name),
        public.financial_history_document_reference(advance.system_code, advance.name),
        public.financial_history_document_reference(payroll.system_code, payroll.name),
        '-'
      )$replacement$
    );
    v_function_definition := regexp_replace(
      v_function_definition,
      v_invoice_reference_pattern,
      $replacement$coalesce(public.financial_history_document_reference(i.system_code, i.name), 'بدون عنوان')$replacement$,
      'g'
    );
    v_function_definition := regexp_replace(
      v_function_definition,
      v_payroll_reference_pattern,
      $replacement$coalesce(public.financial_history_document_reference(p.system_code, p.name), 'بدون عنوان')$replacement$,
      'g'
    );
    v_function_definition := regexp_replace(
      v_function_definition,
      v_expense_reference_pattern,
      $replacement$coalesce(public.financial_history_document_reference(e.system_code, e.name), 'بدون عنوان')$replacement$,
      'g'
    );
    v_function_definition := regexp_replace(
      v_function_definition,
      v_barter_reference_pattern,
      $replacement$coalesce(public.financial_history_document_reference(b.system_code, b.name), 'بدون عنوان')$replacement$,
      'g'
    );
    v_function_definition := regexp_replace(
      v_function_definition,
      v_advance_reference_pattern,
      $replacement$coalesce(public.financial_history_document_reference(advance.system_code, advance.name), 'بدون عنوان')$replacement$,
      'g'
    );

    if position(v_operation_reference_old in v_function_definition) > 0
      or v_function_definition ~ v_invoice_reference_pattern
      or v_function_definition ~ v_payroll_reference_pattern
      or v_function_definition ~ v_expense_reference_pattern
      or v_function_definition ~ v_barter_reference_pattern
      or v_function_definition ~ v_advance_reference_pattern
      or (
        length(v_function_definition) - length(replace(v_function_definition, v_helper_call, ''))
      ) / length(v_helper_call) <> 15 then
      raise exception 'جایگزینی مرجع خوانای اسناد در تابع مرکزی کامل نشد.';
    end if;

    execute v_function_definition;
  end if;
end;
$$;

-- عملیات خودکار در نسخه‌های قدیمی می‌توانستند در دو اجرای نزدیک هم‌زمان ساخته
-- شوند. رکورد اضافه حذف نمی‌شود؛ لغو می‌شود تا رد حسابرسی باقی بماند. رکوردی
-- که قبلاً از ردیف پرداخت به آن لینک شده در اولویت نگه‌داری است، سپس قدیمی‌ترین
-- رکورد همان کلید منبع نگه داشته می‌شود.
do $$
declare
  v_remaining_duplicates integer;
begin
  with payment_operation_references as (
    select i.org_id, nullif(p.item ->> '_cash_bank_operation_id', '') as operation_id
    from public.invoices i
    cross join lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) p(item)
    union all
    select i.org_id, nullif(p.item ->> '_cash_bank_operation_id', '')
    from public.purchase_invoices i
    cross join lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) p(item)
    union all
    select e.org_id, nullif(p.item ->> '_cash_bank_operation_id', '')
    from public.expense_documents e
    cross join lateral jsonb_array_elements(coalesce(e.payments, '[]'::jsonb)) p(item)
    union all
    select a.org_id, nullif(p.item ->> '_cash_bank_operation_id', '')
    from public.employee_advances a
    cross join lateral jsonb_array_elements(coalesce(a.payments, '[]'::jsonb)) p(item)
    union all
    select p.org_id, nullif(row.item ->> '_cash_bank_operation_id', '')
    from public.payroll_slips p
    cross join lateral jsonb_array_elements(coalesce(p.payments, '[]'::jsonb)) row(item)
  ), ranked_duplicate_operations as (
    select
      operation.id,
      row_number() over (
        partition by
          operation.org_id,
          operation.metadata ->> 'source_table',
          operation.metadata ->> 'source_record_id',
          operation.metadata ->> 'source_row_key'
        order by
          case when reference.operation_id is not null then 0 else 1 end,
          operation.created_at,
          operation.id
      ) as row_number
    from public.cash_bank_operations operation
    left join payment_operation_references reference
      on reference.org_id = operation.org_id
      and reference.operation_id = operation.id::text
    where operation.metadata ->> 'is_auto_generated' = 'true'
      and nullif(btrim(operation.metadata ->> 'source_table'), '') is not null
      and nullif(btrim(operation.metadata ->> 'source_record_id'), '') is not null
      and nullif(btrim(operation.metadata ->> 'source_row_key'), '') is not null
      and lower(coalesce(operation.status, '')) <> 'canceled'
  )
  update public.cash_bank_operations operation
  set
    status = 'canceled',
    metadata = coalesce(operation.metadata, '{}'::jsonb) || jsonb_build_object(
      'deduplicated_at', now(),
      'deduplication_reason', 'duplicate_auto_generated_source_row',
      'deduplicated_by_system', true
    ),
    updated_at = now()
  from ranked_duplicate_operations duplicate_operation
  where operation.id = duplicate_operation.id
    and duplicate_operation.row_number > 1;

  select count(*)
    into v_remaining_duplicates
  from (
    select 1
    from public.cash_bank_operations operation
    where operation.metadata ->> 'is_auto_generated' = 'true'
      and nullif(btrim(operation.metadata ->> 'source_table'), '') is not null
      and nullif(btrim(operation.metadata ->> 'source_record_id'), '') is not null
      and nullif(btrim(operation.metadata ->> 'source_row_key'), '') is not null
      and lower(coalesce(operation.status, '')) <> 'canceled'
    group by
      operation.org_id,
      operation.metadata ->> 'source_table',
      operation.metadata ->> 'source_record_id',
      operation.metadata ->> 'source_row_key'
    having count(*) > 1
  ) remaining;

  if v_remaining_duplicates <> 0 then
    raise exception 'لغو عملیات خودکار تکراری کامل نشد.';
  end if;
end;
$$;

-- لایهٔ نهایی idempotency: حتی اگر دو درخواست هم‌زمان از دو مرورگر برسند،
-- در هر سازمان فقط یک عملیات فعال برای هر ردیف منبع خودکار می‌تواند وجود داشته باشد.
create unique index if not exists ux_cash_bank_operations_active_auto_source_row
  on public.cash_bank_operations (
    org_id,
    (metadata ->> 'source_table'),
    (metadata ->> 'source_record_id'),
    (metadata ->> 'source_row_key')
  )
  where metadata ->> 'is_auto_generated' = 'true'
    and nullif(btrim(metadata ->> 'source_table'), '') is not null
    and nullif(btrim(metadata ->> 'source_record_id'), '') is not null
    and nullif(btrim(metadata ->> 'source_row_key'), '') is not null
    and lower(coalesce(status, '')) <> 'canceled';

commit;
