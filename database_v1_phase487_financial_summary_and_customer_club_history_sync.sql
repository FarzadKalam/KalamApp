-- همگام‌سازی خلاصهٔ مالی اشخاص با دفتر عملیاتی مرکزی و نمایش یکپارچهٔ اعتبار باشگاه
-- این migration افزایشی و قابل اجرای مجدد است.

begin;

-- «جمع خرید» برای سطح‌بندی باشگاه از جمع دفتر عملیاتی جدا نگه داشته می‌شود؛
-- زیرا جمع دفتر، دریافت/پرداخت‌های مستقیم، تهاتر و ماندهٔ اول دوره را نیز دارد.
alter table if exists public.customers
  add column if not exists loyalty_total_spend numeric(18,2) not null default 0;

-- ردیف‌های اعتبار باشگاه نیز از همان endpoint سروریِ سوابق مالی برمی‌گردند.
-- اعتبار، جریان نقدی نیست و به همین دلیل debit/credit/balance آن صفر می‌ماند.
create or replace function public.get_operational_financial_history(
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_entity_type text := lower(trim(coalesce(p_entity_type, '')));
  v_exists boolean := false;
  v_history jsonb;
  v_club_rows jsonb := '[]'::jsonb;
begin
  if v_org_id is null or p_entity_id is null or v_entity_type not in ('customer', 'supplier', 'employee') then
    return jsonb_build_object(
      'rows', '[]'::jsonb,
      'summary', jsonb_build_object('total_debit', 0, 'total_credit', 0, 'final_balance', 0, 'source', 'central_financial_history')
    );
  end if;

  if v_entity_type = 'customer' then
    select exists(select 1 from public.customers where id = p_entity_id and org_id = v_org_id) into v_exists;
  elsif v_entity_type = 'supplier' then
    select exists(select 1 from public.suppliers where id = p_entity_id and org_id = v_org_id) into v_exists;
  else
    select exists(select 1 from public.employees where id = p_entity_id and org_id = v_org_id) into v_exists;
  end if;
  if not v_exists then
    return jsonb_build_object(
      'rows', '[]'::jsonb,
      'summary', jsonb_build_object('total_debit', 0, 'total_credit', 0, 'final_balance', 0, 'source', 'central_financial_history')
    );
  end if;

  v_history := public._get_operational_financial_history(v_org_id, v_entity_type, p_entity_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', history.key,
    'row_type', 'club_credit',
    'source_label', history.source_label,
    'source_module_id', 'customer_club',
    'source_record_id', null,
    'payment_type', '',
    'status', history.status,
    'cheque_status', '',
    'date', history.date,
    'debit', 0,
    'credit', 0,
    'club_credit_amount', history.club_credit_amount,
    'balance', 0,
    'invoice_label', history.invoice_label,
    'bank_label', '-',
    'description', history.description,
    'created_at', history.created_at,
    'bank_module_id', null,
    'bank_record_id', null
  ) order by history.date, history.created_at, history.key), '[]'::jsonb)
  into v_club_rows
  from public.get_customer_club_financial_history(v_entity_type, p_entity_id) history;

  return jsonb_set(
    coalesce(v_history, '{}'::jsonb),
    '{rows}',
    coalesce(v_history -> 'rows', '[]'::jsonb) || v_club_rows,
    true
  );
end;
$$;

