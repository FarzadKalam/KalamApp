-- Phase 276: Online payment gateway foundation.
-- Adds tenant-safe payment gateway settings, transaction ledger, public invoice
-- payment availability RPC, and locked invoice receipt append helper.

begin;

-- Allow the new payment gateway connection type without invalidating
-- production-only/legacy connection types already accepted by the current
-- constraint.
do $$
declare
  v_existing_check text;
begin
  select pg_get_expr(c.conbin, c.conrelid)
  into v_existing_check
  from pg_constraint c
  where c.conrelid = 'public.integration_settings'::regclass
    and c.conname = 'integration_settings_connection_type_check'
  limit 1;

  alter table public.integration_settings
    drop constraint if exists integration_settings_connection_type_check;

  if v_existing_check is not null and btrim(v_existing_check) <> '' then
    execute format(
      'alter table public.integration_settings add constraint integration_settings_connection_type_check check ((%s) or connection_type = %L)',
      v_existing_check,
      'payment_gateway'
    );
  else
    alter table public.integration_settings
      add constraint integration_settings_connection_type_check
      check (connection_type is null or btrim(connection_type) <> '');
  end if;
end;
$$;

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  gateway_scope text not null default 'system',
  provider text not null default 'zarinpal',
  purpose text not null,
  module_id text,
  record_id uuid,
  amount numeric(18,2) not null,
  currency text not null default 'IRR',
  status text not null default 'pending',
  authority text,
  ref_id text,
  card_pan text,
  fee numeric(18,2),
  callback_url text,
  start_url text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  request_payload jsonb not null default '{}'::jsonb,
  verify_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_transactions_gateway_scope_check
    check (gateway_scope in ('system', 'org')),
  constraint payment_transactions_purpose_check
    check (purpose in ('online_invoice', 'saas_renewal', 'ai_topup', 'sms_topup', 'extra_user', 'manual')),
  constraint payment_transactions_status_check
    check (status in ('pending', 'redirected', 'paid', 'verified', 'failed', 'cancelled', 'expired', 'refunded')),
  constraint payment_transactions_currency_check
    check (currency in ('IRR', 'IRT')),
  constraint payment_transactions_amount_positive_check
    check (amount > 0)
);

create index if not exists idx_payment_transactions_org_created
  on public.payment_transactions(org_id, created_at desc);

create index if not exists idx_payment_transactions_org_purpose_status
  on public.payment_transactions(org_id, purpose, status, created_at desc);

create index if not exists idx_payment_transactions_record
  on public.payment_transactions(org_id, module_id, record_id, created_at desc)
  where module_id is not null and record_id is not null;

create unique index if not exists payment_transactions_authority_uidx
  on public.payment_transactions(provider, authority)
  where authority is not null and btrim(authority) <> '';

alter table public.payment_transactions enable row level security;

drop policy if exists p_payment_transactions_org_select on public.payment_transactions;
create policy p_payment_transactions_org_select
on public.payment_transactions
for select
to authenticated
using (org_id = public.current_org_id());

revoke all on table public.payment_transactions from public, anon, authenticated;
grant select on table public.payment_transactions to authenticated;
grant select, insert, update, delete on table public.payment_transactions to service_role;

create or replace function public.touch_payment_transactions_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_payment_transactions_updated_at on public.payment_transactions;
create trigger trg_payment_transactions_updated_at
before update on public.payment_transactions
for each row
execute function public.touch_payment_transactions_updated_at();

