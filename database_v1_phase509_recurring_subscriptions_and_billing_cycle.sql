-- =====================================================
-- TazeSystem - Phase 509: recurring subscriptions and billing cycle
-- Date: 2026-09-16
-- Type: additive / idempotent
-- =====================================================

begin;

alter table public.saas_catalog_items
  add column if not exists billing_cycle text not null default 'one_time';

alter table public.saas_catalog_items drop constraint if exists saas_catalog_items_billing_cycle_check;
alter table public.saas_catalog_items add constraint saas_catalog_items_billing_cycle_check
  check (billing_cycle in ('one_time', 'monthly'));

alter table public.saas_org_settings
  add column if not exists billing_readonly boolean not null default false,
  add column if not exists billing_readonly_at timestamptz;

alter table public.saas_org_entitlements drop constraint if exists saas_org_entitlements_source_check;
alter table public.saas_org_entitlements add constraint saas_org_entitlements_source_check
  check (source in ('purchase', 'subscription', 'admin_adjustment'));

alter table public.payment_transactions drop constraint if exists payment_transactions_purpose_check;
alter table public.payment_transactions add constraint payment_transactions_purpose_check
  check (purpose in (
    'online_invoice', 'online_account_card', 'saas_renewal', 'saas_account_order',
    'saas_billing_wallet_topup', 'saas_subscription_invoice', 'ai_topup', 'sms_topup',
    'extra_user', 'manual'
  ));

create table if not exists public.saas_recurring_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  item_kind text not null check (item_kind in ('plan', 'module', 'feature', 'quota')),
  source_code text not null,
  entitlement_code text not null,
  quantity numeric not null default 1 check (quantity > 0),
  amount_irt numeric not null check (amount_irt >= 0),
  status text not null default 'active' check (status in ('active', 'grace', 'expired', 'cancelled')),
  current_period_starts_at timestamptz not null default now(),
  current_period_ends_at timestamptz not null,
  next_invoice_at timestamptz not null,
  last_invoice_at timestamptz,
  source_order_id uuid references public.saas_orders(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_saas_recurring_subscriptions_active_item
  on public.saas_recurring_subscriptions (org_id, item_kind, source_code)
  where status in ('active', 'grace');
create index if not exists idx_saas_recurring_subscriptions_invoice_due
  on public.saas_recurring_subscriptions (next_invoice_at)
  where status in ('active', 'grace');
create index if not exists idx_saas_recurring_subscriptions_org_status
  on public.saas_recurring_subscriptions (org_id, status, current_period_ends_at);

create table if not exists public.saas_subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.saas_recurring_subscriptions(id) on delete cascade,
  status text not null default 'issued' check (status in ('issued', 'paid', 'overdue', 'cancelled')),
  period_starts_at timestamptz not null,
  period_ends_at timestamptz not null,
  due_at timestamptz not null,
  grace_ends_at timestamptz not null,
  total_irt numeric not null check (total_irt >= 0),
  payment_transaction_id uuid references public.payment_transactions(id) on delete set null,
  paid_at timestamptz,
  last_payment_attempt_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, period_starts_at)
);

create index if not exists idx_saas_subscription_invoices_org_created
  on public.saas_subscription_invoices (org_id, created_at desc);
create index if not exists idx_saas_subscription_invoices_collect
  on public.saas_subscription_invoices (status, due_at, grace_ends_at);
create unique index if not exists idx_saas_subscription_invoices_payment_once
  on public.saas_subscription_invoices (payment_transaction_id)
  where payment_transaction_id is not null;

alter table public.saas_recurring_subscriptions enable row level security;
alter table public.saas_subscription_invoices enable row level security;
drop policy if exists p_saas_recurring_subscriptions_org_read on public.saas_recurring_subscriptions;
create policy p_saas_recurring_subscriptions_org_read on public.saas_recurring_subscriptions
for select to authenticated using (org_id = public.current_org_id());
drop policy if exists p_saas_subscription_invoices_org_read on public.saas_subscription_invoices;
create policy p_saas_subscription_invoices_org_read on public.saas_subscription_invoices
for select to authenticated using (org_id = public.current_org_id());
revoke all on public.saas_recurring_subscriptions, public.saas_subscription_invoices from public, anon, authenticated;
grant select on public.saas_recurring_subscriptions, public.saas_subscription_invoices to authenticated;

