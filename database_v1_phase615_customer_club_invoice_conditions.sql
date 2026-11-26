-- شرایط فاکتور و ردیف‌های داخلی در همان تراکنش تخصیص اعتبار بررسی می‌شوند.
begin;

create or replace function public.record_scope_condition_matches(p_record jsonb, p_condition jsonb)
returns boolean language plpgsql stable security invoker
set search_path = public
as $$
declare
  v_field text := p_condition->>'field';
  v_operator text := p_condition->>'operator';
  v_expected jsonb := p_condition->'value';
  v_actual jsonb := p_record->v_field;
  v_left text := btrim(coalesce(v_actual#>>'{}', ''));
  v_right text := btrim(coalesce(v_expected#>>'{}', ''));
  v_left_numeric numeric;
  v_right_numeric numeric;
  v_actual_day date;
  v_expected_day date;
  v_today date := (now() at time zone 'Asia/Tehran')::date;
  v_found boolean;
  v_related_parts text[];
  v_related_id text;
  v_related_module text;
  v_related_value jsonb;
  v_org_id uuid;
begin
  if v_field is null or v_field = '' or jsonb_typeof(p_record) is distinct from 'object' then return false; end if;
  if v_field = 'reservation_id' and p_record ? 'invoiceItems' then
    v_org_id := nullif(p_record->>'org_id', '')::uuid;
    if v_org_id is null or not public.org_has_plan_module(v_org_id, 'reservations', false) then return false; end if;
  end if;
  if starts_with(v_field, '__workflow_related__') then
    v_related_parts := string_to_array(substr(v_field, length('__workflow_related__') + 1), '::');
    if cardinality(v_related_parts) <> 3 or not (
      (v_related_parts[1] = 'product_id' and v_related_parts[2] in ('products', 'billboards'))
      or (v_related_parts[1] = 'reservation_id' and v_related_parts[2] = 'reservations')
    ) then return false; end if;
    v_org_id := coalesce(nullif(p_record->>'__condition_org_id', ''), nullif(p_record->>'org_id', ''))::uuid;
    if v_org_id is null or (auth.role() = 'authenticated' and v_org_id is distinct from public.current_org_id()) then return false; end if;
    v_related_value := p_record->v_related_parts[1];
    v_related_module := coalesce(v_related_value->>'moduleId', v_related_value->>'module', v_related_value->>'targetModule',
      case when v_related_parts[1] = 'product_id' then p_record->>'commission_product_module' end);
    if coalesce(v_related_module, '') <> '' and v_related_module <> v_related_parts[2] then return false; end if;
    v_related_id := case when jsonb_typeof(v_related_value) = 'object'
      then coalesce(v_related_value->>'id', v_related_value->>'value', v_related_value->>'record_id')
      else v_related_value#>>'{}' end;
    if coalesce(v_related_id, '') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return false; end if;
    if current_user = 'authenticated'
      and not public.current_user_can_module_field(v_related_parts[2], 'view', v_related_parts[3]) then return false; end if;
    if v_related_parts[2] = 'products' then
      select to_jsonb(p)->v_related_parts[3] into v_actual from public.products p where p.id = v_related_id::uuid and p.org_id = v_org_id;
    elsif v_related_parts[2] = 'billboards' and public.org_has_plan_module(v_org_id, 'billboards', false) then
      select to_jsonb(b)->v_related_parts[3] into v_actual from public.billboards b where b.id = v_related_id::uuid and b.org_id = v_org_id;
    elsif v_related_parts[2] = 'reservations' and public.org_has_plan_module(v_org_id, 'reservations', false) then
      select to_jsonb(r)->v_related_parts[3] into v_actual from public.reservations r where r.id = v_related_id::uuid and r.org_id = v_org_id;
    else
      return false;
    end if;
    if v_actual is null then return false; end if;
    v_left := btrim(coalesce(v_actual#>>'{}', ''));
  end if;
  if v_operator in ('table_any', 'table_all') then
    if jsonb_typeof(v_expected) is distinct from 'array' or jsonb_typeof(v_actual) is distinct from 'array' then
      return false;
    end if;
    if jsonb_array_length(v_expected) = 0 or exists (
      select 1 from jsonb_array_elements(v_expected) cond
      where cond->>'operator' in ('table_any', 'table_all')
    ) then return false; end if;
    with rows as (
      select row_item from jsonb_array_elements(v_actual) row_item
      where jsonb_typeof(row_item) = 'object' and coalesce(row_item->>'deleted_at', '') = ''
        and not (row_item @> '{"is_deleted":true}' or row_item @> '{"deleted":true}'
          or row_item @> '{"_deleted":true}' or row_item @> '{"__deleted":true}' or row_item @> '{"_destroy":true}')
    ), matching as (
      select not exists (
        select 1 from jsonb_array_elements(v_expected) cond
        where public.record_scope_condition_matches(
          row_item || jsonb_build_object('__condition_org_id', p_record->'org_id'), cond
        ) is not true
      ) as matched from rows
    )
    select case when v_operator = 'table_all' then bool_and(matched) else bool_or(matched) end into v_found from matching;
    return coalesce(v_found, false);
  end if;
  if v_operator in ('is_null', 'not_null') then
    return (v_left in ('', '[]')) = (v_operator = 'is_null');
  end if;
  if v_operator = 'is_true' then return v_left in ('true', '1'); end if;
  if v_operator = 'is_false' then return v_left in ('false', '0'); end if;
  if v_operator in ('in', 'not_in') then
    if jsonb_typeof(v_expected) is distinct from 'array' then return false; end if;
    if jsonb_array_length(v_expected) = 0 then return false; end if;
    return exists (select 1 from jsonb_array_elements_text(v_expected) item where btrim(item) = v_left) = (v_operator = 'in');
  end if;
  if v_operator in ('after_date', 'before_date', 'date_between', 'is_today', 'is_yesterday', 'is_tomorrow') then
    if v_left !~ '^\d{4}-\d{2}-\d{2}' then return false; end if;
    v_actual_day := case when length(v_left) = 10 then v_left::date else (v_left::timestamptz at time zone 'Asia/Tehran')::date end;
    if v_operator = 'is_today' then return v_actual_day = v_today; end if;
    if v_operator = 'is_yesterday' then return v_actual_day = v_today - 1; end if;
    if v_operator = 'is_tomorrow' then return v_actual_day = v_today + 1; end if;
    if v_operator = 'date_between' then
      return coalesce(v_actual_day between left(v_expected->>'from', 10)::date and left(v_expected->>'to', 10)::date, false);
    end if;
    v_expected_day := case when length(v_right) = 10 then v_right::date else (v_right::timestamptz at time zone 'Asia/Tehran')::date end;
    return case when v_operator = 'after_date' then v_actual_day > v_expected_day else v_actual_day < v_expected_day end;
  end if;
  if v_expected is null or v_expected = 'null'::jsonb or v_right = '' then return false; end if;
  if v_operator in ('contains', 'not_contains') then return (strpos(lower(v_left), lower(v_right)) > 0) = (v_operator = 'contains'); end if;
  if v_operator = 'starts_with' then return left(lower(v_left), length(v_right)) = lower(v_right); end if;
  if v_operator = 'ends_with' then return right(lower(v_left), length(v_right)) = lower(v_right); end if;
  if v_operator in ('eq', 'neq') then
    if jsonb_typeof(v_actual) = 'number' and jsonb_typeof(v_expected) = 'number' then
      return (v_left::numeric = v_right::numeric) = (v_operator = 'eq');
    end if;
    return (v_left = v_right) = (v_operator = 'eq');
  end if;
  if v_operator in ('gt', 'gte', 'lt', 'lte') then
    if v_left !~ '^-?[0-9]+(\.[0-9]+)?$' or v_right !~ '^-?[0-9]+(\.[0-9]+)?$' then return false; end if;
    v_left_numeric := v_left::numeric;
    v_right_numeric := v_right::numeric;
    return case v_operator
      when 'gt' then v_left_numeric > v_right_numeric when 'gte' then v_left_numeric >= v_right_numeric
      when 'lt' then v_left_numeric < v_right_numeric else v_left_numeric <= v_right_numeric end;
  end if;
  return false;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  return false;
end;
$$;

revoke all on function public.record_scope_condition_matches(jsonb, jsonb) from public, anon;
grant execute on function public.record_scope_condition_matches(jsonb, jsonb) to authenticated, service_role;

create or replace function public.customer_club_invoice_rule_conditions_match(
  p_invoice jsonb, p_customer jsonb, p_invoice_conditions jsonb, p_customer_all jsonb, p_customer_any jsonb
)
returns boolean language sql stable security invoker set search_path = public
as $$
  select case
    when p_invoice_conditions is null then
      jsonb_array_length(coalesce(p_customer_all, '[]'::jsonb)) = 0
      and jsonb_array_length(coalesce(p_customer_any, '[]'::jsonb)) = 0
    when jsonb_typeof(p_invoice_conditions) is distinct from 'array' then false
    when jsonb_array_length(p_invoice_conditions) = 0 then false
    else not exists (
      select 1 from jsonb_array_elements(p_invoice_conditions) cond
      where public.record_scope_condition_matches(p_invoice, cond) is not true
    ) and not exists (
      select 1 from jsonb_array_elements(coalesce(p_customer_all, '[]'::jsonb)) cond
      where public.record_scope_condition_matches(p_customer, cond) is not true
    ) and (
      jsonb_array_length(coalesce(p_customer_any, '[]'::jsonb)) = 0 or exists (
        select 1 from jsonb_array_elements(p_customer_any) cond
        group by cond->>'field'
        having case
          when bool_and(cond->>'operator' in ('neq', 'not_in', 'not_contains', 'is_false', 'is_null'))
            then bool_and(public.record_scope_condition_matches(p_customer, cond) is true)
          else bool_or(public.record_scope_condition_matches(p_customer, cond) is true)
        end
      )
    )
  end;
$$;

revoke all on function public.customer_club_invoice_rule_conditions_match(jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.customer_club_invoice_rule_conditions_match(jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;


create or replace function public.check_customer_club_invoice_rule_fields()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare
  v_condition jsonb;
  v_row_condition jsonb;
  v_field text;
  v_related text[];
begin
  if auth.role() is distinct from 'authenticated' then return new; end if;
  if not (new.config ? 'invoice_conditions')
    and (tg_op = 'INSERT' or not (old.config ? 'invoice_conditions')) then return new; end if;
  if not public.current_user_can_module_field('__customer_club', 'edit', 'rules') then
    raise exception 'customer_club_rule_access_denied' using errcode = '42501';
  end if;
  if not (new.config ? 'invoice_conditions') then return new; end if;
  for v_condition in select value from jsonb_array_elements(new.config->'invoice_conditions') loop
    v_field := v_condition->>'field';
    if starts_with(v_field, '__workflow_related__') then
      v_related := string_to_array(substr(v_field, length('__workflow_related__') + 1), '::');
      if cardinality(v_related) <> 3 or not public.current_user_can_module_field('invoices', 'view', v_related[1])
        or not public.current_user_can_module_field(v_related[2], 'view', v_related[3]) then
        raise exception 'customer_club_condition_field_access_denied' using errcode = '42501';
      end if;
    elsif v_field is null or not public.current_user_can_module_field('invoices', 'view', v_field) then
      raise exception 'customer_club_condition_field_access_denied' using errcode = '42501';
    end if;
    if v_condition->>'operator' in ('table_any', 'table_all') then
      for v_row_condition in select value from jsonb_array_elements(v_condition->'value') loop
        if not starts_with(v_row_condition->>'field', '__workflow_related__') then continue; end if;
        v_related := string_to_array(substr(v_row_condition->>'field', length('__workflow_related__') + 1), '::');
        if cardinality(v_related) <> 3 or not public.current_user_can_module_field(v_related[2], 'view', v_related[3]) then
          raise exception 'customer_club_condition_field_access_denied' using errcode = '42501';
        end if;
      end loop;
    end if;
  end loop;
  for v_condition in
    select value from jsonb_array_elements(coalesce(new.config->'invoice_customer_conditions_all', '[]'::jsonb))
    union all
    select value from jsonb_array_elements(coalesce(new.config->'invoice_customer_conditions_any', '[]'::jsonb))
  loop
    if v_condition->>'field' is null or not public.current_user_can_module_field('customers', 'view', v_condition->>'field') then
      raise exception 'customer_club_condition_field_access_denied' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_check_customer_club_invoice_rule_fields on public.customer_loyalty_rules;
create trigger trg_check_customer_club_invoice_rule_fields
  before insert or update of config on public.customer_loyalty_rules
  for each row execute function public.check_customer_club_invoice_rule_fields();

CREATE OR REPLACE FUNCTION public.apply_customer_loyalty_rewards_from_invoice() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_org_id uuid := new.org_id;
  v_rule record;
  v_amount numeric(18,2);
  v_target_customer_id uuid;
  v_has_prior_purchase boolean;
  v_applied_rule_ids uuid[] := '{}'::uuid[];
  v_sync_customer_ids uuid[] := '{}'::uuid[];
  v_customer_id uuid;
begin
  if v_org_id is null or (auth.role() = 'authenticated' and v_org_id is distinct from public.current_org_id()) then
    return new;
  end if;

  -- پاداش‌های بدون شرط، منبع سروری دارند. پاداش‌های دارای شرط با کلید
  -- conditioned_* جدا هستند؛ فقط هنگام نامعتبرشدن فاکتور باید آن‌ها هم حذف شوند.
  select coalesce(array_agg(distinct customer_id), '{}'::uuid[])
    into v_sync_customer_ids
  from public.customer_loyalty_ledger
  where org_id = v_org_id
    and source_table = 'invoices'
    and source_record_id = new.id
    and source_type in (
      'cashback_reward', 'first_purchase_reward', 'referral_reward',
      'conditioned_cashback_reward', 'conditioned_first_purchase_reward', 'conditioned_referral_reward'
    );


  delete from public.customer_loyalty_ledger ledger
  using public.customer_loyalty_rules rule
  where ledger.rule_id = rule.id and ledger.org_id = v_org_id and rule.org_id = v_org_id
    and ledger.source_table = 'invoices' and ledger.source_record_id = new.id
    and ledger.source_type in ('conditioned_cashback_reward','conditioned_first_purchase_reward','conditioned_referral_reward')
    and rule.config ? 'invoice_conditions';

  if new.customer_id is not null and public.is_customer_purchase_status(new.status) then
    for v_rule in
      select *
      from public.customer_loyalty_rules
      where org_id = v_org_id
        and is_active = true
        and rule_type in ('cashback', 'first_purchase', 'referral')
        and (starts_at is null or starts_at <= coalesce(new.invoice_date, new.created_at::date, current_date))
        and (ends_at is null or ends_at >= coalesce(new.invoice_date, new.created_at::date, current_date))
        and public.customer_club_invoice_rule_conditions_match(
          to_jsonb(new),
          (select to_jsonb(c) from public.customers c where c.org_id = v_org_id and c.id = new.customer_id),
          config->'invoice_conditions',
          coalesce(config->'invoice_customer_conditions_all', conditions_all),
          coalesce(config->'invoice_customer_conditions_any', conditions_any)
        )
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

      v_target_customer_id := new.customer_id;
      if v_rule.rule_type = 'first_purchase' then
        if exists (
          select 1
          from public.customers c
          where c.id = new.customer_id
            and c.org_id = v_org_id
            and coalesce(c.previous_system_purchase_count, 0) > 0
        ) then
          continue;
        end if;
        select exists(
          select 1
          from public.invoices i
          where i.org_id = v_org_id
            and i.customer_id = new.customer_id
            and i.id <> new.id
            and public.is_customer_purchase_status(i.status)
            and coalesce(i.invoice_date, i.created_at::date) <= coalesce(new.invoice_date, new.created_at::date)
        ) into v_has_prior_purchase;
        if v_has_prior_purchase then
          continue;
        end if;
      elsif v_rule.rule_type = 'referral' then
        select c.referrer_customer_id
          into v_target_customer_id
        from public.customers c
        where c.id = new.customer_id
          and c.org_id = v_org_id
          and c.referrer_module = 'customers';
        if v_target_customer_id is null then
          continue;
        end if;
      end if;

      insert into public.customer_loyalty_ledger (
        org_id, customer_id, rule_id, entry_type, source_type, source_table, source_record_id,
        amount, effective_date, idempotency_key, description, metadata
      ) values (
        v_org_id, v_target_customer_id, v_rule.id, 'credit', v_rule.rule_type || '_reward', 'invoices', new.id,
        v_amount, coalesce(new.invoice_date, new.created_at::date, current_date),
        v_rule.rule_type || '_reward:' || v_rule.id::text || ':' || new.id::text,
        case
          when v_rule.rule_type = 'referral' then 'پاداش معرفی مشتری'
          when v_rule.rule_type = 'cashback' then 'کش‌بک خرید'
          else 'هدیه اولین خرید'
        end,
        case when v_rule.rule_type = 'referral'
          then jsonb_build_object('introduced_customer_id', new.customer_id)
          else '{}'::jsonb
        end
      ) on conflict (org_id, idempotency_key) do update
        set customer_id = excluded.customer_id,
            amount = excluded.amount,
            effective_date = excluded.effective_date,
            description = excluded.description,
            metadata = excluded.metadata;

      v_applied_rule_ids := array_append(v_applied_rule_ids, v_rule.id);
      v_sync_customer_ids := array_append(v_sync_customer_ids, v_target_customer_id);
    end loop;
  end if;

  if new.customer_id is null or not public.is_customer_purchase_status(new.status) then
    -- لغو یا برگشت فاکتور، هیچ اعتبارِ منتسب به آن را باقی نمی‌گذارد؛ حتی اگر
    -- آن پاداش در زمان ذخیرهٔ دستی فاکتور با شرط‌های اختصاصی ایجاد شده باشد.
    delete from public.customer_loyalty_ledger ledger
    where ledger.org_id = v_org_id
      and ledger.source_table = 'invoices'
      and ledger.source_record_id = new.id
      and ledger.source_type in (
        'cashback_reward', 'first_purchase_reward', 'referral_reward',
        'conditioned_cashback_reward', 'conditioned_first_purchase_reward', 'conditioned_referral_reward'
      );
  else
    -- خروج از بازهٔ طرح یا تغییر معرف نباید اعتبار بدون شرطِ قدیمی را نگه دارد.
    delete from public.customer_loyalty_ledger ledger
    where ledger.org_id = v_org_id
      and ledger.source_table = 'invoices'
      and ledger.source_record_id = new.id
      and ledger.source_type in ('cashback_reward', 'first_purchase_reward', 'referral_reward')
      and coalesce(ledger.rule_id = any(v_applied_rule_ids), false) = false;
  end if;

  foreach v_customer_id in array v_sync_customer_ids loop
    if v_customer_id is null then
      continue;
    end if;
    perform public.sync_customer_loyalty_balance(v_customer_id);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_invoice_loyalty_rewards on public.invoices;
create trigger trg_invoice_loyalty_rewards
  after insert or update of customer_id, status, total_invoice_amount, invoice_date, reservation_id, "invoiceItems", payments on public.invoices
  for each row execute function public.apply_customer_loyalty_rewards_from_invoice();


CREATE OR REPLACE FUNCTION public.apply_customer_club_non_customer_referral_rewards_from_invoice() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_rule record;
  v_org_id uuid := new.org_id;
  v_target_module text;
  v_target_id uuid;
  v_amount numeric(18,2);
  v_rule_ids uuid[] := '{}'::uuid[];
begin
  if v_org_id is null or (auth.role() = 'authenticated' and v_org_id is distinct from public.current_org_id()) then return new; end if;
  -- ابتدا تنها اقلام همین مسیر را پاک می‌کنیم؛ رکوردهای مشتری و پاداش‌های
  -- شرط‌دار در منبع مسئول خودشان باقی می‌مانند.

  delete from public.customer_club_entity_credits ledger
  using public.customer_loyalty_rules rule
  where ledger.rule_id = rule.id and ledger.org_id = v_org_id and rule.org_id = v_org_id
    and ledger.source_table = 'invoices' and ledger.source_record_id = new.id
    and ledger.source_type in ('conditioned_referral_reward')
    and rule.config ? 'invoice_conditions';

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
      and public.customer_club_invoice_rule_conditions_match(
          to_jsonb(new),
          (select to_jsonb(c) from public.customers c where c.org_id = v_org_id and c.id = new.customer_id),
          config->'invoice_conditions',
          coalesce(config->'invoice_customer_conditions_all', conditions_all),
          coalesce(config->'invoice_customer_conditions_any', conditions_any)
        )
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
  after insert or update of customer_id, status, total_invoice_amount, invoice_date, reservation_id, "invoiceItems", payments on public.invoices
  for each row execute function public.apply_customer_club_non_customer_referral_rewards_from_invoice();

commit;
