-- کارت حساب آنلاین: لینک عمومی tenant-safe و پرداخت تجمیعی فاکتورهای مشتری
-- بررسی drift محیط production باید پیش از اجرا به‌صورت دستی انجام شود.

begin;

create table if not exists public.online_account_cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('customer', 'supplier', 'employee')),
  entity_id uuid not null,
  title text not null default 'کارت حساب آنلاین',
  is_active boolean not null default true,
  public_token text not null default substr(encode(sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)), 'hex'), 1, 48),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint online_account_cards_token_format check (public_token ~ '^[0-9a-f]{48}$')
);

create unique index if not exists online_account_cards_org_entity_uidx on public.online_account_cards(org_id, entity_type, entity_id);
create unique index if not exists online_account_cards_public_token_uidx on public.online_account_cards(public_token);
create index if not exists online_account_cards_org_active_idx on public.online_account_cards(org_id, is_active) where is_active;

alter table public.online_account_cards enable row level security;
drop policy if exists online_account_cards_org_select on public.online_account_cards;
drop policy if exists online_account_cards_org_insert on public.online_account_cards;
drop policy if exists online_account_cards_org_update on public.online_account_cards;
drop policy if exists online_account_cards_org_delete on public.online_account_cards;
create policy online_account_cards_org_select on public.online_account_cards for select to authenticated using (org_id = public.current_org_id());
create policy online_account_cards_org_insert on public.online_account_cards for insert to authenticated with check (org_id = public.current_org_id());
create policy online_account_cards_org_update on public.online_account_cards for update to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy online_account_cards_org_delete on public.online_account_cards for delete to authenticated using (org_id = public.current_org_id());
grant select, insert, update, delete on public.online_account_cards to authenticated;

create or replace function public.online_account_cards_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists trg_online_account_cards_touch_updated_at on public.online_account_cards;
create trigger trg_online_account_cards_touch_updated_at before update on public.online_account_cards
for each row execute function public.online_account_cards_touch_updated_at();

-- پرداخت کارت حساب نوع مستقلی از تراکنش است تا در callback، مبلغ بین همه فاکتورهای باز تقسیم شود.
alter table public.payment_transactions drop constraint if exists payment_transactions_purpose_check;
alter table public.payment_transactions add constraint payment_transactions_purpose_check
  check (purpose in ('online_invoice', 'online_account_card', 'saas_renewal', 'ai_topup', 'sms_topup', 'extra_user', 'manual'));

