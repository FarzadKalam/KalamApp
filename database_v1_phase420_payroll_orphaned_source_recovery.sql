-- =====================================================
-- KalamApp - Phase 420 Payroll Orphaned Source Recovery
-- Date: 2026-07-29
-- Type: Additive / idempotent migration
-- Goal: recover payroll sources left linked to a deleted slip and preserve one-time advance deductions
-- =====================================================

begin;

-- «لحاظ‌شده در فیش» فقط وقتی معتبر است که خود فیش هنوز وجود داشته باشد.
-- این تابع برای داده‌های قدیمی و حذف‌های پیش از triggerهای آزادسازی، اتصال‌های
-- یتیم را آزاد می‌کند. از آن‌جا که فقط اتصال سیستمی منابع تغییر می‌کند، قفل
-- ویرایش عادی رکوردها همچنان برقرار می‌ماند.
create or replace function public.release_orphaned_payroll_sources(
  p_org_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null then
    return;
  end if;

  perform set_config('app.payroll_source_sync', 'active', true);

  -- ابتدا پیش‌نویس‌های پورسانت را آزاد می‌کنیم تا محاسبهٔ همان ماه بتواند
  -- دوباره با همان کلید منبع ذخیره شود.
  with orphaned_commission_entries as (
    select entry.*
    from public.payroll_calculation_entries entry
    left join public.payroll_slips slip
      on slip.id = entry.payroll_slip_id
     and slip.org_id = entry.org_id
    where entry.org_id = p_org_id
      and entry.source_type = 'commission'
      and entry.status = 'included_in_payroll'
      and slip.id is null
  ), orphaned_commission_keys as (
    select distinct nullif(trim(payroll_line.value->>'source_key'), '') as source_key
    from orphaned_commission_entries entry
    cross join lateral jsonb_array_elements(coalesce(entry.details->'rows', '[]'::jsonb)) as invoice_row(value)
    cross join lateral jsonb_array_elements(coalesce(invoice_row.value->'lines', '[]'::jsonb)) as payroll_line(value)
  ), orphaned_commission_scopes as (
    select distinct
      entry.employee_id,
      entry.period_start,
      entry.period_end,
      nullif(trim(entry.details->>'basis'), '') as source_basis,
      nullif(trim(entry.details->>'percent_mode'), '') as percent_mode
    from orphaned_commission_entries entry
  )
  update public.commission_drafts draft
  set
    posted_amount = 0,
    remaining_amount = greatest(0, coalesce(draft.entitled_amount, 0)),
    draft_status = 'draft',
    updated_at = now()
  where draft.org_id = p_org_id
    and (
      draft.source_key in (select source_key from orphaned_commission_keys where source_key is not null)
      or exists (
        select 1
        from orphaned_commission_scopes scope
        where scope.employee_id = draft.employee_id
          and scope.period_start = draft.period_start
          and scope.period_end = draft.period_end
          and scope.source_basis is not distinct from draft.source_basis
          and scope.percent_mode is not distinct from draft.percent_mode
      )
    );

  -- همهٔ اقلام محاسباتیِ وصل به فیش حذف‌شده، دوباره قابل انتخاب می‌شوند.
  update public.payroll_calculation_entries entry
  set
    status = 'draft',
    payroll_slip_id = null,
    updated_at = now()
  where entry.org_id = p_org_id
    and entry.status = 'included_in_payroll'
    and not exists (
      select 1
      from public.payroll_slips slip
      where slip.id = entry.payroll_slip_id
        and slip.org_id = entry.org_id
    );

  -- پاداش، جریمه و مساعده فقط تا وقتی فیش مرجع موجود است، مصرف‌شده محسوب می‌شوند.
  update public.employee_bonus_requests request
  set related_payroll_slip_id = null, updated_at = now()
  where request.org_id = p_org_id
    and request.related_payroll_slip_id is not null
    and not exists (
      select 1 from public.payroll_slips slip
      where slip.id = request.related_payroll_slip_id
        and slip.org_id = request.org_id
    );

  update public.employee_penalty_requests request
  set related_payroll_slip_id = null, updated_at = now()
  where request.org_id = p_org_id
    and request.related_payroll_slip_id is not null
    and not exists (
      select 1 from public.payroll_slips slip
      where slip.id = request.related_payroll_slip_id
        and slip.org_id = request.org_id
    );

  update public.employee_advances advance
  set related_payroll_slip_id = null, updated_at = now()
  where advance.org_id = p_org_id
    and advance.related_payroll_slip_id is not null
    and not exists (
      select 1 from public.payroll_slips slip
      where slip.id = advance.related_payroll_slip_id
        and slip.org_id = advance.org_id
    );
end;
$$;

revoke all on function public.release_orphaned_payroll_sources(uuid) from public, anon, authenticated;

-- یک‌بار تمام سازمان‌ها ترمیم می‌شوند تا فیش‌ها و پورسانت‌های قبلی هم بدون
-- نیاز به باز کردن رکورد قدیمی دوباره قابل ایجاد باشند.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in
    select distinct org_id
    from (
      select org_id from public.payroll_calculation_entries where status = 'included_in_payroll'
      union
      select org_id from public.employee_bonus_requests where related_payroll_slip_id is not null
      union
      select org_id from public.employee_penalty_requests where related_payroll_slip_id is not null
      union
      select org_id from public.employee_advances where related_payroll_slip_id is not null
    ) as payroll_source_orgs
    where org_id is not null
  loop
    perform public.release_orphaned_payroll_sources(v_org_id);
  end loop;
end;
$$;

-- پیش از ذخیرهٔ پورسانت، اتصال یتیم همان سازمان را پاکسازی می‌کنیم. بنابراین
-- فقط پورسانتی که واقعاً در یک فیش موجود است، دوباره‌ثبت شدن را متوقف می‌کند.
create or replace function public.save_commission_calculation(
  p_ledger_payload jsonb,
  p_draft_payloads jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_employee_id uuid := nullif(trim(p_ledger_payload->>'employee_id'), '')::uuid;
  v_period_start date := nullif(trim(p_ledger_payload->>'period_start'), '')::date;
  v_period_end date := nullif(trim(p_ledger_payload->>'period_end'), '')::date;
  v_source_key text := nullif(trim(p_ledger_payload->>'source_key'), '');
  v_basis text := nullif(trim(p_ledger_payload->'details'->>'basis'), '');
  v_percent_mode text := nullif(trim(p_ledger_payload->'details'->>'percent_mode'), '');
  v_ledger_id uuid;
  v_draft jsonb;
  v_draft_employee_id uuid;
  v_draft_invoice_id uuid;
begin
  if v_org_id is null then
    raise exception 'organization_context_required';
  end if;
  if not public.current_user_has_role_permission_entry('payroll_slips', 'edit', null, true) then
    raise exception 'commission_calculation_not_allowed';
  end if;
  if v_employee_id is null or v_period_start is null or v_period_end is null
    or v_period_end < v_period_start or v_source_key is null or v_basis is null or v_percent_mode is null then
    raise exception 'invalid_commission_payload';
  end if;
  if jsonb_typeof(coalesce(p_draft_payloads, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_commission_drafts_payload';
  end if;
  if not exists (
    select 1 from public.employees
    where id = v_employee_id and org_id = v_org_id
  ) then
    raise exception 'commission_employee_not_found';
  end if;

  perform public.release_orphaned_payroll_sources(v_org_id);

  -- محاسبهٔ یک کارمند و یک دوره به‌صورت ترتیبی انجام می‌شود تا دو مرورگر
  -- نتوانند هم‌زمان ماندهٔ یک قلم را ثبت کنند.
  perform pg_advisory_xact_lock(hashtext('commission:' || v_source_key));

  for v_draft in select value from jsonb_array_elements(p_draft_payloads) as item(value) loop
    v_draft_employee_id := nullif(trim(v_draft->>'employee_id'), '')::uuid;
    v_draft_invoice_id := nullif(trim(v_draft->>'invoice_id'), '')::uuid;
    if v_draft_employee_id is distinct from v_employee_id
      or nullif(trim(v_draft->>'source_key'), '') is null
      or nullif(trim(v_draft->>'source_basis'), '') is distinct from v_basis
      or nullif(trim(v_draft->>'percent_mode'), '') is distinct from v_percent_mode then
      raise exception 'invalid_commission_draft_scope';
    end if;
    if not exists (
      select 1 from public.invoices
      where id = v_draft_invoice_id and org_id = v_org_id
    ) then
      raise exception 'commission_invoice_not_found';
    end if;

    insert into public.commission_drafts (
      org_id, source_key, employee_id, assignee_id, period_start, period_end,
      source_basis, percent_mode, eligibility_event_type, eligibility_event_at,
      invoice_id, invoice_item_key, entitled_amount, posted_amount, remaining_amount,
      decision_status, decision_reason, deferred_from_period, deferred_to_period,
      manual_decision_by, manual_decision_at, draft_status, details, updated_at
    ) values (
      v_org_id,
      v_draft->>'source_key',
      v_draft_employee_id,
      nullif(trim(v_draft->>'assignee_id'), '')::uuid,
      nullif(trim(v_draft->>'period_start'), '')::date,
      nullif(trim(v_draft->>'period_end'), '')::date,
      v_draft->>'source_basis',
      v_draft->>'percent_mode',
      nullif(trim(v_draft->>'eligibility_event_type'), ''),
      nullif(trim(v_draft->>'eligibility_event_at'), '')::timestamptz,
      v_draft_invoice_id,
      nullif(trim(v_draft->>'invoice_item_key'), ''),
      coalesce((v_draft->>'entitled_amount')::numeric, 0),
      coalesce((v_draft->>'posted_amount')::numeric, 0),
      coalesce((v_draft->>'remaining_amount')::numeric, 0),
      coalesce(nullif(trim(v_draft->>'decision_status'), ''), 'auto'),
      nullif(v_draft->>'decision_reason', ''),
      nullif(trim(v_draft->>'deferred_from_period'), '')::date,
      nullif(trim(v_draft->>'deferred_to_period'), '')::date,
      nullif(trim(v_draft->>'manual_decision_by'), '')::uuid,
      nullif(trim(v_draft->>'manual_decision_at'), '')::timestamptz,
      coalesce(nullif(trim(v_draft->>'draft_status'), ''), 'draft'),
      coalesce(v_draft->'details', '{}'::jsonb),
      now()
    )
    on conflict (source_key) where source_key is not null do update
    set
      employee_id = excluded.employee_id,
      assignee_id = excluded.assignee_id,
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      source_basis = excluded.source_basis,
      percent_mode = excluded.percent_mode,
      eligibility_event_type = excluded.eligibility_event_type,
      eligibility_event_at = excluded.eligibility_event_at,
      invoice_id = excluded.invoice_id,
      invoice_item_key = excluded.invoice_item_key,
      entitled_amount = excluded.entitled_amount,
      posted_amount = excluded.posted_amount,
      remaining_amount = excluded.remaining_amount,
      decision_status = excluded.decision_status,
      decision_reason = excluded.decision_reason,
      deferred_from_period = excluded.deferred_from_period,
      deferred_to_period = excluded.deferred_to_period,
      manual_decision_by = excluded.manual_decision_by,
      manual_decision_at = excluded.manual_decision_at,
      draft_status = excluded.draft_status,
      details = excluded.details,
      updated_at = now()
    where public.commission_drafts.org_id = v_org_id;
  end loop;

  select id into v_ledger_id
  from public.payroll_calculation_entries
  where org_id = v_org_id
    and source_type = 'commission'
    and source_key = v_source_key
    and status <> 'voided'
  for update;

  if v_ledger_id is not null then
    if exists (
      select 1 from public.payroll_calculation_entries
      where id = v_ledger_id and status = 'included_in_payroll'
    ) then
      raise exception 'commission_already_in_payroll';
    end if;
    update public.payroll_calculation_entries
    set
      entry_type = coalesce(nullif(trim(p_ledger_payload->>'entry_type'), ''), entry_type),
      source_module_id = nullif(trim(p_ledger_payload->>'source_module_id'), ''),
      source_record_id = nullif(trim(p_ledger_payload->>'source_record_id'), '')::uuid,
      title = coalesce(p_ledger_payload->>'title', ''),
      amount = coalesce((p_ledger_payload->>'amount')::numeric, 0),
      quantity = nullif(trim(p_ledger_payload->>'quantity'), '')::numeric,
      rate = nullif(trim(p_ledger_payload->>'rate'), '')::numeric,
      status = coalesce(nullif(trim(p_ledger_payload->>'status'), ''), 'draft'),
      assignee_id = nullif(trim(p_ledger_payload->>'assignee_id'), '')::uuid,
      details = coalesce(p_ledger_payload->'details', '{}'::jsonb),
      updated_at = now()
    where id = v_ledger_id and org_id = v_org_id;
  else
    insert into public.payroll_calculation_entries (
      org_id, employee_id, period_start, period_end, entry_type, source_type,
      source_key, source_module_id, source_record_id, title, amount, quantity,
      rate, status, assignee_id, details
    ) values (
      v_org_id, v_employee_id, v_period_start, v_period_end,
      coalesce(nullif(trim(p_ledger_payload->>'entry_type'), ''), 'commission_calculation'),
      'commission', v_source_key,
      nullif(trim(p_ledger_payload->>'source_module_id'), ''),
      nullif(trim(p_ledger_payload->>'source_record_id'), '')::uuid,
      coalesce(p_ledger_payload->>'title', ''),
      coalesce((p_ledger_payload->>'amount')::numeric, 0),
      nullif(trim(p_ledger_payload->>'quantity'), '')::numeric,
      nullif(trim(p_ledger_payload->>'rate'), '')::numeric,
      coalesce(nullif(trim(p_ledger_payload->>'status'), ''), 'draft'),
      nullif(trim(p_ledger_payload->>'assignee_id'), '')::uuid,
      coalesce(p_ledger_payload->'details', '{}'::jsonb)
    ) returning id into v_ledger_id;
  end if;

  update public.payroll_calculation_entries
  set status = 'voided', updated_at = now()
  where org_id = v_org_id
    and source_type = 'commission'
    and employee_id = v_employee_id
    and period_start = v_period_start
    and period_end = v_period_end
    and id <> v_ledger_id
    and status in ('draft', 'proposed')
    and details->>'basis' = v_basis
    and details->>'percent_mode' = v_percent_mode;

  return v_ledger_id;
end;
$$;

revoke all on function public.save_commission_calculation(jsonb, jsonb) from public, anon;
grant execute on function public.save_commission_calculation(jsonb, jsonb) to authenticated;

-- ایجاد فیش نیز پیش از کنترل منابع، فقط اتصال‌های مربوط به فیش حذف‌شده را
-- آزاد می‌کند؛ مساعدهٔ متصل به فیش موجود همچنان در هیچ ماه یا داشبوردی دوباره
-- در دسترس نخواهد بود.
create or replace function public.create_payroll_slip_from_wizard(
  p_payload jsonb,
  p_ledger_entry_ids uuid[] default array[]::uuid[],
  p_bonus_request_ids uuid[] default array[]::uuid[],
  p_penalty_request_ids uuid[] default array[]::uuid[],
  p_advance_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_employee_id uuid := nullif(trim(p_payload->>'employee_id'), '')::uuid;
  v_period_start date := nullif(trim(p_payload->>'period_start'), '')::date;
  v_period_end date := nullif(trim(p_payload->>'period_end'), '')::date;
  v_ledger_ids uuid[] := array[]::uuid[];
  v_advance_ids uuid[] := array[]::uuid[];
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if v_org_id is null or v_employee_id is null or v_period_start is null or v_period_end is null then
    raise exception 'invalid_payroll_wizard_payload';
  end if;
  if not public.current_user_has_role_permission_entry('payroll_slips', 'edit', null, true) then
    raise exception 'payroll_creation_not_allowed';
  end if;

  perform public.release_orphaned_payroll_sources(v_org_id);

  select coalesce(array_agg(distinct item), array[]::uuid[])
    into v_ledger_ids
  from unnest(coalesce(p_ledger_entry_ids, array[]::uuid[])) as item;
  select coalesce(array_agg(distinct item), array[]::uuid[])
    into v_advance_ids
  from unnest(coalesce(p_advance_ids, array[]::uuid[])) as item;

  perform 1
  from public.payroll_calculation_entries
  where org_id = v_org_id
    and employee_id = v_employee_id
    and period_start = v_period_start
    and period_end = v_period_end
    and status in ('draft', 'proposed')
    and id = any(v_ledger_ids)
  for update;

  perform 1
  from public.employee_bonus_requests
  where org_id = v_org_id and employee_id = v_employee_id
    and related_payroll_slip_id is null
    and id = any(coalesce(p_bonus_request_ids, array[]::uuid[]))
  for update;

  perform 1
  from public.employee_penalty_requests
  where org_id = v_org_id and employee_id = v_employee_id
    and related_payroll_slip_id is null
    and id = any(coalesce(p_penalty_request_ids, array[]::uuid[]))
  for update;

  -- این قفل و کنترل server-side تضمین می‌کند یک مساعده فقط در یک فیش موجود
  -- مصرف شود؛ تاریخ درخواست آن نقشی در امکان دوباره‌مصرف ندارد.
  perform 1
  from public.employee_advances
  where org_id = v_org_id and employee_id = v_employee_id
    and related_payroll_slip_id is null
    and id = any(v_advance_ids)
  for update;

  v_payload := v_payload || jsonb_build_object(
    'performance_snapshot',
    coalesce(v_payload->'performance_snapshot', '{}'::jsonb)
      || jsonb_build_object(
        'payroll_ledger_entry_ids', to_jsonb(v_ledger_ids),
        'employee_advance_ids', to_jsonb(v_advance_ids)
      )
  );

  perform set_config('app.payroll_source_sync', 'active', true);
  return public._create_payroll_slip_from_wizard_internal(
    v_payload,
    v_ledger_ids,
    p_bonus_request_ids,
    p_penalty_request_ids,
    v_advance_ids
  );
end;
$$;

revoke all on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
