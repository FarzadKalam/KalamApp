-- =====================================================
-- TazeSystem - Phase 259
-- گروه‌ها و پی‌وی‌های بات با bind سراسری chat_id
-- =====================================================

begin;

alter table if exists public.customers
  alter column preferred_notification_channel set default 'none';

alter table if exists public.suppliers
  add column if not exists telegram_chat_id text,
  add column if not exists bale_chat_id text,
  add column if not exists rubika_chat_id text;

alter table if exists public.employees
  add column if not exists telegram_chat_id text,
  add column if not exists bale_chat_id text,
  add column if not exists rubika_chat_id text;

alter table if exists public.profiles
  add column if not exists telegram_chat_id text,
  add column if not exists bale_chat_id text,
  add column if not exists rubika_chat_id text;

create table if not exists public.bot_chat_identity_bindings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  channel_type text not null,
  chat_id text not null,
  target_module_id text not null,
  target_record_id uuid not null,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text,
  username text,
  phone_number text,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_bot_chat_identity_bindings_channel_type
    check (channel_type in ('telegram', 'bale', 'rubika')),
  constraint chk_bot_chat_identity_bindings_target_module
    check (target_module_id in ('customers', 'suppliers', 'employees'))
);

create unique index if not exists uq_bot_chat_identity_bindings_org_channel_chat
  on public.bot_chat_identity_bindings (org_id, channel_type, chat_id);

create index if not exists idx_bot_chat_identity_bindings_target
  on public.bot_chat_identity_bindings (org_id, target_module_id, target_record_id);

create index if not exists idx_bot_chat_identity_bindings_profile
  on public.bot_chat_identity_bindings (org_id, profile_id)
  where profile_id is not null;

create table if not exists public.counterparty_bot_direct_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  binding_id uuid references public.bot_chat_identity_bindings(id) on delete set null,
  channel_type text not null,
  chat_id text not null,
  target_module_id text,
  target_record_id uuid,
  customer_id uuid references public.customers(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text,
  username text,
  phone_number text,
  last_seen_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_counterparty_bot_direct_threads_channel_type
    check (channel_type in ('telegram', 'bale', 'rubika')),
  constraint chk_counterparty_bot_direct_threads_target_module
    check (target_module_id is null or target_module_id in ('customers', 'suppliers', 'employees')),
  constraint chk_counterparty_bot_direct_threads_target_link
    check (
      (
        target_module_id is null
        and target_record_id is null
        and customer_id is null
        and supplier_id is null
        and employee_id is null
      )
      or (
        target_module_id = 'customers'
        and target_record_id = customer_id
        and supplier_id is null
        and employee_id is null
      )
      or (
        target_module_id = 'suppliers'
        and target_record_id = supplier_id
        and customer_id is null
        and employee_id is null
      )
      or (
        target_module_id = 'employees'
        and target_record_id = employee_id
        and customer_id is null
        and supplier_id is null
      )
    )
);

create unique index if not exists uq_counterparty_bot_direct_threads_org_channel_chat
  on public.counterparty_bot_direct_threads (org_id, channel_type, chat_id);

create index if not exists idx_counterparty_bot_direct_threads_message_at
  on public.counterparty_bot_direct_threads (org_id, last_message_at desc nulls last, last_seen_at desc nulls last);

create index if not exists idx_counterparty_bot_direct_threads_target
  on public.counterparty_bot_direct_threads (org_id, target_module_id, target_record_id)
  where target_module_id is not null and target_record_id is not null;