create or replace function public.get_public_online_account_card_payment_state(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_card public.online_account_cards%rowtype;
  v_amount numeric := 0;
  v_settings jsonb := '{}'::jsonb;
  v_gateway_active boolean := false;
  v_scope text := 'system';
  v_currency text := 'IRR';
  v_allowed boolean := false;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return jsonb_build_object('available', false, 'reason', 'not_found'); end if;
  select * into v_card from public.online_account_cards where public_token = p_token and is_active = true limit 1;
  if not found or v_card.entity_type <> 'customer' or not public.org_has_plan_feature(v_card.org_id, 'online_catalog', false) then
    return jsonb_build_object('available', false, 'reason', 'not_found');
  end if;
  select coalesce(sum(greatest(coalesce(remaining_balance, 0), 0)), 0) into v_amount
  from public.invoices where org_id = v_card.org_id and customer_id = v_card.entity_id
    and status in ('confirmed', 'final', 'settled', 'completed');
  select coalesce(settings, '{}'::jsonb), is_active = true into v_settings, v_gateway_active
  from public.integration_settings where org_id = v_card.org_id and connection_type = 'payment_gateway' and coalesce(provider, '') = 'zarinpal'
  order by is_active desc, updated_at desc nulls last, created_at desc nulls last limit 1;
  v_scope := case when coalesce(v_settings ->> 'gateway_scope', 'system') = 'org' then 'org' else 'system' end;
  v_currency := case when coalesce(v_settings ->> 'currency', 'IRR') = 'IRT' then 'IRT' else 'IRR' end;
  v_gateway_active := coalesce(v_gateway_active, false)
    and coalesce((v_settings ->> 'online_invoice_payments_enabled')::boolean, false)
    and nullif(btrim(coalesce(v_settings ->> 'payment_domain', '')), '') is not null;
  v_allowed := v_gateway_active and v_amount > 0 and (
    (v_scope = 'system' and public.org_has_saas_admin_payment_access(v_card.org_id))
    or (v_scope = 'org' and public.org_has_plan_feature(v_card.org_id, 'custom_domain', false)
      and public.org_has_plan_feature(v_card.org_id, 'own_payment_gateway', false)
      and public.org_has_plan_feature(v_card.org_id, 'online_invoice_payment', false)
      and nullif(btrim(coalesce(v_settings ->> 'merchant_id', '')), '') is not null)
  );
  return jsonb_build_object('available', v_allowed, 'amount', v_amount, 'currency', v_currency, 'gateway_scope', v_scope);
end;
$$;
revoke all on function public.get_public_online_account_card_payment_state(text) from public;
grant execute on function public.get_public_online_account_card_payment_state(text) to anon, authenticated, service_role;

create or replace function public.get_public_online_account_card(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_card public.online_account_cards%rowtype;
  v_name text := '';
  v_company jsonb := '{}'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return jsonb_build_object('error', 'not_found'); end if;
  select * into v_card from public.online_account_cards where public_token = p_token and is_active = true limit 1;
  if not found or not public.org_has_plan_feature(v_card.org_id, 'online_catalog', false) then return jsonb_build_object('error', 'not_found'); end if;
  if v_card.entity_type = 'customer' then select coalesce(full_name, business_name, legal_name, nullif(btrim(concat_ws(' ', first_name, last_name)), ''), system_code, 'مشتری') into v_name from public.customers where id = v_card.entity_id and org_id = v_card.org_id;
  elsif v_card.entity_type = 'supplier' then select coalesce(business_name, nullif(btrim(concat_ws(' ', first_name, last_name)), ''), system_code, 'تامین‌کننده') into v_name from public.suppliers where id = v_card.entity_id and org_id = v_card.org_id;
  else select coalesce(name, first_name || ' ' || last_name, system_code, 'کارمند') into v_name from public.employees where id = v_card.entity_id and org_id = v_card.org_id;
  end if;
  if v_name is null then return jsonb_build_object('error', 'not_found'); end if;
  select jsonb_strip_nulls(jsonb_build_object('company_name', coalesce(company_full_name, company_name, trade_name), 'trade_name', trade_name, 'logo_url', logo_url, 'currency_label', currency_label))
  into v_company from public.company_settings where org_id = v_card.org_id order by updated_at desc limit 1;

  with raw_rows as (
    select 'opening'::text row_type, 'مانده اول دوره'::text source_label, null::text status, null::text payment_type, null::date row_date,
      case when v_card.entity_type = 'customer' and coalesce(c.previous_system_balance_total, 0) >= 0 then abs(c.previous_system_balance_total) else 0 end debit,
      case when v_card.entity_type <> 'customer' and coalesce(c.previous_system_balance_total, 0) < 0 then abs(c.previous_system_balance_total) else 0 end credit,
      'مانده اول دوره سیستم قبلی'::text description, c.created_at, 'opening_' || c.id::text key
    from (select id, created_at, previous_system_balance_total from public.customers where v_card.entity_type = 'customer' and id = v_card.entity_id and org_id = v_card.org_id
          union all select id, created_at, previous_system_balance_total from public.suppliers where v_card.entity_type = 'supplier' and id = v_card.entity_id and org_id = v_card.org_id
          union all select id, created_at, previous_system_balance_total from public.employees where v_card.entity_type = 'employee' and id = v_card.entity_id and org_id = v_card.org_id) c
    union all
    select 'invoice', case when v_card.entity_type = 'customer' then 'صدور فاکتور فروش' else 'ثبت فاکتور خرید' end, i.status, null, i.invoice_date,
      case when v_card.entity_type = 'customer' then i.total_invoice_amount else 0 end, case when v_card.entity_type = 'supplier' then i.total_invoice_amount else 0 end,
      concat(case when v_card.entity_type = 'customer' then 'فاکتور فروش' else 'فاکتور خرید' end, case when coalesce(i.remaining_balance, 0) <> 0 then ' | مانده: ' || i.remaining_balance else '' end), i.created_at, 'invoice_' || i.id::text
    from (select id, invoice_date, status, total_invoice_amount, remaining_balance, created_at from public.invoices where v_card.entity_type = 'customer' and customer_id = v_card.entity_id and org_id = v_card.org_id and status in ('confirmed','final','settled','completed')
          union all select id, invoice_date, status, total_invoice_amount, remaining_balance, created_at from public.purchase_invoices where v_card.entity_type = 'supplier' and supplier_id = v_card.entity_id and org_id = v_card.org_id and status in ('confirmed','final','settled','completed')) i
    union all
    select case when o.operation_type = 'payment' then 'payment' else 'receipt' end, 'عملیات نقد و بانک', o.status, o.payment_type, o.operation_date,
      case when v_card.entity_type = 'customer' and o.operation_type = 'receipt' then abs(o.amount) when v_card.entity_type <> 'customer' and o.operation_type = 'payment' then abs(o.amount) else 0 end,
      case when v_card.entity_type = 'customer' and o.operation_type = 'payment' then abs(o.amount) when v_card.entity_type <> 'customer' and o.operation_type = 'receipt' then abs(o.amount) else 0 end,
      coalesce(o.description, ''), o.created_at, 'operation_' || o.id::text
    from public.cash_bank_operations o where o.org_id = v_card.org_id and o.status in ('received','approved','paid','settled','cleared') and o.operation_type <> 'transfer'
      and ((v_card.entity_type = 'customer' and o.customer_id = v_card.entity_id) or (v_card.entity_type = 'supplier' and o.supplier_id = v_card.entity_id) or (v_card.entity_type = 'employee' and o.employee_id = v_card.entity_id))
    union all
    select case when v_card.entity_type = 'customer' then 'receipt' else 'payment' end, case when v_card.entity_type = 'customer' then 'دریافت فاکتور فروش' else 'پرداخت فاکتور خرید' end,
      coalesce(p.item ->> 'status', 'received'), coalesce(p.item ->> 'payment_type', ''), coalesce(nullif(p.item ->> 'date', '')::date, i.invoice_date),
      case when v_card.entity_type = 'customer' then abs((p.item ->> 'amount')::numeric) else 0 end,
      case when v_card.entity_type = 'supplier' then abs((p.item ->> 'amount')::numeric) else 0 end,
      coalesce(p.item ->> 'description', ''), i.created_at, 'legacy_payment_' || i.id::text || '_' || p.ordinality::text
    from (
      select id, invoice_date, created_at, payments from public.invoices where v_card.entity_type = 'customer' and customer_id = v_card.entity_id and org_id = v_card.org_id
      union all
      select id, invoice_date, created_at, payments from public.purchase_invoices where v_card.entity_type = 'supplier' and supplier_id = v_card.entity_id and org_id = v_card.org_id
    ) i cross join lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) with ordinality p(item, ordinality)
    where lower(coalesce(p.item ->> 'status', 'received')) in ('received','paid','approved','cleared')
      and coalesce(p.item ->> 'amount', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
      and not exists (select 1 from public.cash_bank_operations o where o.org_id = v_card.org_id and ((v_card.entity_type = 'customer' and o.sales_invoice_id = i.id) or (v_card.entity_type = 'supplier' and o.purchase_invoice_id = i.id)))
    union all
    select 'payroll_slip', 'فیش حقوقی', p.status, null, p.period_end, 0, p.net_amount, 'تعهد پرداخت حقوق', p.created_at, 'payroll_' || p.id::text
    from public.payroll_slips p where v_card.entity_type = 'employee' and p.org_id = v_card.org_id and p.employee_id = v_card.entity_id and p.status in ('approved','paid','posted') and coalesce(p.net_amount, 0) > 0
    union all
    select 'advance', 'درخواست مساعده', a.status, null, a.request_date, 0, a.amount, concat('مساعده', case when coalesce(a.remaining_amount,0) <> 0 then ' | مانده: ' || a.remaining_amount else '' end), a.created_at, 'advance_' || a.id::text
    from public.employee_advances a where v_card.entity_type = 'employee' and a.org_id = v_card.org_id and a.employee_id = v_card.entity_id and a.status in ('requested','approved','paid','settled','posted') and coalesce(a.amount, 0) > 0
    union all
    select 'expense', 'ثبت هزینه', e.status, null, e.expense_date, 0, e.total_amount, concat('هزینه', case when coalesce(e.remaining_amount,0) <> 0 then ' | مانده: ' || e.remaining_amount else '' end), e.created_at, 'expense_' || e.id::text
    from public.expense_documents e where e.org_id = v_card.org_id and e.status in ('approved','paid','posted','settled','completed') and coalesce(e.total_amount,0) > 0
      and ((v_card.entity_type = 'customer' and e.customer_id = v_card.entity_id) or (v_card.entity_type = 'supplier' and e.supplier_id = v_card.entity_id) or (v_card.entity_type = 'employee' and e.employee_id = v_card.entity_id))
    union all
    select 'barter', 'تهاتر', b.status, 'barter', b.barter_date,
      case when b.barter_type = 'outgoing' then abs(b.initial_amount) else 0 end, case when b.barter_type = 'incoming' then abs(b.initial_amount) else 0 end,
      coalesce(b.notes, ''), b.created_at, 'barter_' || b.id::text
    from public.barters b where b.org_id = v_card.org_id and b.status <> 'canceled'
      and ((v_card.entity_type = 'customer' and b.customer_id = v_card.entity_id) or (v_card.entity_type = 'supplier' and b.supplier_id = v_card.entity_id) or (v_card.entity_type = 'employee' and b.employee_id = v_card.entity_id))
  ), ranked as (
    select *, sum(coalesce(debit,0) - coalesce(credit,0)) over (order by coalesce(row_date, created_at::date), key rows between unbounded preceding and current row) balance from raw_rows
  )
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'row_type', row_type, 'source_label', source_label, 'status', status, 'payment_type', payment_type, 'date', row_date, 'debit', debit, 'credit', credit, 'balance', balance, 'description', description) order by coalesce(row_date, created_at::date), key), '[]'::jsonb),
    jsonb_build_object('total_debit', coalesce(sum(debit),0), 'total_credit', coalesce(sum(credit),0), 'final_balance', coalesce((array_agg(balance order by coalesce(row_date, created_at::date) desc, key desc))[1],0))
  into v_rows, v_summary from ranked;
  return jsonb_build_object('card', jsonb_build_object('title', v_card.title, 'entity_type', v_card.entity_type, 'entity_name', v_name), 'company', coalesce(v_company, '{}'::jsonb), 'rows', v_rows, 'summary', v_summary);
