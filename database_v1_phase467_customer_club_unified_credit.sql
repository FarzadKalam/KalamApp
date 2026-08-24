-- =====================================================
-- TazeSystem - Phase 467 Customer club unified credit
-- Date: 2026-08-24
-- Type: Additive / idempotent migration
-- Goal: one club-credit balance for linked customer, supplier and employee
--       records, with an auditable history that does not affect cash balance.
-- =====================================================

begin;

alter table if exists public.suppliers
  add column if not exists loyalty_credit_balance numeric(18,2) not null default 0;
alter table if exists public.employees
  add column if not exists loyalty_credit_balance numeric(18,2) not null default 0;

create table if not exists public.customer_club_entity_credits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  recipient_module_id text not null check (recipient_module_id in ('customers', 'suppliers', 'employees')),
  recipient_record_id uuid not null,
  rule_id uuid references public.customer_loyalty_rules(id) on delete set null,
  entry_type text not null default 'credit' check (entry_type in ('credit', 'debit', 'adjustment')),
  source_type text not null,
  source_table text,
  source_record_id uuid,
  amount numeric(18,2) not null check (amount >= 0),
  effective_date date not null default current_date,
  idempotency_key text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);

create index if not exists idx_customer_club_entity_credits_recipient_date
  on public.customer_club_entity_credits(org_id, recipient_module_id, recipient_record_id, effective_date desc, created_at desc);
create index if not exists idx_customer_club_entity_credits_source
  on public.customer_club_entity_credits(org_id, source_table, source_record_id);

alter table public.customer_club_notification_queue
  add column if not exists recipient_module_id text,
  add column if not exists recipient_record_id uuid;
create index if not exists idx_customer_club_notification_queue_recipient
  on public.customer_club_notification_queue(org_id, recipient_module_id, recipient_record_id, status, available_at);

alter table public.customer_club_entity_credits enable row level security;
drop policy if exists customer_club_entity_credits_org_select on public.customer_club_entity_credits;
drop policy if exists customer_club_entity_credits_org_insert on public.customer_club_entity_credits;
drop policy if exists customer_club_entity_credits_org_update on public.customer_club_entity_credits;
drop policy if exists customer_club_entity_credits_org_delete on public.customer_club_entity_credits;
create policy customer_club_entity_credits_org_select on public.customer_club_entity_credits
  for select to authenticated using (org_id = public.current_org_id());
create policy customer_club_entity_credits_org_insert on public.customer_club_entity_credits
  for insert to authenticated with check (org_id = public.current_org_id());
create policy customer_club_entity_credits_org_update on public.customer_club_entity_credits
  for update to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy customer_club_entity_credits_org_delete on public.customer_club_entity_credits
  for delete to authenticated using (org_id = public.current_org_id());
grant select, insert, update, delete on public.customer_club_entity_credits to authenticated;

-- همهٔ نقش‌های یک شخص از پیوندهای دوطرفهٔ موجود استخراج می‌شوند؛ این تابع
-- تنها منبع مشترک همگام‌سازی مانده و سابقه است.
create or replace function public.get_customer_club_credit_scope(p_org_id uuid, p_entity_type text, p_entity_id uuid)
returns table(entity_type text, entity_id uuid)
language sql
security invoker
set search_path = public
stable
as $$
  with recursive nodes as (
    select 'customer'::text as entity_type, c.id as entity_id, c.linked_supplier_id, c.linked_employee_id, null::uuid as linked_customer_id
      from public.customers c where c.org_id = p_org_id
    union all
    select 'supplier', s.id, null::uuid, s.linked_employee_id, s.linked_customer_id
      from public.suppliers s where s.org_id = p_org_id
    union all
    select 'employee', e.id, e.linked_supplier_id, null::uuid, e.linked_customer_id
      from public.employees e where e.org_id = p_org_id
  ), edges as (
    select entity_type as from_type, entity_id as from_id, 'supplier'::text as to_type, linked_supplier_id as to_id from nodes where linked_supplier_id is not null
    union all select 'supplier', linked_supplier_id, entity_type, entity_id from nodes where linked_supplier_id is not null
    union all select entity_type, entity_id, 'employee', linked_employee_id from nodes where linked_employee_id is not null
    union all select 'employee', linked_employee_id, entity_type, entity_id from nodes where linked_employee_id is not null
    union all select entity_type, entity_id, 'customer', linked_customer_id from nodes where linked_customer_id is not null
    union all select 'customer', linked_customer_id, entity_type, entity_id from nodes where linked_customer_id is not null
  ), walk(entity_type, entity_id) as (
    select lower(trim(p_entity_type)), p_entity_id
    union
    select e.to_type, e.to_id from edges e join walk w on w.entity_type = e.from_type and w.entity_id = e.from_id
  )
  select w.entity_type, w.entity_id
  from walk w join nodes n on n.entity_type = w.entity_type and n.entity_id = w.entity_id;