create table if not exists public.counterparty_bot_direct_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  direct_thread_id uuid not null references public.counterparty_bot_direct_threads(id) on delete cascade,
  binding_id uuid references public.bot_chat_identity_bindings(id) on delete set null,
  channel_type text not null,
  chat_id text not null,
  target_module_id text,
  target_record_id uuid,
  customer_id uuid references public.customers(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  direction text not null,
  message_type text not null default 'text',
  provider_message_id text,
  content_text text,
  file_url text,
  file_name text,
  mime_type text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chk_counterparty_bot_direct_messages_channel_type
    check (channel_type in ('telegram', 'bale', 'rubika')),
  constraint chk_counterparty_bot_direct_messages_direction
    check (direction in ('inbound', 'outbound')),
  constraint chk_counterparty_bot_direct_messages_message_type
    check (message_type in ('text', 'image', 'file', 'invoice', 'other')),
  constraint chk_counterparty_bot_direct_messages_target_module
    check (target_module_id is null or target_module_id in ('customers', 'suppliers', 'employees'))
);

create index if not exists idx_counterparty_bot_direct_messages_thread_time
  on public.counterparty_bot_direct_messages (direct_thread_id, created_at desc);

create index if not exists idx_counterparty_bot_direct_messages_org_time
  on public.counterparty_bot_direct_messages (org_id, created_at desc);

create index if not exists idx_counterparty_bot_direct_messages_provider
  on public.counterparty_bot_direct_messages (org_id, channel_type, provider_message_id)
  where provider_message_id is not null;

alter table if exists public.counterparty_bot_config
  add column if not exists employee_id uuid references public.employees(id) on delete cascade;

drop index if exists public.counterparty_bot_config_employee_uq;
create unique index if not exists counterparty_bot_config_employee_uq
  on public.counterparty_bot_config (org_id, employee_id)
  where employee_id is not null;

alter table if exists public.counterparty_bot_groups
  add column if not exists employee_id uuid references public.employees(id) on delete cascade;

alter table if exists public.counterparty_bot_messages
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

create index if not exists idx_counterparty_bot_groups_employee
  on public.counterparty_bot_groups (employee_id, channel_type, created_at desc)
  where employee_id is not null;

create unique index if not exists uq_counterparty_bot_groups_employee_channel
  on public.counterparty_bot_groups (org_id, employee_id, channel_type)
  where employee_id is not null;

create index if not exists idx_counterparty_bot_messages_employee_time
  on public.counterparty_bot_messages (employee_id, created_at desc)
  where employee_id is not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'counterparty_bot_config_one_target'
      and conrelid = 'public.counterparty_bot_config'::regclass
  ) then
    alter table public.counterparty_bot_config
      drop constraint counterparty_bot_config_one_target;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'counterparty_bot_config_one_target_v2'
      and conrelid = 'public.counterparty_bot_config'::regclass
  ) then
    alter table public.counterparty_bot_config
      add constraint counterparty_bot_config_one_target_v2
      check (
        (
          customer_id is not null
          and supplier_id is null
          and employee_id is null
        )
        or (
          supplier_id is not null
          and customer_id is null
          and employee_id is null
        )
        or (
          employee_id is not null
          and customer_id is null
          and supplier_id is null
        )
      );
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'chk_counterparty_bot_groups_target_type'
      and conrelid = 'public.counterparty_bot_groups'::regclass
  ) then
    alter table public.counterparty_bot_groups
      drop constraint chk_counterparty_bot_groups_target_type;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_counterparty_bot_groups_target_type_v2'
      and conrelid = 'public.counterparty_bot_groups'::regclass
  ) then
    alter table public.counterparty_bot_groups
      add constraint chk_counterparty_bot_groups_target_type_v2
      check (target_type in ('customers', 'suppliers', 'employees'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'chk_counterparty_bot_groups_target_link'
      and conrelid = 'public.counterparty_bot_groups'::regclass
  ) then
    alter table public.counterparty_bot_groups
      drop constraint chk_counterparty_bot_groups_target_link;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_counterparty_bot_groups_target_link_v2'
      and conrelid = 'public.counterparty_bot_groups'::regclass
  ) then
    alter table public.counterparty_bot_groups
      add constraint chk_counterparty_bot_groups_target_link_v2
      check (
        (
          target_type = 'customers'
          and customer_id is not null
          and supplier_id is null
          and employee_id is null
        )
        or (
          target_type = 'suppliers'
          and supplier_id is not null
          and customer_id is null
          and employee_id is null
        )
        or (
          target_type = 'employees'
          and employee_id is not null
          and customer_id is null
          and supplier_id is null
        )
      );
  end if;
