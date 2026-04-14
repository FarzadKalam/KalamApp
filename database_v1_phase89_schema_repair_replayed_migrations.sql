-- KalamApp V1 - Phase 89
-- Repair migration for replayed / partial runs across phases 80-87.
-- This file is intentionally idempotent and avoids create-or-replace view shape conflicts.

begin;

do $$
begin
  if to_regclass('public.integration_settings') is not null then
    alter table public.integration_settings
      drop constraint if exists integration_settings_connection_type_check;

    update public.integration_settings
    set connection_type = case
      when connection_type = 'telegram' then 'telegram_bot'
      when connection_type = 'bale' then 'bale_bot'
      when connection_type = 'rubika' then 'rubika_bot'
      else connection_type
    end
    where connection_type in ('telegram', 'bale', 'rubika');

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
          'portal',
          'voip'
        )
      ) not valid;
  end if;
end $$;

alter table if exists public.profiles
  add column if not exists voip_operator_code text,
  add column if not exists voip_extension text,
  add column if not exists voip_service_id text,
  add column if not exists voip_enabled boolean not null default false,
  add column if not exists voip_dial_mode text not null default 'telefonchy_smartcall',
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

alter table if exists public.profiles
  drop constraint if exists profiles_voip_dial_mode_check;

alter table if exists public.profiles
  add constraint profiles_voip_dial_mode_check
  check (voip_dial_mode in ('telefonchy_smartcall', 'sip_link', 'tel_link')) not valid;

alter table if exists public.outbound_messages
  add column if not exists title text,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists operator_report text,
  add column if not exists related_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists direction text not null default 'outbound',
  add column if not exists sender text,
  add column if not exists received_at timestamptz;

update public.outbound_messages
set
  direction = coalesce(nullif(trim(direction), ''), 'outbound'),
  sender = nullif(trim(coalesce(sender, '')), ''),
  recipient = nullif(trim(coalesce(recipient, '')), ''),
  received_at = case
    when coalesce(nullif(trim(direction), ''), 'outbound') = 'inbound' and received_at is null
      then coalesce(sent_at, created_at, now())
    else received_at
  end,
  assignee_type = case
    when assignee_role_id is not null then 'role'
    when assignee_id is not null then 'user'
    else nullif(assignee_type, '')
  end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> ''
   or coalesce(direction, '') = ''
   or coalesce(sender, '') <> btrim(coalesce(sender, ''))
   or coalesce(recipient, '') <> btrim(coalesce(recipient, ''))
   or (coalesce(nullif(trim(direction), ''), 'outbound') = 'inbound' and received_at is null);

alter table if exists public.outbound_messages
  drop constraint if exists chk_outbound_messages_assignee_type,
  drop constraint if exists chk_outbound_messages_status,
  drop constraint if exists outbound_messages_direction_check;

alter table if exists public.outbound_messages
  add constraint chk_outbound_messages_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role')) not valid,
  add constraint chk_outbound_messages_status
    check (status in ('pending', 'sent', 'failed', 'skipped', 'received', 'processed', 'ignored')) not valid,
  add constraint outbound_messages_direction_check
    check (direction in ('inbound', 'outbound')) not valid;

create index if not exists idx_outbound_messages_assignee
  on public.outbound_messages(assignee_id, created_at desc)
  where assignee_id is not null;

create index if not exists idx_outbound_messages_assignee_scope
  on public.outbound_messages(assignee_id, assignee_role_id);

create index if not exists idx_outbound_messages_related_task
  on public.outbound_messages(related_task_id)
  where related_task_id is not null;

create index if not exists idx_outbound_messages_sms_direction_time
  on public.outbound_messages(org_id, direction, coalesce(received_at, sent_at, created_at) desc)
  where channel_type = 'sms';

create index if not exists idx_outbound_messages_sms_sender_time
  on public.outbound_messages(org_id, sender, coalesce(received_at, sent_at, created_at) desc)
  where channel_type = 'sms' and sender is not null;

create table if not exists public.voip_call_logs (
  id uuid primary key default gen_random_uuid()
);