$$;

create or replace function public.sync_customer_club_credit_group(p_entity_type text, p_entity_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_total numeric(18,2) := 0;
begin
  if v_org_id is null or p_entity_id is null or lower(trim(coalesce(p_entity_type, ''))) not in ('customer', 'supplier', 'employee') then
    return 0;
  end if;

  with scope as (
    select * from public.get_customer_club_credit_scope(v_org_id, lower(trim(p_entity_type)), p_entity_id)
  ), sums as (
    select coalesce(sum(case when l.entry_type = 'debit' then -l.amount else l.amount end), 0)::numeric as amount
    from public.customer_loyalty_ledger l
    join scope s on s.entity_type = 'customer' and s.entity_id = l.customer_id
    where l.org_id = v_org_id
    union all
    select coalesce(sum(case when e.entry_type = 'debit' then -e.amount else e.amount end), 0)::numeric
    from public.customer_club_entity_credits e
    join scope s on s.entity_type = e.recipient_module_id and s.entity_id = e.recipient_record_id
    where e.org_id = v_org_id
  ) select coalesce(sum(amount), 0) into v_total from sums;

  update public.customers c set loyalty_credit_balance = v_total
  where c.org_id = v_org_id and c.id in (select entity_id from public.get_customer_club_credit_scope(v_org_id, lower(trim(p_entity_type)), p_entity_id) where entity_type = 'customer');
  update public.suppliers s set loyalty_credit_balance = v_total
  where s.org_id = v_org_id and s.id in (select entity_id from public.get_customer_club_credit_scope(v_org_id, lower(trim(p_entity_type)), p_entity_id) where entity_type = 'supplier');
  update public.employees e set loyalty_credit_balance = v_total
  where e.org_id = v_org_id and e.id in (select entity_id from public.get_customer_club_credit_scope(v_org_id, lower(trim(p_entity_type)), p_entity_id) where entity_type = 'employee');
  return v_total;
end;
$$;

-- مسیرهای قدیمیِ ثبت اعتبار همچنان همین تابع را صدا می‌زنند؛ آن‌ها را به
-- منبع مرکزی هدایت می‌کنیم تا ماندهٔ یک نقش، نقش‌های متصل را از هم جدا نکند.
create or replace function public.sync_customer_loyalty_balance(p_customer_id uuid)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
begin
  return public.sync_customer_club_credit_group('customer', p_customer_id);
end;
$$;

create or replace function public.record_customer_club_entity_credit(
  p_recipient_module_id text, p_recipient_record_id uuid, p_rule_id uuid, p_entry_type text,
  p_source_type text, p_source_table text, p_source_record_id uuid, p_amount numeric,
  p_effective_date date, p_idempotency_key text, p_description text, p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_id uuid;
  v_module text := lower(trim(coalesce(p_recipient_module_id, '')));
  v_exists boolean := false;
begin
  if v_org_id is null or v_module not in ('customers', 'suppliers', 'employees') or p_recipient_record_id is null
    or coalesce(p_amount, 0) < 0 or nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'اعتبار باشگاه مشتریان نامعتبر است';
  end if;
  if v_module = 'customers' then select exists(select 1 from public.customers where id = p_recipient_record_id and org_id = v_org_id) into v_exists;
  elsif v_module = 'suppliers' then select exists(select 1 from public.suppliers where id = p_recipient_record_id and org_id = v_org_id) into v_exists;
  else select exists(select 1 from public.employees where id = p_recipient_record_id and org_id = v_org_id) into v_exists;
  end if;
  if not v_exists then raise exception 'رکورد دریافت‌کنندهٔ اعتبار یافت نشد'; end if;

  insert into public.customer_club_entity_credits (
    org_id, recipient_module_id, recipient_record_id, rule_id, entry_type, source_type, source_table,
    source_record_id, amount, effective_date, idempotency_key, description, metadata, created_by
  ) values (
    v_org_id, v_module, p_recipient_record_id, p_rule_id, coalesce(nullif(trim(p_entry_type), ''), 'credit'),
    p_source_type, p_source_table, p_source_record_id, p_amount, coalesce(p_effective_date, current_date),
    trim(p_idempotency_key), p_description, coalesce(p_metadata, '{}'::jsonb), auth.uid()
  ) on conflict (org_id, idempotency_key) do update set
    amount = excluded.amount, effective_date = excluded.effective_date, description = excluded.description,
    metadata = excluded.metadata, updated_at = now()
  returning id into v_id;
  perform public.sync_customer_club_credit_group(case v_module when 'customers' then 'customer' when 'suppliers' then 'supplier' else 'employee' end, p_recipient_record_id);
  return v_id;
end;
$$;

create or replace function public.reconcile_customer_club_credit(
  p_entity_type text, p_entity_id uuid, p_target_amount numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_current numeric(18,2) := 0;
  v_delta numeric(18,2);
  v_module text := lower(trim(coalesce(p_entity_type, '')));
begin
  if v_org_id is null or v_module not in ('customer', 'supplier', 'employee') or p_entity_id is null or p_target_amount is null then
    raise exception 'مقدار نهایی اعتبار نامعتبر است';
  end if;
  select coalesce(sum(case when l.entry_type = 'debit' then -l.amount else l.amount end), 0)
    into v_current from public.customer_loyalty_ledger l
    join public.get_customer_club_credit_scope(v_org_id, v_module, p_entity_id) s on s.entity_type = 'customer' and s.entity_id = l.customer_id
    where l.org_id = v_org_id;
  select v_current + coalesce(sum(case when e.entry_type = 'debit' then -e.amount else e.amount end), 0)
    into v_current from public.customer_club_entity_credits e
    join public.get_customer_club_credit_scope(v_org_id, v_module, p_entity_id) s on s.entity_type = e.recipient_module_id and s.entity_id = e.recipient_record_id
    where e.org_id = v_org_id;
  v_delta := p_target_amount - v_current;
  if v_delta <> 0 then
    perform public.record_customer_club_entity_credit(
      case v_module when 'customer' then 'customers' when 'supplier' then 'suppliers' else 'employees' end,
      p_entity_id, null, case when v_delta < 0 then 'debit' else 'adjustment' end,
      'link_reconciliation', null, null, abs(v_delta), current_date,
      'link_reconciliation:' || gen_random_uuid()::text, 'هماهنگ‌سازی اعتبار باشگاه مشتریان',
      jsonb_build_object('target_amount', p_target_amount)
    );
  else
    perform public.sync_customer_club_credit_group(v_module, p_entity_id);
  end if;
  return public.sync_customer_club_credit_group(v_module, p_entity_id);
end;
$$;

create or replace function public.get_customer_club_financial_history(p_entity_type text, p_entity_id uuid)
returns table(key text, row_type text, source_label text, status text, date date, club_credit_amount numeric, invoice_label text, description text, created_at timestamptz)
language sql
security invoker
set search_path = public
stable
as $$
  with scope as (
    select * from public.get_customer_club_credit_scope(public.current_org_id(), lower(trim(p_entity_type)), p_entity_id)
  )
  select 'legacy:' || l.id::text, 'club_credit', 'باشگاه مشتریان', 'ثبت شده', l.effective_date,
    case when l.entry_type = 'debit' then -l.amount else l.amount end, '-', coalesce(l.description, 'گردش اعتبار باشگاه مشتریان'), l.created_at
  from public.customer_loyalty_ledger l join scope s on s.entity_type = 'customer' and s.entity_id = l.customer_id
  where l.org_id = public.current_org_id()
  union all
  select 'entity:' || e.id::text, 'club_credit', 'باشگاه مشتریان', 'ثبت شده', e.effective_date,
    case when e.entry_type = 'debit' then -e.amount else e.amount end, '-', coalesce(e.description, 'گردش اعتبار باشگاه مشتریان'), e.created_at
  from public.customer_club_entity_credits e join scope s on s.entity_type = e.recipient_module_id and s.entity_id = e.recipient_record_id
  where e.org_id = public.current_org_id();
$$;

-- پاداش معرفی برای معرفِ کارمند یا تأمین‌کننده نیز همانند معرف مشتری ثبت
-- می‌شود. مسیر قدیمیِ مشتری دست‌نخورده می‌ماند تا داده‌های قبلی سازگار باشند.
create or replace function public.apply_customer_club_non_customer_referral_rewards_from_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule record;
  v_org_id uuid := new.org_id;
  v_target_module text;
  v_target_id uuid;
  v_amount numeric(18,2);
  v_rule_ids uuid[] := '{}'::uuid[];
begin
  if v_org_id is null then return new; end if;
  -- ابتدا تنها اقلام همین مسیر را پاک می‌کنیم؛ رکوردهای مشتری و پاداش‌های
  -- شرط‌دار در منبع مسئول خودشان باقی می‌مانند.
  if new.customer_id is null or not public.is_customer_purchase_status(new.status) then
    delete from public.customer_club_entity_credits
    where org_id = v_org_id and source_table = 'invoices' and source_record_id = new.id
      and source_type = 'referral_reward';
    return new;
  end if;

  select lower(trim(coalesce(c.referrer_module, ''))),
    case lower(trim(coalesce(c.referrer_module, '')))
      when 'employees' then c.referrer_employee_id
      when 'suppliers' then c.referrer_supplier_id
      else null
    end
  into v_target_module, v_target_id
  from public.customers c where c.id = new.customer_id and c.org_id = v_org_id;
  if v_target_module not in ('employees', 'suppliers') or v_target_id is null then
    delete from public.customer_club_entity_credits
    where org_id = v_org_id and source_table = 'invoices' and source_record_id = new.id
      and source_type = 'referral_reward';
    return new;
  end if;

  for v_rule in
    select * from public.customer_loyalty_rules
    where org_id = v_org_id and is_active = true and rule_type = 'referral'
      and (starts_at is null or starts_at <= coalesce(new.invoice_date, new.created_at::date, current_date))
      and (ends_at is null or ends_at >= coalesce(new.invoice_date, new.created_at::date, current_date))
      and jsonb_array_length(coalesce(conditions_all, '[]'::jsonb)) = 0
      and jsonb_array_length(coalesce(conditions_any, '[]'::jsonb)) = 0
  loop
    v_amount := case when v_rule.reward_type = 'percent'
      then round(coalesce(new.total_invoice_amount, 0) * coalesce(v_rule.reward_percent, 0) / 100, 2)
      else coalesce(v_rule.reward_amount, 0) end;
    if v_rule.max_reward_amount is not null then v_amount := least(v_amount, v_rule.max_reward_amount); end if;
    if v_amount <= 0 then continue; end if;
    perform public.record_customer_club_entity_credit(
      v_target_module, v_target_id, v_rule.id, 'credit', 'referral_reward', 'invoices', new.id,
      v_amount, coalesce(new.invoice_date, new.created_at::date, current_date),
      'referral_reward:' || v_rule.id::text || ':' || new.id::text,
      'پاداش معرفی مشتری', jsonb_build_object('introduced_customer_id', new.customer_id)
    );
    v_rule_ids := array_append(v_rule_ids, v_rule.id);
  end loop;

  delete from public.customer_club_entity_credits e
  where e.org_id = v_org_id and e.source_table = 'invoices' and e.source_record_id = new.id
    and e.source_type = 'referral_reward' and coalesce(e.rule_id = any(v_rule_ids), false) = false;
  return new;
end;
$$;
drop trigger if exists trg_customer_club_non_customer_referral_rewards on public.invoices;
create trigger trg_customer_club_non_customer_referral_rewards
  after insert or update of customer_id, status, total_invoice_amount, invoice_date on public.invoices
  for each row execute function public.apply_customer_club_non_customer_referral_rewards_from_invoice();

create or replace function public.enqueue_customer_club_recipient_notifications(
  p_notifications jsonb, p_event_key text, p_recipient_module_id text, p_recipient_record_id uuid,
  p_context jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid := public.current_org_id();
  v_actions jsonb;
  v_module text := lower(trim(coalesce(p_recipient_module_id, '')));
begin
  if v_org_id is null or v_module not in ('customers', 'suppliers', 'employees') or p_recipient_record_id is null
    or coalesce((p_notifications->p_event_key->>'enabled')::boolean, false) is not true then return; end if;
  v_actions := coalesce(p_notifications->p_event_key->'actions', '[]'::jsonb);
  if jsonb_typeof(v_actions) <> 'array' or jsonb_array_length(v_actions) = 0 then return; end if;
  insert into public.customer_club_notification_queue(
    org_id, event_key, customer_id, recipient_module_id, recipient_record_id, actions, context
  ) values (
    v_org_id, p_event_key,
    case when v_module = 'customers' then p_recipient_record_id else null end,
    v_module, p_recipient_record_id, v_actions, coalesce(p_context, '{}'::jsonb)
  );
end;
$$;

create or replace function public.log_customer_club_entity_credit_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rule_id is not null then
    perform public.enqueue_customer_club_recipient_notifications(
      coalesce((select config->'notifications' from public.customer_loyalty_rules where id = new.rule_id and org_id = new.org_id), '{}'::jsonb),
      'condition_met', new.recipient_module_id, new.recipient_record_id,
      jsonb_build_object('entity_credit_id', new.id, 'rule_id', new.rule_id, 'amount', new.amount)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists trg_customer_club_entity_credit_notification on public.customer_club_entity_credits;
create trigger trg_customer_club_entity_credit_notification after insert on public.customer_club_entity_credits
  for each row execute function public.log_customer_club_entity_credit_notification();

create or replace function public.sync_customer_club_credit_from_legacy_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_customer_club_credit_group('customer', coalesce(new.customer_id, old.customer_id));
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_sync_customer_club_credit_from_legacy_ledger on public.customer_loyalty_ledger;
create trigger trg_sync_customer_club_credit_from_legacy_ledger after insert or update or delete on public.customer_loyalty_ledger
  for each row execute function public.sync_customer_club_credit_from_legacy_ledger();

create or replace function public.sync_customer_club_credit_from_entity_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_customer_club_credit_group(case coalesce(new.recipient_module_id, old.recipient_module_id) when 'customers' then 'customer' when 'suppliers' then 'supplier' else 'employee' end, coalesce(new.recipient_record_id, old.recipient_record_id));
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_sync_customer_club_credit_from_entity_ledger on public.customer_club_entity_credits;
create trigger trg_sync_customer_club_credit_from_entity_ledger after insert or update or delete on public.customer_club_entity_credits
  for each row execute function public.sync_customer_club_credit_from_entity_ledger();

-- اتصال یا جداسازی نقش‌ها از هر مسیر دیگری (اتوماسیون، ویرایش گروهی و …) نیز
-- همان ماندهٔ مرکزی را بازسازی می‌کند؛ بنابراین همگام‌سازی به فرم وابسته نیست.
create or replace function public.sync_customer_club_credit_from_person_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type text := case tg_table_name when 'customers' then 'customer' when 'suppliers' then 'supplier' else 'employee' end;
begin
  perform public.sync_customer_club_credit_group(v_type, new.id);
  if tg_table_name = 'customers' then
    if old.linked_supplier_id is not null then perform public.sync_customer_club_credit_group('supplier', old.linked_supplier_id); end if;
    if old.linked_employee_id is not null then perform public.sync_customer_club_credit_group('employee', old.linked_employee_id); end if;
  elsif tg_table_name = 'suppliers' then
    if old.linked_customer_id is not null then perform public.sync_customer_club_credit_group('customer', old.linked_customer_id); end if;
    if old.linked_employee_id is not null then perform public.sync_customer_club_credit_group('employee', old.linked_employee_id); end if;
  else
    if old.linked_customer_id is not null then perform public.sync_customer_club_credit_group('customer', old.linked_customer_id); end if;
    if old.linked_supplier_id is not null then perform public.sync_customer_club_credit_group('supplier', old.linked_supplier_id); end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sync_customer_club_credit_from_customer_link on public.customers;
create trigger trg_sync_customer_club_credit_from_customer_link after update of linked_supplier_id, linked_employee_id on public.customers
  for each row execute function public.sync_customer_club_credit_from_person_link();
drop trigger if exists trg_sync_customer_club_credit_from_supplier_link on public.suppliers;
create trigger trg_sync_customer_club_credit_from_supplier_link after update of linked_customer_id, linked_employee_id on public.suppliers
  for each row execute function public.sync_customer_club_credit_from_person_link();
drop trigger if exists trg_sync_customer_club_credit_from_employee_link on public.employees;
create trigger trg_sync_customer_club_credit_from_employee_link after update of linked_customer_id, linked_supplier_id on public.employees
  for each row execute function public.sync_customer_club_credit_from_person_link();

revoke all on function public.get_customer_club_credit_scope(uuid, text, uuid) from public;
revoke all on function public.sync_customer_club_credit_group(text, uuid) from public;
revoke all on function public.record_customer_club_entity_credit(text, uuid, uuid, text, text, text, uuid, numeric, date, text, text, jsonb) from public;
revoke all on function public.reconcile_customer_club_credit(text, uuid, numeric) from public;
revoke all on function public.get_customer_club_financial_history(text, uuid) from public;
revoke all on function public.apply_customer_club_non_customer_referral_rewards_from_invoice() from public;
revoke all on function public.sync_customer_club_credit_from_person_link() from public;
revoke all on function public.enqueue_customer_club_recipient_notifications(jsonb, text, text, uuid, jsonb) from public;
revoke all on function public.log_customer_club_entity_credit_notification() from public;
grant execute on function public.get_customer_club_credit_scope(uuid, text, uuid) to authenticated;
grant execute on function public.sync_customer_club_credit_group(text, uuid) to authenticated;
grant execute on function public.record_customer_club_entity_credit(text, uuid, uuid, text, text, text, uuid, numeric, date, text, text, jsonb) to authenticated;
grant execute on function public.reconcile_customer_club_credit(text, uuid, numeric) to authenticated;
grant execute on function public.get_customer_club_financial_history(text, uuid) to authenticated;
grant execute on function public.apply_customer_club_non_customer_referral_rewards_from_invoice() to authenticated;
grant execute on function public.enqueue_customer_club_recipient_notifications(jsonb, text, text, uuid, jsonb) to authenticated;

commit;