end $$;

create or replace function public.sync_counterparty_bot_direct_thread_activity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  preview_text text;
begin
  preview_text := nullif(trim(coalesce(new.content_text, new.file_name, '')), '');

  update public.counterparty_bot_direct_threads
  set
    last_message_at = coalesce(new.created_at, now()),
    last_message_preview = coalesce(preview_text, last_message_preview),
    last_seen_at = greatest(coalesce(last_seen_at, '-infinity'::timestamptz), coalesce(new.created_at, now())),
    last_inbound_at = case
      when new.direction = 'inbound' then greatest(coalesce(last_inbound_at, '-infinity'::timestamptz), coalesce(new.created_at, now()))
      else last_inbound_at
    end,
    last_outbound_at = case
      when new.direction = 'outbound' then greatest(coalesce(last_outbound_at, '-infinity'::timestamptz), coalesce(new.created_at, now()))
      else last_outbound_at
    end,
    updated_at = now()
  where id = new.direct_thread_id;

  return new;
end;
$$;

drop trigger if exists trg_counterparty_bot_direct_messages_activity on public.counterparty_bot_direct_messages;
create trigger trg_counterparty_bot_direct_messages_activity
  after insert on public.counterparty_bot_direct_messages
  for each row
  execute function public.sync_counterparty_bot_direct_thread_activity();

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_bot_chat_identity_bindings_updated_at on public.bot_chat_identity_bindings;
    create trigger trg_bot_chat_identity_bindings_updated_at
      before update on public.bot_chat_identity_bindings
      for each row execute function public.set_updated_at();

    drop trigger if exists trg_counterparty_bot_direct_threads_updated_at on public.counterparty_bot_direct_threads;
    create trigger trg_counterparty_bot_direct_threads_updated_at
      before update on public.counterparty_bot_direct_threads
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.bot_chat_identity_bindings enable row level security;
alter table public.counterparty_bot_direct_threads enable row level security;
alter table public.counterparty_bot_direct_messages enable row level security;

drop policy if exists p_bot_chat_identity_bindings_tenant_select on public.bot_chat_identity_bindings;
drop policy if exists p_bot_chat_identity_bindings_tenant_insert on public.bot_chat_identity_bindings;
drop policy if exists p_bot_chat_identity_bindings_tenant_update on public.bot_chat_identity_bindings;
drop policy if exists p_bot_chat_identity_bindings_tenant_delete on public.bot_chat_identity_bindings;

create policy p_bot_chat_identity_bindings_tenant_select
  on public.bot_chat_identity_bindings
  for select
  to authenticated
  using (org_id = public.current_org_id());

create policy p_bot_chat_identity_bindings_tenant_insert
  on public.bot_chat_identity_bindings
  for insert
  to authenticated
  with check (org_id = public.current_org_id());

create policy p_bot_chat_identity_bindings_tenant_update
  on public.bot_chat_identity_bindings
  for update
  to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

create policy p_bot_chat_identity_bindings_tenant_delete
  on public.bot_chat_identity_bindings
  for delete
  to authenticated
  using (org_id = public.current_org_id());

drop policy if exists p_counterparty_bot_direct_threads_tenant_select on public.counterparty_bot_direct_threads;
drop policy if exists p_counterparty_bot_direct_threads_tenant_insert on public.counterparty_bot_direct_threads;
drop policy if exists p_counterparty_bot_direct_threads_tenant_update on public.counterparty_bot_direct_threads;
drop policy if exists p_counterparty_bot_direct_threads_tenant_delete on public.counterparty_bot_direct_threads;

create policy p_counterparty_bot_direct_threads_tenant_select
  on public.counterparty_bot_direct_threads
  for select
  to authenticated
  using (org_id = public.current_org_id());

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

