-- =====================================================
-- KalamApp - Phase 483 Atomic Commission Calculation Void
-- Date: 2026-08-29
-- Type: Additive / idempotent migration
-- هدف:
--   1) حذف اتمی محاسبه پورسانت و آزادسازی اقلام مصرف‌شده همان محاسبه
--   2) بازیابی اقلامی که محاسبه‌شان void شده ولی به‌اشتباه posted مانده‌اند
-- =====================================================

begin;

create or replace function public.void_commission_calculation(
  p_ledger_entry_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_ledger_ids uuid[] := array[]::uuid[];
  v_source_keys text[] := array[]::text[];
  v_scope_token uuid := gen_random_uuid();
  v_requested_count integer := 0;
  v_verified_count integer := 0;
  v_released_count integer := 0;
begin
  if v_org_id is null then
    raise exception 'organization_context_required';
  end if;
  if not public.current_user_has_role_permission_entry('payroll_slips', 'edit', null, true) then
    raise exception 'commission_calculation_delete_not_allowed';
  end if;

  select coalesce(array_agg(distinct item), array[]::uuid[])
  into v_ledger_ids
  from unnest(coalesce(p_ledger_entry_ids, array[]::uuid[])) item
  where item is not null;

  v_requested_count := coalesce(cardinality(v_ledger_ids), 0);
  if v_requested_count = 0 then
    raise exception 'commission_calculation_not_found';
  end if;

  perform 1
  from public.payroll_calculation_entries entry
  where entry.org_id = v_org_id
    and entry.id = any(v_ledger_ids)
  for update;

  select count(*)
  into v_verified_count
  from public.payroll_calculation_entries entry
  where entry.org_id = v_org_id
    and entry.id = any(v_ledger_ids)
    and entry.source_type = 'commission'
    and (
      (
        entry.status in ('draft', 'proposed')
        and entry.payroll_slip_id is null
      )
      or (
        entry.status = 'included_in_payroll'
        and not exists (
          select 1
          from public.payroll_slips slip
          where slip.id = entry.payroll_slip_id
            and slip.org_id = entry.org_id
            and coalesce(slip.status, 'draft') <> 'canceled'
        )
      )
    );

  if v_verified_count <> v_requested_count then
    raise exception 'commission_calculation_cannot_be_deleted';
  end if;

  -- اگر فیش حذف یا لغو شده باشد، entry قدیمی ممکن است هنوز included مانده
  -- باشد. همان entry در همین تراکنش مستقیماً void می‌شود؛ وجود فیش فعال در
  -- شرط بالا fail-closed است و حذف پورسانت را متوقف می‌کند.

  -- فقط قلم‌هایی آزاد می‌شوند که مبلغ مثبت همین محاسبه را ساخته‌اند؛ تصمیم‌های
  -- دستی یا اقلام انتخاب‌نشده‌ای که صرفاً در snapshot آمده‌اند تغییر نمی‌کنند.
  select coalesce(array_agg(distinct source.source_key), array[]::text[])
  into v_source_keys
  from public.payroll_calculation_entries entry
  cross join lateral (
    select nullif(trim(line.value ->> 'source_key'), '') source_key
    from jsonb_array_elements(
      case when jsonb_typeof(entry.details -> 'rows') = 'array'
        then entry.details -> 'rows' else '[]'::jsonb end
    ) invoice_row(value)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(invoice_row.value -> 'lines') = 'array'
        then invoice_row.value -> 'lines' else '[]'::jsonb end
    ) line(value)
    where case
      when coalesce(line.value ->> 'commission_amount', line.value ->> 'selected_amount', '')
        ~ '^[0-9]+([.][0-9]+)?$'
      then coalesce(line.value ->> 'commission_amount', line.value ->> 'selected_amount')::numeric > 0
      else false
    end

    union

    select nullif(trim(line.value ->> 'source_key'), '') source_key
    from jsonb_array_elements(
      case when jsonb_typeof(entry.details -> 'lines') = 'array'
        then entry.details -> 'lines' else '[]'::jsonb end
    ) line(value)
    where case
      when coalesce(line.value ->> 'commission_amount', line.value ->> 'selected_amount', '')
        ~ '^[0-9]+([.][0-9]+)?$'
      then coalesce(line.value ->> 'commission_amount', line.value ->> 'selected_amount')::numeric > 0
      else false
    end
  ) source
  where entry.org_id = v_org_id
    and entry.id = any(v_ledger_ids)
    and source.source_key is not null;

  insert into public.payroll_source_mutation_scopes(scope_token, org_id, table_name, record_id)
  select v_scope_token, v_org_id, 'payroll_calculation_entries', item
  from unnest(v_ledger_ids) item
  union all
  select v_scope_token, v_org_id, 'commission_drafts', draft.id
  from public.commission_drafts draft
  where draft.org_id = v_org_id
    and draft.source_key = any(v_source_keys)
  on conflict do nothing;

  update public.commission_drafts draft
  set posted_amount = 0,
      remaining_amount = greatest(0, draft.entitled_amount),
      draft_status = 'draft',
      updated_at = now(),
      updated_by = auth.uid()
  where draft.org_id = v_org_id
    and draft.source_key = any(v_source_keys);
  get diagnostics v_released_count = row_count;

  update public.payroll_calculation_entries entry
  set status = 'voided',
      updated_at = now(),
      updated_by = auth.uid()
  where entry.org_id = v_org_id
    and entry.id = any(v_ledger_ids);

  delete from public.payroll_source_mutation_scopes
  where scope_token = v_scope_token;

  return jsonb_build_object(
    'voided_calculations', v_verified_count,
    'released_commission_items', v_released_count
  );
