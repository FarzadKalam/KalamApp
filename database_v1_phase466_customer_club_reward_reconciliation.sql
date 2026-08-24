-- =====================================================
-- TazeSystem - Phase 466 Customer club reward reconciliation
-- Date: 2026-08-24
-- Type: Additive / idempotent migration
-- Goal: keep unconditional invoice rewards tenant-safe and accurate after
--       invoice edits, cancellation, and trusted gateway updates.
-- =====================================================

begin;

create or replace function public.apply_customer_loyalty_rewards_from_invoice()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
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
  if v_org_id is null then
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

  if new.customer_id is not null and public.is_customer_purchase_status(new.status) then
    for v_rule in
      select *
      from public.customer_loyalty_rules
      where org_id = v_org_id
        and is_active = true
        and rule_type in ('cashback', 'first_purchase', 'referral')
        and (starts_at is null or starts_at <= coalesce(new.invoice_date, new.created_at::date, current_date))
        and (ends_at is null or ends_at >= coalesce(new.invoice_date, new.created_at::date, current_date))
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

revoke all on function public.apply_customer_loyalty_rewards_from_invoice() from public;
grant execute on function public.apply_customer_loyalty_rewards_from_invoice() to authenticated;

commit;
