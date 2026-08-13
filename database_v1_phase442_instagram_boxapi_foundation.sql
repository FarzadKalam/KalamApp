-- TazeSystem - Phase 442: Instagram / BoxAPI multi-provider foundation
-- هر اتصال، پیج، گفتگو و پیام به یک سازمان تعلق دارد و RLS به‌صورت fail-closed اعمال می‌شود.

begin;

create table if not exists public.instagram_providers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider_key text not null default 'boxapi',
  name text not null,
  api_key_encrypted text not null default '',
  webhook_secret text not null default encode(gen_random_bytes(24), 'hex'),
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_providers_provider_key_check check (provider_key in ('boxapi')),
  constraint instagram_providers_org_name_unique unique (org_id, name)
);

create table if not exists public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider_id uuid not null references public.instagram_providers(id) on delete cascade,
  provider_account_id text not null,
  instagram_user_id text,
  username text not null,
  display_name text,
  profile_photo_url text,
  capabilities jsonb not null default '{"text":true,"buttons":true,"attachments":false,"voice":false,"product_catalog":true}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_accounts_provider_account_unique unique (provider_id, provider_account_id)
);

create table if not exists public.instagram_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.instagram_accounts(id) on delete cascade,
  instagram_scoped_id text not null,
  username text,
  display_name text,
  profile_photo_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_contacts_account_scoped_user_unique unique (account_id, instagram_scoped_id)
);

create table if not exists public.instagram_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider_id uuid not null references public.instagram_providers(id) on delete cascade,
  account_id uuid not null references public.instagram_accounts(id) on delete cascade,
  contact_id uuid not null references public.instagram_contacts(id) on delete cascade,
  provider_thread_id text not null,
  status text not null default 'new' check (status in ('new','open','pending_customer','pending_internal','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  tags jsonb not null default '[]'::jsonb,
  assignee_user_id uuid references public.profiles(id) on delete set null,
  assignee_role_id uuid references public.org_roles(id) on delete set null,
  last_message_preview text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_conversations_provider_thread_unique unique (provider_id, account_id, provider_thread_id)
);

create table if not exists public.instagram_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.instagram_conversations(id) on delete cascade,
  provider_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text' check (message_type in ('text','button','image','file','audio','video','other')),
  content_text text,
  buttons jsonb not null default '[]'::jsonb,
  delivery_status text not null default 'received' check (delivery_status in ('queued','sending','sent','delivered','failed','received')),
  provider_payload jsonb not null default '{}'::jsonb,
  error_message text,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_messages_provider_message_unique unique (conversation_id, provider_message_id)
);

create table if not exists public.instagram_conversation_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.instagram_conversations(id) on delete cascade,
  target_module_id text not null check (target_module_id in ('customers','suppliers','employees')),
  target_record_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint instagram_conversation_links_unique unique (conversation_id, target_module_id, target_record_id)
);

create table if not exists public.instagram_conversation_access_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.instagram_conversations(id) on delete cascade,
  grantee_type text not null check (grantee_type in ('user','role')),
  grantee_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint instagram_conversation_access_grants_unique unique (conversation_id, grantee_type, grantee_id)
);

