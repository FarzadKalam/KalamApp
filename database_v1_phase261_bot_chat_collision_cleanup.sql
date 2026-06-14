-- KalamApp V1 - Phase 261
-- Cleanup dangerous collisions between bot group chat ids and direct chat ids.

begin;

with duplicate_group_bindings as (
  select
    org_id,
    channel_type,
    btrim(bot_chat_id) as bot_chat_id,
    (
      array_agg(
        id
        order by
          coalesce(last_inbound_at, last_outbound_at, updated_at) desc nulls last,
          id desc
      )
    )[1] as keeper_group_id
  from public.counterparty_bot_groups
  where nullif(btrim(bot_chat_id), '') is not null
  group by org_id, channel_type, btrim(bot_chat_id)
  having count(*) > 1
),
duplicate_group_rows as (
  select
    g.id,
    d.keeper_group_id,
    d.bot_chat_id
  from public.counterparty_bot_groups g
  join duplicate_group_bindings d
    on d.org_id = g.org_id
   and d.channel_type = g.channel_type
   and d.bot_chat_id = btrim(g.bot_chat_id)
  where g.id <> d.keeper_group_id
)
update public.counterparty_bot_messages m
set bot_group_id = d.keeper_group_id
from duplicate_group_rows d
where m.bot_group_id = d.id;

with duplicate_group_bindings as (
  select
    org_id,
    channel_type,
    btrim(bot_chat_id) as bot_chat_id,
    (
      array_agg(
        id
        order by
          coalesce(last_inbound_at, last_outbound_at, updated_at) desc nulls last,
          id desc
      )
    )[1] as keeper_group_id
  from public.counterparty_bot_groups
  where nullif(btrim(bot_chat_id), '') is not null
  group by org_id, channel_type, btrim(bot_chat_id)
  having count(*) > 1
),
duplicate_group_rows as (
  select
    g.id,
    d.keeper_group_id,
    d.bot_chat_id,
    coalesce(g.metadata, '{}'::jsonb) as metadata
  from public.counterparty_bot_groups g
  join duplicate_group_bindings d
    on d.org_id = g.org_id
   and d.channel_type = g.channel_type
   and d.bot_chat_id = btrim(g.bot_chat_id)
  where g.id <> d.keeper_group_id
)
update public.counterparty_bot_groups g
set
  bot_chat_id = null,
  status = case when g.status = 'active' then 'pending_join' else g.status end,
  metadata = duplicate_group_rows.metadata || jsonb_build_object(
    'duplicate_chat_binding_cleared_at', now(),
    'duplicate_chat_binding_previous_chat_id', duplicate_group_rows.bot_chat_id,
    'duplicate_chat_binding_kept_group_id', duplicate_group_rows.keeper_group_id
  )
from duplicate_group_rows
where g.id = duplicate_group_rows.id;

drop table if exists pg_temp.tmp_group_chat_ids;
create temporary table tmp_group_chat_ids on commit drop as
select distinct
  org_id,
  channel_type,
  btrim(bot_chat_id) as chat_id
from public.counterparty_bot_groups
where nullif(btrim(bot_chat_id), '') is not null;

delete from public.bot_chat_identity_bindings b
using tmp_group_chat_ids g
where b.org_id = g.org_id
  and b.channel_type = g.channel_type
  and b.chat_id = g.chat_id;

update public.counterparty_bot_direct_threads t
set
  binding_id = null,
  target_module_id = null,
  target_record_id = null,
  customer_id = null,
  supplier_id = null,
  employee_id = null,
  profile_id = null,
  metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'suspected_group_chat', true,
    'send_blocked', true,
    'group_chat_collision_detected_at', now(),
    'group_chat_collision_chat_id', t.chat_id
  )
