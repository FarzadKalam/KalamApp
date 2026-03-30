-- =====================================================
-- KalamApp - Phase 25 Customer Portal + Bots Foundation
-- Date: 2026-03-21
-- Type: Additive / non-breaking migration
-- Goal: prepare org-specific bot settings, portal roles, customer portal fields, and outbound message logs
-- =====================================================

begin;

-- -----------------------------------------------------------------
-- Integration settings: per-org bot channels + portal settings
-- -----------------------------------------------------------------
alter table if exists public.integration_settings
  add column if not exists org_id uuid references public.organizations(id) on delete set null;

do $$
begin
  if to_regprocedure('public.current_org_id()') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'integration_settings'
         and column_name = 'org_id'
     ) then
    alter table public.integration_settings
      alter column org_id set default public.current_org_id();
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.integration_settings'::regclass
      and conname = 'integration_settings_connection_type_check'
  ) then
    alter table public.integration_settings
      drop constraint integration_settings_connection_type_check;
  end if;
end $$;

alter table public.integration_settings
  add constraint integration_settings_connection_type_check
  check (
    connection_type in (
      'sms',
      'email',
      'site',
      'module_settings',
      'print_templates',
      'telegram_bot',
      'bale_bot',
      'rubika_bot',
      'portal'
    )
  );

drop index if exists public.idx_integration_settings_connection_type;

create unique index if not exists idx_integration_settings_org_connection_type
  on public.integration_settings(org_id, connection_type);

create index if not exists idx_integration_settings_org
  on public.integration_settings(org_id, connection_type);

-- -----------------------------------------------------------------
-- Portal roles per organization
-- -----------------------------------------------------------------
create table if not exists public.portal_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  title text not null,
  permissions jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_portal_roles_org_title
  on public.portal_roles(org_id, lower(title));

create index if not exists idx_portal_roles_org
  on public.portal_roles(org_id, created_at desc);

do $$
begin
  if to_regprocedure('public.current_org_id()') is not null then
    alter table public.portal_roles
      alter column org_id set default public.current_org_id();
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_portal_roles_updated_at on public.portal_roles;
    create trigger trg_portal_roles_updated_at
      before update on public.portal_roles
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.portal_roles enable row level security;

drop policy if exists p_portal_roles_org_all on public.portal_roles;
create policy p_portal_roles_org_all on public.portal_roles
  for all to authenticated
  using (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  )
  with check (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  );

-- -----------------------------------------------------------------
-- Customer portal fields and notification channel mapping
-- -----------------------------------------------------------------
alter table if exists public.customers
  add column if not exists portal_enabled boolean not null default false,
  add column if not exists portal_status text not null default 'disabled',
  add column if not exists portal_role_id uuid references public.portal_roles(id) on delete set null,
  add column if not exists portal_permissions_override jsonb not null default '{}'::jsonb,
  add column if not exists preferred_notification_channel text not null default 'sms',
  add column if not exists telegram_chat_id text,
  add column if not exists bale_chat_id text,
  add column if not exists rubika_chat_id text,
  add column if not exists portal_last_login_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.customers'::regclass
      and conname = 'chk_customers_portal_status'
  ) then
    alter table public.customers
      add constraint chk_customers_portal_status
      check (portal_status in ('disabled', 'invited', 'active', 'suspended'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.customers'::regclass
      and conname = 'chk_customers_preferred_notification_channel'
  ) then
    alter table public.customers
      add constraint chk_customers_preferred_notification_channel
      check (preferred_notification_channel in ('sms', 'telegram', 'bale', 'rubika', 'portal', 'none'));
  end if;
end $$;

create index if not exists idx_customers_portal_enabled
  on public.customers(org_id, portal_enabled, portal_status);

create index if not exists idx_customers_portal_role
  on public.customers(portal_role_id)
  where portal_role_id is not null;

-- -----------------------------------------------------------------
-- Outbound message logs for SMS and bot notifications
-- -----------------------------------------------------------------
create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  channel_type text not null,
  provider text,
  module_id text,
  record_id text,
  customer_id uuid references public.customers(id) on delete set null,
  recipient text,
  title text,
  message_text text not null default '',
  status text not null default 'pending',
  provider_message_id text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_outbound_messages_channel_type
    check (channel_type in ('sms', 'telegram', 'bale', 'rubika', 'portal')),
  constraint chk_outbound_messages_status
    check (status in ('pending', 'sent', 'failed', 'skipped'))
);

create index if not exists idx_outbound_messages_org_channel
  on public.outbound_messages(org_id, channel_type, created_at desc);

create index if not exists idx_outbound_messages_module_record
  on public.outbound_messages(module_id, record_id, created_at desc);

create index if not exists idx_outbound_messages_customer
  on public.outbound_messages(customer_id, created_at desc)
  where customer_id is not null;

do $$
begin
  if to_regprocedure('public.current_org_id()') is not null then
    alter table public.outbound_messages
      alter column org_id set default public.current_org_id();
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_outbound_messages_updated_at on public.outbound_messages;
    create trigger trg_outbound_messages_updated_at
      before update on public.outbound_messages
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.outbound_messages enable row level security;

drop policy if exists p_outbound_messages_org_all on public.outbound_messages;
create policy p_outbound_messages_org_all on public.outbound_messages
  for all to authenticated
  using (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  )
  with check (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  );

commit;
