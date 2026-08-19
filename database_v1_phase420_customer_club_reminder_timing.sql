-- زمان‌بندی اعلان‌های باشگاه مشتریان؛ افزایشی و قابل اجرای مجدد
begin;

create or replace function public.enqueue_customer_club_reminder_actions(
  p_notifications jsonb,
  p_customer_id uuid,
  p_context jsonb default '{}'::jsonb
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_org_id uuid := public.current_org_id();
  v_action jsonb;
  v_timing jsonb;
  v_reference text;
  v_reference_at timestamptz;
  v_offset interval;
  v_available_at timestamptz;
begin
  if v_org_id is null or coalesce((p_notifications->'reminder'->>'enabled')::boolean, false) is not true then return; end if;
  for v_action in select value from jsonb_array_elements(coalesce(p_notifications->'reminder'->'actions', '[]'::jsonb)) loop
    v_timing := coalesce(v_action->'config'->'customer_club_reminder_timing', '{}'::jsonb);
    v_reference := coalesce(nullif(v_timing->>'reference', ''), 'credit_added');
    v_reference_at := case v_reference
      when 'plan_expiry' then nullif(p_context->>'plan_expires_at', '')::timestamptz
      when 'discount_expiry' then nullif(p_context->>'discount_expires_at', '')::timestamptz
      when 'credit_expiry' then nullif(p_context->>'credit_expires_at', '')::timestamptz
      else coalesce(nullif(p_context->>'credit_added_at', '')::timestamptz, now())
    end;
    if v_reference_at is null or (v_reference = 'credit_added' and coalesce(v_timing->>'direction', 'after') = 'before') then continue; end if;
    v_offset := make_interval(hours => case when coalesce(v_timing->>'unit', 'day') = 'hour' then greatest(0, coalesce((v_timing->>'value')::integer, 0)) else 0 end,
                              days => case when coalesce(v_timing->>'unit', 'day') = 'day' then greatest(0, coalesce((v_timing->>'value')::integer, 0)) else 0 end);
    v_available_at := case when coalesce(v_timing->>'direction', 'after') = 'before' then v_reference_at - v_offset else v_reference_at + v_offset end;
    insert into public.customer_club_notification_queue(org_id, event_key, customer_id, actions, context, available_at)
    values (v_org_id, 'reminder', p_customer_id, jsonb_build_array(v_action), coalesce(p_context, '{}'::jsonb), v_available_at);
  end loop;
end; $$;

create or replace function public.queue_customer_club_rule_reminders()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' or (old.is_active is distinct from new.is_active and new.is_active) then
    perform public.enqueue_customer_club_reminder_actions(coalesce(new.config->'notifications', '{}'::jsonb), null,
      jsonb_build_object('rule_id', new.id, 'rule_name', new.name, 'plan_expires_at', new.ends_at));
  end if;
  return new;
end; $$;

create or replace function public.queue_customer_club_discount_reminders()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' or (old.is_active is distinct from new.is_active and new.is_active) then
    perform public.enqueue_customer_club_reminder_actions(coalesce(new.metadata->'notifications', '{}'::jsonb), new.customer_id,
      jsonb_build_object('discount_code_id', new.id, 'discount_code', new.code, 'discount_expires_at', new.ends_at));
  end if;
  return new;
end; $$;

create or replace function public.queue_customer_club_credit_reminders()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.entry_type <> 'debit' then
    perform public.enqueue_customer_club_reminder_actions(coalesce(new.metadata->'notifications', '{}'::jsonb), new.customer_id,
      jsonb_build_object('ledger_id', new.id, 'amount', new.amount, 'credit_added_at', coalesce(new.effective_date, now())));
  end if;
  return new;
end; $$;

drop trigger if exists trg_queue_customer_club_rule_reminders on public.customer_loyalty_rules;
create trigger trg_queue_customer_club_rule_reminders after insert or update on public.customer_loyalty_rules
  for each row execute function public.queue_customer_club_rule_reminders();
drop trigger if exists trg_queue_customer_club_discount_reminders on public.customer_discount_codes;
create trigger trg_queue_customer_club_discount_reminders after insert or update on public.customer_discount_codes
  for each row execute function public.queue_customer_club_discount_reminders();
drop trigger if exists trg_queue_customer_club_credit_reminders on public.customer_loyalty_ledger;
create trigger trg_queue_customer_club_credit_reminders after insert on public.customer_loyalty_ledger
  for each row execute function public.queue_customer_club_credit_reminders();

revoke all on function public.enqueue_customer_club_reminder_actions(jsonb, uuid, jsonb) from public;
commit;