-- تنها این تابع خصوصی می‌تواند org را صریح دریافت کند؛ برای backfill همان
-- سازمان رکورد استفاده می‌شود و به هیچ کاربر عادی واگذار نمی‌شود.
create or replace function public._sync_customer_financial_stats_for_org(
  p_org_id uuid,
  p_customer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer record;
  v_history jsonb;
  v_summary jsonb;
  v_current_count numeric(18,3) := 0;
  v_current_purchase_total numeric(18,2) := 0;
  v_current_first date;
  v_current_last date;
  v_first date;
  v_last date;
begin
  if p_org_id is null or p_customer_id is null then return; end if;

  -- قفل رکوردهای مشتری حفظ می‌شود؛ فقط همین فیلدهای مشتق‌شده با context داخلی
  -- و محدود، برای همگام‌سازی دفتر مالی اجازهٔ تغییر دارند.
  perform set_config('app.financial_summary_sync', 'active', true);

  select * into v_customer
  from public.customers
  where id = p_customer_id and org_id = p_org_id;
  if not found then return; end if;

  select
    count(*)::numeric(18,3),
    coalesce(sum(coalesce(total_invoice_amount, 0)), 0),
    min(coalesce(invoice_date, created_at::date)),
    max(coalesce(invoice_date, created_at::date))
  into v_current_count, v_current_purchase_total, v_current_first, v_current_last
  from public.invoices
  where org_id = p_org_id
    and customer_id = p_customer_id
    and public.is_customer_purchase_status(status);

  v_history := public._get_operational_financial_history(p_org_id, 'customer', p_customer_id);
  v_summary := coalesce(v_history -> 'summary', '{}'::jsonb);
  v_first := least(coalesce(v_customer.previous_system_first_purchase_date, v_current_first), coalesce(v_current_first, v_customer.previous_system_first_purchase_date));
  v_last := greatest(coalesce(v_customer.previous_system_last_purchase_date, v_current_last), coalesce(v_current_last, v_customer.previous_system_last_purchase_date));

  update public.customers
  set
    first_purchase_date = v_first,
    last_purchase_date = v_last,
    purchase_count = coalesce(v_customer.previous_system_purchase_count, 0) + coalesce(v_current_count, 0),
    loyalty_total_spend = coalesce(v_customer.previous_system_invoice_total, 0) + coalesce(v_current_purchase_total, 0),
    total_spend = coalesce(nullif(v_summary ->> 'total_debit', '')::numeric, 0),
    total_paid_amount = coalesce(nullif(v_summary ->> 'total_credit', '')::numeric, 0),
    total_balance = coalesce(nullif(v_summary ->> 'final_balance', '')::numeric, 0),
    acquaintance_days = case when v_first is null then null else greatest(0, current_date - v_first) end,
    cooperation_days = case when v_first is null or v_last is null then null else greatest(0, v_last - v_first) end
  where id = p_customer_id and org_id = p_org_id;
end;
$$;

-- قفل رکورد مانع تغییر دادهٔ عملیاتی است. همگام‌سازی داخلی این migration فقط
-- ستون‌های مشتق‌شدهٔ مشتری را تغییر می‌دهد و هر تغییر دیگری همچنان رد می‌شود.
create or replace function public.prevent_locked_record_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean := false;
  v_scoped_payroll_source_sync boolean := false;
  v_allowed_payroll_change boolean := false;
  v_allowed_payroll_recalculation boolean := false;
  v_allowed_financial_summary_sync boolean := false;
begin
  if tg_op not in ('UPDATE', 'DELETE') then return coalesce(new, old); end if;

  if tg_op = 'UPDATE' then
    select exists (
      select 1 from public.payroll_source_mutation_scopes scope
      where scope.org_id = old.org_id and scope.table_name = tg_table_name and scope.record_id = old.id
    ) into v_scoped_payroll_source_sync;

    if v_scoped_payroll_source_sync then
      v_allowed_payroll_change := case tg_table_name
        when 'payroll_calculation_entries' then
          (to_jsonb(new) - array['status', 'payroll_slip_id', 'updated_at', 'updated_by']) is not distinct from
          (to_jsonb(old) - array['status', 'payroll_slip_id', 'updated_at', 'updated_by'])
        when 'employee_bonus_requests' then
          (to_jsonb(new) - array['related_payroll_slip_id', 'updated_at', 'updated_by']) is not distinct from
          (to_jsonb(old) - array['related_payroll_slip_id', 'updated_at', 'updated_by'])
        when 'employee_penalty_requests' then
          (to_jsonb(new) - array['related_payroll_slip_id', 'updated_at', 'updated_by']) is not distinct from
          (to_jsonb(old) - array['related_payroll_slip_id', 'updated_at', 'updated_by'])
        when 'employee_advances' then
          (to_jsonb(new) - array['related_payroll_slip_id', 'paid_amount', 'remaining_amount', 'updated_at', 'updated_by']) is not distinct from
          (to_jsonb(old) - array['related_payroll_slip_id', 'paid_amount', 'remaining_amount', 'updated_at', 'updated_by'])
        when 'commission_drafts' then
          (to_jsonb(new) - array['posted_amount', 'remaining_amount', 'draft_status', 'updated_at', 'updated_by']) is not distinct from
          (to_jsonb(old) - array['posted_amount', 'remaining_amount', 'draft_status', 'updated_at', 'updated_by'])
        else false
      end;
      if v_allowed_payroll_change then return new; end if;
    end if;

    if tg_table_name = 'payroll_slips' and current_setting('app.payroll_source_sync', true) = 'active' then
      v_allowed_payroll_recalculation :=
        (to_jsonb(new) - array['base_salary', 'task_wage_total', 'bonus_total', 'earnings_total', 'deduction_total', 'insurance_employee_amount', 'insurance_employer_amount', 'gross_amount', 'net_amount', 'updated_at', 'updated_by'])
          is not distinct from
        (to_jsonb(old) - array['base_salary', 'task_wage_total', 'bonus_total', 'earnings_total', 'deduction_total', 'insurance_employee_amount', 'insurance_employer_amount', 'gross_amount', 'net_amount', 'updated_at', 'updated_by']);
      if v_allowed_payroll_recalculation then return new; end if;
    end if;

    if tg_table_name = 'customers' and current_setting('app.financial_summary_sync', true) = 'active' then
      v_allowed_financial_summary_sync :=
        (to_jsonb(new) - array['first_purchase_date', 'last_purchase_date', 'purchase_count', 'loyalty_total_spend', 'total_spend', 'total_paid_amount', 'total_balance', 'acquaintance_days', 'cooperation_days', 'updated_at', 'updated_by'])
          is not distinct from
        (to_jsonb(old) - array['first_purchase_date', 'last_purchase_date', 'purchase_count', 'loyalty_total_spend', 'total_spend', 'total_paid_amount', 'total_balance', 'acquaintance_days', 'cooperation_days', 'updated_at', 'updated_by']);
      if v_allowed_financial_summary_sync then return new; end if;
    end if;
  end if;

  select exists (
    select 1 from public.record_locks lock_row
    where lock_row.org_id = old.org_id and lock_row.record_id = old.id
      and (lock_row.module_id = tg_table_name or lock_row.metadata ->> 'table_name' = tg_table_name)
  ) into v_locked;
  if v_locked then raise exception 'این رکورد قفل شده و قابل تغییر یا حذف نیست.'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.sync_customer_financial_stats(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
begin
  if v_org_id is null then return; end if;
  perform public._sync_customer_financial_stats_for_org(v_org_id, p_customer_id);
end;
$$;

-- تغییر هر منبع مالی، خلاصهٔ همهٔ مشتریانِ متصل را نیز به‌روزرسانی می‌کند.
create or replace function public.sync_customer_financial_stats_for_entity(
  p_entity_type text,
  p_entity_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_entity_type text := lower(trim(coalesce(p_entity_type, '')));
  v_customer_id uuid;
begin
  if v_org_id is null or p_entity_id is null or v_entity_type not in ('customer', 'supplier', 'employee') then return; end if;
  if v_entity_type = 'customer' and not exists(select 1 from public.customers where id = p_entity_id and org_id = v_org_id) then return; end if;
  if v_entity_type = 'supplier' and not exists(select 1 from public.suppliers where id = p_entity_id and org_id = v_org_id) then return; end if;
  if v_entity_type = 'employee' and not exists(select 1 from public.employees where id = p_entity_id and org_id = v_org_id) then return; end if;

  for v_customer_id in
    select entity_id
    from public.get_customer_club_credit_scope(v_org_id, v_entity_type, p_entity_id)
    where entity_type = 'customer'
  loop
    perform public._sync_customer_financial_stats_for_org(v_org_id, v_customer_id);
  end loop;
end;
$$;

create or replace function public.sync_customer_financial_stats_from_financial_source_row(p_row jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid := nullif(coalesce(p_row ->> 'customer_id', ''), '')::uuid;
  v_supplier_id uuid := nullif(coalesce(p_row ->> 'supplier_id', ''), '')::uuid;
  v_employee_id uuid := nullif(coalesce(p_row ->> 'employee_id', ''), '')::uuid;
  v_source_id uuid;
begin
  if p_row is null then return; end if;
  if v_customer_id is not null then perform public.sync_customer_financial_stats_for_entity('customer', v_customer_id); end if;
  if v_supplier_id is not null then perform public.sync_customer_financial_stats_for_entity('supplier', v_supplier_id); end if;
  if v_employee_id is not null then perform public.sync_customer_financial_stats_for_entity('employee', v_employee_id); end if;

  v_source_id := nullif(coalesce(p_row ->> 'sales_invoice_id', ''), '')::uuid;
  if v_source_id is not null then
    select customer_id into v_customer_id from public.invoices where id = v_source_id and org_id = public.current_org_id();
    if v_customer_id is not null then perform public.sync_customer_financial_stats_for_entity('customer', v_customer_id); end if;
  end if;
  v_source_id := nullif(coalesce(p_row ->> 'purchase_invoice_id', ''), '')::uuid;
  if v_source_id is not null then
    select supplier_id into v_supplier_id from public.purchase_invoices where id = v_source_id and org_id = public.current_org_id();
    if v_supplier_id is not null then perform public.sync_customer_financial_stats_for_entity('supplier', v_supplier_id); end if;
  end if;
  v_source_id := nullif(coalesce(p_row ->> 'expense_document_id', ''), '')::uuid;
  if v_source_id is not null then
    select customer_id, supplier_id, employee_id into v_customer_id, v_supplier_id, v_employee_id from public.expense_documents where id = v_source_id and org_id = public.current_org_id();
    if v_customer_id is not null then perform public.sync_customer_financial_stats_for_entity('customer', v_customer_id); end if;
    if v_supplier_id is not null then perform public.sync_customer_financial_stats_for_entity('supplier', v_supplier_id); end if;
    if v_employee_id is not null then perform public.sync_customer_financial_stats_for_entity('employee', v_employee_id); end if;
  end if;
  v_source_id := nullif(coalesce(p_row ->> 'payroll_slip_id', ''), '')::uuid;
  if v_source_id is not null then
    select employee_id into v_employee_id from public.payroll_slips where id = v_source_id and org_id = public.current_org_id();
    if v_employee_id is not null then perform public.sync_customer_financial_stats_for_entity('employee', v_employee_id); end if;
  end if;
  v_source_id := nullif(coalesce(p_row ->> 'employee_advance_id', ''), '')::uuid;
  if v_source_id is not null then
    select employee_id into v_employee_id from public.employee_advances where id = v_source_id and org_id = public.current_org_id();
    if v_employee_id is not null then perform public.sync_customer_financial_stats_for_entity('employee', v_employee_id); end if;
  end if;
end;
$$;

create or replace function public.sync_customer_financial_stats_from_financial_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'DELETE' then perform public.sync_customer_financial_stats_from_financial_source_row(to_jsonb(new)); end if;
  if tg_op <> 'INSERT' then perform public.sync_customer_financial_stats_from_financial_source_row(to_jsonb(old)); end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.sync_customer_financial_stats_from_person_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_type text := case tg_table_name when 'customers' then 'customer' when 'suppliers' then 'supplier' else 'employee' end;
begin
  if tg_op <> 'DELETE' then perform public.sync_customer_financial_stats_for_entity(v_entity_type, new.id); end if;
  if tg_op <> 'INSERT' then perform public.sync_customer_financial_stats_for_entity(v_entity_type, old.id); end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_customer_financial_stats_from_cash_bank_operation on public.cash_bank_operations;
create trigger trg_sync_customer_financial_stats_from_cash_bank_operation
  after insert or update or delete on public.cash_bank_operations
  for each row execute function public.sync_customer_financial_stats_from_financial_source();
drop trigger if exists trg_sync_customer_financial_stats_from_barter on public.barters;
create trigger trg_sync_customer_financial_stats_from_barter
  after insert or update or delete on public.barters
  for each row execute function public.sync_customer_financial_stats_from_financial_source();
drop trigger if exists trg_sync_customer_financial_stats_from_expense_document on public.expense_documents;
create trigger trg_sync_customer_financial_stats_from_expense_document
  after insert or update or delete on public.expense_documents
  for each row execute function public.sync_customer_financial_stats_from_financial_source();
drop trigger if exists trg_sync_customer_financial_stats_from_purchase_invoice on public.purchase_invoices;
create trigger trg_sync_customer_financial_stats_from_purchase_invoice
  after insert or update or delete on public.purchase_invoices
  for each row execute function public.sync_customer_financial_stats_from_financial_source();
drop trigger if exists trg_sync_customer_financial_stats_from_payroll_slip on public.payroll_slips;
create trigger trg_sync_customer_financial_stats_from_payroll_slip
  after insert or update or delete on public.payroll_slips
  for each row execute function public.sync_customer_financial_stats_from_financial_source();
drop trigger if exists trg_sync_customer_financial_stats_from_employee_advance on public.employee_advances;
create trigger trg_sync_customer_financial_stats_from_employee_advance
  after insert or update or delete on public.employee_advances
  for each row execute function public.sync_customer_financial_stats_from_financial_source();

drop trigger if exists trg_sync_customer_financial_stats_from_customer on public.customers;
create trigger trg_sync_customer_financial_stats_from_customer
  after insert or update of previous_system_first_purchase_date, previous_system_last_purchase_date,
    previous_system_purchase_count, previous_system_invoice_total, previous_system_paid_total,
    previous_system_balance_total, linked_supplier_id, linked_employee_id on public.customers
  for each row execute function public.sync_customer_financial_stats_from_person_link();
drop trigger if exists trg_sync_customer_financial_stats_from_supplier_link on public.suppliers;
create trigger trg_sync_customer_financial_stats_from_supplier_link
  after insert or update of previous_system_first_purchase_date, previous_system_invoice_total,
    previous_system_paid_total, previous_system_balance_total, linked_customer_id, linked_employee_id on public.suppliers
  for each row execute function public.sync_customer_financial_stats_from_person_link();
drop trigger if exists trg_sync_customer_financial_stats_from_employee_link on public.employees;
create trigger trg_sync_customer_financial_stats_from_employee_link
  after insert or update of previous_system_first_purchase_date, previous_system_invoice_total,
    previous_system_paid_total, previous_system_balance_total, linked_customer_id, linked_supplier_id on public.employees
  for each row execute function public.sync_customer_financial_stats_from_person_link();

-- داده‌های قبلی نیز بدون نیاز به ویرایش مجدد فاکتور یا عملیات، با همان منبع
-- مرکزی بازسازی می‌شوند.
do $$
declare
  v_customer record;
begin
  for v_customer in select id, org_id from public.customers loop
    perform public._sync_customer_financial_stats_for_org(v_customer.org_id, v_customer.id);
  end loop;
end;
$$;

-- معیار سطح مشتری همچنان فقط از خریدها می‌آید، نه از جمع بدهکار عملیاتی.
create or replace function public.sync_customer_club_rank(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id(); v_customer record; v_settings jsonb := '{}'::jsonb;
  v_enabled boolean := true; v_rank text := 'normal';
  v_silver jsonb := '{}'::jsonb; v_gold jsonb := '{}'::jsonb; v_vip jsonb := '{}'::jsonb;
  v_old_rank text;
begin
  if v_org_id is null or p_customer_id is null then return; end if;
  select * into v_customer from public.customers where id = p_customer_id and org_id = v_org_id;
  if not found then return; end if;
  select coalesce(to_jsonb(cs)->'customer_leveling_config', '{}'::jsonb) into v_settings
  from public.company_settings cs where cs.org_id = v_org_id limit 1;
  v_enabled := coalesce((v_settings->>'enabled')::boolean, true);
  if not v_enabled then v_rank := 'normal'; else
    v_silver := coalesce(v_settings->'silver', '{}'::jsonb); v_gold := coalesce(v_settings->'gold', '{}'::jsonb); v_vip := coalesce(v_settings->'vip', '{}'::jsonb);
    if coalesce(v_customer.purchase_count, 0) >= coalesce((v_vip->>'min_purchase_count')::numeric, 15) and coalesce(v_customer.loyalty_total_spend, 0) >= coalesce((v_vip->>'min_total_spend')::numeric, 300000000) and coalesce(v_customer.acquaintance_days, 0) >= coalesce((v_vip->>'min_acquaintance_days')::numeric, 365) then v_rank := 'vip';
    elsif coalesce(v_customer.purchase_count, 0) >= coalesce((v_gold->>'min_purchase_count')::numeric, 8) and coalesce(v_customer.loyalty_total_spend, 0) >= coalesce((v_gold->>'min_total_spend')::numeric, 120000000) and coalesce(v_customer.acquaintance_days, 0) >= coalesce((v_gold->>'min_acquaintance_days')::numeric, 120) then v_rank := 'gold';
    elsif coalesce(v_customer.purchase_count, 0) >= coalesce((v_silver->>'min_purchase_count')::numeric, 3) and coalesce(v_customer.loyalty_total_spend, 0) >= coalesce((v_silver->>'min_total_spend')::numeric, 30000000) and coalesce(v_customer.acquaintance_days, 0) >= coalesce((v_silver->>'min_acquaintance_days')::numeric, 30) then v_rank := 'silver'; end if;
  end if;
  v_old_rank := coalesce(v_customer.rank, 'normal');
  update public.customers set rank = v_rank where id = p_customer_id and org_id = v_org_id and rank is distinct from v_rank;
  if v_old_rank is distinct from v_rank then perform public.log_customer_club_event('level_changed', 'تغییر سطح مشتری', p_customer_id, null, null, null, 'customers', p_customer_id, jsonb_build_object('from', v_old_rank, 'to', v_rank)); end if;
end;
$$;

create or replace function public.sync_customer_club_levels(p_customer_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_customer_id uuid;
  v_customer record;
  v_settings jsonb := '{}'::jsonb;
  v_enabled boolean := true;
  v_rank text;
  v_old_rank text;
  v_processed integer := 0;
  v_silver jsonb := '{}'::jsonb;
  v_gold jsonb := '{}'::jsonb;
  v_vip jsonb := '{}'::jsonb;
begin
  if v_org_id is null or coalesce(array_length(p_customer_ids, 1), 0) = 0 then return 0; end if;

  select coalesce(nullif(to_jsonb(cs)->'customer_leveling_config', 'null'::jsonb), '{}'::jsonb)
    into v_settings
  from public.company_settings cs where cs.org_id = v_org_id limit 1;
  if v_settings = '{}'::jsonb then
    select coalesce(nullif(settings->'customer_leveling_config', 'null'::jsonb), '{}'::jsonb)
      into v_settings
    from public.integration_settings
    where org_id = v_org_id and connection_type = 'site' limit 1;
  end if;
  v_enabled := coalesce((v_settings->>'enabled')::boolean, true);
  v_silver := coalesce(v_settings->'silver', '{}'::jsonb);
  v_gold := coalesce(v_settings->'gold', '{}'::jsonb);
  v_vip := coalesce(v_settings->'vip', '{}'::jsonb);

  for v_customer_id in
    select id from public.customers where org_id = v_org_id and id = any(p_customer_ids) order by id
  loop
    perform public.sync_customer_financial_stats(v_customer_id);
    select * into v_customer from public.customers where id = v_customer_id and org_id = v_org_id;
    if not found then continue; end if;

    v_rank := 'normal';
    if v_enabled then
      if coalesce(v_customer.purchase_count, 0) >= coalesce((v_vip->>'min_purchase_count')::numeric, 15)
         and coalesce(v_customer.loyalty_total_spend, 0) >= coalesce((v_vip->>'min_total_spend')::numeric, 300000000)
         and coalesce(v_customer.acquaintance_days, 0) >= coalesce((v_vip->>'min_acquaintance_days')::numeric, 365) then v_rank := 'vip';
      elsif coalesce(v_customer.purchase_count, 0) >= coalesce((v_gold->>'min_purchase_count')::numeric, 8)
         and coalesce(v_customer.loyalty_total_spend, 0) >= coalesce((v_gold->>'min_total_spend')::numeric, 120000000)
         and coalesce(v_customer.acquaintance_days, 0) >= coalesce((v_gold->>'min_acquaintance_days')::numeric, 120) then v_rank := 'gold';
      elsif coalesce(v_customer.purchase_count, 0) >= coalesce((v_silver->>'min_purchase_count')::numeric, 3)
         and coalesce(v_customer.loyalty_total_spend, 0) >= coalesce((v_silver->>'min_total_spend')::numeric, 30000000)
         and coalesce(v_customer.acquaintance_days, 0) >= coalesce((v_silver->>'min_acquaintance_days')::numeric, 30) then v_rank := 'silver';
      end if;
    end if;

    v_old_rank := coalesce(v_customer.rank, 'normal');
    update public.customers set rank = v_rank
    where id = v_customer_id and org_id = v_org_id and rank is distinct from v_rank;
    if v_old_rank is distinct from v_rank then
      perform public.log_customer_club_event(
        'level_changed', 'تغییر سطح مشتری', v_customer_id, null, null, null,
        'customers', v_customer_id, jsonb_build_object('from', v_old_rank, 'to', v_rank)
      );
    end if;
    v_processed := v_processed + 1;
  end loop;
  return v_processed;
end;
$$;

revoke all on function public._sync_customer_financial_stats_for_org(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sync_customer_financial_stats_for_entity(text, uuid) from public, anon, authenticated;
revoke all on function public.sync_customer_financial_stats_from_financial_source_row(jsonb) from public, anon, authenticated;
revoke all on function public.sync_customer_financial_stats_from_financial_source() from public, anon, authenticated;
revoke all on function public.sync_customer_financial_stats_from_person_link() from public, anon, authenticated;
revoke all on function public.get_operational_financial_history(text, uuid) from public, anon;
grant execute on function public.get_operational_financial_history(text, uuid) to authenticated;
grant execute on function public.sync_customer_financial_stats(uuid) to authenticated;
grant execute on function public.sync_customer_club_rank(uuid) to authenticated;
grant execute on function public.sync_customer_club_levels(uuid[]) to authenticated;

commit;
