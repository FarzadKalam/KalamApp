-- =====================================================
-- KalamApp - Phase 80 Counterparty Bot Groups
-- Date: 2026-04-11
-- Type: Additive / non-breaking migration
-- Goal: generic bot-group mapping for customers/suppliers + message timeline foundation
-- =====================================================

begin;

create table if not exists public.counterparty_bot_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  target_type text not null default 'customers',
  customer_id uuid references public.customers(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete cascade,
  channel_type text not null default 'rubika',
  status text not null default 'pending_join_link',
  group_join_link text,
  group_platform_id text,
  bot_chat_id text,
  group_title text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_counterparty_bot_groups_target_type
    check (target_type in ('customers', 'suppliers')),
  constraint chk_counterparty_bot_groups_channel_type
    check (channel_type in ('telegram', 'bale', 'rubika')),
  constraint chk_counterparty_bot_groups_status
    check (status in ('pending_join_link', 'pending_join', 'active', 'disabled', 'error')),
  constraint chk_counterparty_bot_groups_target_link
    check (
      (target_type = 'customers' and customer_id is not null and supplier_id is null)
      or (target_type = 'suppliers' and supplier_id is not null and customer_id is null)
  )
);

alter table public.counterparty_bot_groups
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists target_type text not null default 'customers',
  add column if not exists customer_id uuid references public.customers(id) on delete cascade,
  add column if not exists supplier_id uuid references public.suppliers(id) on delete cascade,
  add column if not exists channel_type text not null default 'rubika',
  add column if not exists status text not null default 'pending_join_link',
  add column if not exists group_join_link text,
  add column if not exists group_platform_id text,
  add column if not exists bot_chat_id text,
  add column if not exists group_title text,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists last_outbound_at timestamptz,
  add column if not exists last_error text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_counterparty_bot_groups_org_channel
  on public.counterparty_bot_groups(org_id, channel_type, created_at desc);

create index if not exists idx_counterparty_bot_groups_customer
  on public.counterparty_bot_groups(customer_id, channel_type, created_at desc)
  where customer_id is not null;

create index if not exists idx_counterparty_bot_groups_supplier
  on public.counterparty_bot_groups(supplier_id, channel_type, created_at desc)
  where supplier_id is not null;

create unique index if not exists uq_counterparty_bot_groups_customer_channel
  on public.counterparty_bot_groups(org_id, customer_id, channel_type)
  where customer_id is not null;

create unique index if not exists uq_counterparty_bot_groups_supplier_channel
  on public.counterparty_bot_groups(org_id, supplier_id, channel_type)
  where supplier_id is not null;

do $$
begin
  if to_regprocedure('public.current_org_id()') is not null then
    alter table public.counterparty_bot_groups
      alter column org_id set default public.current_org_id();
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_counterparty_bot_groups_updated_at on public.counterparty_bot_groups;
    create trigger trg_counterparty_bot_groups_updated_at
      before update on public.counterparty_bot_groups
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.counterparty_bot_groups enable row level security;

drop policy if exists p_counterparty_bot_groups_org_all on public.counterparty_bot_groups;
create policy p_counterparty_bot_groups_org_all on public.counterparty_bot_groups
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

create table if not exists public.counterparty_bot_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  bot_group_id uuid references public.counterparty_bot_groups(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  channel_type text not null,
  direction text not null,
  message_type text not null default 'text',
  chat_id text,
  provider_message_id text,
  content_text text,
  file_url text,
  file_name text,
  mime_type text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chk_counterparty_bot_messages_channel_type
    check (channel_type in ('telegram', 'bale', 'rubika')),
  constraint chk_counterparty_bot_messages_direction
    check (direction in ('inbound', 'outbound')),
  constraint chk_counterparty_bot_messages_message_type
    check (message_type in ('text', 'image', 'file', 'invoice', 'other'))
);

alter table public.counterparty_bot_messages
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists bot_group_id uuid references public.counterparty_bot_groups(id) on delete set null,
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists channel_type text not null default 'rubika',
  add column if not exists direction text not null default 'inbound',
  add column if not exists message_type text not null default 'text',
  add column if not exists chat_id text,
  add column if not exists provider_message_id text,
  add column if not exists content_text text,
  add column if not exists file_url text,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_counterparty_bot_messages_org_time
  on public.counterparty_bot_messages(org_id, created_at desc);

create index if not exists idx_counterparty_bot_messages_group_time
  on public.counterparty_bot_messages(bot_group_id, created_at desc)
  where bot_group_id is not null;

create index if not exists idx_counterparty_bot_messages_customer_time
  on public.counterparty_bot_messages(customer_id, created_at desc)
  where customer_id is not null;

create index if not exists idx_counterparty_bot_messages_supplier_time
  on public.counterparty_bot_messages(supplier_id, created_at desc)
  where supplier_id is not null;

do $$
begin
  if to_regprocedure('public.current_org_id()') is not null then
    alter table public.counterparty_bot_messages
      alter column org_id set default public.current_org_id();
  end if;
end $$;

alter table public.counterparty_bot_messages enable row level security;

drop policy if exists p_counterparty_bot_messages_org_all on public.counterparty_bot_messages;
create policy p_counterparty_bot_messages_org_all on public.counterparty_bot_messages
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

notify pgrst, 'reload schema';

commit;