create or replace function public.org_has_plan_feature(
  p_org_id uuid,
  p_feature_key text,
  p_default_enabled boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan_features jsonb := '{}'::jsonb;
  v_feature_overrides jsonb := '{}'::jsonb;
  v_raw_value text;
  v_key text := nullif(btrim(coalesce(p_feature_key, '')), '');
begin
  if p_org_id is null or v_key is null then
    return false;
  end if;

  select
    coalesce(p.enabled_features, '{}'::jsonb),
    coalesce(s.feature_overrides, '{}'::jsonb)
  into v_plan_features, v_feature_overrides
  from public.saas_org_settings s
  left join public.saas_plans p on lower(p.code) = lower(coalesce(s.plan_code, ''))
  where s.org_id = p_org_id
  limit 1;

  v_raw_value := coalesce(v_feature_overrides ->> v_key, v_plan_features ->> v_key);
  if v_raw_value is null then
    return coalesce(p_default_enabled, false);
  end if;

  return lower(v_raw_value) in ('true', '1', 'yes', 'on');
end;
$$;

revoke all on function public.org_has_plan_feature(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.org_has_plan_feature(uuid, text, boolean) to service_role;

create or replace function public.org_has_saas_admin_payment_access(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_roles r
    cross join lateral (
      select coalesce(r.permissions -> '__saas_admin', '{}'::jsonb) as saas_admin_permissions
    ) p
    where r.org_id = p_org_id
      and (
        coalesce((p.saas_admin_permissions ->> 'view')::boolean, false) = true
        or coalesce((p.saas_admin_permissions ->> 'edit')::boolean, false) = true
        or exists (
          select 1
          from jsonb_each(coalesce(p.saas_admin_permissions -> 'fields', '{}'::jsonb)) as f(key, value)
          where f.value = 'true'::jsonb
        )
      )
  )
$$;

revoke all on function public.org_has_saas_admin_payment_access(uuid) from public, anon, authenticated;
grant execute on function public.org_has_saas_admin_payment_access(uuid) to service_role;

create or replace function public.get_public_invoice_payment_state(
  p_system_code text,
  p_module text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_invoice_id uuid;
  v_remaining numeric := 0;
  v_currency text := 'IRR';
  v_settings jsonb := '{}'::jsonb;
  v_gateway_active boolean := false;
  v_gateway_scope text := 'system';
  v_payment_domain text := '';
  v_callback_path text := '/payment/callback';
  v_is_saas_admin_org boolean := false;
  v_has_custom_domain_payment boolean := false;
  v_org_gateway_merchant_configured boolean := false;
  v_available boolean := false;
begin
  if p_module <> 'invoices' then
    return jsonb_build_object(
      'available', false,
      'reason', 'unsupported_module'
    );
  end if;

  v_org_id := public._resolve_org_for_public_invoice(p_system_code, p_module);
  if v_org_id is null then
    return jsonb_build_object(
      'available', false,
      'reason', 'not_found'
    );
  end if;

  select i.id, greatest(coalesce(i.remaining_balance, 0), 0)
  into v_invoice_id, v_remaining
  from public.invoices i
  where i.org_id = v_org_id
    and (i.public_slug = p_system_code or i.public_token = p_system_code)
  limit 1;

  if v_invoice_id is null then
    return jsonb_build_object(
      'available', false,
      'reason', 'not_found'
    );
  end if;

  select
    coalesce(s.settings, '{}'::jsonb),
    s.is_active = true
  into v_settings, v_gateway_active
  from public.integration_settings s
  where s.org_id = v_org_id
    and s.connection_type = 'payment_gateway'
    and coalesce(s.provider, '') = 'zarinpal'
  order by s.is_active desc, s.updated_at desc nulls last, s.created_at desc nulls last
  limit 1;

  v_gateway_scope := case
    when coalesce(v_settings ->> 'gateway_scope', 'system') = 'org' then 'org'
    else 'system'
  end;
  v_currency := case
    when coalesce(v_settings ->> 'currency', 'IRR') = 'IRT' then 'IRT'
    else 'IRR'
  end;
  v_payment_domain := btrim(coalesce(v_settings ->> 'payment_domain', ''));
  v_callback_path := coalesce(nullif(btrim(v_settings ->> 'callback_path'), ''), '/payment/callback');

  v_gateway_active := coalesce(v_gateway_active, false)
    and coalesce((v_settings ->> 'online_invoice_payments_enabled')::boolean, false)
    and v_payment_domain <> '';

  v_is_saas_admin_org := public.org_has_saas_admin_payment_access(v_org_id);

  v_has_custom_domain_payment :=
    public.org_has_plan_feature(v_org_id, 'custom_domain', false)
    and public.org_has_plan_feature(v_org_id, 'own_payment_gateway', false)
    and public.org_has_plan_feature(v_org_id, 'online_invoice_payment', false);
  v_org_gateway_merchant_configured := btrim(coalesce(v_settings ->> 'merchant_id', '')) <> '';

  v_available := v_gateway_active
    and v_remaining > 0
    and (
      (v_gateway_scope = 'system' and v_is_saas_admin_org)
      or (v_gateway_scope = 'org' and v_has_custom_domain_payment and v_org_gateway_merchant_configured)
    );

  return jsonb_build_object(
    'available', v_available,
    'reason', case
      when v_remaining <= 0 then 'already_paid'
      when not v_gateway_active then 'gateway_inactive'
      when v_gateway_scope = 'system' and not v_is_saas_admin_org then 'system_gateway_not_allowed_for_org'
      when v_gateway_scope = 'org' and not v_has_custom_domain_payment then 'org_gateway_feature_not_enabled'
      when v_gateway_scope = 'org' and not v_org_gateway_merchant_configured then 'org_gateway_merchant_missing'
      else 'available'
    end,
    'provider', 'zarinpal',
    'gateway_scope', v_gateway_scope,
    'amount', v_remaining,
    'currency', v_currency,
    'payment_domain', v_payment_domain,
    'callback_path', v_callback_path,
    'mode', case when coalesce(v_settings ->> 'mode', 'production') = 'sandbox' then 'sandbox' else 'production' end,
    'title', coalesce(v_settings ->> 'title', ''),
    'default_description', coalesce(v_settings ->> 'default_description', '')
  );
end;
$$;

revoke all on function public.get_public_invoice_payment_state(text, text) from public;
grant execute on function public.get_public_invoice_payment_state(text, text) to anon, authenticated, service_role;

create or replace function public.append_online_invoice_payment_from_transaction(
  p_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.payment_transactions%rowtype;
  v_payment_row jsonb;
  v_exists boolean := false;
begin
  select *
  into v_tx
  from public.payment_transactions
  where id = p_transaction_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'تراکنش پیدا نشد.');
  end if;

  if v_tx.purpose <> 'online_invoice'
     or v_tx.module_id <> 'invoices'
     or v_tx.record_id is null
     or v_tx.status not in ('paid', 'verified') then
    return jsonb_build_object('success', false, 'message', 'تراکنش قابل ثبت روی فاکتور نیست.');
  end if;

  select exists (
    select 1
    from public.invoices i,
         lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) payment_row(item)
    where i.id = v_tx.record_id
      and i.org_id = v_tx.org_id
      and (
        payment_row.item ->> 'gateway_transaction_id' = v_tx.id::text
        or payment_row.item ->> 'authority' = coalesce(v_tx.authority, '')
      )
  )
  into v_exists;

  if v_exists then
    return jsonb_build_object('success', true, 'already_exists', true);
  end if;

  v_payment_row := jsonb_strip_nulls(jsonb_build_object(
    'row_key', 'gateway_' || replace(v_tx.id::text, '-', ''),
    'date', to_char(coalesce(v_tx.paid_at, v_tx.verified_at, now()), 'YYYY-MM-DD'),
    'amount', v_tx.amount,
    'payment_type', 'online',
    'status', 'received',
    'description', trim(both ' ' from concat('پرداخت آنلاین زرین‌پال', case when v_tx.ref_id is not null then ' - کد پیگیری: ' || v_tx.ref_id else '' end)),
    'source', 'online_gateway',
    'locked', true,
    '_readonly', true,
    '_lockedByGateway', true,
    '_lockedFields', jsonb_build_array('date', 'amount', 'payment_type', 'status', 'description'),
    'gateway_provider', v_tx.provider,
    'gateway_scope', v_tx.gateway_scope,
    'gateway_transaction_id', v_tx.id::text,
    'authority', v_tx.authority,
    'ref_id', v_tx.ref_id
  ));

  update public.invoices
  set payments = coalesce(payments, '[]'::jsonb) || jsonb_build_array(v_payment_row),
      updated_at = now()
  where id = v_tx.record_id
    and org_id = v_tx.org_id;

  if not found then
    return jsonb_build_object('success', false, 'message', 'فاکتور پیدا نشد.');
  end if;

  update public.payment_transactions
  set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('invoice_payment_appended', true, 'invoice_payment_appended_at', now())
  where id = v_tx.id;

  return jsonb_build_object('success', true, 'already_exists', false);
end;
$$;

revoke all on function public.append_online_invoice_payment_from_transaction(uuid) from public, anon, authenticated;
grant execute on function public.append_online_invoice_payment_from_transaction(uuid) to service_role;

commit;