create table if not exists public.instagram_webhook_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider_id uuid not null references public.instagram_providers(id) on delete cascade,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'received' check (processing_status in ('received','processed','ignored','failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint instagram_webhook_events_provider_event_unique unique (provider_id, provider_event_id)
);

create table if not exists public.instagram_outbound_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider_id uuid not null references public.instagram_providers(id) on delete cascade,
  account_id uuid not null references public.instagram_accounts(id) on delete cascade,
  conversation_id uuid references public.instagram_conversations(id) on delete set null,
  job_type text not null check (job_type in ('send_message','reply_comment')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued','processing','succeeded','failed','canceled')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_outbound_jobs_idempotency_unique unique (org_id, idempotency_key)
);

create index if not exists idx_instagram_accounts_org_provider on public.instagram_accounts(org_id, provider_id, is_active);
create index if not exists idx_instagram_conversations_org_account_activity on public.instagram_conversations(org_id, account_id, last_message_at desc, id desc);
create index if not exists idx_instagram_conversations_org_assignee_activity on public.instagram_conversations(org_id, assignee_user_id, last_message_at desc, id desc);
create index if not exists idx_instagram_conversations_tags_gin on public.instagram_conversations using gin(tags);
create index if not exists idx_instagram_messages_conversation_created on public.instagram_messages(conversation_id, created_at desc, id desc);
create index if not exists idx_instagram_links_org_target on public.instagram_conversation_links(org_id, target_module_id, target_record_id);
create index if not exists idx_instagram_jobs_queue on public.instagram_outbound_jobs(org_id, status, available_at, created_at);

create or replace function public.kalam_matches_instagram_conversation_condition(p_conversation_id uuid, p_condition jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_conversation record;
  v_field text := lower(coalesce(p_condition ->> 'field', p_condition ->> 'field_key', ''));
  v_operator text := lower(coalesce(p_condition ->> 'operator', 'eq'));
  v_expected jsonb := coalesce(p_condition -> 'value', 'null'::jsonb);
  v_expected_text text := trim(both '"' from coalesce(p_condition -> 'value', '""'::jsonb)::text);
  v_actual text := '';
begin
  select * into v_conversation from public.instagram_conversations where id = p_conversation_id limit 1;
  if not found then return false; end if;
  if v_field in ('tag', 'tags') then
    if v_operator in ('contains', 'has', 'equals', 'eq', 'in') then
      return case when jsonb_typeof(v_expected) = 'array'
        then coalesce(v_conversation.tags, '[]'::jsonb) ?| array(select jsonb_array_elements_text(v_expected))
        else coalesce(v_conversation.tags, '[]'::jsonb) ? v_expected_text end;
    end if;
    if v_operator in ('not_contains', 'not_has', 'not_equals', 'neq', 'not_in') then
      return case when jsonb_typeof(v_expected) = 'array'
        then not (coalesce(v_conversation.tags, '[]'::jsonb) ?| array(select jsonb_array_elements_text(v_expected)))
        else not (coalesce(v_conversation.tags, '[]'::jsonb) ? v_expected_text) end;
    end if;
    return false;
  end if;
  v_actual := case v_field
    when 'account_id' then v_conversation.account_id::text
    when 'status' then coalesce(v_conversation.status, '')
    when 'priority' then coalesce(v_conversation.priority, '')
    when 'assignee_user_id' then coalesce(v_conversation.assignee_user_id::text, '')
    when 'assignee_role_id' then coalesce(v_conversation.assignee_role_id::text, '')
    else '' end;
  if v_operator in ('eq', 'equals') then return v_actual = v_expected_text; end if;
  if v_operator in ('neq', 'not_equals') then return v_actual <> v_expected_text; end if;
  if v_operator = 'contains' then return position(v_expected_text in v_actual) > 0; end if;
  if v_operator = 'not_contains' then return position(v_expected_text in v_actual) = 0; end if;
  if v_operator in ('in', 'one_of') and jsonb_typeof(v_expected) = 'array' then return v_actual = any(array(select jsonb_array_elements_text(v_expected))); end if;
  if v_operator in ('not_in', 'not_one_of') and jsonb_typeof(v_expected) = 'array' then return not (v_actual = any(array(select jsonb_array_elements_text(v_expected)))); end if;
  if v_operator = 'is_null' then return v_actual = ''; end if;
  if v_operator = 'not_null' then return v_actual <> ''; end if;
  return false;
end;
$$;

create or replace function public.kalam_can_access_instagram_conversation(p_conversation_id uuid, p_org_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := coalesce(p_org_id, public.current_org_id());
  v_role_id uuid;
  v_permissions jsonb := '{}'::jsonb;
  v_permission jsonb := '{}'::jsonb;
  v_scope text := 'all';
  v_conversation record;
  v_scope_allowed boolean := false;
  v_conditions jsonb := '[]'::jsonb;
  v_conditions_any jsonb := '[]'::jsonb;
  v_conditions_any_match boolean := true;
  v_condition jsonb;
  v_condition_mode text := 'all';
  v_condition_match boolean;
  v_match_count integer := 0;
  v_condition_count integer := 0;
  v_field text;
  v_operator text;
  v_expected jsonb;
  v_actual text;
begin
  if v_user_id is null or v_org_id is null or p_conversation_id is null then return false; end if;
  select p.role_id, coalesce(r.permissions, '{}'::jsonb)
    into v_role_id, v_permissions
  from public.profiles p left join public.org_roles r on r.id = p.role_id and r.org_id = p.org_id
  where p.id = v_user_id and p.org_id = v_org_id limit 1;
  if not found then return false; end if;
  v_permission := coalesce(v_permissions -> 'instagram_conversations', '{}'::jsonb);
  select * into v_conversation from public.instagram_conversations
   where id = p_conversation_id and org_id = v_org_id limit 1;
  if not found then return false; end if;
  if lower(coalesce(v_permissions -> '__saas_admin' ->> 'view', 'false')) = 'true'
    or lower(coalesce(v_permissions -> '__saas_admin' ->> 'edit', 'false')) = 'true' then return true; end if;
  if lower(coalesce(v_permission ->> 'view', 'false')) <> 'true' then return false; end if;

  if exists (
    select 1 from public.instagram_conversation_access_grants grant_row
    where grant_row.conversation_id = p_conversation_id and grant_row.org_id = v_org_id
      and ((grant_row.grantee_type = 'user' and grant_row.grantee_id = v_user_id)
        or (grant_row.grantee_type = 'role' and grant_row.grantee_id = v_role_id))
  ) then
    v_scope_allowed := true;
  else
    v_scope := lower(coalesce(nullif(v_permission ->> 'record_scope', ''), 'all'));
    if v_scope = 'all' then v_scope_allowed := true; end if;
    if v_scope = 'own' then v_scope_allowed := v_conversation.assignee_user_id = v_user_id; end if;
    if v_scope = 'team' then v_scope_allowed := v_conversation.assignee_role_id = v_role_id; end if;
    if v_scope = 'subtree' then
      v_scope_allowed := v_conversation.assignee_role_id in (
      with recursive role_tree as (
        select id from public.org_roles where id = v_role_id and org_id = v_org_id
        union all
        select child.id from public.org_roles child join role_tree parent on child.parent_id = parent.id where child.org_id = v_org_id
      ) select id from role_tree
      );
    end if;
  end if;
  if not v_scope_allowed then return false; end if;

  -- شرط‌های نقش علاوه بر محدودهٔ رکورد اعمال می‌شوند و برچسب‌ها را نیز پشتیبانی می‌کنند.
  v_conditions := coalesce(v_permission -> 'view_conditions' -> 'conditions_all', v_permission -> 'view_conditions' -> 'conditions', '[]'::jsonb);
  v_conditions_any := coalesce(v_permission -> 'view_conditions' -> 'conditions_any', '[]'::jsonb);
  if jsonb_typeof(v_conditions_any) = 'array' and jsonb_array_length(v_conditions_any) > 0 then
    select coalesce(bool_or(public.kalam_matches_instagram_conversation_condition(p_conversation_id, value)), false)
      into v_conditions_any_match from jsonb_array_elements(v_conditions_any);
    if not v_conditions_any_match then return false; end if;
  end if;
  if jsonb_typeof(v_conditions) <> 'array' or jsonb_array_length(v_conditions) = 0 then return true; end if;
  v_condition_mode := lower(coalesce(v_permission -> 'view_conditions' ->> 'mode', 'all'));
  for v_condition in select value from jsonb_array_elements(v_conditions) loop
    v_condition_count := v_condition_count + 1;
    v_field := lower(coalesce(v_condition ->> 'field', v_condition ->> 'field_key', ''));
    v_operator := lower(coalesce(v_condition ->> 'operator', 'equals'));
    v_expected := coalesce(v_condition -> 'value', 'null'::jsonb);
    v_condition_match := false;
    if v_field in ('tag', 'tags') then
      if v_operator in ('contains', 'has', 'equals', 'in') then
        v_condition_match := case when jsonb_typeof(v_expected) = 'array'
          then v_conversation.tags ?| array(select jsonb_array_elements_text(v_expected))
          else v_conversation.tags ? trim(both '"' from v_expected::text) end;
      elsif v_operator in ('not_contains', 'not_has', 'not_equals', 'not_in') then
        v_condition_match := case when jsonb_typeof(v_expected) = 'array'
          then not (v_conversation.tags ?| array(select jsonb_array_elements_text(v_expected)))
          else not (v_conversation.tags ? trim(both '"' from v_expected::text)) end;
      end if;
    else
      v_actual := case v_field
        when 'account_id' then v_conversation.account_id::text
        when 'status' then coalesce(v_conversation.status, '')
        when 'priority' then coalesce(v_conversation.priority, '')
        when 'assignee_user_id' then coalesce(v_conversation.assignee_user_id::text, '')
        when 'assignee_role_id' then coalesce(v_conversation.assignee_role_id::text, '')
        else '' end;
      if v_operator in ('equals', 'eq') then v_condition_match := v_actual = trim(both '"' from v_expected::text); end if;
      if v_operator in ('not_equals', 'neq') then v_condition_match := v_actual <> trim(both '"' from v_expected::text); end if;
      if v_operator in ('in', 'one_of') and jsonb_typeof(v_expected) = 'array' then v_condition_match := v_actual = any(array(select jsonb_array_elements_text(v_expected))); end if;
      if v_operator in ('not_in', 'not_one_of') and jsonb_typeof(v_expected) = 'array' then v_condition_match := not (v_actual = any(array(select jsonb_array_elements_text(v_expected)))); end if;
    end if;
    if v_condition_match then v_match_count := v_match_count + 1; end if;
  end loop;
  return case when v_condition_mode = 'any' then v_match_count > 0 else v_match_count = v_condition_count end;
end;
$$;

-- مدیران تنظیمات، دسترسی اولیهٔ لازم برای راه‌اندازی Inbox را دارند؛ سایر نقش‌ها
-- بعداً از صفحهٔ نقش‌ها به‌صورت صریح دسترسی می‌گیرند.
update public.org_roles role_row
set permissions = jsonb_set(
  coalesce(role_row.permissions, '{}'::jsonb),
  '{instagram_conversations}',
  case when lower(coalesce(role_row.permissions -> '__settings_tabs' ->> 'edit', 'false')) = 'true'
    then '{"view":true,"edit":true,"delete":false,"record_scope":"all","fields":{"reply":true,"assign":true,"tag":true,"link_counterparty":true,"manage_automation":true}}'::jsonb
    else '{"view":false,"edit":false,"delete":false,"record_scope":"own","fields":{"reply":false,"assign":false,"tag":false,"link_counterparty":false,"manage_automation":false}}'::jsonb
  end,
  true
)
where not (coalesce(role_row.permissions, '{}'::jsonb) ? 'instagram_conversations');

alter table public.instagram_providers enable row level security;
alter table public.instagram_accounts enable row level security;
alter table public.instagram_contacts enable row level security;
alter table public.instagram_conversations enable row level security;
alter table public.instagram_messages enable row level security;
alter table public.instagram_conversation_links enable row level security;
alter table public.instagram_conversation_access_grants enable row level security;
alter table public.instagram_webhook_events enable row level security;
alter table public.instagram_outbound_jobs enable row level security;

drop policy if exists instagram_accounts_org_select on public.instagram_accounts;
create policy instagram_accounts_org_select on public.instagram_accounts for select to authenticated using (
  org_id = public.current_org_id()
  and exists (
    select 1 from public.instagram_conversations conversation_row
    where conversation_row.account_id = instagram_accounts.id
      and conversation_row.org_id = public.current_org_id()
      and public.kalam_can_access_instagram_conversation(conversation_row.id, conversation_row.org_id)
  )
);
drop policy if exists instagram_contacts_org_select on public.instagram_contacts;
create policy instagram_contacts_org_select on public.instagram_contacts for select to authenticated using (
  org_id = public.current_org_id()
  and exists (
    select 1 from public.instagram_conversations conversation_row
    where conversation_row.contact_id = instagram_contacts.id
      and conversation_row.org_id = public.current_org_id()
      and public.kalam_can_access_instagram_conversation(conversation_row.id, conversation_row.org_id)
  )
);
drop policy if exists instagram_conversations_access_select on public.instagram_conversations;
create policy instagram_conversations_access_select on public.instagram_conversations for select to authenticated using (org_id = public.current_org_id() and public.kalam_can_access_instagram_conversation(id, org_id));
drop policy if exists instagram_messages_access_select on public.instagram_messages;
create policy instagram_messages_access_select on public.instagram_messages for select to authenticated using (org_id = public.current_org_id() and public.kalam_can_access_instagram_conversation(conversation_id, org_id));
drop policy if exists instagram_links_access_select on public.instagram_conversation_links;
create policy instagram_links_access_select on public.instagram_conversation_links for select to authenticated using (org_id = public.current_org_id() and public.kalam_can_access_instagram_conversation(conversation_id, org_id));
drop policy if exists instagram_grants_access_select on public.instagram_conversation_access_grants;
create policy instagram_grants_access_select on public.instagram_conversation_access_grants for select to authenticated using (org_id = public.current_org_id() and public.kalam_can_access_instagram_conversation(conversation_id, org_id));

revoke all on public.instagram_providers, public.instagram_accounts, public.instagram_contacts, public.instagram_conversations, public.instagram_messages, public.instagram_conversation_links, public.instagram_conversation_access_grants, public.instagram_webhook_events, public.instagram_outbound_jobs from anon, authenticated;
grant select on public.instagram_accounts, public.instagram_contacts, public.instagram_conversations, public.instagram_messages, public.instagram_conversation_links, public.instagram_conversation_access_grants to authenticated;
grant execute on function public.kalam_can_access_instagram_conversation(uuid, uuid) to authenticated;
revoke all on function public.kalam_can_access_instagram_conversation(uuid, uuid) from public, anon;
revoke all on function public.kalam_matches_instagram_conversation_condition(uuid, jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