create or replace function public.refresh_saas_subscription_entitlement(p_subscription_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare subscription_row public.saas_recurring_subscriptions%rowtype;
begin
  select * into subscription_row from public.saas_recurring_subscriptions where id = p_subscription_id;
  if subscription_row.id is null or subscription_row.item_kind = 'plan' then return; end if;
  update public.saas_org_entitlements
  set state = case when subscription_row.status in ('active', 'grace') then 'enabled' else 'expired' end,
      quantity = subscription_row.quantity,
      expires_at = subscription_row.current_period_ends_at,
      metadata = metadata || jsonb_build_object('subscription_id', subscription_row.id),
      updated_at = now()
  where org_id = subscription_row.org_id
    and source = 'subscription'
    and item_kind = subscription_row.item_kind
    and entitlement_code = subscription_row.entitlement_code;
  if not found then
    insert into public.saas_org_entitlements(org_id, item_kind, entitlement_code, quantity, state, source, expires_at, metadata)
    values (
      subscription_row.org_id, subscription_row.item_kind, subscription_row.entitlement_code,
      subscription_row.quantity,
      case when subscription_row.status in ('active', 'grace') then 'enabled' else 'expired' end,
      'subscription', subscription_row.current_period_ends_at,
      jsonb_build_object('subscription_id', subscription_row.id)
    );
  end if;
end; $$;

create or replace function public.activate_saas_order_items(
  p_order_id uuid,
  p_payment_transaction_id uuid default null,
  p_payment_method text default 'online'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare order_row public.saas_orders%rowtype; entry record; catalog_row public.saas_catalog_items%rowtype;
  subscription_row public.saas_recurring_subscriptions%rowtype; item_quantity numeric; item_amount numeric;
  cycle text; now_at timestamptz := now();
begin
  select * into order_row from public.saas_orders where id = p_order_id for update;
  if order_row.id is null then raise exception 'saas_order_not_found'; end if;
  if order_row.status = 'paid' then return jsonb_build_object('success', true, 'already_applied', true); end if;

  for entry in select value from jsonb_array_elements(order_row.items) loop
    item_quantity := greatest(coalesce((entry.value ->> 'quantity')::numeric, 1), 1);
    -- quantity میزان سهمیه‌ای است که فعال می‌شود (برای نمونه ۵ گیگ)، نه لزوماً
    -- تعداد واحد فروش. مبلغ تمدید همیشه از مبلغ خط سفارش خوانده می‌شود.
    item_amount := greatest(coalesce((entry.value ->> 'line_total_irt')::numeric, (entry.value ->> 'unit_price_irt')::numeric * coalesce((entry.value ->> 'purchase_quantity')::numeric, 1), 0), 0);
    if entry.value ->> 'item_kind' = 'plan' then
      update public.saas_org_settings
      set plan_code = entry.value ->> 'entitlement_code', status = case when status in ('draft', 'trial', 'demo') then 'active' else status end,
          billing_readonly = false, billing_readonly_at = null, updated_at = now()
      where org_id = order_row.org_id;
      update public.saas_recurring_subscriptions
      set status = 'cancelled', updated_at = now()
      where org_id = order_row.org_id and item_kind = 'plan' and status in ('active', 'grace');
      insert into public.saas_recurring_subscriptions(org_id, item_kind, source_code, entitlement_code, quantity, amount_irt, status, current_period_starts_at, current_period_ends_at, next_invoice_at, source_order_id, metadata)
      values (order_row.org_id, 'plan', 'plan:' || (entry.value ->> 'entitlement_code'), entry.value ->> 'entitlement_code', 1, item_amount, 'active', now_at, now_at + interval '30 days', now_at + interval '23 days', order_row.id, jsonb_build_object('payment_method', p_payment_method, 'payment_transaction_id', p_payment_transaction_id));
    else
      select * into catalog_row from public.saas_catalog_items where code = entry.value ->> 'code' limit 1;
      cycle := coalesce(catalog_row.billing_cycle, 'one_time');
      if cycle = 'monthly' then
        select * into subscription_row from public.saas_recurring_subscriptions
        where org_id = order_row.org_id and item_kind = entry.value ->> 'item_kind' and source_code = entry.value ->> 'code' and status in ('active', 'grace')
        for update;
        if subscription_row.id is null then
          insert into public.saas_recurring_subscriptions(org_id, item_kind, source_code, entitlement_code, quantity, amount_irt, status, current_period_starts_at, current_period_ends_at, next_invoice_at, source_order_id, metadata)
          values (order_row.org_id, entry.value ->> 'item_kind', entry.value ->> 'code', entry.value ->> 'entitlement_code', item_quantity, item_amount, 'active', now_at, now_at + interval '30 days', now_at + interval '23 days', order_row.id, jsonb_build_object('payment_method', p_payment_method, 'payment_transaction_id', p_payment_transaction_id))
          returning * into subscription_row;
        else
          update public.saas_recurring_subscriptions
          set quantity = quantity + item_quantity, amount_irt = amount_irt + item_amount,
              current_period_ends_at = greatest(current_period_ends_at, now_at + interval '30 days'),
              next_invoice_at = greatest(next_invoice_at, now_at + interval '23 days'), updated_at = now()
          where id = subscription_row.id returning * into subscription_row;
        end if;
        perform public.refresh_saas_subscription_entitlement(subscription_row.id);
      else
        insert into public.saas_org_entitlements (org_id, item_kind, entitlement_code, quantity, state, source, order_id, created_by, metadata)
        values (order_row.org_id, entry.value ->> 'item_kind', entry.value ->> 'entitlement_code', item_quantity, 'enabled', 'purchase', order_row.id, order_row.created_by, jsonb_build_object('payment_transaction_id', p_payment_transaction_id, 'payment_method', p_payment_method));
      end if;
    end if;
  end loop;
  update public.saas_orders set status = 'paid', payment_transaction_id = coalesce(p_payment_transaction_id, payment_transaction_id), paid_at = now(), metadata = metadata || jsonb_build_object('payment_method', p_payment_method), updated_at = now() where id = order_row.id;
  return jsonb_build_object('success', true, 'order_id', order_row.id);
end; $$;

create or replace function public.apply_saas_order_payment_transaction(p_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare tx public.payment_transactions%rowtype; order_id uuid;
begin
  select * into tx from public.payment_transactions where id = p_transaction_id for update;
  if tx.id is null or tx.purpose <> 'saas_account_order' or tx.status not in ('verified', 'paid') then raise exception 'payment_not_verified'; end if;
  order_id := (tx.metadata ->> 'saas_order_id')::uuid;
  if not exists (select 1 from public.saas_orders where id = order_id and org_id = tx.org_id) then raise exception 'saas_order_not_found'; end if;
  return public.activate_saas_order_items(order_id, tx.id, 'online');
end; $$;

create or replace function public.pay_current_saas_order_from_billing_wallet(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org_id uuid := public.current_org_id(); order_row public.saas_orders%rowtype; wallet public.org_billing_wallets%rowtype; applied jsonb;
begin
  if auth.uid() is null or v_org_id is null then raise exception 'organization_access_denied'; end if;
  if not exists (select 1 from public.user_organization_memberships m where m.user_id = auth.uid() and m.org_id = v_org_id and m.is_active and (m.is_owner or m.software_role = 'admin')) then raise exception 'organization_admin_required'; end if;
  select * into order_row from public.saas_orders where id = p_order_id and org_id = v_org_id for update;
  if order_row.id is null then raise exception 'saas_order_not_found'; end if;
  if order_row.status = 'paid' then return jsonb_build_object('success', true, 'already_applied', true); end if;
  if order_row.status <> 'pending_payment' then raise exception 'saas_order_not_payable'; end if;
  insert into public.org_billing_wallets(org_id) values (v_org_id) on conflict (org_id) do nothing;
  select * into wallet from public.org_billing_wallets where org_id = v_org_id for update;
  if wallet.status <> 'active' or wallet.balance_irt < order_row.total_irt then raise exception 'billing_wallet_insufficient'; end if;
  update public.org_billing_wallets set balance_irt = balance_irt - order_row.total_irt, updated_at = now() where org_id = v_org_id returning * into wallet;
  insert into public.org_billing_wallet_transactions(org_id, kind, amount_irt, balance_after_irt, order_id, description, created_by)
  values (v_org_id, 'order_payment', -order_row.total_irt, wallet.balance_irt, order_row.id, 'پرداخت سفارش حساب از کیف پول', auth.uid());
  applied := public.activate_saas_order_items(order_row.id, null, 'billing_wallet');
  return applied || jsonb_build_object('balance_irt', wallet.balance_irt);
end; $$;

-- Existing customers do not lose access on the day recurring billing launches.
insert into public.saas_recurring_subscriptions(org_id, item_kind, source_code, entitlement_code, quantity, amount_irt, status, current_period_starts_at, current_period_ends_at, next_invoice_at, metadata)
select settings.org_id, 'plan', 'plan:' || plan.code, plan.code, 1, greatest(coalesce(plan.price_monthly, 0), 0), 'active', now(), now() + interval '30 days', now() + interval '23 days', jsonb_build_object('source', 'billing_migration_grace_period')
from public.saas_org_settings settings
join public.saas_plans plan on lower(plan.code) = lower(coalesce(settings.plan_code, ''))
where settings.is_demo = false and settings.is_billing_provider = false and settings.plan_code is not null
  and not public.org_is_saas_admin(settings.org_id)
  and not exists (select 1 from public.saas_recurring_subscriptions subscription where subscription.org_id = settings.org_id and subscription.item_kind = 'plan' and subscription.status in ('active', 'grace'));

create or replace function public.activate_saas_subscription_invoice(
  p_invoice_id uuid,
  p_payment_transaction_id uuid default null,
  p_payment_method text default 'online'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare invoice_row public.saas_subscription_invoices%rowtype; subscription_row public.saas_recurring_subscriptions%rowtype;
begin
  select * into invoice_row from public.saas_subscription_invoices where id = p_invoice_id for update;
  if invoice_row.id is null then raise exception 'saas_subscription_invoice_not_found'; end if;
  if invoice_row.status = 'paid' then return jsonb_build_object('success', true, 'already_applied', true); end if;
  if invoice_row.status not in ('issued', 'overdue') then raise exception 'saas_subscription_invoice_not_payable'; end if;
  select * into subscription_row from public.saas_recurring_subscriptions where id = invoice_row.subscription_id for update;
  if subscription_row.id is null then raise exception 'saas_subscription_not_found'; end if;
  update public.saas_subscription_invoices set status = 'paid', payment_transaction_id = coalesce(p_payment_transaction_id, payment_transaction_id), paid_at = now(), metadata = metadata || jsonb_build_object('payment_method', p_payment_method), updated_at = now() where id = invoice_row.id;
  update public.saas_recurring_subscriptions set status = 'active', current_period_starts_at = invoice_row.period_starts_at, current_period_ends_at = invoice_row.period_ends_at, next_invoice_at = invoice_row.period_ends_at - interval '7 days', last_invoice_at = now(), updated_at = now() where id = subscription_row.id;
  if subscription_row.item_kind = 'plan' then
    update public.saas_org_settings set billing_readonly = false, billing_readonly_at = null, status = case when status = 'past_due' then 'active' else status end, updated_at = now() where org_id = subscription_row.org_id;
  else
    perform public.refresh_saas_subscription_entitlement(subscription_row.id);
  end if;
  return jsonb_build_object('success', true, 'invoice_id', invoice_row.id);
end; $$;

create or replace function public.pay_saas_subscription_invoice_from_wallet_internal(p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare invoice_row public.saas_subscription_invoices%rowtype; wallet public.org_billing_wallets%rowtype; applied jsonb;
begin
  select * into invoice_row from public.saas_subscription_invoices where id = p_invoice_id for update;
  if invoice_row.id is null then raise exception 'saas_subscription_invoice_not_found'; end if;
  if invoice_row.status = 'paid' then return jsonb_build_object('success', true, 'already_applied', true); end if;
  insert into public.org_billing_wallets(org_id) values (invoice_row.org_id) on conflict (org_id) do nothing;
  select * into wallet from public.org_billing_wallets where org_id = invoice_row.org_id for update;
  update public.saas_subscription_invoices set last_payment_attempt_at = now(), updated_at = now() where id = invoice_row.id;
  if wallet.status <> 'active' or wallet.balance_irt < invoice_row.total_irt then return jsonb_build_object('success', false, 'reason', 'billing_wallet_insufficient'); end if;
  update public.org_billing_wallets set balance_irt = balance_irt - invoice_row.total_irt, updated_at = now() where org_id = invoice_row.org_id returning * into wallet;
  insert into public.org_billing_wallet_transactions(org_id, kind, amount_irt, balance_after_irt, description, metadata)
  values (invoice_row.org_id, 'order_payment', -invoice_row.total_irt, wallet.balance_irt, 'پرداخت صورت‌حساب اشتراک از کیف پول', jsonb_build_object('subscription_invoice_id', invoice_row.id));
  applied := public.activate_saas_subscription_invoice(invoice_row.id, null, 'billing_wallet');
  return applied || jsonb_build_object('balance_irt', wallet.balance_irt);
end; $$;

create or replace function public.pay_current_saas_subscription_invoice_from_billing_wallet(p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org_id uuid := public.current_org_id();
begin
  if auth.uid() is null or v_org_id is null then raise exception 'organization_access_denied'; end if;
  if not exists (select 1 from public.user_organization_memberships m where m.user_id = auth.uid() and m.org_id = v_org_id and m.is_active and (m.is_owner or m.software_role = 'admin')) then raise exception 'organization_admin_required'; end if;
  if not exists (select 1 from public.saas_subscription_invoices where id = p_invoice_id and org_id = v_org_id) then raise exception 'saas_subscription_invoice_not_found'; end if;
  return public.pay_saas_subscription_invoice_from_wallet_internal(p_invoice_id);
end; $$;

create or replace function public.prepare_current_saas_subscription_invoice_payment(p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org_id uuid := public.current_org_id(); invoice_row public.saas_subscription_invoices%rowtype;
begin
  if auth.uid() is null or v_org_id is null then raise exception 'organization_access_denied'; end if;
  if not exists (select 1 from public.user_organization_memberships m where m.user_id = auth.uid() and m.org_id = v_org_id and m.is_active and (m.is_owner or m.software_role = 'admin')) then raise exception 'organization_admin_required'; end if;
  select * into invoice_row from public.saas_subscription_invoices where id = p_invoice_id and org_id = v_org_id for update;
  if invoice_row.id is null then raise exception 'saas_subscription_invoice_not_found'; end if;
  if invoice_row.status = 'paid' then raise exception 'saas_subscription_invoice_already_paid'; end if;
  if invoice_row.status not in ('issued', 'overdue') or invoice_row.total_irt <= 0 then raise exception 'saas_subscription_invoice_not_payable'; end if;
  return jsonb_build_object('success', true, 'invoice_id', invoice_row.id, 'amount_irt', invoice_row.total_irt);
end; $$;

create or replace function public.apply_saas_subscription_invoice_payment_transaction(p_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare tx public.payment_transactions%rowtype; invoice_id uuid;
begin
  select * into tx from public.payment_transactions where id = p_transaction_id for update;
  if tx.id is null or tx.purpose <> 'saas_subscription_invoice' or tx.status not in ('verified', 'paid') then raise exception 'payment_not_verified'; end if;
  invoice_id := (tx.metadata ->> 'saas_subscription_invoice_id')::uuid;
  if not exists (select 1 from public.saas_subscription_invoices where id = invoice_id and org_id = tx.org_id and total_irt = tx.amount) then raise exception 'saas_subscription_invoice_not_found'; end if;
  return public.activate_saas_subscription_invoice(invoice_id, tx.id, 'online');
end; $$;

create or replace function public.run_saas_billing_cycle(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
declare subscription_row record; invoice_row record; created_count integer := 0; paid_count integer := 0; expired_count integer := 0; payment_result jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  for subscription_row in
    select * from public.saas_recurring_subscriptions
    where status in ('active', 'grace') and next_invoice_at <= now()
      and not public.org_is_saas_admin(org_id)
    order by next_invoice_at asc limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  loop
    insert into public.saas_subscription_invoices(org_id, subscription_id, status, period_starts_at, period_ends_at, due_at, grace_ends_at, total_irt, metadata)
    values (subscription_row.org_id, subscription_row.id, 'issued', subscription_row.current_period_ends_at, subscription_row.current_period_ends_at + interval '30 days', subscription_row.current_period_ends_at, subscription_row.current_period_ends_at + interval '3 days', subscription_row.amount_irt, jsonb_build_object('source', 'recurring_billing'))
    on conflict (subscription_id, period_starts_at) do nothing;
    if found then created_count := created_count + 1; end if;
    update public.saas_recurring_subscriptions set next_invoice_at = current_period_ends_at + interval '1 year', updated_at = now() where id = subscription_row.id;
  end loop;

  for invoice_row in
    select id from public.saas_subscription_invoices
  where status = 'issued' and total_irt > 0 and (last_payment_attempt_at is null or last_payment_attempt_at < now() - interval '1 hour')
    and not public.org_is_saas_admin(org_id)
    order by due_at asc limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  loop
    payment_result := public.pay_saas_subscription_invoice_from_wallet_internal(invoice_row.id);
    if coalesce((payment_result ->> 'success')::boolean, false) then paid_count := paid_count + 1; end if;
  end loop;

  update public.saas_subscription_invoices set status = 'overdue', updated_at = now()
  where status = 'issued' and grace_ends_at < now() and not public.org_is_saas_admin(org_id);
  update public.saas_recurring_subscriptions subscription
  set status = 'expired', updated_at = now()
  from public.saas_subscription_invoices invoice
  where invoice.subscription_id = subscription.id and invoice.status = 'overdue' and subscription.status in ('active', 'grace')
    and not public.org_is_saas_admin(subscription.org_id);
  get diagnostics expired_count = row_count;
  update public.saas_org_settings settings set billing_readonly = true, billing_readonly_at = now(), updated_at = now()
  where exists (
    select 1 from public.saas_recurring_subscriptions subscription
    where subscription.org_id = settings.org_id and subscription.item_kind = 'plan' and subscription.status = 'expired'
  ) and not settings.is_billing_provider and not public.org_is_saas_admin(settings.org_id);
  for subscription_row in
    select id from public.saas_recurring_subscriptions
    where status = 'expired' and item_kind <> 'plan' and not public.org_is_saas_admin(org_id)
  loop
    perform public.refresh_saas_subscription_entitlement(subscription_row.id);
  end loop;
  return jsonb_build_object('success', true, 'invoices_created', created_count, 'invoices_paid_from_wallet', paid_count, 'subscriptions_expired', expired_count);
end; $$;

create or replace function public.get_current_org_saas_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare org_id_val uuid := public.current_org_id(); rec record; next_invoice record; is_saas_admin_org boolean := false;
begin
  if auth.uid() is null or org_id_val is null then return null; end if;
  select status, is_demo, is_readonly, billing_readonly, trial_ends_at, plan_code, slug into rec from public.saas_org_settings where org_id = org_id_val limit 1;
  if not found then return null; end if;
  is_saas_admin_org := public.org_is_saas_admin(org_id_val);
  if not is_saas_admin_org then
    select due_at, grace_ends_at, total_irt, status into next_invoice from public.saas_subscription_invoices where org_id = org_id_val and status in ('issued', 'overdue') order by due_at asc limit 1;
  end if;
  return jsonb_build_object(
    'status', rec.status, 'is_demo', rec.is_demo,
    'is_readonly', rec.is_readonly or (not is_saas_admin_org and (rec.billing_readonly or (rec.trial_ends_at is not null and rec.trial_ends_at < now()))),
    'billing_readonly', case when is_saas_admin_org then false else rec.billing_readonly end,
    'trial_ends_at', rec.trial_ends_at, 'plan_code', rec.plan_code, 'slug', rec.slug,
    'next_billing_invoice', case when next_invoice.due_at is null then null else jsonb_build_object('due_at', next_invoice.due_at, 'grace_ends_at', next_invoice.grace_ends_at, 'total_irt', next_invoice.total_irt, 'status', next_invoice.status) end
  );
end; $$;

create or replace function public.saas_account_overview_payload(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare settings_row public.saas_org_settings%rowtype; plan_row public.saas_plans%rowtype; enabled_modules jsonb; enabled_features jsonb; quotas jsonb; plan_quotas jsonb := '{}'::jsonb; member_count integer; ai_wallet jsonb; billing_wallet jsonb; instagram_count integer; is_saas_admin_org boolean := false;
begin
  select * into settings_row from public.saas_org_settings where org_id = p_org_id;
  if settings_row.org_id is null then return jsonb_build_object('is_saas_org', false); end if;
  is_saas_admin_org := public.org_is_saas_admin(p_org_id);
  select * into plan_row from public.saas_plans where lower(code) = lower(coalesce(settings_row.plan_code, '')) limit 1;
  plan_quotas := coalesce(plan_row.included_quotas, '{}'::jsonb);
  select coalesce(jsonb_object_agg(code, enabled), '{}'::jsonb) into enabled_modules from (
    select key as code, lower(value #>> '{}') in ('true', '1', 'yes', 'on') as enabled from jsonb_each(coalesce(plan_row.enabled_modules, '{}'::jsonb))
    union all select entitlement_code, state = 'enabled' from public.saas_org_entitlements where org_id = p_org_id and item_kind = 'module' and state <> 'expired' and (expires_at is null or expires_at > now())
  ) source;
  enabled_modules := enabled_modules || coalesce(settings_row.module_overrides, '{}'::jsonb);
  select coalesce(jsonb_object_agg(code, enabled), '{}'::jsonb) into enabled_features from (
    select key as code, lower(value #>> '{}') in ('true', '1', 'yes', 'on') as enabled from jsonb_each(coalesce(plan_row.enabled_features, '{}'::jsonb))
    union all select entitlement_code, state = 'enabled' from public.saas_org_entitlements where org_id = p_org_id and item_kind = 'feature' and state <> 'expired' and (expires_at is null or expires_at > now())
  ) source;
  enabled_features := enabled_features || coalesce(settings_row.feature_overrides, '{}'::jsonb);
  select coalesce(jsonb_object_agg(entitlement_code, total), '{}'::jsonb) into quotas from (
    select entitlement_code, sum(case when state = 'enabled' then quantity else 0 end) as total from public.saas_org_entitlements where org_id = p_org_id and item_kind = 'quota' and state <> 'expired' and (expires_at is null or expires_at > now()) group by entitlement_code
  ) source;
  select count(*) into member_count from public.user_organization_memberships where org_id = p_org_id and is_active;
  select to_jsonb(wallet) into ai_wallet from public.org_ai_wallets wallet where wallet.org_id = p_org_id;
  select to_jsonb(wallet) into billing_wallet from public.org_billing_wallets wallet where wallet.org_id = p_org_id;
  select count(*) into instagram_count from public.instagram_accounts where org_id = p_org_id and is_active;
  return jsonb_build_object(
    'is_saas_org', true,
    'organization', jsonb_build_object('name', (select name from public.organizations where id = p_org_id), 'status', settings_row.status, 'is_demo', settings_row.is_demo, 'trial_ends_at', settings_row.trial_ends_at, 'billing_readonly', settings_row.billing_readonly),
    'plan', jsonb_build_object('code', plan_row.code, 'title', plan_row.title, 'price_monthly', plan_row.price_monthly, 'included_users', plan_row.included_users, 'max_users', plan_row.max_users, 'storage_gb', plan_row.storage_gb),
    'access', jsonb_build_object('modules', enabled_modules, 'features', enabled_features, 'full_access', is_saas_admin_org),
    'management', jsonb_build_object('plan_code', settings_row.plan_code, 'module_overrides', settings_row.module_overrides, 'feature_overrides', settings_row.feature_overrides, 'quota_adjustments', quotas),
    'quotas', jsonb_build_object('users_used', member_count, 'users_included', coalesce(plan_row.included_users, 0), 'users_extra', coalesce((quotas ->> 'users')::numeric, 0), 'storage_gb', coalesce(plan_row.storage_gb, 0) + coalesce((quotas ->> 'storage_gb')::numeric, 0), 'scheduled_runs', coalesce((plan_quotas ->> 'scheduled_runs')::numeric, 0) + coalesce((quotas ->> 'scheduled_runs')::numeric, 0), 'active_workflows', coalesce((plan_quotas ->> 'active_workflows')::numeric, 0) + coalesce((quotas ->> 'active_workflows')::numeric, 0), 'sms_credit', coalesce((quotas ->> 'sms_credit')::numeric, 0), 'instagram_accounts_used', instagram_count, 'instagram_accounts', coalesce((quotas ->> 'instagram_accounts')::numeric, 0)),
    'ai_wallet', coalesce(ai_wallet, '{}'::jsonb), 'billing_wallet', coalesce(billing_wallet, '{}'::jsonb),
    'subscription_invoices', case when is_saas_admin_org then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(invoice) order by invoice.due_at asc) from (select id, status, total_irt, due_at, grace_ends_at, paid_at, created_at from public.saas_subscription_invoices where org_id = p_org_id order by created_at desc limit 20) invoice), '[]'::jsonb) end,
    'history', coalesce((select jsonb_agg(jsonb_build_object('kind', 'order', 'title', 'خرید حساب', 'status', status, 'amount_irt', total_irt, 'created_at', created_at) order by created_at desc) from (select * from public.saas_orders where org_id = p_org_id order by created_at desc limit 20) orders), '[]'::jsonb)
  );
end; $$;

-- چرخهٔ پرداخت، جزء اطلاعات تجاری هر قلم است و باید از پنل تازه سیستم قابل
-- مدیریت بماند؛ نه اینکه در رابط کاربری یا کد فروشگاه ثابت شود.
create or replace function public.get_current_saas_store_catalog()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(item order by (item ->> 'sort_order')::int, item ->> 'title'), '[]'::jsonb) from (
    select jsonb_build_object('code', code, 'title', title, 'description', description, 'item_kind', item_kind, 'entitlement_code', entitlement_code, 'quantity', quantity, 'price_irt', price_irt, 'billing_cycle', billing_cycle, 'sort_order', sort_order, 'metadata', metadata) as item
    from public.saas_catalog_items where is_active and is_public and price_irt > 0
    union all
    select jsonb_build_object('code', 'plan:' || code, 'title', title, 'description', short_description, 'item_kind', 'plan', 'entitlement_code', code, 'quantity', 1, 'price_irt', price_monthly, 'billing_cycle', 'monthly', 'sort_order', sort_order, 'metadata', jsonb_build_object('included_users', included_users, 'storage_gb', storage_gb))
    from public.saas_plans where is_active and is_public and price_monthly > 0
  ) items;
$$;

create or replace function public.create_current_saas_order(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid := public.current_org_id(); normalized_items jsonb := '[]'::jsonb;
  entry record; catalog public.saas_catalog_items%rowtype; plan public.saas_plans%rowtype;
  qty numeric; entitlement_quantity numeric; line_total numeric; total numeric := 0; order_id uuid;
begin
  if auth.uid() is null or v_org_id is null then raise exception 'organization_access_denied'; end if;
  if not exists (select 1 from public.user_organization_memberships where user_id = auth.uid() and org_id = v_org_id and is_active and (is_owner or software_role = 'admin')) then raise exception 'organization_admin_required'; end if;
  if not exists (select 1 from public.saas_org_settings where org_id = v_org_id) then raise exception 'saas_org_not_found'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'order_items_required'; end if;
  for entry in select value from jsonb_array_elements(p_items) loop
    qty := greatest(1, least(coalesce((entry.value ->> 'quantity')::numeric, 1), 1000));
    if left(coalesce(entry.value ->> 'code', ''), 5) = 'plan:' then
      select * into plan from public.saas_plans where code = substr(entry.value ->> 'code', 6) and is_active and is_public;
      if plan.id is null or plan.price_monthly <= 0 then raise exception 'catalog_item_not_available'; end if;
      line_total := plan.price_monthly;
      normalized_items := normalized_items || jsonb_build_array(jsonb_build_object('code', 'plan:' || plan.code, 'title', plan.title, 'item_kind', 'plan', 'entitlement_code', plan.code, 'quantity', 1, 'purchase_quantity', 1, 'unit_price_irt', plan.price_monthly, 'line_total_irt', line_total));
      total := total + line_total;
    else
      select * into catalog from public.saas_catalog_items where code = entry.value ->> 'code' and is_active and is_public and price_irt > 0;
      if catalog.id is null then raise exception 'catalog_item_not_available'; end if;
      entitlement_quantity := qty * catalog.quantity;
      line_total := qty * catalog.price_irt;
      normalized_items := normalized_items || jsonb_build_array(jsonb_build_object('code', catalog.code, 'title', catalog.title, 'item_kind', catalog.item_kind, 'entitlement_code', catalog.entitlement_code, 'quantity', entitlement_quantity, 'purchase_quantity', qty, 'unit_price_irt', catalog.price_irt, 'line_total_irt', line_total));
      total := total + line_total;
    end if;
  end loop;
  insert into public.saas_orders (org_id, created_by, total_irt, items) values (v_org_id, auth.uid(), total, normalized_items) returning id into order_id;
  return jsonb_build_object('success', true, 'order_id', order_id, 'total_irt', total, 'items', normalized_items);
end; $$;

create or replace function public.admin_upsert_saas_catalog_item(p_item jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text := lower(nullif(trim(coalesce(p_item ->> 'code', '')), ''));
  v_kind text := lower(nullif(trim(coalesce(p_item ->> 'item_kind', '')), ''));
  v_cycle text := lower(coalesce(nullif(trim(p_item ->> 'billing_cycle'), ''), 'one_time'));
  saved public.saas_catalog_items%rowtype;
begin
  if not public.current_user_has_saas_admin_permission('edit_orgs') then raise exception 'permission denied'; end if;
  if v_code is null or v_code !~ '^[a-z0-9_:-]{3,80}$' then raise exception 'catalog_code_invalid'; end if;
  if v_kind not in ('module', 'feature', 'quota') then raise exception 'catalog_kind_invalid'; end if;
  if v_cycle not in ('one_time', 'monthly') then raise exception 'catalog_billing_cycle_invalid'; end if;
  insert into public.saas_catalog_items(code, title, description, item_kind, entitlement_code, quantity, price_irt, billing_cycle, is_active, is_public, sort_order, metadata)
  values (v_code, nullif(trim(coalesce(p_item ->> 'title', '')), ''), nullif(trim(coalesce(p_item ->> 'description', '')), ''), v_kind, nullif(trim(coalesce(p_item ->> 'entitlement_code', '')), ''), greatest(coalesce((p_item ->> 'quantity')::numeric, 1), 1), greatest(coalesce((p_item ->> 'price_irt')::numeric, 0), 0), v_cycle, coalesce((p_item ->> 'is_active')::boolean, false), coalesce((p_item ->> 'is_public')::boolean, true), coalesce((p_item ->> 'sort_order')::integer, 100), coalesce(p_item -> 'metadata', '{}'::jsonb))
  on conflict (code) do update set title = excluded.title, description = excluded.description, item_kind = excluded.item_kind, entitlement_code = excluded.entitlement_code, quantity = excluded.quantity, price_irt = excluded.price_irt, billing_cycle = excluded.billing_cycle, is_active = excluded.is_active, is_public = excluded.is_public, sort_order = excluded.sort_order, metadata = excluded.metadata, updated_at = now()
  returning * into saved;
  if saved.title is null or saved.entitlement_code is null then raise exception 'catalog_title_and_entitlement_required'; end if;
  return to_jsonb(saved);
end; $$;

revoke all on function public.refresh_saas_subscription_entitlement(uuid), public.activate_saas_order_items(uuid, uuid, text), public.activate_saas_subscription_invoice(uuid, uuid, text), public.pay_saas_subscription_invoice_from_wallet_internal(uuid), public.run_saas_billing_cycle(integer), public.apply_saas_subscription_invoice_payment_transaction(uuid) from public, anon, authenticated;
grant execute on function public.apply_saas_order_payment_transaction(uuid), public.apply_saas_subscription_invoice_payment_transaction(uuid), public.run_saas_billing_cycle(integer) to service_role;
grant execute on function public.pay_current_saas_order_from_billing_wallet(uuid), public.pay_current_saas_subscription_invoice_from_billing_wallet(uuid), public.prepare_current_saas_subscription_invoice_payment(uuid), public.get_current_org_saas_status() to authenticated;
grant execute on function public.get_current_saas_store_catalog(), public.admin_upsert_saas_catalog_item(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
