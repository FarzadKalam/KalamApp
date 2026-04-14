-- KalamApp V1 - Phase 84
-- VoIP/Telefonchy foundation, call logs, SMS follow-up fields, and user VoIP profile fields.

begin;

alter table if exists public.integration_settings
  drop constraint if exists integration_settings_connection_type_check;

alter table if exists public.integration_settings
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
  );

alter table if exists public.profiles
  add column if not exists voip_operator_code text,
  add column if not exists voip_extension text,
  add column if not exists voip_service_id text,
  add column if not exists voip_enabled boolean not null default false,
  add column if not exists voip_dial_mode text not null default 'telefonchy_smartcall';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_voip_dial_mode_check'
  ) then
    alter table public.profiles
      drop constraint profiles_voip_dial_mode_check;
  end if;

  alter table public.profiles
    add constraint profiles_voip_dial_mode_check
    check (voip_dial_mode in ('telefonchy_smartcall', 'sip_link', 'tel_link'));
end $$;

alter table if exists public.outbound_messages
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
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else nullif(assignee_type, '')
end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> '';

alter table if exists public.outbound_messages
  drop constraint if exists chk_outbound_messages_assignee_type;

alter table if exists public.outbound_messages
  add constraint chk_outbound_messages_assignee_type
  check (assignee_type is null or assignee_type in ('user', 'role'));

create index if not exists idx_outbound_messages_assignee
  on public.outbound_messages(assignee_id, created_at desc)
  where assignee_id is not null;

create index if not exists idx_outbound_messages_assignee_scope
  on public.outbound_messages(assignee_id, assignee_role_id);

create index if not exists idx_outbound_messages_related_task
  on public.outbound_messages(related_task_id)
  where related_task_id is not null;

create table if not exists public.voip_call_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  provider text not null default 'telefonchy',
  service_id text,
  call_id text,
  object_id text,
  direction text not null default 'unknown',
  status text not null default 'unknown',
  source_number text,
  destination_number text,
  extension text,
  operator_code text,
  trunk text,
  started_at timestamptz,
  ended_at timestamptz,
  wait_seconds integer,
  talk_seconds integer,
  file_id text,
  recording_url text,
  module_id text,
  record_id text,
  assignee_id uuid references public.profiles(id) on delete set null,
  assignee_type text,
  assignee_role_id uuid references public.org_roles(id) on delete set null,
  operator_report text,
  related_task_id uuid references public.tasks(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_voip_call_logs_direction
    check (direction in ('incoming', 'outgoing', 'internal', 'unknown')),
  constraint chk_voip_call_logs_status
    check (status in ('ringing', 'answered', 'missed', 'failed', 'completed', 'unknown')),
  constraint chk_voip_call_logs_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role'))
);

alter table public.voip_call_logs
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null;

update public.voip_call_logs
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else nullif(assignee_type, '')
end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> '';

alter table public.voip_call_logs
  drop constraint if exists chk_voip_call_logs_assignee_type;

alter table public.voip_call_logs
  add constraint chk_voip_call_logs_assignee_type
  check (assignee_type is null or assignee_type in ('user', 'role'));

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

drop view if exists public.sms_delivery_reports;
create view public.sms_delivery_reports
with (security_invoker = true)
as
select
  m.id,
  m.org_id,
  coalesce(nullif(m.title, ''), nullif(m.recipient, ''), 'پیامک') as title,
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
grant select, insert, update, delete on public.voip_call_logs to authenticated;

notify pgrst, 'reload schema';

commit;