alter table public.voip_call_logs
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists provider text not null default 'telefonchy',
  add column if not exists service_id text,
  add column if not exists call_id text,
  add column if not exists object_id text,
  add column if not exists direction text not null default 'unknown',
  add column if not exists status text not null default 'unknown',
  add column if not exists source_number text,
  add column if not exists destination_number text,
  add column if not exists extension text,
  add column if not exists operator_code text,
  add column if not exists trunk text,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists wait_seconds integer,
  add column if not exists talk_seconds integer,
  add column if not exists file_id text,
  add column if not exists recording_url text,
  add column if not exists module_id text,
  add column if not exists record_id text,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists title text,
  add column if not exists operator_report text,
  add column if not exists related_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.voip_call_logs
set
  extension = nullif(trim(coalesce(extension, '')), ''),
  source_number = nullif(trim(coalesce(source_number, '')), ''),
  destination_number = nullif(trim(coalesce(destination_number, '')), ''),
  assignee_type = case
    when assignee_role_id is not null then 'role'
    when assignee_id is not null then 'user'
    else nullif(assignee_type, '')
  end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> ''
   or coalesce(extension, '') <> btrim(coalesce(extension, ''))
   or coalesce(source_number, '') <> btrim(coalesce(source_number, ''))
   or coalesce(destination_number, '') <> btrim(coalesce(destination_number, ''));

alter table public.voip_call_logs
  drop constraint if exists chk_voip_call_logs_direction,
  drop constraint if exists chk_voip_call_logs_status,
  drop constraint if exists chk_voip_call_logs_assignee_type;

alter table public.voip_call_logs
  add constraint chk_voip_call_logs_direction
    check (direction in ('incoming', 'outgoing', 'internal', 'unknown')) not valid,
  add constraint chk_voip_call_logs_status
    check (status in ('ringing', 'answered', 'missed', 'failed', 'completed', 'unknown')) not valid,
  add constraint chk_voip_call_logs_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role')) not valid;

do $$
begin
  if to_regprocedure('public.current_org_id()') is not null then
    alter table public.voip_call_logs
      alter column org_id set default public.current_org_id();
  end if;
end $$;

create unique index if not exists idx_voip_call_logs_provider_call
  on public.voip_call_logs(org_id, provider, call_id)
  where call_id is not null;

create unique index if not exists idx_voip_call_logs_provider_object
  on public.voip_call_logs(org_id, provider, object_id)
  where object_id is not null;

create index if not exists idx_voip_call_logs_org_created
  on public.voip_call_logs(org_id, created_at desc);

create index if not exists idx_voip_call_logs_module_record
  on public.voip_call_logs(module_id, record_id, created_at desc);

create index if not exists idx_voip_call_logs_extension
  on public.voip_call_logs(org_id, extension, started_at desc)
  where extension is not null;

create index if not exists idx_voip_call_logs_assignee
  on public.voip_call_logs(assignee_id, started_at desc)
  where assignee_id is not null;

create index if not exists idx_voip_call_logs_assignee_scope
  on public.voip_call_logs(assignee_id, assignee_role_id);

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_voip_call_logs_updated_at on public.voip_call_logs;
    create trigger trg_voip_call_logs_updated_at
      before update on public.voip_call_logs
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.voip_call_logs enable row level security;

drop policy if exists p_voip_call_logs_org_all on public.voip_call_logs;
create policy p_voip_call_logs_org_all on public.voip_call_logs
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

grant select, insert, update, delete on public.voip_call_logs to authenticated;

