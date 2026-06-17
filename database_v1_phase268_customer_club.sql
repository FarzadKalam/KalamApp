-- =====================================================
-- TazeSystem - Phase 268 Customer Club foundation
-- Date: 2026-06-17
-- Type: Additive / idempotent migration
-- Goal: Customer club rules, auditable customer credit, discount codes,
--       database-backed customer financial stats and overview.
-- =====================================================

begin;

alter table if exists public.customers
  add column if not exists previous_system_first_purchase_date date,
  add column if not exists previous_system_last_purchase_date date,
  add column if not exists previous_system_purchase_count numeric(18,3) not null default 0,
  add column if not exists previous_system_invoice_total numeric(18,2) not null default 0,
  add column if not exists previous_system_paid_total numeric(18,2) not null default 0,
  add column if not exists previous_system_balance_total numeric(18,2) not null default 0,
  add column if not exists total_balance numeric(18,2) not null default 0,
  add column if not exists loyalty_credit_balance numeric(18,2) not null default 0;

alter table if exists public.invoices
  add column if not exists loyalty_discount_code_id uuid,
  add column if not exists loyalty_discount_code text,
  add column if not exists loyalty_discount_amount numeric(18,2) not null default 0;

create table if not exists public.customer_loyalty_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  name text not null,
  rule_type text not null,
  reward_type text not null default 'amount',
  reward_amount numeric(18,2) not null default 0,
  reward_percent numeric(9,4) not null default 0,
  max_reward_amount numeric(18,2),
  conditions_all jsonb not null default '[]'::jsonb,
  conditions_any jsonb not null default '[]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  starts_at date,
  ends_at date,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_customer_loyalty_rules_type check (rule_type in ('referral', 'birthday', 'cashback', 'first_purchase', 'leveling')),
  constraint chk_customer_loyalty_rules_reward_type check (reward_type in ('amount', 'percent'))
);

create table if not exists public.customer_loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  rule_id uuid references public.customer_loyalty_rules(id) on delete set null,
  entry_type text not null,
  source_type text not null,
  source_table text,
  source_record_id uuid,
  source_row_key text,
  amount numeric(18,2) not null,
  effective_date date not null default current_date,
  idempotency_key text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint chk_customer_loyalty_ledger_entry_type check (entry_type in ('credit', 'debit', 'adjustment')),
  constraint chk_customer_loyalty_ledger_amount check (amount >= 0)
);

create table if not exists public.customer_discount_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  code text not null,
  title text not null,
  discount_type text not null default 'amount',
  discount_value numeric(18,2) not null default 0,
  max_discount_amount numeric(18,2),
  starts_at date,
  ends_at date,
  max_uses integer,
  per_customer_max_uses integer,
  conditions_all jsonb not null default '[]'::jsonb,
  conditions_any jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_customer_discount_codes_type check (discount_type in ('amount', 'percent')),
  constraint chk_customer_discount_codes_value check (discount_value >= 0)
);

