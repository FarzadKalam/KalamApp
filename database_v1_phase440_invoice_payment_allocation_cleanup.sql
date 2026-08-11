-- حذف زنجیره‌ای تخصیص‌های دریافت/پرداختی که ردیف مبدا آن‌ها دیگر موثر نیست.
-- این منطق روی هر دو نوع فاکتور اجرا می‌شود تا گردش مالی و مانده‌ها با ردیف‌های واقعی یکسان بمانند.

begin;

create or replace function public.cleanup_stale_invoice_payment_allocations(
  p_module_id text,
  p_source_invoice_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_table_name text;
  v_pending_invoice_ids uuid[] := array[p_source_invoice_id];
  v_affected_invoice_ids uuid[] := '{}'::uuid[];
  v_active_row_keys text[];
  v_current_invoice_id uuid;
  v_target_invoice_id uuid;
  v_pending_index integer := 1;
  v_removed_rows integer := 0;
  v_canceled_operations integer := 0;
  v_updated_count integer := 0;
begin
  if v_org_id is null then
    raise exception 'سازمان فعال مشخص نیست.';
  end if;
  if p_module_id not in ('invoices', 'purchase_invoices') or p_source_invoice_id is null then
    raise exception 'اطلاعات فاکتور برای پاک‌سازی تخصیص معتبر نیست.';
  end if;

  v_table_name := p_module_id;

  -- هر ردیفی که دیگر در فاکتور فعلی نیست یا وضعیت نهایی ندارد، نباید
  -- عملیات نقد و بانک فعال داشته باشد. این حالت حذف مستقیم یک ردیف مقصد را هم پوشش می‌دهد.
  while v_pending_index <= coalesce(array_length(v_pending_invoice_ids, 1), 0) loop
    v_current_invoice_id := v_pending_invoice_ids[v_pending_index];
    v_pending_index := v_pending_index + 1;

    execute format($sql$
      select coalesce(array_agg(distinct candidate.row_key), '{}'::text[])
      from public.%I invoice
      cross join lateral jsonb_array_elements(coalesce(invoice.payments, '[]'::jsonb)) with ordinality as payment(item, ordinality)
      cross join lateral unnest(array[
        nullif(trim(payment.item->>'row_key'), ''),
        nullif(trim(payment.item->>'_cash_bank_operation_id'), ''),
        nullif(trim(payment.item->>'_barter_allocation_key'), ''),
        case
          when nullif(trim(payment.item->>'key'), '') is not null
            then 'key_' || trim(payment.item->>'key')
          else null
        end,
        'legacy_' || (payment.ordinality - 1)::text
      ]) as candidate(row_key)
      where invoice.id = $1
        and invoice.org_id = $2
        and candidate.row_key is not null
        and (
          not (payment.item ? 'status')
          or nullif(trim(payment.item->>'status'), '') is null
          or lower(trim(payment.item->>'status')) in ('received', 'paid', 'approved', 'cleared')
        )
    $sql$, v_table_name) into v_active_row_keys using v_current_invoice_id, v_org_id;
    v_active_row_keys := coalesce(v_active_row_keys, '{}'::text[]);

    execute format($sql$
      update public.cash_bank_operations operation
      set status = 'canceled', updated_at = now()
      where operation.org_id = $1
        and coalesce(operation.status, '') <> 'canceled'
        and operation.metadata->>'is_auto_generated' = 'true'
        and operation.metadata->>'source_table' = $2
        and operation.metadata->>'source_record_id' = $3::text
        and nullif(trim(operation.metadata->>'source_row_key'), '') is not null
        and not (operation.metadata->>'source_row_key' = any($4))
    $sql$, v_table_name) using v_org_id, p_module_id, v_current_invoice_id, v_active_row_keys;
    get diagnostics v_updated_count = row_count;
    v_canceled_operations := v_canceled_operations + v_updated_count;

    -- ردیف‌های تخصیص‌یافته‌ای که ردیف مبداشان حذف یا لغو شده، از فاکتور مقصد پاک می‌شوند.
    -- هر مقصد وارد صف می‌شود تا تخصیص‌های چندمرحله‌ای نیز به شکل زنجیره‌ای پاک‌سازی شوند.
    for v_target_invoice_id in execute format($sql$
      select distinct target.id
      from public.%I target
      cross join lateral jsonb_array_elements(coalesce(target.payments, '[]'::jsonb)) as payment(item)
      where target.org_id = $1
        and target.payments @> jsonb_build_array(jsonb_build_object('allocation_source_invoice_id', $2::text))
        and payment.item->>'allocation_source_invoice_id' = $2::text
        and not (coalesce(payment.item->>'allocation_source_row_key', '') = any($3))
    $sql$, v_table_name) using v_org_id, v_current_invoice_id, v_active_row_keys
    loop
      execute format($sql$
        update public.%I target
        set payments = cleaned.payments
        from lateral (
          select coalesce(
            jsonb_agg(payment.item order by payment.ordinality) filter (
              where not (
                payment.item->>'allocation_source_invoice_id' = $1::text
                and not (coalesce(payment.item->>'allocation_source_row_key', '') = any($2))
              )
            ),
            '[]'::jsonb
          ) as payments
          from jsonb_array_elements(coalesce(target.payments, '[]'::jsonb)) with ordinality as payment(item, ordinality)
        ) cleaned
        where target.id = $3
          and target.org_id = $4
      $sql$, v_table_name) using v_current_invoice_id, v_active_row_keys, v_target_invoice_id, v_org_id;
      get diagnostics v_updated_count = row_count;
      v_removed_rows := v_removed_rows + v_updated_count;

      if not (v_target_invoice_id = any(v_pending_invoice_ids)) then
        v_pending_invoice_ids := array_append(v_pending_invoice_ids, v_target_invoice_id);
      end if;
      if not (v_target_invoice_id = any(v_affected_invoice_ids)) then
        v_affected_invoice_ids := array_append(v_affected_invoice_ids, v_target_invoice_id);
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'affected_invoice_ids', to_jsonb(v_affected_invoice_ids),
    'removed_payment_groups', v_removed_rows,
    'canceled_operations', v_canceled_operations
  );
