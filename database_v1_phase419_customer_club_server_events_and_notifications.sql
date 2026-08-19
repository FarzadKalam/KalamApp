-- =====================================================
-- TazeSystem - Phase 419 Customer club server events
-- Date: 2026-08-20
-- Type: Additive / idempotent migration
-- Goal: tenant-safe club event history, private discount codes and
--       server-side recalculation of customer rank after invoice changes.
-- =====================================================

begin;

alter table public.customer_discount_codes
  add column if not exists customer_id uuid references public.customers(id) on delete cascade;

create index if not exists idx_customer_discount_codes_org_customer_active
  on public.customer_discount_codes(org_id, customer_id, is_active)
  where customer_id is not null;

create table if not exists public.customer_club_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  event_type text not null,
  title text not null,
  customer_id uuid references public.customers(id) on delete set null,
  rule_id uuid references public.customer_loyalty_rules(id) on delete set null,
  discount_code_id uuid references public.customer_discount_codes(id) on delete set null,
  ledger_id uuid references public.customer_loyalty_ledger(id) on delete set null,
  source_table text,
  source_record_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_club_notification_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  event_key text not null,
  customer_id uuid references public.customers(id) on delete set null,
  actions jsonb not null default '[]'::jsonb,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_club_events_org_created
  on public.customer_club_events(org_id, created_at desc);
create index if not exists idx_customer_club_events_org_type_created
  on public.customer_club_events(org_id, event_type, created_at desc);
create index if not exists idx_customer_club_events_org_customer_created
  on public.customer_club_events(org_id, customer_id, created_at desc)
  where customer_id is not null;
create index if not exists idx_customer_club_notification_queue_due
  on public.customer_club_notification_queue(status, available_at, created_at);

alter table public.customer_club_events enable row level security;
alter table public.customer_club_notification_queue enable row level security;
drop policy if exists customer_club_events_org_select on public.customer_club_events;
drop policy if exists customer_club_events_org_insert on public.customer_club_events;
create policy customer_club_events_org_select on public.customer_club_events
  for select using (org_id = public.current_org_id());
create policy customer_club_events_org_insert on public.customer_club_events
  for insert with check (org_id = public.current_org_id());
grant select, insert on public.customer_club_events to authenticated;