end;
$$;
revoke all on function public.get_public_online_account_card(text) from public, authenticated;
grant execute on function public.get_public_online_account_card(text) to anon;

create or replace function public.apply_online_account_card_payment_transaction(p_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tx public.payment_transactions%rowtype;
  v_invoice record;
  v_remaining numeric;
  v_applied numeric := 0;
  v_row jsonb;
  v_index integer := 0;
begin
  select * into v_tx from public.payment_transactions where id = p_transaction_id for update;
  if not found or v_tx.purpose <> 'online_account_card' or v_tx.module_id <> 'customers' or v_tx.record_id is null or v_tx.status not in ('paid','verified') then
    return jsonb_build_object('success', false, 'message', 'تراکنش کارت حساب قابل ثبت نیست.');
  end if;
  if coalesce((v_tx.metadata ->> 'account_card_payment_applied')::boolean, false) then return jsonb_build_object('success', true, 'already_exists', true); end if;
  v_remaining := v_tx.amount;
  for v_invoice in select id, remaining_balance from public.invoices where org_id = v_tx.org_id and customer_id = v_tx.record_id and status in ('confirmed','final','settled','completed') and coalesce(remaining_balance,0) > 0 order by invoice_date nulls last, created_at, id for update loop
    exit when v_remaining <= 0;
    v_index := v_index + 1;
    v_applied := least(v_remaining, greatest(coalesce(v_invoice.remaining_balance,0),0));
    v_row := jsonb_strip_nulls(jsonb_build_object('row_key', 'gateway_' || replace(v_tx.id::text, '-', '') || '_' || v_index, 'date', to_char(coalesce(v_tx.paid_at, v_tx.verified_at, now()), 'YYYY-MM-DD'), 'amount', v_applied, 'payment_type', 'online', 'status', 'received', 'description', trim(both ' ' from concat('پرداخت آنلاین زرین‌پال', case when v_tx.ref_id is not null then ' - کد پیگیری: ' || v_tx.ref_id else '' end)), 'source', 'online_gateway', 'locked', true, '_readonly', true, '_lockedByGateway', true, '_lockedFields', jsonb_build_array('date','amount','payment_type','status','description'), 'gateway_provider', v_tx.provider, 'gateway_scope', v_tx.gateway_scope, 'gateway_transaction_id', v_tx.id::text, 'authority', v_tx.authority, 'ref_id', v_tx.ref_id));
    update public.invoices set payments = coalesce(payments, '[]'::jsonb) || jsonb_build_array(v_row), updated_at = now() where id = v_invoice.id and org_id = v_tx.org_id;
    v_remaining := v_remaining - v_applied;
  end loop;
  update public.payment_transactions set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('account_card_payment_applied', true, 'account_card_payment_applied_at', now(), 'allocated_amount', v_tx.amount - v_remaining, 'unallocated_amount', v_remaining) where id = v_tx.id;
  return jsonb_build_object('success', true, 'already_exists', false, 'allocated_amount', v_tx.amount - v_remaining, 'unallocated_amount', v_remaining);
end;
$$;
revoke all on function public.apply_online_account_card_payment_transaction(uuid) from public, anon, authenticated;
grant execute on function public.apply_online_account_card_payment_transaction(uuid) to service_role;

commit;
