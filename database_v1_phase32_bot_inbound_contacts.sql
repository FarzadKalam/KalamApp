-- =====================================================
-- KalamApp - Phase 32 Bot Inbound Contacts
-- Date: 2026-03-23
-- Type: Additive / non-breaking migration
-- Goal: capture inbound bot contacts from webhook updates for test messaging
-- =====================================================

begin;

create table if not exists public.bot_inbound_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  channel_type text not null,
  chat_id text not null,
  username text,
  display_name text,
  phone_number text,
  last_message_text text,
  source_provider text,
  last_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_bot_inbound_contacts_channel_type
    check (channel_type in ('telegram', 'bale', 'rubika'))
);

create unique index if not exists idx_bot_inbound_contacts_org_channel_chat
  on public.bot_inbound_contacts(org_id, channel_type, chat_id);

create index if not exists idx_bot_inbound_contacts_org_last_seen
  on public.bot_inbound_contacts(org_id, channel_type, last_seen_at desc);

do $$
begin
  if to_regprocedure('public.current_org_id()') is not null then
    alter table public.bot_inbound_contacts
      alter column org_id set default public.current_org_id();
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_bot_inbound_contacts_updated_at on public.bot_inbound_contacts;
    create trigger trg_bot_inbound_contacts_updated_at
      before update on public.bot_inbound_contacts
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.bot_inbound_contacts enable row level security;

drop policy if exists p_bot_inbound_contacts_org_all on public.bot_inbound_contacts;
create policy p_bot_inbound_contacts_org_all on public.bot_inbound_contacts
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