end;
$$;

create or replace function public.trigger_cleanup_stale_invoice_payment_allocations()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice_id uuid;
begin
  if tg_op = 'DELETE' then
    v_invoice_id := old.id;
  else
    v_invoice_id := new.id;
  end if;
  perform public.cleanup_stale_invoice_payment_allocations(tg_table_name, v_invoice_id);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoices_cleanup_stale_payment_allocations on public.invoices;
create trigger trg_invoices_cleanup_stale_payment_allocations
after update of payments on public.invoices
for each row
execute function public.trigger_cleanup_stale_invoice_payment_allocations();

drop trigger if exists trg_purchase_invoices_cleanup_stale_payment_allocations on public.purchase_invoices;
create trigger trg_purchase_invoices_cleanup_stale_payment_allocations
after update of payments on public.purchase_invoices
for each row
execute function public.trigger_cleanup_stale_invoice_payment_allocations();

drop trigger if exists trg_invoices_delete_cleanup_stale_payment_allocations on public.invoices;
create trigger trg_invoices_delete_cleanup_stale_payment_allocations
after delete on public.invoices
for each row
execute function public.trigger_cleanup_stale_invoice_payment_allocations();

drop trigger if exists trg_purchase_invoices_delete_cleanup_stale_payment_allocations on public.purchase_invoices;
create trigger trg_purchase_invoices_delete_cleanup_stale_payment_allocations
after delete on public.purchase_invoices
for each row
execute function public.trigger_cleanup_stale_invoice_payment_allocations();

create index if not exists idx_invoices_payments_allocation_source
  on public.invoices using gin (payments jsonb_path_ops);
create index if not exists idx_purchase_invoices_payments_allocation_source
  on public.purchase_invoices using gin (payments jsonb_path_ops);

revoke all on function public.cleanup_stale_invoice_payment_allocations(text, uuid) from public;
grant execute on function public.cleanup_stale_invoice_payment_allocations(text, uuid) to authenticated;

commit;