create table if not exists public.customer_discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  discount_code_id uuid not null references public.customer_discount_codes(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  discount_amount numeric(18,2) not null default 0,
  redeemed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_customer_loyalty_ledger_org_idempotency
  on public.customer_loyalty_ledger(org_id, idempotency_key);

create index if not exists idx_customer_loyalty_ledger_customer_date
  on public.customer_loyalty_ledger(org_id, customer_id, effective_date, created_at);

create index if not exists idx_customer_loyalty_rules_org_type_active
  on public.customer_loyalty_rules(org_id, rule_type, is_active);

create unique index if not exists idx_customer_discount_codes_org_code
  on public.customer_discount_codes(org_id, lower(code));

create index if not exists idx_customer_discount_redemptions_org_code
  on public.customer_discount_redemptions(org_id, discount_code_id, customer_id);

create index if not exists idx_customers_org_financial_stats
  on public.customers(org_id, first_purchase_date, last_purchase_date)
  where first_purchase_date is not null or last_purchase_date is not null;

create index if not exists idx_invoices_org_customer_status_date
  on public.invoices(org_id, customer_id, status, invoice_date)
  where customer_id is not null;

alter table public.customer_loyalty_rules enable row level security;
alter table public.customer_loyalty_ledger enable row level security;
alter table public.customer_discount_codes enable row level security;
alter table public.customer_discount_redemptions enable row level security;

drop policy if exists customer_loyalty_rules_org_select on public.customer_loyalty_rules;
drop policy if exists customer_loyalty_rules_org_insert on public.customer_loyalty_rules;
drop policy if exists customer_loyalty_rules_org_update on public.customer_loyalty_rules;
drop policy if exists customer_loyalty_rules_org_delete on public.customer_loyalty_rules;
create policy customer_loyalty_rules_org_select on public.customer_loyalty_rules
  for select to authenticated using (org_id = public.current_org_id());
create policy customer_loyalty_rules_org_insert on public.customer_loyalty_rules
  for insert to authenticated with check (org_id = public.current_org_id());
create policy customer_loyalty_rules_org_update on public.customer_loyalty_rules
  for update to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy customer_loyalty_rules_org_delete on public.customer_loyalty_rules
  for delete to authenticated using (org_id = public.current_org_id());

drop policy if exists customer_loyalty_ledger_org_select on public.customer_loyalty_ledger;
drop policy if exists customer_loyalty_ledger_org_insert on public.customer_loyalty_ledger;
drop policy if exists customer_loyalty_ledger_org_update on public.customer_loyalty_ledger;
drop policy if exists customer_loyalty_ledger_org_delete on public.customer_loyalty_ledger;
create policy customer_loyalty_ledger_org_select on public.customer_loyalty_ledger
  for select to authenticated using (org_id = public.current_org_id());
create policy customer_loyalty_ledger_org_insert on public.customer_loyalty_ledger
  for insert to authenticated with check (org_id = public.current_org_id());
create policy customer_loyalty_ledger_org_update on public.customer_loyalty_ledger
  for update to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy customer_loyalty_ledger_org_delete on public.customer_loyalty_ledger
  for delete to authenticated using (org_id = public.current_org_id());

drop policy if exists customer_discount_codes_org_select on public.customer_discount_codes;
drop policy if exists customer_discount_codes_org_insert on public.customer_discount_codes;
drop policy if exists customer_discount_codes_org_update on public.customer_discount_codes;
drop policy if exists customer_discount_codes_org_delete on public.customer_discount_codes;
create policy customer_discount_codes_org_select on public.customer_discount_codes
  for select to authenticated using (org_id = public.current_org_id());
create policy customer_discount_codes_org_insert on public.customer_discount_codes
  for insert to authenticated with check (org_id = public.current_org_id());
create policy customer_discount_codes_org_update on public.customer_discount_codes
  for update to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy customer_discount_codes_org_delete on public.customer_discount_codes
  for delete to authenticated using (org_id = public.current_org_id());

drop policy if exists customer_discount_redemptions_org_select on public.customer_discount_redemptions;
drop policy if exists customer_discount_redemptions_org_insert on public.customer_discount_redemptions;
drop policy if exists customer_discount_redemptions_org_update on public.customer_discount_redemptions;
drop policy if exists customer_discount_redemptions_org_delete on public.customer_discount_redemptions;
create policy customer_discount_redemptions_org_select on public.customer_discount_redemptions
  for select to authenticated using (org_id = public.current_org_id());
create policy customer_discount_redemptions_org_insert on public.customer_discount_redemptions
  for insert to authenticated with check (org_id = public.current_org_id());
create policy customer_discount_redemptions_org_update on public.customer_discount_redemptions
  for update to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy customer_discount_redemptions_org_delete on public.customer_discount_redemptions
  for delete to authenticated using (org_id = public.current_org_id());

grant select, insert, update, delete on public.customer_loyalty_rules to authenticated;
grant select, insert, update, delete on public.customer_loyalty_ledger to authenticated;
grant select, insert, update, delete on public.customer_discount_codes to authenticated;
grant select, insert, update, delete on public.customer_discount_redemptions to authenticated;

create or replace function public.is_customer_purchase_status(p_status text)
returns boolean
language sql
immutable
as $$
  select coalesce(lower(trim(p_status)), '') not in ('', 'created', 'proforma', 'canceled', 'cancelled')
$$;

create or replace function public.recalculate_invoice_totals()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_total numeric(18,2) := 0;
  v_paid numeric(18,2) := 0;
  v_item jsonb;
  v_amount numeric;
  v_status text;
  v_discount_type text;
  v_discount_value numeric(18,2);
  v_discount_amount numeric(18,2) := 0;
begin
  for v_item in select jsonb_array_elements(coalesce(new."invoiceItems", '[]'::jsonb)) loop
    begin
      v_amount := (v_item->>'total_price')::numeric;
      if v_amount is not null then
        v_total := v_total + v_amount;
      end if;
    exception when others then
      null;
    end;
  end loop;

  v_discount_type := lower(trim(coalesce(new.global_discount_type, 'amount')));
  v_discount_value := greatest(0, coalesce(new.global_discount_value, 0));
  if v_discount_type = 'percent' then
    v_discount_amount := least(v_total, round(v_total * v_discount_value / 100, 2));
  else
    v_discount_amount := least(v_total, v_discount_value);
  end if;
  v_total := greatest(0, v_total - v_discount_amount);

  for v_item in select jsonb_array_elements(coalesce(new.payments, '[]'::jsonb)) loop
    begin
      v_status := lower(trim(coalesce(v_item->>'status', '')));
      if (v_item ? 'status')
         and v_status <> ''
         and v_status not in ('received', 'paid', 'approved', 'cleared')
      then
        continue;
      end if;
      v_amount := abs((v_item->>'amount')::numeric);
      if v_amount is not null then
        v_paid := v_paid + v_amount;
      end if;
    exception when others then
      null;
    end;
  end loop;

  new.total_invoice_amount := v_total;
  new.total_received_amount := v_paid;
  new.remaining_balance := v_total - v_paid;
  return new;
end;
$$;

create or replace function public.sync_customer_loyalty_balance(p_customer_id uuid)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_balance numeric(18,2) := 0;
begin
  if v_org_id is null or p_customer_id is null then
    return 0;
  end if;

  select coalesce(sum(case
    when entry_type = 'debit' then -amount
    else amount
  end), 0)
    into v_balance
  from public.customer_loyalty_ledger
  where org_id = v_org_id
    and customer_id = p_customer_id;

  update public.customers
  set loyalty_credit_balance = v_balance
  where id = p_customer_id
    and org_id = v_org_id;

  return v_balance;
end;
$$;

create or replace function public.sync_customer_financial_stats(p_customer_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_customer record;
  v_current_count numeric(18,3) := 0;
  v_current_total numeric(18,2) := 0;
  v_current_paid numeric(18,2) := 0;
  v_current_balance numeric(18,2) := 0;
  v_current_first date;
  v_current_last date;
  v_first date;
  v_last date;
  v_purchase_count numeric(18,3) := 0;
  v_total_spend numeric(18,2) := 0;
  v_total_paid numeric(18,2) := 0;
  v_total_balance numeric(18,2) := 0;
  v_acquaintance_days integer;
  v_cooperation_days integer;
begin
  if v_org_id is null or p_customer_id is null then
    return;
  end if;

  select *
    into v_customer
  from public.customers
  where id = p_customer_id
    and org_id = v_org_id;

  if not found then
    return;
  end if;

  select
    count(*)::numeric(18,3),
    coalesce(sum(coalesce(total_invoice_amount, 0)), 0),
    coalesce(sum(coalesce(total_received_amount, 0)), 0),
    coalesce(sum(coalesce(remaining_balance, 0)), 0),
    min(coalesce(invoice_date, created_at::date)),
    max(coalesce(invoice_date, created_at::date))
    into v_current_count, v_current_total, v_current_paid, v_current_balance, v_current_first, v_current_last
  from public.invoices
  where org_id = v_org_id
    and customer_id = p_customer_id
    and public.is_customer_purchase_status(status);

  v_first := least(coalesce(v_customer.previous_system_first_purchase_date, v_current_first), coalesce(v_current_first, v_customer.previous_system_first_purchase_date));
  v_last := greatest(coalesce(v_customer.previous_system_last_purchase_date, v_current_last), coalesce(v_current_last, v_customer.previous_system_last_purchase_date));
  v_purchase_count := coalesce(v_customer.previous_system_purchase_count, 0) + coalesce(v_current_count, 0);
  v_total_spend := coalesce(v_customer.previous_system_invoice_total, 0) + coalesce(v_current_total, 0);
  v_total_paid := coalesce(v_customer.previous_system_paid_total, 0) + coalesce(v_current_paid, 0);
  v_total_balance := coalesce(v_customer.previous_system_balance_total, 0) + coalesce(v_current_balance, 0);
  v_acquaintance_days := case when v_first is null then null else greatest(0, current_date - v_first) end;
  v_cooperation_days := case when v_first is null or v_last is null then null else greatest(0, v_last - v_first) end;

  update public.customers
  set
    first_purchase_date = v_first,
    last_purchase_date = v_last,
    purchase_count = v_purchase_count,
    total_spend = v_total_spend,
    total_paid_amount = v_total_paid,
    total_balance = v_total_balance,
    acquaintance_days = v_acquaintance_days,
    cooperation_days = v_cooperation_days
  where id = p_customer_id
    and org_id = v_org_id;
end;
$$;

create or replace function public.sync_customer_financial_stats_from_invoice()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.sync_customer_financial_stats(new.customer_id);
    if tg_op = 'UPDATE' and old.customer_id is distinct from new.customer_id then
      perform public.sync_customer_financial_stats(old.customer_id);
    end if;
    return new;
  end if;

  perform public.sync_customer_financial_stats(old.customer_id);
  return old;
end;
$$;

create or replace function public.sync_customer_financial_stats_from_customer()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.sync_customer_financial_stats(new.id);
  return new;
end;
$$;

create or replace function public.apply_customer_loyalty_credit_from_invoice()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_payment jsonb;
  v_amount numeric(18,2);
  v_status text;
  v_type text;
  v_row_key text;
  v_existing_balance numeric(18,2);
  v_credit_total numeric(18,2) := 0;
  v_customer_id uuid;
begin
  if v_org_id is null then
    return new;
  end if;

  v_customer_id := new.customer_id;

  delete from public.customer_loyalty_ledger
  where org_id = v_org_id
    and source_type = 'invoice_credit_payment'
    and source_table = 'invoices'
    and source_record_id = new.id;

  if tg_op = 'UPDATE'
     and old.customer_id is not null
     and old.customer_id is distinct from new.customer_id
  then
    perform public.sync_customer_loyalty_balance(old.customer_id);
  end if;

  if v_customer_id is null then
    return new;
  end if;

  select coalesce(sum(case when entry_type = 'debit' then -amount else amount end), 0)
    into v_existing_balance
  from public.customer_loyalty_ledger
  where org_id = v_org_id
    and customer_id = v_customer_id;

  for v_payment in select value from jsonb_array_elements(coalesce(new.payments, '[]'::jsonb)) loop
    v_type := lower(trim(coalesce(v_payment->>'payment_type', '')));
    v_status := lower(trim(coalesce(v_payment->>'status', '')));
    if v_type <> 'credit' then
      continue;
    end if;
    if (v_payment ? 'status')
       and v_status <> ''
       and v_status not in ('received', 'paid', 'approved', 'cleared')
    then
      continue;
    end if;
    begin
      v_amount := abs((v_payment->>'amount')::numeric);
    exception when others then
      v_amount := 0;
    end;
    if v_amount <= 0 then
      continue;
    end if;
    v_credit_total := v_credit_total + v_amount;
  end loop;

  if v_credit_total > v_existing_balance + 0.01 then
    raise exception 'اعتبار مشتری برای این دریافت کافی نیست.';
  end if;

  for v_payment in select value from jsonb_array_elements(coalesce(new.payments, '[]'::jsonb)) loop
    v_type := lower(trim(coalesce(v_payment->>'payment_type', '')));
    v_status := lower(trim(coalesce(v_payment->>'status', '')));
    if v_type <> 'credit' then
      continue;
    end if;
    if (v_payment ? 'status')
       and v_status <> ''
       and v_status not in ('received', 'paid', 'approved', 'cleared')
    then
      continue;
    end if;
    begin
      v_amount := abs((v_payment->>'amount')::numeric);
    exception when others then
      v_amount := 0;
    end;
    if v_amount <= 0 then
      continue;
    end if;
    v_row_key := coalesce(nullif(v_payment->>'row_key', ''), nullif(v_payment->>'key', ''), md5(v_payment::text));

    insert into public.customer_loyalty_ledger (
      org_id, customer_id, entry_type, source_type, source_table, source_record_id,
      source_row_key, amount, effective_date, idempotency_key, description, metadata
    ) values (
      v_org_id, v_customer_id, 'debit', 'invoice_credit_payment', 'invoices', new.id,
      v_row_key, v_amount, coalesce(nullif(v_payment->>'date', '')::date, coalesce(new.invoice_date, current_date)),
      'invoice_credit_payment:' || new.id::text || ':' || v_row_key,
      'مصرف اعتبار در فاکتور فروش',
      jsonb_build_object('invoice_name', coalesce(new.name, new.system_code), 'payment_row', v_payment)
    )
    on conflict (org_id, idempotency_key) do update
      set amount = excluded.amount,
          effective_date = excluded.effective_date,
          metadata = excluded.metadata;
  end loop;

  perform public.sync_customer_loyalty_balance(v_customer_id);
  return new;
end;
$$;

create or replace function public.apply_customer_loyalty_rewards_from_invoice()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_rule record;
  v_amount numeric(18,2);
  v_referrer uuid;
  v_has_prior_purchase boolean;
begin
  if v_org_id is null or new.customer_id is null or not public.is_customer_purchase_status(new.status) then
    return new;
  end if;

  for v_rule in
    select *
    from public.customer_loyalty_rules
    where org_id = v_org_id
      and is_active = true
      and rule_type in ('cashback', 'first_purchase', 'referral')
      and (starts_at is null or starts_at <= coalesce(new.invoice_date, current_date))
      and (ends_at is null or ends_at >= coalesce(new.invoice_date, current_date))
      and jsonb_array_length(coalesce(conditions_all, '[]'::jsonb)) = 0
      and jsonb_array_length(coalesce(conditions_any, '[]'::jsonb)) = 0
  loop
    v_amount := case
      when v_rule.reward_type = 'percent' then round(coalesce(new.total_invoice_amount, 0) * coalesce(v_rule.reward_percent, 0) / 100, 2)
      else coalesce(v_rule.reward_amount, 0)
    end;
    if v_rule.max_reward_amount is not null then
      v_amount := least(v_amount, v_rule.max_reward_amount);
    end if;
    if v_amount <= 0 then
      continue;
    end if;

    if v_rule.rule_type = 'first_purchase' then
      select exists(
        select 1 from public.invoices i
        where i.org_id = v_org_id
          and i.customer_id = new.customer_id
          and i.id <> new.id
          and public.is_customer_purchase_status(i.status)
          and coalesce(i.invoice_date, i.created_at::date) <= coalesce(new.invoice_date, new.created_at::date)
      ) into v_has_prior_purchase;
      if v_has_prior_purchase then
        continue;
      end if;
    end if;

    if v_rule.rule_type = 'referral' then
      select referrer_customer_id
        into v_referrer
      from public.customers
      where id = new.customer_id
        and org_id = v_org_id
        and referrer_module = 'customers';
      if v_referrer is null then
        continue;
      end if;
      insert into public.customer_loyalty_ledger (
        org_id, customer_id, rule_id, entry_type, source_type, source_table, source_record_id,
        amount, effective_date, idempotency_key, description, metadata
      ) values (
        v_org_id, v_referrer, v_rule.id, 'credit', 'referral_reward', 'invoices', new.id,
        v_amount, coalesce(new.invoice_date, current_date),
        'referral_reward:' || v_rule.id::text || ':' || new.id::text,
        'پاداش معرفی مشتری',
        jsonb_build_object('introduced_customer_id', new.customer_id)
      ) on conflict (org_id, idempotency_key) do nothing;
      perform public.sync_customer_loyalty_balance(v_referrer);
    else
      insert into public.customer_loyalty_ledger (
        org_id, customer_id, rule_id, entry_type, source_type, source_table, source_record_id,
        amount, effective_date, idempotency_key, description, metadata
      ) values (
        v_org_id, new.customer_id, v_rule.id, 'credit', v_rule.rule_type || '_reward', 'invoices', new.id,
        v_amount, coalesce(new.invoice_date, current_date),
        v_rule.rule_type || '_reward:' || v_rule.id::text || ':' || new.id::text,
        case when v_rule.rule_type = 'cashback' then 'کش‌بک خرید' else 'هدیه اولین خرید' end,
        '{}'::jsonb
      ) on conflict (org_id, idempotency_key) do nothing;
      perform public.sync_customer_loyalty_balance(new.customer_id);
    end if;
  end loop;

  return new;
end;
$$;

create or replace function public.get_customer_operational_financial_overview(p_customer_id uuid)
returns table (
  key text,
  row_type text,
  source_label text,
  source_module_id text,
  source_record_id uuid,
  payment_type text,
  status text,
  cheque_status text,
  row_date date,
  debit numeric,
  credit numeric,
  balance numeric,
  invoice_label text,
  bank_label text,
  description text,
  created_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  with customer_row as (
    select *
    from public.customers
    where id = p_customer_id
      and org_id = public.current_org_id()
  ),
  opening as (
    select
      'legacy_opening_' || c.id::text as key,
      'opening'::text as row_type,
      'اطلاعات سیستم قبلی'::text as source_label,
      'customers'::text as source_module_id,
      c.id as source_record_id,
      ''::text as payment_type,
      'opening'::text as status,
      ''::text as cheque_status,
      coalesce(c.previous_system_first_purchase_date, c.created_at::date) as row_date,
      coalesce(c.previous_system_invoice_total, 0) as debit,
      coalesce(c.previous_system_paid_total, 0) as credit,
      coalesce(c.full_name, c.business_name, c.system_code, 'مشتری') as invoice_label,
      '-'::text as bank_label,
      ('مانده سیستم قبلی: ' || coalesce(c.previous_system_balance_total, 0)::text)::text as description,
      c.created_at
    from customer_row c
    where coalesce(c.previous_system_invoice_total, 0) <> 0
       or coalesce(c.previous_system_paid_total, 0) <> 0
       or coalesce(c.previous_system_balance_total, 0) <> 0
  ),
  invoices_rows as (
    select
      'invoice_' || i.id::text as key,
      'invoice'::text as row_type,
      'صدور فاکتور فروش'::text as source_label,
      'invoices'::text as source_module_id,
      i.id as source_record_id,
      ''::text as payment_type,
      coalesce(i.status, '')::text as status,
      ''::text as cheque_status,
      coalesce(i.invoice_date, i.created_at::date) as row_date,
      coalesce(i.total_invoice_amount, 0) as debit,
      0::numeric as credit,
      coalesce(i.name, i.system_code, 'فاکتور فروش') as invoice_label,
      '-'::text as bank_label,
      ('فاکتور فروش | مانده: ' || coalesce(i.remaining_balance, 0)::text)::text as description,
      i.created_at
    from public.invoices i
    where i.org_id = public.current_org_id()
      and i.customer_id = p_customer_id
      and public.is_customer_purchase_status(i.status)
  ),
  invoice_payment_rows as (
    select
      'invoice_payment_' || i.id::text || '_' || p.ordinality::text as key,
      'receipt'::text as row_type,
      'دریافت فاکتور فروش'::text as source_label,
      'invoices'::text as source_module_id,
      i.id as source_record_id,
      lower(trim(coalesce(p.value->>'payment_type', '')))::text as payment_type,
      lower(trim(coalesce(p.value->>'status', '')))::text as status,
      coalesce(p.value->>'cheque_status', '')::text as cheque_status,
      coalesce(nullif(p.value->>'date', '')::date, coalesce(i.invoice_date, i.created_at::date)) as row_date,
      0::numeric as debit,
      case
        when lower(trim(coalesce(p.value->>'cheque_status', ''))) not in ('bounced', 'returned')
        then abs(coalesce(nullif(p.value->>'amount', '')::numeric, 0))
        else 0
      end as credit,
      coalesce(i.name, i.system_code, 'فاکتور فروش') as invoice_label,
      '-'::text as bank_label,
      coalesce(p.value->>'description', '')::text as description,
      i.created_at
    from public.invoices i
    cross join lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) with ordinality p(value, ordinality)
    where i.org_id = public.current_org_id()
      and i.customer_id = p_customer_id
      and public.is_customer_purchase_status(i.status)
      and not (p.value ? '_cash_bank_operation_id' and nullif(p.value->>'_cash_bank_operation_id', '') is not null)
      and (
        not (p.value ? 'status')
        or lower(trim(coalesce(p.value->>'status', ''))) = ''
        or lower(trim(coalesce(p.value->>'status', ''))) in ('received', 'paid', 'approved', 'cleared')
      )
      and abs(coalesce(nullif(p.value->>'amount', '')::numeric, 0)) > 0
  ),
  cash_rows as (
    select
      'cash_' || op.id::text as key,
      case when op.operation_type = 'payment' then 'payment' else 'receipt' end::text as row_type,
      'ثبت نقد و بانک'::text as source_label,
      'cash_bank_operations'::text as source_module_id,
      op.id as source_record_id,
      coalesce(op.payment_type, '')::text as payment_type,
      coalesce(op.status, '')::text as status,
      coalesce(ch.status, '')::text as cheque_status,
      coalesce(op.operation_date, op.created_at::date) as row_date,
      case when op.operation_type = 'payment' then abs(coalesce(op.amount, 0)) else 0 end as debit,
      case
        when op.operation_type <> 'payment'
          and lower(trim(coalesce(ch.status, ''))) not in ('bounced', 'returned')
        then abs(coalesce(op.amount, 0))
        else 0
      end as credit,
      '-'::text as invoice_label,
      '-'::text as bank_label,
      coalesce(op.description, '')::text as description,
      op.created_at
    from public.cash_bank_operations op
    left join public.cheques ch
      on ch.id = op.cheque_id
     and ch.org_id = op.org_id
    where op.org_id = public.current_org_id()
      and op.customer_id = p_customer_id
      and lower(trim(coalesce(op.operation_type, ''))) <> 'transfer'
      and lower(trim(coalesce(op.status, ''))) in ('received', 'approved', 'paid', 'settled', 'cleared')
  ),
  all_rows as (
    select * from opening
    union all select * from invoices_rows
    union all select * from invoice_payment_rows
    union all select * from cash_rows
  ),
  ordered as (
    select
      all_rows.*,
      sum(debit - credit) over (order by row_date nulls first, created_at nulls first, key) as running_balance
    from all_rows
  )
  select
    ordered.key,
    ordered.row_type,
    ordered.source_label,
    ordered.source_module_id,
    ordered.source_record_id,
    ordered.payment_type,
    ordered.status,
    ordered.cheque_status,
    ordered.row_date,
    ordered.debit,
    ordered.credit,
    ordered.running_balance as balance,
    ordered.invoice_label,
    ordered.bank_label,
    ordered.description,
    ordered.created_at
  from ordered
  order by row_date nulls first, created_at nulls first, key;
$$;

drop trigger if exists trg_invoices_recalc_totals on public.invoices;
create trigger trg_invoices_recalc_totals
  before insert or update of "invoiceItems", payments, global_discount_type, global_discount_value
  on public.invoices
  for each row
  execute function public.recalculate_invoice_totals();

drop trigger if exists trg_purchase_invoices_recalc_totals on public.purchase_invoices;
create trigger trg_purchase_invoices_recalc_totals
  before insert or update of "invoiceItems", payments, global_discount_type, global_discount_value
  on public.purchase_invoices
  for each row
  execute function public.recalculate_invoice_totals();

drop trigger if exists trg_customer_financial_stats_from_invoice on public.invoices;
create trigger trg_customer_financial_stats_from_invoice
  after insert or update or delete
  on public.invoices
  for each row
  execute function public.sync_customer_financial_stats_from_invoice();

drop trigger if exists trg_customer_financial_stats_from_customer on public.customers;
create trigger trg_customer_financial_stats_from_customer
  after update of previous_system_first_purchase_date, previous_system_last_purchase_date,
    previous_system_purchase_count, previous_system_invoice_total, previous_system_paid_total,
    previous_system_balance_total
  on public.customers
  for each row
  execute function public.sync_customer_financial_stats_from_customer();

drop trigger if exists trg_invoice_loyalty_credit_payment on public.invoices;
create trigger trg_invoice_loyalty_credit_payment
  after insert or update of payments, customer_id, invoice_date, name, system_code
  on public.invoices
  for each row
  execute function public.apply_customer_loyalty_credit_from_invoice();

drop trigger if exists trg_invoice_loyalty_rewards on public.invoices;
create trigger trg_invoice_loyalty_rewards
  after insert or update of status, total_invoice_amount, customer_id, invoice_date
  on public.invoices
  for each row
  execute function public.apply_customer_loyalty_rewards_from_invoice();

update public.invoices
set "invoiceItems" = "invoiceItems"
where org_id = public.current_org_id()
  and (
    jsonb_array_length(coalesce("invoiceItems", '[]'::jsonb)) > 0
    or jsonb_array_length(coalesce(payments, '[]'::jsonb)) > 0
  );

update public.customers
set previous_system_purchase_count = coalesce(previous_system_purchase_count, 0),
    previous_system_invoice_total = coalesce(previous_system_invoice_total, 0),
    previous_system_paid_total = coalesce(previous_system_paid_total, 0),
    previous_system_balance_total = coalesce(previous_system_balance_total, 0),
    total_balance = coalesce(total_balance, 0),
    loyalty_credit_balance = coalesce(loyalty_credit_balance, 0)
where org_id = public.current_org_id();

select public.sync_customer_financial_stats(id)
from public.customers
where org_id = public.current_org_id();

revoke all on function public.sync_customer_loyalty_balance(uuid) from public;
revoke all on function public.sync_customer_financial_stats(uuid) from public;
revoke all on function public.get_customer_operational_financial_overview(uuid) from public;
grant execute on function public.sync_customer_loyalty_balance(uuid) to authenticated;
grant execute on function public.sync_customer_financial_stats(uuid) to authenticated;
grant execute on function public.get_customer_operational_financial_overview(uuid) to authenticated;

commit;