create policy p_counterparty_bot_direct_threads_tenant_delete
  on public.counterparty_bot_direct_threads
  for delete
  to authenticated
  using (org_id = public.current_org_id());

drop policy if exists p_counterparty_bot_direct_messages_tenant_select on public.counterparty_bot_direct_messages;
drop policy if exists p_counterparty_bot_direct_messages_tenant_insert on public.counterparty_bot_direct_messages;
drop policy if exists p_counterparty_bot_direct_messages_tenant_update on public.counterparty_bot_direct_messages;
drop policy if exists p_counterparty_bot_direct_messages_tenant_delete on public.counterparty_bot_direct_messages;

create policy p_counterparty_bot_direct_messages_tenant_select
  on public.counterparty_bot_direct_messages
  for select
  to authenticated
  using (org_id = public.current_org_id());

create policy p_counterparty_bot_direct_messages_tenant_insert
  on public.counterparty_bot_direct_messages
  for insert
  to authenticated
  with check (org_id = public.current_org_id());

create policy p_counterparty_bot_direct_messages_tenant_update
  on public.counterparty_bot_direct_messages
  for update
  to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

create policy p_counterparty_bot_direct_messages_tenant_delete
  on public.counterparty_bot_direct_messages
  for delete
  to authenticated
  using (org_id = public.current_org_id());

drop policy if exists p_bot_inbound_contacts_org_all on public.bot_inbound_contacts;
drop policy if exists p_bot_inbound_contacts_tenant_select on public.bot_inbound_contacts;
drop policy if exists p_bot_inbound_contacts_tenant_insert on public.bot_inbound_contacts;
drop policy if exists p_bot_inbound_contacts_tenant_update on public.bot_inbound_contacts;
drop policy if exists p_bot_inbound_contacts_tenant_delete on public.bot_inbound_contacts;

create policy p_bot_inbound_contacts_tenant_select
  on public.bot_inbound_contacts
  for select
  to authenticated
  using (org_id = public.current_org_id());

create policy p_bot_inbound_contacts_tenant_insert
  on public.bot_inbound_contacts
  for insert
  to authenticated
  with check (org_id = public.current_org_id());

create policy p_bot_inbound_contacts_tenant_update
  on public.bot_inbound_contacts
  for update
  to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

create policy p_bot_inbound_contacts_tenant_delete
  on public.bot_inbound_contacts
  for delete
  to authenticated
  using (org_id = public.current_org_id());

insert into public.bot_chat_identity_bindings (
  org_id,
  channel_type,
  chat_id,
  target_module_id,
  target_record_id,
  display_name,
  metadata
)
select
  c.org_id,
  src.channel_type,
  src.chat_id,
  'customers',
  c.id,
  nullif(trim(coalesce(c.full_name, c.business_name, c.legal_name, c.system_code)), ''),
  '{}'::jsonb
from public.customers c
cross join lateral (
  values
    ('telegram', nullif(trim(c.telegram_chat_id), '')),
    ('bale', nullif(trim(c.bale_chat_id), '')),
    ('rubika', nullif(trim(c.rubika_chat_id), ''))
) as src(channel_type, chat_id)
where c.org_id is not null
  and src.chat_id is not null
on conflict (org_id, channel_type, chat_id) do update
set
  target_module_id = excluded.target_module_id,
  target_record_id = excluded.target_record_id,
  display_name = coalesce(excluded.display_name, public.bot_chat_identity_bindings.display_name),
  updated_at = now();

insert into public.bot_chat_identity_bindings (
  org_id,
  channel_type,
  chat_id,
  target_module_id,
  target_record_id,
  display_name,
  metadata
)
select
  s.org_id,
  src.channel_type,
  src.chat_id,
  'suppliers',
  s.id,
  nullif(trim(coalesce(s.business_name, s.first_name, s.last_name, s.system_code)), ''),
  '{}'::jsonb