create table if not exists public.counterparty_bot_groups (
  id uuid primary key default gen_random_uuid()
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

alter table public.counterparty_bot_groups
  drop constraint if exists chk_counterparty_bot_groups_target_type,
  drop constraint if exists chk_counterparty_bot_groups_channel_type,
  drop constraint if exists chk_counterparty_bot_groups_status,
  drop constraint if exists chk_counterparty_bot_groups_target_link;

alter table public.counterparty_bot_groups
  add constraint chk_counterparty_bot_groups_target_type
    check (target_type in ('customers', 'suppliers')) not valid,
  add constraint chk_counterparty_bot_groups_channel_type
    check (channel_type in ('telegram', 'bale', 'rubika')) not valid,
  add constraint chk_counterparty_bot_groups_status
    check (status in ('pending_join_link', 'pending_join', 'active', 'disabled', 'error')) not valid,
  add constraint chk_counterparty_bot_groups_target_link
    check (
      (target_type = 'customers' and customer_id is not null and supplier_id is null)
      or (target_type = 'suppliers' and supplier_id is not null and customer_id is null)
    ) not valid;

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

grant select, insert, update, delete on public.counterparty_bot_groups to authenticated;

create table if not exists public.counterparty_bot_messages (
  id uuid primary key default gen_random_uuid()
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

alter table public.counterparty_bot_messages
  drop constraint if exists chk_counterparty_bot_messages_channel_type,
  drop constraint if exists chk_counterparty_bot_messages_direction,
  drop constraint if exists chk_counterparty_bot_messages_message_type;

alter table public.counterparty_bot_messages
  add constraint chk_counterparty_bot_messages_channel_type
    check (channel_type in ('telegram', 'bale', 'rubika')) not valid,
  add constraint chk_counterparty_bot_messages_direction
    check (direction in ('inbound', 'outbound')) not valid,
  add constraint chk_counterparty_bot_messages_message_type
    check (message_type in ('text', 'image', 'file', 'invoice', 'other')) not valid;

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

grant select, insert, update, delete on public.counterparty_bot_messages to authenticated;

create table if not exists public.secretariat_documents (
  id uuid primary key default gen_random_uuid()
);

alter table public.secretariat_documents
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists document_type text not null default 'letter',
  add column if not exists direction text not null default 'internal',
  add column if not exists status text not null default 'draft',
  add column if not exists priority text not null default 'normal',
  add column if not exists confidentiality text not null default 'normal',
  add column if not exists document_date date not null default current_date,
  add column if not exists registered_at timestamptz,
  add column if not exists due_at timestamptz,
  add column if not exists external_number text,
  add column if not exists indicator_number text,
  add column if not exists sender_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists recipient_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists related_document_id uuid references public.secretariat_documents(id) on delete set null,
  add column if not exists related_module_id text,
  add column if not exists related_record_id uuid,
  add column if not exists body text,
  add column if not exists summary text,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.delivery_forms (
  id uuid primary key default gen_random_uuid()
);

alter table public.delivery_forms
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists form_type text not null default 'goods_delivery',
  add column if not exists status text not null default 'draft',
  add column if not exists delivery_date date not null default current_date,
  add column if not exists delivered_by_id uuid references public.profiles(id) on delete set null,
  add column if not exists received_by_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists external_delivered_by text,
  add column if not exists external_received_by text,
  add column if not exists location_text text,
  add column if not exists related_module_id text,
  add column if not exists related_record_id uuid,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.stock_transfers
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists status text not null default 'draft',
  add column if not exists transfer_date date not null default current_date,
  add column if not exists source_warehouse_id uuid references public.warehouses(id) on delete set null,
  add column if not exists target_warehouse_id uuid references public.warehouses(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists delivery_form_id uuid references public.delivery_forms(id) on delete set null,
  add column if not exists related_module_id text,
  add column if not exists related_record_id uuid,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists inventory_applied_at timestamptz,
  add column if not exists inventory_applied_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

do $$
begin
  if to_regprocedure('public.current_org_id()') is not null then
    alter table public.secretariat_documents alter column org_id set default public.current_org_id();
    alter table public.delivery_forms alter column org_id set default public.current_org_id();
  end if;
end $$;

update public.secretariat_documents
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else nullif(assignee_type, '')
end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> '';

update public.delivery_forms
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else nullif(assignee_type, '')
end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> '';

do $$
begin
  if to_regclass('public.stock_transfers') is not null then
    update public.stock_transfers
    set assignee_type = case
      when assignee_role_id is not null then 'role'
      when assignee_id is not null then 'user'
      else nullif(assignee_type, '')
    end
    where assignee_role_id is not null
       or assignee_id is not null
       or coalesce(assignee_type, '') <> '';
  end if;
end $$;

alter table public.secretariat_documents
  drop constraint if exists chk_secretariat_documents_document_type,
  drop constraint if exists chk_secretariat_documents_direction,
  drop constraint if exists chk_secretariat_documents_status,
  drop constraint if exists chk_secretariat_documents_priority,
  drop constraint if exists chk_secretariat_documents_confidentiality,
  drop constraint if exists chk_secretariat_documents_assignee_type;

alter table public.secretariat_documents
  add constraint chk_secretariat_documents_document_type
    check (document_type in ('letter', 'incoming_letter', 'outgoing_letter', 'internal_notice', 'internal_request', 'directive', 'minutes')) not valid,
  add constraint chk_secretariat_documents_direction
    check (direction in ('incoming', 'outgoing', 'internal')) not valid,
  add constraint chk_secretariat_documents_status
    check (status in ('draft', 'registered', 'in_review', 'referred', 'answered', 'archived', 'canceled')) not valid,
  add constraint chk_secretariat_documents_priority
    check (priority in ('low', 'normal', 'high', 'urgent')) not valid,
  add constraint chk_secretariat_documents_confidentiality
    check (confidentiality in ('normal', 'confidential', 'secret')) not valid,
  add constraint chk_secretariat_documents_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role')) not valid;

alter table public.delivery_forms
  drop constraint if exists chk_delivery_forms_form_type,
  drop constraint if exists chk_delivery_forms_status,
  drop constraint if exists chk_delivery_forms_assignee_type;

alter table public.delivery_forms
  add constraint chk_delivery_forms_form_type
    check (form_type in ('goods_delivery', 'goods_receipt', 'document_delivery', 'document_receipt', 'asset_delivery', 'other')) not valid,
  add constraint chk_delivery_forms_status
    check (status in ('draft', 'pending_signature', 'signed', 'confirmed', 'archived', 'canceled')) not valid,
  add constraint chk_delivery_forms_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role')) not valid;

do $$
begin
  if to_regclass('public.stock_transfers') is not null then
    alter table public.stock_transfers
      drop constraint if exists chk_stock_transfers_status,
      drop constraint if exists chk_stock_transfers_assignee_type;

    alter table public.stock_transfers
      add constraint chk_stock_transfers_status
        check (status in ('draft', 'pending_approval', 'approved', 'issued', 'received', 'closed', 'canceled')) not valid,
      add constraint chk_stock_transfers_assignee_type
        check (assignee_type is null or assignee_type in ('user', 'role')) not valid;
  end if;
end $$;

create unique index if not exists idx_secretariat_documents_org_system_code
  on public.secretariat_documents(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_secretariat_documents_org_date
  on public.secretariat_documents(org_id, document_date desc);

create index if not exists idx_secretariat_documents_assignee
  on public.secretariat_documents(assignee_id, due_at desc)
  where assignee_id is not null;

create index if not exists idx_secretariat_documents_assignee_scope
  on public.secretariat_documents(assignee_id, assignee_role_id);

create index if not exists idx_secretariat_documents_related_record
  on public.secretariat_documents(related_module_id, related_record_id)
  where related_module_id is not null and related_record_id is not null;

create unique index if not exists idx_delivery_forms_org_system_code
  on public.delivery_forms(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_delivery_forms_org_date
  on public.delivery_forms(org_id, delivery_date desc);

create index if not exists idx_delivery_forms_assignee_scope
  on public.delivery_forms(assignee_id, assignee_role_id);

create index if not exists idx_delivery_forms_related_record
  on public.delivery_forms(related_module_id, related_record_id)
  where related_module_id is not null and related_record_id is not null;

do $$
begin
  if to_regclass('public.stock_transfers') is not null then
    execute $sql$
      create unique index if not exists idx_stock_transfers_org_system_code
        on public.stock_transfers(org_id, system_code)
        where system_code is not null and system_code <> ''
    $sql$;

    execute $sql$
      create index if not exists idx_stock_transfers_org_date
        on public.stock_transfers(org_id, transfer_date desc, created_at desc)
    $sql$;

    execute $sql$
      create index if not exists idx_stock_transfers_status
        on public.stock_transfers(status, transfer_date desc)
    $sql$;

    execute $sql$
      create index if not exists idx_stock_transfers_delivery_form
        on public.stock_transfers(delivery_form_id)
        where delivery_form_id is not null
    $sql$;

    execute $sql$
      create index if not exists idx_stock_transfers_assignee_scope
        on public.stock_transfers(assignee_id, assignee_role_id)
    $sql$;

    execute $sql$
      create index if not exists idx_stock_transfers_related_record
        on public.stock_transfers(related_module_id, related_record_id)
        where related_module_id is not null and related_record_id is not null
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_secretariat_documents_updated_at on public.secretariat_documents;
    create trigger trg_secretariat_documents_updated_at
      before update on public.secretariat_documents
      for each row execute function public.set_updated_at();

    drop trigger if exists trg_delivery_forms_updated_at on public.delivery_forms;
    create trigger trg_delivery_forms_updated_at
      before update on public.delivery_forms
      for each row execute function public.set_updated_at();

    if to_regclass('public.stock_transfers') is not null then
      drop trigger if exists trg_stock_transfers_updated_at on public.stock_transfers;
      create trigger trg_stock_transfers_updated_at
        before update on public.stock_transfers
        for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

alter table public.secretariat_documents enable row level security;
alter table public.delivery_forms enable row level security;

drop policy if exists p_secretariat_documents_org_all on public.secretariat_documents;
create policy p_secretariat_documents_org_all on public.secretariat_documents
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

drop policy if exists p_delivery_forms_org_all on public.delivery_forms;
create policy p_delivery_forms_org_all on public.delivery_forms
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

do $$
begin
  if to_regclass('public.stock_transfers') is not null then
    alter table public.stock_transfers enable row level security;

    execute $sql$
      drop policy if exists p_stock_transfers_org_all on public.stock_transfers
    $sql$;

    execute $sql$
      create policy p_stock_transfers_org_all on public.stock_transfers
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
        )
    $sql$;
  end if;
end $$;

grant select, insert, update, delete on public.secretariat_documents to authenticated;
grant select, insert, update, delete on public.delivery_forms to authenticated;

do $$
begin
  if to_regclass('public.stock_transfers') is not null then
    execute 'grant select, insert, update, delete on public.stock_transfers to authenticated';
  end if;
end $$;

create table if not exists public.expense_documents (
  id uuid primary key default gen_random_uuid()
);

alter table public.expense_documents
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists expense_date date not null default current_date,
  add column if not exists status text not null default 'draft',
  add column if not exists expense_type text not null default 'general',
  add column if not exists counterparty_type text not null default 'other',
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists cost_center_id uuid references public.cost_centers(id) on delete set null,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists payments jsonb not null default '[]'::jsonb,
  add column if not exists total_amount numeric(18,2) not null default 0,
  add column if not exists paid_amount numeric(18,2) not null default 0,
  add column if not exists remaining_amount numeric(18,2) not null default 0,
  add column if not exists related_module_id text,
  add column if not exists related_record_id uuid,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.employee_advances (
  id uuid primary key default gen_random_uuid()
);

alter table public.employee_advances
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists request_date date not null default current_date,
  add column if not exists due_date date,
  add column if not exists status text not null default 'draft',
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists amount numeric(18,2) not null default 0,
  add column if not exists paid_amount numeric(18,2) not null default 0,
  add column if not exists remaining_amount numeric(18,2) not null default 0,
  add column if not exists payments jsonb not null default '[]'::jsonb,
  add column if not exists reason text,
  add column if not exists related_payroll_slip_id uuid,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.payroll_slips (
  id uuid primary key default gen_random_uuid()
);

alter table public.payroll_slips
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists status text not null default 'draft',
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists base_salary numeric(18,2) not null default 0,
  add column if not exists task_wage_total numeric(18,2) not null default 0,
  add column if not exists bonus_total numeric(18,2) not null default 0,
  add column if not exists deduction_total numeric(18,2) not null default 0,
  add column if not exists insurance_employee_amount numeric(18,2) not null default 0,
  add column if not exists insurance_employer_amount numeric(18,2) not null default 0,
  add column if not exists gross_amount numeric(18,2) not null default 0,
  add column if not exists net_amount numeric(18,2) not null default 0,
  add column if not exists lines jsonb not null default '[]'::jsonb,
  add column if not exists payments jsonb not null default '[]'::jsonb,
  add column if not exists performance_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists task_ids jsonb not null default '[]'::jsonb,
  add column if not exists related_module_id text,
  add column if not exists related_record_id uuid,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.employee_contracts (
  id uuid primary key default gen_random_uuid()
);

alter table public.employee_contracts
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists contract_type text not null default 'employment',
  add column if not exists status text not null default 'draft',
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists applicant_id uuid,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists base_salary numeric(18,2) not null default 0,
  add column if not exists work_location text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists terms jsonb not null default '[]'::jsonb,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.recruitment_applicants (
  id uuid primary key default gen_random_uuid()
);

alter table public.recruitment_applicants
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists status text not null default 'new',
  add column if not exists source text,
  add column if not exists position_title text,
  add column if not exists department text,
  add column if not exists mobile text,
  add column if not exists email text,
  add column if not exists expected_salary numeric(18,2) not null default 0,
  add column if not exists interview_at timestamptz,
  add column if not exists score numeric(6,2),
  add column if not exists assigned_reviewer_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists related_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists resume_url text,
  add column if not exists notes text,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employee_advances_related_payroll_slip_id_fkey') then
    alter table public.employee_advances
      add constraint employee_advances_related_payroll_slip_id_fkey
      foreign key (related_payroll_slip_id) references public.payroll_slips(id) on delete set null
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'employee_contracts_applicant_id_fkey') then
    alter table public.employee_contracts
      add constraint employee_contracts_applicant_id_fkey
      foreign key (applicant_id) references public.recruitment_applicants(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.current_org_id()') is not null then
    alter table public.expense_documents alter column org_id set default public.current_org_id();
    alter table public.employee_advances alter column org_id set default public.current_org_id();
    alter table public.payroll_slips alter column org_id set default public.current_org_id();
    alter table public.employee_contracts alter column org_id set default public.current_org_id();
    alter table public.recruitment_applicants alter column org_id set default public.current_org_id();
  end if;
end $$;

update public.expense_documents
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else nullif(assignee_type, '')
end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> '';

update public.employee_advances
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else nullif(assignee_type, '')
end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> '';

update public.payroll_slips
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else nullif(assignee_type, '')
end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> '';

update public.employee_contracts
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else nullif(assignee_type, '')
end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> '';

update public.recruitment_applicants
set
  assignee_id = coalesce(assignee_id, assigned_reviewer_id),
  assignee_type = case
    when assignee_role_id is not null then 'role'
    when coalesce(assignee_id, assigned_reviewer_id) is not null then 'user'
    else nullif(assignee_type, '')
  end
where assignee_role_id is not null
   or assignee_id is not null
   or assigned_reviewer_id is not null
   or coalesce(assignee_type, '') <> '';

alter table public.expense_documents
  drop constraint if exists chk_expense_documents_status,
  drop constraint if exists chk_expense_documents_counterparty_type,
  drop constraint if exists chk_expense_documents_assignee_type;

alter table public.expense_documents
  add constraint chk_expense_documents_status
    check (status in ('draft', 'pending_approval', 'approved', 'paid', 'posted', 'canceled')) not valid,
  add constraint chk_expense_documents_counterparty_type
    check (counterparty_type in ('supplier', 'customer', 'employee', 'other')) not valid,
  add constraint chk_expense_documents_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role')) not valid;

alter table public.employee_advances
  drop constraint if exists chk_employee_advances_status,
  drop constraint if exists chk_employee_advances_assignee_type;

alter table public.employee_advances
  add constraint chk_employee_advances_status
    check (status in ('draft', 'requested', 'approved', 'paid', 'settled', 'posted', 'rejected', 'canceled')) not valid,
  add constraint chk_employee_advances_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role')) not valid;

alter table public.payroll_slips
  drop constraint if exists chk_payroll_slips_status,
  drop constraint if exists chk_payroll_slips_assignee_type;

alter table public.payroll_slips
  add constraint chk_payroll_slips_status
    check (status in ('draft', 'approved', 'paid', 'posted', 'canceled')) not valid,
  add constraint chk_payroll_slips_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role')) not valid;

alter table public.employee_contracts
  drop constraint if exists chk_employee_contracts_status,
  drop constraint if exists chk_employee_contracts_contract_type,
  drop constraint if exists chk_employee_contracts_assignee_type;

alter table public.employee_contracts
  add constraint chk_employee_contracts_status
    check (status in ('draft', 'pending_signature', 'active', 'expired', 'terminated', 'canceled')) not valid,
  add constraint chk_employee_contracts_contract_type
    check (contract_type in ('employment', 'consulting', 'temporary', 'probation', 'contractor', 'other')) not valid,
  add constraint chk_employee_contracts_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role')) not valid;

alter table public.recruitment_applicants
  drop constraint if exists chk_recruitment_applicants_status,
  drop constraint if exists chk_recruitment_applicants_assignee_type;

alter table public.recruitment_applicants
  add constraint chk_recruitment_applicants_status
    check (status in ('new', 'screening', 'interview', 'accepted', 'rejected', 'hired', 'archived')) not valid,
  add constraint chk_recruitment_applicants_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role')) not valid;

create unique index if not exists idx_expense_documents_org_system_code
  on public.expense_documents(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_expense_documents_org_date
  on public.expense_documents(org_id, expense_date desc);

create index if not exists idx_expense_documents_status
  on public.expense_documents(status, expense_date desc);

create index if not exists idx_expense_documents_assignee_scope
  on public.expense_documents(assignee_id, assignee_role_id);

create unique index if not exists idx_employee_advances_org_system_code
  on public.employee_advances(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_employee_advances_employee
  on public.employee_advances(employee_id, request_date desc);

create index if not exists idx_employee_advances_assignee_scope
  on public.employee_advances(assignee_id, assignee_role_id);

create unique index if not exists idx_payroll_slips_org_system_code
  on public.payroll_slips(org_id, system_code)
  where system_code is not null and system_code <> '';

create unique index if not exists idx_payroll_slips_employee_period
  on public.payroll_slips(org_id, employee_id, period_start, period_end)
  where employee_id is not null;

create index if not exists idx_payroll_slips_assignee_scope
  on public.payroll_slips(assignee_id, assignee_role_id);

create unique index if not exists idx_employee_contracts_org_system_code
  on public.employee_contracts(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_employee_contracts_employee
  on public.employee_contracts(employee_id, start_date desc);

create index if not exists idx_employee_contracts_assignee_scope
  on public.employee_contracts(assignee_id, assignee_role_id);

create unique index if not exists idx_recruitment_applicants_org_system_code
  on public.recruitment_applicants(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_recruitment_applicants_status
  on public.recruitment_applicants(status, created_at desc);

create index if not exists idx_recruitment_applicants_assignee_scope
  on public.recruitment_applicants(assignee_id, assignee_role_id);

do $$
declare
  t text;
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    foreach t in array array[
      'expense_documents',
      'employee_advances',
      'payroll_slips',
      'employee_contracts',
      'recruitment_applicants'
    ]
    loop
      execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated_at', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'trg_' || t || '_updated_at', t);
    end loop;
  end if;
end $$;

alter table public.expense_documents enable row level security;
alter table public.employee_advances enable row level security;
alter table public.payroll_slips enable row level security;
alter table public.employee_contracts enable row level security;
alter table public.recruitment_applicants enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'expense_documents',
    'employee_advances',
    'payroll_slips',
    'employee_contracts',
    'recruitment_applicants'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'p_' || t || '_org_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (to_regprocedure(''public.current_org_id()'') is null or public.current_org_id() is null or org_id is null or org_id = public.current_org_id()) with check (to_regprocedure(''public.current_org_id()'') is null or public.current_org_id() is null or org_id is null or org_id = public.current_org_id())',
      'p_' || t || '_org_all',
      t
    );
  end loop;
end $$;

grant select, insert, update, delete on public.expense_documents to authenticated;
grant select, insert, update, delete on public.employee_advances to authenticated;
grant select, insert, update, delete on public.payroll_slips to authenticated;
grant select, insert, update, delete on public.employee_contracts to authenticated;
grant select, insert, update, delete on public.recruitment_applicants to authenticated;

drop view if exists public.sms_delivery_reports;
create view public.sms_delivery_reports
with (security_invoker = true)
as
select
  m.id,
  m.org_id,
  coalesce(nullif(m.title, ''), nullif(m.sender, ''), nullif(m.recipient, ''), 'پیامک') as title,
  m.channel_type,
  m.provider,
  m.module_id,
  m.record_id,
  m.customer_id,
  m.recipient,
  m.message_text,
  m.status,
  m.provider_message_id,
  m.error_message,
  m.metadata,
  m.sent_at,
  m.created_at,
  m.updated_at,
  m.tags,
  m.assignee_id,
  m.operator_report,
  m.related_task_id,
  m.direction,
  m.sender,
  case when m.direction = 'inbound' then m.sender else m.recipient end as phone_number,
  m.received_at,
  coalesce(m.received_at, m.sent_at, m.created_at) as message_at,
  m.assignee_type,
  m.assignee_role_id
from public.outbound_messages m
where m.channel_type = 'sms';

grant select, update on public.sms_delivery_reports to authenticated;

notify pgrst, 'reload schema';

commit;
