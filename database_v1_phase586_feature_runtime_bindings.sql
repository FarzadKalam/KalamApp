-- Phase 586: enforce existing commercial features in their real entry paths.
begin;
update public.saas_plans set enabled_features=
 '{"advanced_reports":true,"goals":true,"advanced_commission":true,"performance_payroll_kpi":true,"internal_chat":true,"internal_realtime_notifications":true,"business_model_canvas":true}'::jsonb || coalesce(enabled_features,'{}');
update public.saas_plans set enabled_features=jsonb_build_object(
 'telegram_bot',coalesce(enabled_features->'bots','true'::jsonb),
 'bale_bot',coalesce(enabled_features->'bots','true'::jsonb),
 'rubika_bot',coalesce(enabled_features->'bots','true'::jsonb)) || enabled_features;
-- Explicit flags remain untouched, including false on paid/custom plans.
update public.saas_plans set enabled_features=enabled_features||'{"telegram_bot":true}'::jsonb where is_demo_default or lower(code)='public_demo_full';

create or replace function public.saas_plan_feature_table_bindings()
returns jsonb language sql immutable set search_path=public as $$ select '{"report_definitions": "advanced_reports", "report_widgets": "advanced_reports", "report_data_sources": "advanced_reports", "goals": "goals", "goal_contributions": "goals", "goal_milestone_events": "goals", "commission_rules": "advanced_commission", "commission_drafts": "advanced_commission", "commission_entries": "advanced_commission", "activity_performance_rules": "performance_payroll_kpi", "chat_groups": "internal_chat"}'::jsonb; $$;
revoke all on function public.saas_plan_feature_table_bindings() from public,anon,authenticated;

-- Restrictive policies can only narrow the existing per-role, per-record rules.
-- Missing optional tables are ignored; RLS is never disabled.
do $$
declare item record; condition text;
begin
 for item in select key,value from jsonb_each_text(public.saas_plan_feature_table_bindings()) loop
  if to_regclass('public.'||item.key) is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name=item.key and column_name='org_id') then
   condition:=format('org_id=(select public.current_org_id()) and (select public.current_org_has_plan_feature(%L,true))',item.value);
   execute format('alter table public.%I enable row level security',item.key);
   execute format('drop policy if exists p_plan_feature_availability on public.%I',item.key);
   execute format('create policy p_plan_feature_availability on public.%I as restrictive for all to authenticated using (%s) with check (%s)',item.key,condition,condition);
  end if;
 end loop;
 if to_regclass('public.org_documents') is not null then
  execute 'drop policy if exists p_canvas_plan_feature_availability on public.org_documents';
  execute $policy$create policy p_canvas_plan_feature_availability on public.org_documents as restrictive for all to authenticated
   using(org_id=(select public.current_org_id()) and (document_type<>'business_model_canvas' or (select public.current_org_has_plan_feature('business_model_canvas',true))))
   with check(org_id=(select public.current_org_id()) and (document_type<>'business_model_canvas' or (select public.current_org_has_plan_feature('business_model_canvas',true))))$policy$;
 end if;
end; $$;

-- Canonical messaging RPC and legacy note inserts both reach this guard.
-- Record comments, saved personal notes and service-authored system messages keep their semantics.
create or replace function public.enforce_internal_chat_plan_write()
returns trigger language plpgsql security definer set search_path=public as $$
declare row_data jsonb:=to_jsonb(new); meta jsonb:=coalesce(row_data->'metadata','{}');
begin
 if auth.uid() is not null and not (coalesce(meta->>'saved_message','false')='true' and coalesce(row_data->'mention_user_ids','[]'::jsonb)='[]'::jsonb and coalesce(row_data->'mention_role_ids','[]'::jsonb)='[]'::jsonb and nullif(meta->>'chat_group_id','') is null)
  and ((nullif(row_data->>'module_id','') is null and nullif(row_data->>'record_id','') is null) or nullif(meta->>'chat_group_id','') is not null)
  and not public.org_has_plan_feature(new.org_id,'internal_chat',true) then
  raise exception 'پیام‌رسانی داخلی در پلن سازمان فعال نیست.' using errcode='42501';
 end if;
 return new;
end; $$;
revoke all on function public.enforce_internal_chat_plan_write() from public,anon,authenticated;
do $$ begin
 if to_regclass('public.notes') is not null then
  drop trigger if exists trg_internal_chat_plan_write on public.notes;
  create trigger trg_internal_chat_plan_write before insert on public.notes for each row execute function public.enforce_internal_chat_plan_write();
 end if;
end; $$;
-- Preserve the latest atomic financial behavior from phase 420; add the license check before mutation.
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
  if not public.org_has_plan_feature(v_org_id,'advanced_commission',true) then
    raise exception 'پورسانت پیشرفته در پلن سازمان فعال نیست.' using errcode='42501';
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
revoke all on function public.save_commission_calculation(jsonb,jsonb) from public,anon;
grant execute on function public.save_commission_calculation(jsonb,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
