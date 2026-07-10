begin;

do $$
begin
  if to_regclass('public.counterparty_bot_messages') is not null then
    alter table public.counterparty_bot_messages
      drop constraint if exists chk_counterparty_bot_messages_message_type;

    alter table public.counterparty_bot_messages
      add constraint chk_counterparty_bot_messages_message_type
      check (message_type in ('text', 'image', 'file', 'invoice', 'other', 'video', 'audio', 'voice', 'deleted', 'edited')) not valid;

    alter table public.counterparty_bot_messages
      validate constraint chk_counterparty_bot_messages_message_type;
  end if;

  if to_regclass('public.counterparty_bot_direct_messages') is not null then
    alter table public.counterparty_bot_direct_messages
      drop constraint if exists chk_counterparty_bot_direct_messages_message_type;

    alter table public.counterparty_bot_direct_messages
      add constraint chk_counterparty_bot_direct_messages_message_type
      check (message_type in ('text', 'image', 'file', 'invoice', 'other', 'video', 'audio', 'voice', 'deleted', 'edited')) not valid;

    alter table public.counterparty_bot_direct_messages
      validate constraint chk_counterparty_bot_direct_messages_message_type;
  end if;
end $$;

do $$
begin
  if to_regclass('public.counterparty_bot_direct_threads') is not null then
    alter table public.counterparty_bot_direct_threads enable row level security;

    drop policy if exists p_counterparty_bot_direct_threads_tenant_insert on public.counterparty_bot_direct_threads;
    drop policy if exists p_counterparty_bot_direct_threads_tenant_update on public.counterparty_bot_direct_threads;

    create policy p_counterparty_bot_direct_threads_tenant_insert
      on public.counterparty_bot_direct_threads
      for insert
      to authenticated
      with check (org_id = public.current_org_id());

    create policy p_counterparty_bot_direct_threads_tenant_update
      on public.counterparty_bot_direct_threads
      for update
      to authenticated
      using (org_id = public.current_org_id())
      with check (org_id = public.current_org_id());
  end if;
end $$;