from public.suppliers s
cross join lateral (
  values
    ('telegram', nullif(trim(s.telegram_chat_id), '')),
    ('bale', nullif(trim(s.bale_chat_id), '')),
    ('rubika', nullif(trim(s.rubika_chat_id), ''))
) as src(channel_type, chat_id)
where s.org_id is not null
  and src.chat_id is not null
on conflict (org_id, channel_type, chat_id) do update
set
  target_module_id = excluded.target_module_id,
  target_record_id = excluded.target_record_id,
  display_name = coalesce(excluded.display_name, public.bot_chat_identity_bindings.display_name),
  updated_at = now();

insert into public.bot_chat_identity_bindings (
  org_id,
  channel_type,
  chat_id,
  target_module_id,
  target_record_id,
  profile_id,
  display_name,
  metadata
)
select
  e.org_id,
  src.channel_type,
  src.chat_id,
  'employees',
  e.id,
  e.related_profile_id,
  nullif(trim(coalesce(e.full_name, concat_ws(' ', e.first_name, e.last_name), e.system_code, e.legacy_system_code)), ''),
  '{}'::jsonb
from public.employees e
cross join lateral (
  values
    ('telegram', nullif(trim(e.telegram_chat_id), '')),
    ('bale', nullif(trim(e.bale_chat_id), '')),
    ('rubika', nullif(trim(e.rubika_chat_id), ''))
) as src(channel_type, chat_id)
where e.org_id is not null
  and src.chat_id is not null
on conflict (org_id, channel_type, chat_id) do update
set
  target_module_id = excluded.target_module_id,
  target_record_id = excluded.target_record_id,
  profile_id = coalesce(excluded.profile_id, public.bot_chat_identity_bindings.profile_id),
  display_name = coalesce(excluded.display_name, public.bot_chat_identity_bindings.display_name),
  updated_at = now();

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
select
  b.org_id,
  b.id,
  b.channel_type,
  b.chat_id,
  b.target_module_id,
  b.target_record_id,
  case when b.target_module_id = 'customers' then b.target_record_id else null end,
  case when b.target_module_id = 'suppliers' then b.target_record_id else null end,
  case when b.target_module_id = 'employees' then b.target_record_id else null end,
  b.profile_id,
  b.display_name,
  b.username,
  b.phone_number,
  b.last_seen_at,
  b.metadata
from public.bot_chat_identity_bindings b
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
  last_seen_at = greatest(coalesce(public.counterparty_bot_direct_threads.last_seen_at, '-infinity'::timestamptz), coalesce(excluded.last_seen_at, '-infinity'::timestamptz)),
  metadata = coalesce(excluded.metadata, public.counterparty_bot_direct_threads.metadata),
  updated_at = now();

insert into public.counterparty_bot_direct_threads (
  org_id,
  channel_type,
  chat_id,
  display_name,
  username,
  phone_number,
  last_seen_at,
  metadata
)
select
  c.org_id,
  c.channel_type,
  c.chat_id,
  c.display_name,
  c.username,
  c.phone_number,
  c.last_seen_at,
  coalesce(c.last_payload, '{}'::jsonb)
from public.bot_inbound_contacts c
where c.org_id is not null
  and nullif(trim(c.chat_id), '') is not null
on conflict (org_id, channel_type, chat_id) do update
set
  display_name = coalesce(excluded.display_name, public.counterparty_bot_direct_threads.display_name),
  username = coalesce(excluded.username, public.counterparty_bot_direct_threads.username),
  phone_number = coalesce(excluded.phone_number, public.counterparty_bot_direct_threads.phone_number),
  last_seen_at = greatest(coalesce(public.counterparty_bot_direct_threads.last_seen_at, '-infinity'::timestamptz), coalesce(excluded.last_seen_at, '-infinity'::timestamptz)),
  metadata = coalesce(public.counterparty_bot_direct_threads.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
  updated_at = now();

notify pgrst, 'reload schema';

commit;