end;
$$;

revoke all on function public.void_commission_calculation(uuid[])
  from public, anon;
grant execute on function public.void_commission_calculation(uuid[])
  to authenticated;

-- بازیابی کنترل‌شده: فقط draftهای دارای مبلغ مصرف‌شده که مرجعشان void شده و
-- هیچ محاسبه فعال دیگری به همان source_key متصل نیست آزاد می‌شوند.
do $$
declare
  v_scope_token uuid := gen_random_uuid();
begin
  insert into public.payroll_source_mutation_scopes(scope_token, org_id, table_name, record_id)
  select distinct v_scope_token, draft.org_id, 'commission_drafts', draft.id
  from public.commission_drafts draft
  where draft.posted_amount > 0
    and (
      exists (
        select 1
        from public.payroll_calculation_entries entry
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(entry.details -> 'rows') = 'array'
            then entry.details -> 'rows' else '[]'::jsonb end
        ) invoice_row(value)
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(invoice_row.value -> 'lines') = 'array'
            then invoice_row.value -> 'lines' else '[]'::jsonb end
        ) line(value)
        where entry.org_id = draft.org_id
          and entry.employee_id = draft.employee_id
          and entry.source_type = 'commission'
          and entry.status = 'voided'
          and nullif(trim(line.value ->> 'source_key'), '') = draft.source_key
      )
      or exists (
        select 1
        from public.payroll_calculation_entries entry
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(entry.details -> 'lines') = 'array'
            then entry.details -> 'lines' else '[]'::jsonb end
        ) line(value)
        where entry.org_id = draft.org_id
          and entry.employee_id = draft.employee_id
          and entry.source_type = 'commission'
          and entry.status = 'voided'
          and nullif(trim(line.value ->> 'source_key'), '') = draft.source_key
      )
    )
    and not exists (
      select 1
      from public.payroll_calculation_entries active_entry
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(active_entry.details -> 'rows') = 'array'
          then active_entry.details -> 'rows' else '[]'::jsonb end
      ) active_invoice_row(value)
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(active_invoice_row.value -> 'lines') = 'array'
          then active_invoice_row.value -> 'lines' else '[]'::jsonb end
      ) active_line(value)
      where active_entry.org_id = draft.org_id
        and active_entry.employee_id = draft.employee_id
        and active_entry.source_type = 'commission'
        and active_entry.status <> 'voided'
        and nullif(trim(active_line.value ->> 'source_key'), '') = draft.source_key
    )
    and not exists (
      select 1
      from public.payroll_calculation_entries active_entry
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(active_entry.details -> 'lines') = 'array'
          then active_entry.details -> 'lines' else '[]'::jsonb end
      ) active_line(value)
      where active_entry.org_id = draft.org_id
        and active_entry.employee_id = draft.employee_id
        and active_entry.source_type = 'commission'
        and active_entry.status <> 'voided'
        and nullif(trim(active_line.value ->> 'source_key'), '') = draft.source_key
    )
  on conflict do nothing;

  update public.commission_drafts draft
  set posted_amount = 0,
      remaining_amount = greatest(0, draft.entitled_amount),
      draft_status = 'draft',
      updated_at = now()
  where exists (
    select 1
    from public.payroll_source_mutation_scopes scope
    where scope.scope_token = v_scope_token
      and scope.org_id = draft.org_id
      and scope.table_name = 'commission_drafts'
      and scope.record_id = draft.id
  );

  delete from public.payroll_source_mutation_scopes
  where scope_token = v_scope_token;
end;
$$;

notify pgrst, 'reload schema';

commit;