create or replace function public.log_customer_club_event(
  p_event_type text,
  p_title text,
  p_customer_id uuid default null,
  p_rule_id uuid default null,
  p_discount_code_id uuid default null,
  p_ledger_id uuid default null,
  p_source_table text default null,
  p_source_record_id uuid default null,
  p_payload jsonb default '{}'::jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare v_org_id uuid := public.current_org_id();
begin
  if v_org_id is null then return; end if;
  insert into public.customer_club_events (
    org_id, event_type, title, customer_id, rule_id, discount_code_id, ledger_id,
    source_table, source_record_id, payload
  ) values (
    v_org_id, p_event_type, p_title, p_customer_id, p_rule_id, p_discount_code_id, p_ledger_id,
    p_source_table, p_source_record_id, coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

create or replace function public.enqueue_customer_club_notifications(
  p_notifications jsonb,
  p_event_key text,
  p_customer_id uuid,
  p_context jsonb default '{}'::jsonb
) returns void
language plpgsql security invoker set search_path = public as $$
declare v_org_id uuid := public.current_org_id(); v_actions jsonb;
begin
  if v_org_id is null or coalesce((p_notifications->p_event_key->>'enabled')::boolean, false) is not true then return; end if;
  v_actions := coalesce(p_notifications->p_event_key->'actions', '[]'::jsonb);
  if jsonb_typeof(v_actions) <> 'array' or jsonb_array_length(v_actions) = 0 then return; end if;
  insert into public.customer_club_notification_queue(org_id, event_key, customer_id, actions, context)
  values (v_org_id, p_event_key, p_customer_id, v_actions, coalesce(p_context, '{}'::jsonb));
end; $$;

create or replace function public.log_customer_club_rule_event()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  perform public.log_customer_club_event(
    case when tg_op = 'INSERT' then 'rule_created' else 'rule_updated' end,
    case when tg_op = 'INSERT' then 'ایجاد طرح باشگاه' else 'ویرایش طرح باشگاه' end,
    null, new.id, null, null, 'customer_loyalty_rules', new.id,
    jsonb_build_object('name', new.name, 'is_active', new.is_active)
  );
  if tg_op = 'INSERT' or (old.is_active is distinct from new.is_active and new.is_active) then
    perform public.enqueue_customer_club_notifications(coalesce(new.config->'notifications', '{}'::jsonb), 'activation', null, jsonb_build_object('rule_id', new.id, 'rule_name', new.name));
  end if;
  return new;
end; $$;

create or replace function public.log_customer_club_discount_event()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  perform public.log_customer_club_event(
    case when tg_op = 'INSERT' then 'discount_created' else 'discount_updated' end,
    case when tg_op = 'INSERT' then 'ایجاد کد تخفیف' else 'ویرایش کد تخفیف' end,
    new.customer_id, null, new.id, null, 'customer_discount_codes', new.id,
    jsonb_build_object('title', new.title, 'code', new.code, 'is_active', new.is_active)
  );
  if tg_op = 'INSERT' or (old.is_active is distinct from new.is_active and new.is_active) then
    perform public.enqueue_customer_club_notifications(coalesce(new.metadata->'notifications', '{}'::jsonb), 'activation', new.customer_id, jsonb_build_object('discount_code_id', new.id, 'discount_code', new.code));
  end if;
  return new;
end; $$;

create or replace function public.log_customer_club_ledger_event()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  perform public.log_customer_club_event(
    case when new.entry_type = 'debit' then 'credit_redeemed' else 'credit_added' end,
    case when new.entry_type = 'debit' then 'مصرف اعتبار مشتری' else 'افزودن اعتبار مشتری' end,
    new.customer_id, new.rule_id, null, new.id, new.source_table, new.source_record_id,
    jsonb_build_object('amount', new.amount, 'entry_type', new.entry_type, 'source_type', new.source_type)
  );
  if new.entry_type = 'debit' then
    perform public.enqueue_customer_club_notifications(coalesce(new.metadata->'notifications', '{}'::jsonb), 'redemption', new.customer_id, jsonb_build_object('ledger_id', new.id, 'amount', new.amount));
  elsif new.rule_id is not null then
    perform public.enqueue_customer_club_notifications(coalesce((select config->'notifications' from public.customer_loyalty_rules where id = new.rule_id and org_id = public.current_org_id()), '{}'::jsonb), 'condition_met', new.customer_id, jsonb_build_object('ledger_id', new.id, 'rule_id', new.rule_id, 'amount', new.amount));
  else
    perform public.enqueue_customer_club_notifications(coalesce(new.metadata->'notifications', '{}'::jsonb), 'activation', new.customer_id, jsonb_build_object('ledger_id', new.id, 'amount', new.amount));
  end if;
  return new;
end; $$;

drop trigger if exists trg_customer_club_rule_event on public.customer_loyalty_rules;
create trigger trg_customer_club_rule_event after insert or update on public.customer_loyalty_rules
  for each row execute function public.log_customer_club_rule_event();
drop trigger if exists trg_customer_club_discount_event on public.customer_discount_codes;
create trigger trg_customer_club_discount_event after insert or update on public.customer_discount_codes
  for each row execute function public.log_customer_club_discount_event();
drop trigger if exists trg_customer_club_ledger_event on public.customer_loyalty_ledger;
create trigger trg_customer_club_ledger_event after insert on public.customer_loyalty_ledger
  for each row execute function public.log_customer_club_ledger_event();

-- رتبه بر اساس آمار محاسبه‌شدهٔ سروری بازبینی می‌شود؛ بنابراین تغییر وضعیت یا لغو
-- فاکتور نیز همان لحظه می‌تواند افت سطح ایجاد کند، نه فقط ثبت از فرم کلاینت.
create or replace function public.sync_customer_club_rank(p_customer_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_org_id uuid := public.current_org_id(); v_customer record; v_settings jsonb := '{}'::jsonb;
  v_enabled boolean := true; v_statuses jsonb := '[]'::jsonb; v_rank text := 'normal';
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
    if coalesce(v_customer.purchase_count, 0) >= coalesce((v_vip->>'min_purchase_count')::numeric, 15) and coalesce(v_customer.total_spend, 0) >= coalesce((v_vip->>'min_total_spend')::numeric, 300000000) and coalesce(v_customer.acquaintance_days, 0) >= coalesce((v_vip->>'min_acquaintance_days')::numeric, 365) then v_rank := 'vip';
    elsif coalesce(v_customer.purchase_count, 0) >= coalesce((v_gold->>'min_purchase_count')::numeric, 8) and coalesce(v_customer.total_spend, 0) >= coalesce((v_gold->>'min_total_spend')::numeric, 120000000) and coalesce(v_customer.acquaintance_days, 0) >= coalesce((v_gold->>'min_acquaintance_days')::numeric, 120) then v_rank := 'gold';
    elsif coalesce(v_customer.purchase_count, 0) >= coalesce((v_silver->>'min_purchase_count')::numeric, 3) and coalesce(v_customer.total_spend, 0) >= coalesce((v_silver->>'min_total_spend')::numeric, 30000000) and coalesce(v_customer.acquaintance_days, 0) >= coalesce((v_silver->>'min_acquaintance_days')::numeric, 30) then v_rank := 'silver'; end if;
  end if;
  v_old_rank := coalesce(v_customer.rank, 'normal');
  update public.customers set rank = v_rank where id = p_customer_id and org_id = v_org_id and rank is distinct from v_rank;
  if v_old_rank is distinct from v_rank then perform public.log_customer_club_event('level_changed', 'تغییر سطح مشتری', p_customer_id, null, null, null, 'customers', p_customer_id, jsonb_build_object('from', v_old_rank, 'to', v_rank)); end if;
end; $$;

create or replace function public.sync_customer_club_stats_and_rank_from_invoice()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.sync_customer_financial_stats(new.customer_id); perform public.sync_customer_club_rank(new.customer_id);
    if tg_op = 'UPDATE' and old.customer_id is distinct from new.customer_id then perform public.sync_customer_financial_stats(old.customer_id); perform public.sync_customer_club_rank(old.customer_id); end if;
    return new;
  end if;
  perform public.sync_customer_financial_stats(old.customer_id); perform public.sync_customer_club_rank(old.customer_id); return old;
end; $$;

drop trigger if exists trg_sync_customer_club_stats_and_rank_from_invoice on public.invoices;
create trigger trg_sync_customer_club_stats_and_rank_from_invoice after insert or update or delete on public.invoices
  for each row execute function public.sync_customer_club_stats_and_rank_from_invoice();

revoke all on function public.log_customer_club_event(text, text, uuid, uuid, uuid, uuid, text, uuid, jsonb) from public;
revoke all on function public.enqueue_customer_club_notifications(jsonb, text, uuid, jsonb) from public;
revoke all on function public.sync_customer_club_rank(uuid) from public;
grant execute on function public.sync_customer_club_rank(uuid) to authenticated;

commit;