create or replace function public.sync_bot_direct_chat_identity(
  p_target_module_id text,
  p_target_record_id uuid,
  p_channel_type text,
  p_chat_id text default null,
  p_previous_chat_id text default null,
  p_username text default null,
  p_phone_number text default null,
  p_display_name text default null,
  p_thread_metadata jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_auth_user_id uuid := auth.uid();
  v_channel_type text := nullif(btrim(coalesce(p_channel_type, '')), '');
  v_target_module_id text := nullif(btrim(coalesce(p_target_module_id, '')), '');
  v_chat_id text := nullif(btrim(coalesce(p_chat_id, '')), '');
  v_previous_chat_id text := nullif(btrim(coalesce(p_previous_chat_id, '')), '');
  v_current_chat_id text;
  v_stale_chat_id text;
  v_profile_id uuid;
  v_display_candidate text;
  v_final_display_name text;
  v_binding_id uuid;
  v_thread_id uuid;
  v_metadata jsonb := case when p_thread_metadata is null then null else coalesce(p_thread_metadata, '{}'::jsonb) end;
begin
  if v_org_id is null then
    raise exception 'سازمان فعال پیدا نشد.' using errcode = '42501';
  end if;

  if v_auth_user_id is null then
    raise exception 'برای اتصال مخاطب بات باید وارد سیستم شوید.' using errcode = '42501';
  end if;

  if v_channel_type not in ('telegram', 'bale', 'rubika') then
    raise exception 'کانال بات معتبر نیست.' using errcode = '22023';
  end if;

  if v_target_module_id not in ('customers', 'suppliers', 'employees') then
    raise exception 'نوع مخاطب برای اتصال بات معتبر نیست.' using errcode = '22023';
  end if;

  if v_target_module_id = 'customers' then
    select
      case v_channel_type
        when 'telegram' then nullif(btrim(coalesce(c.telegram_chat_id, '')), '')
        when 'bale' then nullif(btrim(coalesce(c.bale_chat_id, '')), '')
        else nullif(btrim(coalesce(c.rubika_chat_id, '')), '')
      end,
      nullif(btrim(coalesce(c.full_name, c.business_name, c.legal_name, c.system_code, '')), '')
    into v_current_chat_id, v_display_candidate
    from public.customers c
    where c.id = p_target_record_id
      and c.org_id = v_org_id
    for update;

    if not found then
      raise exception 'مخاطب انتخاب‌شده پیدا نشد.' using errcode = 'P0002';
    end if;

    update public.customers
    set
      telegram_chat_id = case when v_channel_type = 'telegram' then v_chat_id else telegram_chat_id end,
      bale_chat_id = case when v_channel_type = 'bale' then v_chat_id else bale_chat_id end,
      rubika_chat_id = case when v_channel_type = 'rubika' then v_chat_id else rubika_chat_id end
    where id = p_target_record_id
      and org_id = v_org_id;
  elsif v_target_module_id = 'suppliers' then
    select
      case v_channel_type
        when 'telegram' then nullif(btrim(coalesce(s.telegram_chat_id, '')), '')
        when 'bale' then nullif(btrim(coalesce(s.bale_chat_id, '')), '')
        else nullif(btrim(coalesce(s.rubika_chat_id, '')), '')
      end,
      coalesce(
        nullif(btrim(coalesce(s.business_name, '')), ''),
        nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''),
        nullif(btrim(coalesce(s.system_code, '')), '')
      )
    into v_current_chat_id, v_display_candidate
    from public.suppliers s
    where s.id = p_target_record_id
      and s.org_id = v_org_id
    for update;

    if not found then
      raise exception 'تأمین‌کننده انتخاب‌شده پیدا نشد.' using errcode = 'P0002';
    end if;

    update public.suppliers
    set
      telegram_chat_id = case when v_channel_type = 'telegram' then v_chat_id else telegram_chat_id end,
      bale_chat_id = case when v_channel_type = 'bale' then v_chat_id else bale_chat_id end,
      rubika_chat_id = case when v_channel_type = 'rubika' then v_chat_id else rubika_chat_id end
    where id = p_target_record_id
      and org_id = v_org_id;
  else
    select
      case v_channel_type
        when 'telegram' then nullif(btrim(coalesce(e.telegram_chat_id, '')), '')
        when 'bale' then nullif(btrim(coalesce(e.bale_chat_id, '')), '')
        else nullif(btrim(coalesce(e.rubika_chat_id, '')), '')
      end,
      e.related_profile_id,
      coalesce(
        nullif(btrim(coalesce(e.full_name, '')), ''),
        nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), ''),
        nullif(btrim(coalesce(e.system_code, '')), ''),
        nullif(btrim(coalesce(e.legacy_system_code, '')), '')
      )
    into v_current_chat_id, v_profile_id, v_display_candidate
    from public.employees e
    where e.id = p_target_record_id
      and e.org_id = v_org_id
    for update;

    if not found then
      raise exception 'کارمند انتخاب‌شده پیدا نشد.' using errcode = 'P0002';
    end if;

    update public.employees
    set
      telegram_chat_id = case when v_channel_type = 'telegram' then v_chat_id else telegram_chat_id end,
      bale_chat_id = case when v_channel_type = 'bale' then v_chat_id else bale_chat_id end,
      rubika_chat_id = case when v_channel_type = 'rubika' then v_chat_id else rubika_chat_id end
    where id = p_target_record_id
      and org_id = v_org_id;

    if v_profile_id is not null then
      update public.profiles
      set
        telegram_chat_id = case when v_channel_type = 'telegram' then v_chat_id else telegram_chat_id end,
        bale_chat_id = case when v_channel_type = 'bale' then v_chat_id else bale_chat_id end,
        rubika_chat_id = case when v_channel_type = 'rubika' then v_chat_id else rubika_chat_id end
      where id = v_profile_id
        and org_id = v_org_id;
    end if;
  end if;

  v_final_display_name := coalesce(nullif(btrim(coalesce(p_display_name, '')), ''), v_display_candidate);

  if v_chat_id is not null then
    insert into public.bot_chat_identity_bindings (
      org_id,
      channel_type,
      chat_id,
      target_module_id,
      target_record_id,
      profile_id,
      display_name,
      username,
      phone_number,
      last_seen_at,
      metadata
    )
    values (
      v_org_id,
      v_channel_type,
      v_chat_id,
      v_target_module_id,
      p_target_record_id,
      v_profile_id,
      v_final_display_name,
      nullif(btrim(coalesce(p_username, '')), ''),
      nullif(btrim(coalesce(p_phone_number, '')), ''),
      now(),
      coalesce(v_metadata, '{}'::jsonb)
    )
    on conflict (org_id, channel_type, chat_id) do update
    set
      target_module_id = excluded.target_module_id,
      target_record_id = excluded.target_record_id,
      profile_id = coalesce(excluded.profile_id, public.bot_chat_identity_bindings.profile_id),
      display_name = coalesce(excluded.display_name, public.bot_chat_identity_bindings.display_name),
      username = coalesce(excluded.username, public.bot_chat_identity_bindings.username),
      phone_number = coalesce(excluded.phone_number, public.bot_chat_identity_bindings.phone_number),
      last_seen_at = now(),
      metadata = case
        when v_metadata is null then public.bot_chat_identity_bindings.metadata
        else coalesce(public.bot_chat_identity_bindings.metadata, '{}'::jsonb) || v_metadata
      end,
      updated_at = now()
    returning id into v_binding_id;

    insert into public.counterparty_bot_direct_threads (
      org_id,
      binding_id,
      channel_type,
      chat_id,
      target_module_id,
      target_record_id,
      customer_id,
      supplier_id,
      employee_id,
      profile_id,
      display_name,
      username,
      phone_number,
      last_seen_at,
      metadata
    )
    values (
      v_org_id,
      v_binding_id,
      v_channel_type,
      v_chat_id,
      v_target_module_id,
      p_target_record_id,
      case when v_target_module_id = 'customers' then p_target_record_id else null end,
      case when v_target_module_id = 'suppliers' then p_target_record_id else null end,
      case when v_target_module_id = 'employees' then p_target_record_id else null end,
      v_profile_id,
      v_final_display_name,
      nullif(btrim(coalesce(p_username, '')), ''),
      nullif(btrim(coalesce(p_phone_number, '')), ''),
      now(),
      coalesce(v_metadata, '{}'::jsonb)
    )
    on conflict (org_id, channel_type, chat_id) do update
    set
      binding_id = excluded.binding_id,
      target_module_id = excluded.target_module_id,
      target_record_id = excluded.target_record_id,
      customer_id = excluded.customer_id,
      supplier_id = excluded.supplier_id,
      employee_id = excluded.employee_id,
      profile_id = coalesce(excluded.profile_id, public.counterparty_bot_direct_threads.profile_id),
      display_name = coalesce(excluded.display_name, public.counterparty_bot_direct_threads.display_name),
      username = coalesce(excluded.username, public.counterparty_bot_direct_threads.username),
      phone_number = coalesce(excluded.phone_number, public.counterparty_bot_direct_threads.phone_number),
      last_seen_at = now(),
      metadata = case
        when v_metadata is null then public.counterparty_bot_direct_threads.metadata
        else coalesce(public.counterparty_bot_direct_threads.metadata, '{}'::jsonb) || v_metadata
      end,
      updated_at = now()
    returning id into v_thread_id;
  end if;

  for v_stale_chat_id in
    select distinct stale.value
    from unnest(array[v_previous_chat_id, v_current_chat_id]) as stale(value)
    where stale.value is not null
      and (v_chat_id is null or stale.value <> v_chat_id)
  loop
    delete from public.bot_chat_identity_bindings
    where org_id = v_org_id
      and channel_type = v_channel_type
      and chat_id = v_stale_chat_id
      and target_module_id = v_target_module_id
      and target_record_id = p_target_record_id;

    update public.counterparty_bot_direct_threads
    set
      binding_id = null,
      target_module_id = null,
      target_record_id = null,
      customer_id = null,
      supplier_id = null,
      employee_id = null,
      profile_id = null,
      updated_at = now()
    where org_id = v_org_id
      and channel_type = v_channel_type
      and chat_id = v_stale_chat_id
      and target_module_id = v_target_module_id
      and target_record_id = p_target_record_id;
  end loop;

  return jsonb_build_object(
    'display_name', v_final_display_name,
    'profile_id', v_profile_id,
    'previous_chat_id', v_current_chat_id,
    'chat_id', v_chat_id,
    'binding_id', v_binding_id,
    'direct_thread_id', v_thread_id
  );
end;
$$;

grant execute on function public.sync_bot_direct_chat_identity(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to authenticated;

notify pgrst, 'reload schema';

commit;