from tmp_group_chat_ids g
where t.org_id = g.org_id
  and t.channel_type = g.channel_type
  and t.chat_id = g.chat_id;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'telegram_chat_id'
  ) then
    update public.customers c
    set telegram_chat_id = null
    where nullif(btrim(c.telegram_chat_id), '') is not null
      and exists (
        select 1 from tmp_group_chat_ids g
        where g.org_id = c.org_id
          and g.channel_type = 'telegram'
          and g.chat_id = btrim(c.telegram_chat_id)
      );
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'bale_chat_id'
  ) then
    update public.customers c
    set bale_chat_id = null
    where nullif(btrim(c.bale_chat_id), '') is not null
      and exists (
        select 1 from tmp_group_chat_ids g
        where g.org_id = c.org_id
          and g.channel_type = 'bale'
          and g.chat_id = btrim(c.bale_chat_id)
      );
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'rubika_chat_id'
  ) then
    update public.customers c
    set rubika_chat_id = null
    where nullif(btrim(c.rubika_chat_id), '') is not null
      and exists (
        select 1 from tmp_group_chat_ids g
        where g.org_id = c.org_id
          and g.channel_type = 'rubika'
          and g.chat_id = btrim(c.rubika_chat_id)
      );
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'suppliers' and column_name = 'telegram_chat_id'
  ) then
    update public.suppliers s
    set telegram_chat_id = null
    where nullif(btrim(s.telegram_chat_id), '') is not null
      and exists (
        select 1 from tmp_group_chat_ids g
        where g.org_id = s.org_id
          and g.channel_type = 'telegram'
          and g.chat_id = btrim(s.telegram_chat_id)
      );
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'suppliers' and column_name = 'bale_chat_id'
  ) then
    update public.suppliers s
    set bale_chat_id = null
    where nullif(btrim(s.bale_chat_id), '') is not null
      and exists (
        select 1 from tmp_group_chat_ids g
        where g.org_id = s.org_id
          and g.channel_type = 'bale'
          and g.chat_id = btrim(s.bale_chat_id)
      );
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'suppliers' and column_name = 'rubika_chat_id'
  ) then
    update public.suppliers s
    set rubika_chat_id = null
    where nullif(btrim(s.rubika_chat_id), '') is not null
      and exists (
        select 1 from tmp_group_chat_ids g
        where g.org_id = s.org_id
          and g.channel_type = 'rubika'
          and g.chat_id = btrim(s.rubika_chat_id)
      );
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'telegram_chat_id'
  ) then
    update public.employees e
    set telegram_chat_id = null
    where nullif(btrim(e.telegram_chat_id), '') is not null
      and exists (
        select 1 from tmp_group_chat_ids g
        where g.org_id = e.org_id
          and g.channel_type = 'telegram'
          and g.chat_id = btrim(e.telegram_chat_id)
      );
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'bale_chat_id'
  ) then
    update public.employees e
    set bale_chat_id = null
    where nullif(btrim(e.bale_chat_id), '') is not null
      and exists (
        select 1 from tmp_group_chat_ids g
        where g.org_id = e.org_id
          and g.channel_type = 'bale'
          and g.chat_id = btrim(e.bale_chat_id)
      );
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'rubika_chat_id'
  ) then
    update public.employees e
    set rubika_chat_id = null
    where nullif(btrim(e.rubika_chat_id), '') is not null
      and exists (
        select 1 from tmp_group_chat_ids g
        where g.org_id = e.org_id
          and g.channel_type = 'rubika'
          and g.chat_id = btrim(e.rubika_chat_id)
      );
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'telegram_chat_id'
  ) then
    update public.profiles p
    set telegram_chat_id = null
    where nullif(btrim(p.telegram_chat_id), '') is not null
      and exists (
        select 1 from tmp_group_chat_ids g
        where g.org_id = p.org_id
          and g.channel_type = 'telegram'
          and g.chat_id = btrim(p.telegram_chat_id)
      );
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'bale_chat_id'
  ) then
    update public.profiles p
    set bale_chat_id = null
    where nullif(btrim(p.bale_chat_id), '') is not null
      and exists (
        select 1 from tmp_group_chat_ids g
        where g.org_id = p.org_id
          and g.channel_type = 'bale'
          and g.chat_id = btrim(p.bale_chat_id)
      );
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'rubika_chat_id'
  ) then
    update public.profiles p
    set rubika_chat_id = null
    where nullif(btrim(p.rubika_chat_id), '') is not null
      and exists (
        select 1 from tmp_group_chat_ids g
        where g.org_id = p.org_id
          and g.channel_type = 'rubika'
          and g.chat_id = btrim(p.rubika_chat_id)
      );
  end if;
end $$;

commit;
