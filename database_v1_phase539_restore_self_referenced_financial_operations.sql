-- =====================================================
-- KalamApp - Phase 539 Restore Self-referenced Operations
-- Date: 2026-10-13
-- Type: Corrective / idempotent migration
-- Goal: بازگردانی عملیات سالمی که فقط به‌علت تکرار همان شناسه در ردیف پرداخت لغو شده‌اند
-- =====================================================

begin;

-- در داده‌های قدیمی ممکن است یک ردیف پرداخت عیناً دو بار در JSON ذخیره شده باشد
-- و هر دو به یک عملیات نقد و بانک اشاره کنند. این یک عملیات تکراری نیست؛ در
-- پاک‌سازی اولیه، join روی آن می‌توانست همان عملیات را دو بار رتبه‌بندی کند.
-- فقط وقتی هیچ عملیات فعال هم‌کلیدی وجود ندارد و یک شناسهٔ عملیات بیش از یک‌بار
-- در خود پرداخت‌های منبع تکرار شده، عملیات سالم به وضعیت اصلی پرداخت برمی‌گردد.
do $$
declare
  v_restored_count integer;
begin
  with payment_operation_references as (
    select i.org_id,
      nullif(p.item ->> '_cash_bank_operation_id', '') as operation_id,
      lower(coalesce(nullif(p.item ->> 'status', ''), 'received')) as payment_status
    from public.invoices i
    cross join lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) p(item)
    union all
    select i.org_id,
      nullif(p.item ->> '_cash_bank_operation_id', ''),
      lower(coalesce(nullif(p.item ->> 'status', ''), 'received'))
    from public.purchase_invoices i
    cross join lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) p(item)
    union all
    select e.org_id,
      nullif(p.item ->> '_cash_bank_operation_id', ''),
      lower(coalesce(nullif(p.item ->> 'status', ''), 'received'))
    from public.expense_documents e
    cross join lateral jsonb_array_elements(coalesce(e.payments, '[]'::jsonb)) p(item)
    union all
    select a.org_id,
      nullif(p.item ->> '_cash_bank_operation_id', ''),
      lower(coalesce(nullif(p.item ->> 'status', ''), 'received'))
    from public.employee_advances a
    cross join lateral jsonb_array_elements(coalesce(a.payments, '[]'::jsonb)) p(item)
    union all
    select p.org_id,
      nullif(row.item ->> '_cash_bank_operation_id', ''),
      lower(coalesce(nullif(row.item ->> 'status', ''), 'received'))
    from public.payroll_slips p
    cross join lateral jsonb_array_elements(coalesce(p.payments, '[]'::jsonb)) row(item)
  ), self_referenced_operations as (
    select reference.org_id,
      reference.operation_id,
      case
        when bool_or(reference.payment_status = 'approved') then 'approved'
        when bool_or(reference.payment_status = 'paid') then 'paid'
        when bool_or(reference.payment_status = 'settled') then 'settled'
        when bool_or(reference.payment_status = 'cleared') then 'cleared'
        else 'received'
      end as restored_status
    from payment_operation_references reference
    where reference.operation_id is not null
    group by reference.org_id, reference.operation_id
    having count(*) > 1
  ), restorable_operations as (
    select operation.id, self_reference.restored_status
    from public.cash_bank_operations operation
    join self_referenced_operations self_reference
      on self_reference.org_id = operation.org_id
      and self_reference.operation_id = operation.id::text
    where operation.metadata ->> 'deduplication_reason' = 'duplicate_auto_generated_source_row'
      and lower(coalesce(operation.status, '')) = 'canceled'
      and not exists (
        select 1
        from public.cash_bank_operations active_operation
        where active_operation.org_id = operation.org_id
          and active_operation.id <> operation.id
          and active_operation.metadata ->> 'source_table' = operation.metadata ->> 'source_table'
          and active_operation.metadata ->> 'source_record_id' = operation.metadata ->> 'source_record_id'
          and active_operation.metadata ->> 'source_row_key' = operation.metadata ->> 'source_row_key'
          and lower(coalesce(active_operation.status, '')) <> 'canceled'
      )
  )
  update public.cash_bank_operations operation
  set
    status = restorable.restored_status,
    metadata = coalesce(operation.metadata, '{}'::jsonb)
      - 'deduplicated_at'
      - 'deduplication_reason'
      - 'deduplicated_by_system',
    updated_at = now()
  from restorable_operations restorable
  where operation.id = restorable.id;

  get diagnostics v_restored_count = row_count;
  raise notice 'Restored % self-referenced financial operation(s).', v_restored_count;
end;
$$;

commit;
