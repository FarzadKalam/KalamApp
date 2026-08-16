-- =====================================================
-- KalamApp - Phase 449 Financial History Cheque Status Source
-- Date: 2026-08-16
-- Type: Additive / idempotent migration
-- Goal: خواندن وضعیت چک از رکورد اصلی چک، بدون نگهداری ستون تکراری
-- =====================================================

begin;

-- وضعیت قطعی چک روی جدول cheques نگهداری می‌شود. عملیات نقد و بانک تنها
-- cheque_id را نگه می‌دارد؛ بنابراین تکرار cheque_status در آن جدول می‌تواند
-- باعث اختلاف گردش مالی با وضعیت واقعی چک شود.
alter table if exists public.cheques
  add column if not exists status text not null default 'new';

alter table if exists public.cash_bank_operations
  add column if not exists cheque_id uuid references public.cheques(id) on delete set null;

create index if not exists idx_cash_bank_operations_org_cheque
  on public.cash_bank_operations(org_id, cheque_id)
  where cheque_id is not null;

do $$
declare
  v_function_definition text;
begin
  if to_regprocedure('public._get_operational_financial_history(uuid,text,uuid)') is null then
    raise exception 'تابع مرکزی گردش مالی برای اصلاح وضعیت چک پیدا نشد.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cash_bank_operations'
      and column_name = 'cheque_id'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cheques'
      and column_name = 'status'
  ) then
    raise exception 'ستون‌های مرجع چک برای اصلاح گردش مالی کامل نیستند.';
  end if;

  select pg_get_functiondef('public._get_operational_financial_history(uuid,text,uuid)'::regprocedure)
    into v_function_definition;

  -- اجرای دوبارهٔ migration هیچ تغییری نمی‌دهد، اما نسخهٔ ناشناختهٔ تابع را
  -- نیز بی‌صدا بازنویسی نمی‌کنیم.
  if position('operation.cheque_status' in v_function_definition) = 0 then
    if position('left join public.cheques cheque' in v_function_definition) > 0
      and position('cheque.status' in v_function_definition) > 0 then
      return;
    end if;
    raise exception 'نسخهٔ تابع مرکزی گردش مالی برای اصلاح وضعیت چک شناخته‌شده نیست.';
  end if;

  v_function_definition := replace(
    v_function_definition,
    $old$coalesce(operation.payment_type, ''), coalesce(operation.status, ''), coalesce(operation.cheque_status, ''), operation.operation_date,$old$,
    $new$coalesce(operation.payment_type, ''), coalesce(operation.status, ''), coalesce(cheque.status, ''), operation.operation_date,$new$
  );
  v_function_definition := replace(
    v_function_definition,
    $old$left join public.payroll_slips payroll on payroll.id = operation.payroll_slip_id and payroll.org_id = p_org_id$old$,
    $new$left join public.payroll_slips payroll on payroll.id = operation.payroll_slip_id and payroll.org_id = p_org_id
    left join public.cheques cheque on cheque.id = operation.cheque_id and cheque.org_id = p_org_id$new$
  );
  v_function_definition := replace(
    v_function_definition,
    $old$and not (lower(coalesce(operation.payment_type, '')) = 'cheque' and lower(coalesce(operation.cheque_status, '')) in ('bounced', 'returned'))$old$,
    $new$and not (lower(coalesce(operation.payment_type, '')) = 'cheque' and lower(coalesce(cheque.status, '')) in ('bounced', 'returned'))$new$
  );

  if position('operation.cheque_status' in v_function_definition) > 0
    or position('left join public.cheques cheque' in v_function_definition) = 0
    or position('cheque.status' in v_function_definition) = 0 then
    raise exception 'جایگزینی امن وضعیت چک در تابع مرکزی گردش مالی انجام نشد.';
  end if;

  execute v_function_definition;
end;
$$;

commit;
