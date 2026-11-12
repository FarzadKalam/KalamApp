-- =====================================================
-- TazeSystem V1 - Phase 574: Modular AI AaaS Foundation,
-- Multi-Agent Control, Staff Bot Binding & Agent Messaging
-- Date: 2026-11-11
-- Type: Additive / Idempotent / Fail-Closed Tenant Security
-- =====================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Per-org AI Agent Configurations
-- ---------------------------------------------------------------------------
create table if not exists public.org_ai_agent_configs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  agent_key text not null,
  is_enabled boolean not null default true,
  model_override text,
  fast_model_override text,
  tone_style text not null default 'friendly_warm',
  allowed_channels jsonb not null default '["web","staff_bot","agent_inbox"]'::jsonb,
  background_config jsonb not null default '{}'::jsonb,
  policy_json jsonb not null default '{}'::jsonb,
  onboarding_completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_org_ai_agent_configs_agent_key check (
    agent_key in (
      'lead_orchestrator',
      'sales_leads',
      'purchase_supply',
      'customer_response',
      'hr_manager',
      'reservation',
      'project_process',
      'instagrammer',
      'system_guide'
    )
  ),
  constraint chk_org_ai_agent_configs_tone_style check (
    tone_style in ('formal', 'friendly_warm', 'concise', 'coaching', 'custom')
  ),
  constraint uq_org_ai_agent_configs_org_agent unique (org_id, agent_key)
);

create index if not exists idx_org_ai_agent_configs_org_enabled
  on public.org_ai_agent_configs(org_id, is_enabled, agent_key);

alter table public.org_ai_agent_configs enable row level security;

drop policy if exists p_org_ai_agent_configs_org_read on public.org_ai_agent_configs;
create policy p_org_ai_agent_configs_org_read
on public.org_ai_agent_configs
for select to authenticated
using (org_id = public.current_org_id());

revoke all on public.org_ai_agent_configs from public, anon;
grant select on public.org_ai_agent_configs to authenticated, service_role;
grant insert, update, delete on public.org_ai_agent_configs to service_role;

-- ---------------------------------------------------------------------------
-- 2. Per-org AI Agent & Staff Bot Member/Role Permissions
-- ---------------------------------------------------------------------------
create table if not exists public.org_ai_agent_member_permissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  subject_type text not null,
  subject_id uuid not null,
  agent_key text not null,
  can_use boolean not null default true,
  staff_bot_enabled boolean not null default false,
  autonomy_mode text not null default 'confirm',
  tone_style text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_org_ai_agent_member_permissions_subject_type check (
    subject_type in ('role', 'user')
  ),
  constraint chk_org_ai_agent_member_permissions_agent_key check (
    agent_key in (
      '__staff_bot',
      'lead_orchestrator',
      'sales_leads',
      'purchase_supply',
      'customer_response',
      'hr_manager',
      'reservation',
      'project_process',
      'instagrammer',
      'system_guide'
    )
  ),
  constraint chk_org_ai_agent_member_permissions_autonomy_mode check (
    autonomy_mode in ('confirm', 'auto_low_risk')
  ),
  constraint chk_org_ai_agent_member_permissions_tone_style check (
    tone_style is null or tone_style in ('formal', 'friendly_warm', 'concise', 'coaching', 'custom')
  ),
  constraint uq_org_ai_agent_member_permissions_subject_agent unique (org_id, subject_type, subject_id, agent_key)
);

create index if not exists idx_org_ai_agent_member_permissions_org_agent
  on public.org_ai_agent_member_permissions(org_id, agent_key);

create index if not exists idx_org_ai_agent_member_permissions_org_subject
  on public.org_ai_agent_member_permissions(org_id, subject_type, subject_id);

alter table public.org_ai_agent_member_permissions enable row level security;

drop policy if exists p_org_ai_agent_member_permissions_org_read on public.org_ai_agent_member_permissions;
create policy p_org_ai_agent_member_permissions_org_read
on public.org_ai_agent_member_permissions
for select to authenticated
using (org_id = public.current_org_id());

revoke all on public.org_ai_agent_member_permissions from public, anon;
grant select on public.org_ai_agent_member_permissions to authenticated, service_role;
grant insert, update, delete on public.org_ai_agent_member_permissions to service_role;

-- ---------------------------------------------------------------------------
-- 3. Staff Bot Self-Service OTP Bind Tokens (Fail-closed per user & org)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_staff_bot_bind_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  channel_type text not null,
  bind_code text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint chk_ai_staff_bot_bind_tokens_channel check (
    channel_type in ('telegram', 'bale', 'rubika')
  )
);

create unique index if not exists uq_ai_staff_bot_bind_tokens_hash
  on public.ai_staff_bot_bind_tokens(token_hash);

create index if not exists idx_ai_staff_bot_bind_tokens_org_user_expires
  on public.ai_staff_bot_bind_tokens(org_id, user_id, expires_at desc);

alter table public.ai_staff_bot_bind_tokens enable row level security;

drop policy if exists p_ai_staff_bot_bind_tokens_owner_read on public.ai_staff_bot_bind_tokens;
create policy p_ai_staff_bot_bind_tokens_owner_read
on public.ai_staff_bot_bind_tokens
for select to authenticated
using (org_id = public.current_org_id() and user_id = auth.uid());

revoke all on public.ai_staff_bot_bind_tokens from public, anon;
grant select on public.ai_staff_bot_bind_tokens to authenticated, service_role;
grant insert, update, delete on public.ai_staff_bot_bind_tokens to service_role;

-- ---------------------------------------------------------------------------
-- 4. SQL-First Background Agent Cooldown & Dedupe Store
-- ---------------------------------------------------------------------------
create table if not exists public.ai_background_cooldowns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  agent_key text not null,
  cooldown_key text not null,
  last_triggered_at timestamptz not null default now(),
  next_eligible_at timestamptz not null,
  last_run_id uuid references public.ai_agent_runs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_ai_background_cooldowns_key unique (org_id, agent_key, cooldown_key)
);

create index if not exists idx_ai_background_cooldowns_org_eligible
  on public.ai_background_cooldowns(org_id, next_eligible_at);

alter table public.ai_background_cooldowns enable row level security;

drop policy if exists p_ai_background_cooldowns_org_read on public.ai_background_cooldowns;
create policy p_ai_background_cooldowns_org_read
on public.ai_background_cooldowns
for select to authenticated
using (org_id = public.current_org_id());

revoke all on public.ai_background_cooldowns from public, anon;
grant select on public.ai_background_cooldowns to authenticated, service_role;
grant insert, update, delete on public.ai_background_cooldowns to service_role;

-- Attach updated_at triggers when helper exists
do $$
declare
  t text;
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'set_updated_at'
      and pronamespace = 'public'::regnamespace
  ) then
    foreach t in array array['org_ai_agent_configs', 'org_ai_agent_member_permissions', 'ai_background_cooldowns']
    loop
      execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated_at', t);
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        'trg_' || t || '_updated_at',
        t
      );
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Additive Runtime Columns on AI Threads, Agent Runs, Usage Ledger & Logs
-- ---------------------------------------------------------------------------
alter table if exists public.ai_threads
  add column if not exists agent_key text,
  add column if not exists selected_agents jsonb not null default '[]'::jsonb,
  add column if not exists channel text not null default 'web',
  add column if not exists working_state jsonb not null default '{}'::jsonb,
  add column if not exists compaction_summary text,
  add column if not exists compaction_cursor_message_id uuid,
  add column if not exists cached_prefix_hash text;

create index if not exists idx_ai_threads_org_user_agent_updated_at
  on public.ai_threads(org_id, user_id, agent_key, updated_at desc)
  where agent_key is not null;

alter table if exists public.ai_agent_runs
  add column if not exists agent_key text,
  add column if not exists selected_agents jsonb not null default '[]'::jsonb,
  add column if not exists trigger_type text not null default 'interactive',
  add column if not exists cooldown_key text,
  add column if not exists channel text,
  add column if not exists estimated_cost_irt numeric,
  add column if not exists waiting_approval_payload jsonb;

alter table if exists public.ai_agent_runs
  drop constraint if exists ai_agent_runs_policy_check;

alter table if exists public.ai_agent_runs
  add constraint ai_agent_runs_policy_check
  check (execution_policy in (
    'interactive_chat',
    'customer_auto_reply',
    'staff_bot_chat',
    'workflow_automation',
    'background_agent',
    'onboarding_qa'
  ));

alter table if exists public.ai_agent_runs
  drop constraint if exists ai_agent_runs_status_check;

alter table if exists public.ai_agent_runs
  add constraint ai_agent_runs_status_check
  check (status in (
    'planned',
    'running',
    'waiting_confirmation',
    'waiting_approval',
    'completed',
    'escalated',
    'failed',
    'cancelled'
  ));

create index if not exists idx_ai_agent_runs_org_agent_created_at
  on public.ai_agent_runs(org_id, agent_key, created_at desc);

alter table if exists public.org_ai_usage_ledger
  add column if not exists cached_input_tokens integer not null default 0,
  add column if not exists agent_key text,
  add column if not exists channel text,
  add column if not exists cache_savings_irt numeric not null default 0;

create index if not exists idx_org_ai_usage_ledger_org_agent_created_at
  on public.org_ai_usage_ledger(org_id, agent_key, created_at desc)
  where agent_key is not null;

alter table if exists public.ai_action_logs
  add column if not exists callback_token text,
  add column if not exists channel text,
  add column if not exists agent_key text,
  add column if not exists approval_status text;

create index if not exists idx_ai_action_logs_callback_token
  on public.ai_action_logs(callback_token)
  where callback_token is not null and callback_token <> '';

-- ---------------------------------------------------------------------------
-- 6. Non-Destructive Catalog Tag Enrichment & Plan Feature Toggles
-- ---------------------------------------------------------------------------
-- Only seed editable defaults if not present yet; never override SaaS Admin changes.
insert into public.ai_model_catalog (
  id, provider, display_name_fa, capability_tags, input_usd_per_1m,
  cached_input_usd_per_1m, output_usd_per_1m, specific_cost_usd,
  specific_cost_unit, margin_percent, is_active, is_coming_soon, metadata
) values
  (
    'text-embedding-3-small',
    'openai',
    'مدل برداری دانش سازمانی (Embedding Small)',
    array['embedding'],
    0.02, null, 0, null, null, 30, true, false,
    '{"tier":"economy","api_route":"embeddings","dimensions":1536,"pricing_source":"estimate"}'::jsonb
  ),
  (
    'deepseek-v4.1-flash',
    'deepseek',
    'DeepSeek V4.1 Flash (سریع و اقتصادی)',
    array['dashboard_chat','record_chat','customer_reply_suggestion','workflow_ai_prompt','agent_fast','context_compression'],
    0.14, 0.028, 0.28, null, null, 30, true, false,
    '{"tier":"economy","api_route":"chat_completions","pricing_source":"estimate"}'::jsonb
  )
on conflict (id) do nothing;

-- Ensure at least active economy models carry context_compression & agent_fast tags if missing
update public.ai_model_catalog
set
  capability_tags = (
    select array(
      select distinct t
      from unnest(coalesce(capability_tags, '{}'::text[]) || array['context_compression', 'agent_fast']) as t
    )
  ),
  updated_at = now()
where is_active = true
  and coalesce(is_coming_soon, false) = false
  and coalesce(metadata->>'tier', '') in ('economy', 'fast')
  and coalesce(metadata->>'api_route', 'chat_completions') = 'chat_completions'
  and not (coalesce(capability_tags, '{}'::text[]) @> array['context_compression', 'agent_fast']);

-- Ensure balanced/flagship/reasoning chat models carry auto_decision when missing
update public.ai_model_catalog
set
  capability_tags = (
    select array(
      select distinct t
      from unnest(coalesce(capability_tags, '{}'::text[]) || array['auto_decision']) as t
    )
  ),
  updated_at = now()
where is_active = true
  and coalesce(is_coming_soon, false) = false
  and coalesce(metadata->>'api_route', 'chat_completions') = 'chat_completions'
  and not ('auto_decision' = any(coalesce(capability_tags, '{}'::text[])));

-- Plan feature flags (non-destructive: keeps explicit overrides by SaaS Admin)
update public.saas_plans
set enabled_features = coalesce(enabled_features, '{}'::jsonb)
  || jsonb_build_object(
    'ai_staff_bot',
    coalesce(
      enabled_features -> 'ai_staff_bot',
      case
        when coalesce(code, '') in ('cloud_growth', 'cloud_enterprise', 'public_demo_full') then 'true'::jsonb
        else 'false'::jsonb
      end
    ),
    'ai_background_agents',
    coalesce(
      enabled_features -> 'ai_background_agents',
      case
        when coalesce(code, '') in ('cloud_growth', 'cloud_enterprise', 'public_demo_full') then 'true'::jsonb
        else 'false'::jsonb
      end
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Agent Notes Indexing, Conversation Routing & High-Priority Overlay RPC v6
-- ---------------------------------------------------------------------------
create index if not exists idx_notes_org_ai_agent_created_at
  on public.notes(org_id, source_type, created_at desc)
  where source_type in ('ai', 'assistant');

create index if not exists idx_notes_org_agent_key
  on public.notes(org_id, (metadata->>'agent_key'), created_at desc)
  where metadata ? 'agent_key';

create or replace function public.kalam_agent_label_fa_v1(p_agent_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(p_agent_key, '')))
    when 'lead_orchestrator' then 'ایجنت راهبر'
    when 'sales_leads' then 'ایجنت فروش و لید'
    when 'purchase_supply' then 'ایجنت خرید و تأمین'
    when 'customer_response' then 'ایجنت پاسخگویی مشتری'
    when 'hr_manager' then 'ایجنت منابع انسانی'
    when 'reservation' then 'ایجنت رزرواسیون'
    when 'project_process' then 'ایجنت پروژه و فرآیند'
    when 'instagrammer' then 'ایجنت اینستاگرامر'
    when 'system_guide' then 'ایجنت راهنمای تازه‌سیستم'
    else 'ایجنت هوشمند'
  end;
$$;

create or replace function public.kalam_agent_subtitle_fa_v1(p_agent_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(p_agent_key, '')))
    when 'lead_orchestrator' then 'هماهنگ‌کننده ایجنت‌ها و مهارت‌ها'
    when 'sales_leads' then 'فروش، پیش‌فاکتور، فاکتور، تسویه و لیدها'
    when 'purchase_supply' then 'خرید، تأمین‌کنندگان، برگشت و موجودی'
    when 'customer_response' then 'پاسخگویی چندکاناله و پیگیری مشتریان'
    when 'hr_manager' then 'آنبوردینگ، مرخصی، اضافه‌کار و پیگیری پرسنل'
    when 'reservation' then 'نوبت‌دهی، ظرفیت منابع و زمان‌بندی'
    when 'project_process' then 'پروژه‌ها، طراحی فرآیندها و فعالیت‌ها'
    when 'instagrammer' then 'پست‌ها، استوری‌ها، ویترین دکمه‌دار و پاسخ خودکار اینستاگرام'
    when 'system_guide' then 'آموزش کار با نرم‌افزار، ویدیوها، دانش و راهنمای سازمان'
    else 'دستیار تخصصی سازمانی'
  end;
$$;

create or replace function public.kalam_resolve_agent_conversation_key_v1(p_metadata jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_explicit text := nullif(trim(coalesce(v_meta->>'conversation_key', '')), '');
  v_agent_key text := lower(trim(coalesce(v_meta->>'agent_key', '')));
begin
  if v_explicit is not null and v_explicit like 'agent:%' then
    return v_explicit;
  end if;
  if v_agent_key <> '' then
    return 'agent:' || v_agent_key;
  end if;
  return null;
end;
$$;

-- Keep legacy conversation-key helper consistent for agent notes
create or replace function public.kalam_note_conversation_key(
  p_org_id uuid,
  p_note_id uuid,
  p_author_id uuid,
  p_mention_user_ids uuid[],
  p_source_type text,
  p_metadata jsonb,
  p_reply_to uuid
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_note_source text := lower(trim(coalesce(p_source_type, p_metadata->>'source_type', '')));
  v_group_id uuid := public.kalam_try_uuid(p_metadata->>'chat_group_id');
  v_agent_conv_key text := public.kalam_resolve_agent_conversation_key_v1(p_metadata);
  v_peer_id uuid := null;
  v_reply_author_id uuid := null;
  v_reply_mention_user_ids uuid[] := '{}'::uuid[];
  v_item uuid;
begin
  if v_group_id is not null then
    return 'group:' || v_group_id::text;
  end if;

  if v_agent_conv_key is not null then
    return v_agent_conv_key;
  end if;

  if v_note_source in ('system', 'ai', 'assistant')
    or (p_metadata ? 'workflow_id')
    or (p_metadata ? 'automation_rule_id')
    or (p_metadata ? 'process_automation_rule_id') then
    return 'system';
  end if;

  foreach v_item in array coalesce(p_mention_user_ids, '{}'::uuid[]) loop
    if v_item is not null and v_item <> p_author_id then
      v_peer_id := v_item;
      exit;
    end if;
  end loop;

  if v_peer_id is null and p_reply_to is not null then
    select n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[])
    into v_reply_author_id, v_reply_mention_user_ids
    from public.notes n
    where n.id = p_reply_to
      and (p_org_id is null or n.org_id = p_org_id)
    limit 1;

    if v_reply_author_id is not null and v_reply_author_id <> p_author_id then
      v_peer_id := v_reply_author_id;
    end if;

    if v_peer_id is null then
      foreach v_item in array coalesce(v_reply_mention_user_ids, '{}'::uuid[]) loop
        if v_item is not null and v_item <> p_author_id then
          v_peer_id := v_item;
          exit;
        end if;
      end loop;
    end if;
  end if;

  if p_author_id is null or v_peer_id is null then
    return null;
  end if;

  return public.kalam_direct_conversation_key(p_author_id, v_peer_id);
end;
$$;

-- Update notes inbox trigger to route agent messages to agent:<agent_key> with high priority
create or replace function public.kalam_notes_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_metadata jsonb := coalesce(v_row->'metadata', '{}'::jsonb);
  v_org_id uuid := public.kalam_try_uuid(v_row->>'org_id');
  v_note_id text := nullif(v_row->>'id', '');
  v_author_id uuid := public.kalam_try_uuid(v_row->>'author_id');
  v_channel_type text := lower(trim(coalesce(v_row->>'channel_type', '')));
  v_group_id uuid;
  v_group_users uuid[] := '{}'::uuid[];
  v_group_roles uuid[] := '{}'::uuid[];
  v_target_users uuid[] := '{}'::uuid[];
  v_target_roles uuid[] := '{}'::uuid[];
  v_note_source text;
  v_category text;
  v_agent_key text := nullif(lower(trim(coalesce(v_metadata->>'agent_key', ''))), '');
  v_agent_conv_key text := public.kalam_resolve_agent_conversation_key_v1(v_metadata);
  v_conversation_key text;
  v_is_system boolean := false;
  v_is_org_wide boolean := false;
  v_priority integer := 0;
begin
  if v_org_id is null or v_note_id is null or v_channel_type = 'sms' then
    return new;
  end if;

  v_note_source := lower(trim(coalesce(
    nullif(v_row->>'source_type', ''),
    nullif(v_metadata->>'source_type', ''),
    'user'
  )));
  v_is_system := v_note_source in ('system', 'ai', 'assistant')
    or v_metadata ?| array[
      'workflow_id', 'automation_rule_id', 'process_automation_rule_id',
      'workflow_action_type', 'scheduled_report_id'
    ];
  v_group_id := public.kalam_try_uuid(v_metadata->>'chat_group_id');
  v_category := case
    when v_group_id is not null then 'group'
    when v_note_source in ('ai', 'assistant') or v_agent_key is not null then 'assistant'
    when v_is_system then 'system'
    else 'internal'
  end;

  if v_group_id is not null then
    select coalesce(group_row.user_ids, '{}'::uuid[]), coalesce(group_row.role_ids, '{}'::uuid[])
      into v_group_users, v_group_roles
    from public.chat_groups group_row
    where group_row.id = v_group_id and group_row.org_id = v_org_id
    limit 1;
  end if;

  -- Strictly recipient-scoped for system/AI/agent notes: sender is never implicitly added
  v_target_users := public.kalam_distinct_uuid_array(
    public.kalam_jsonb_uuid_array(v_row->'mention_user_ids')
    || coalesce(v_group_users, '{}'::uuid[])
    || case when v_is_system or v_author_id is null then '{}'::uuid[] else array[v_author_id] end
  );
  v_target_roles := public.kalam_distinct_uuid_array(
    public.kalam_jsonb_uuid_array(v_row->'mention_role_ids') || coalesce(v_group_roles, '{}'::uuid[])
  );
  v_is_org_wide := not v_is_system and (
    lower(trim(coalesce(v_metadata->>'is_org_wide', 'false'))) in ('true', '1', 'yes')
    or lower(trim(coalesce(v_metadata->>'org_wide', 'false'))) in ('true', '1', 'yes')
  );

  v_conversation_key := case
    when v_group_id is not null then 'group:' || v_group_id::text
    when v_agent_conv_key is not null then v_agent_conv_key
    when v_is_system then 'system'
    when lower(trim(coalesce(v_metadata->>'saved_message', 'false'))) in ('true', '1', 'yes') then 'mine'
    when nullif(trim(v_metadata->>'conversation_key'), '') is not null then trim(v_metadata->>'conversation_key')
    when v_author_id is not null
      and cardinality(public.kalam_jsonb_uuid_array(v_row->'mention_user_ids')) = 1
      then public.kalam_direct_conversation_key(v_author_id, (public.kalam_jsonb_uuid_array(v_row->'mention_user_ids'))[1])
    when v_author_id is not null then 'mine'
    else null
  end;

  v_priority := case
    when coalesce(v_metadata->>'priority', '') ~ '^-?\d+$' then (v_metadata->>'priority')::integer
    when v_agent_conv_key is not null then 10
    else 0
  end;

  perform public.kalam_upsert_notification_item(
    v_org_id,
    'note',
    v_note_id,
    'notes',
    v_category,
    lower(tg_op),
    case
      when v_agent_key is not null then public.kalam_agent_label_fa_v1(v_agent_key)
      when v_category = 'assistant' then 'پیام هوش مصنوعی'
      when v_category = 'system' then 'پیام سیستم'
      else 'پیام داخلی'
    end,
    nullif(left(coalesce(v_row->>'content', ''), 240), ''),
    nullif(v_row->>'module_id', ''),
    nullif(v_row->>'record_id', ''),
    v_target_users,
    v_target_roles,
    v_is_org_wide,
    jsonb_build_object(
      'note_source', v_note_source,
      'chat_group_id', v_group_id,
      'reply_to', nullif(v_row->>'reply_to', ''),
      'conversation_key', v_conversation_key,
      'agent_key', v_agent_key,
      'priority', v_priority
    ),
    coalesce(nullif(v_row->>'updated_at', '')::timestamptz, nullif(v_row->>'created_at', '')::timestamptz, now())
  );

  return new;
end;
$$;

drop trigger if exists trg_notes_notification_inbox on public.notes;
create trigger trg_notes_notification_inbox after insert or update on public.notes
for each row execute function public.kalam_notes_notification_trigger();

-- Update V3 single-key resolver
create or replace function public.kalam_internal_message_conversation_key_v3(
  p_org_id uuid,
  p_note_id uuid,
  p_author_id uuid,
  p_mention_user_ids uuid[],
  p_mention_role_ids uuid[],
  p_source_type text,
  p_metadata jsonb,
  p_reply_to uuid,
  p_viewer_id uuid,
  p_viewer_role_id uuid,
  p_inbox_category text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_source text := lower(trim(coalesce(nullif(p_source_type, ''), nullif(v_metadata->>'source_type', ''), '')));
  v_group_id text := nullif(trim(coalesce(v_metadata->>'chat_group_id', '')), '');
  v_agent_conv_key text := public.kalam_resolve_agent_conversation_key_v1(v_metadata);
  v_user_mentions uuid[] := coalesce(p_mention_user_ids, '{}'::uuid[]);
  v_role_mentions uuid[] := coalesce(p_mention_role_ids, '{}'::uuid[]);
begin
  if v_group_id is not null then
    return 'group:' || v_group_id;
  end if;

  if v_agent_conv_key is not null then
    return v_agent_conv_key;
  end if;

  if public.kalam_internal_message_is_system_v2(v_source, v_metadata, p_inbox_category) then
    return 'system';
  end if;

  if p_author_id is null then
    return null;
  end if;

  if p_viewer_id is not null
    and p_author_id <> p_viewer_id
    and (
      p_viewer_id = any(v_user_mentions)
      or (p_viewer_role_id is not null and p_viewer_role_id = any(v_role_mentions))
    ) then
    return public.kalam_direct_conversation_key(p_viewer_id, p_author_id);
  end if;

  if p_author_id = p_viewer_id and cardinality(v_user_mentions) = 0 then
    return 'mine';
  end if;

  return public.kalam_note_conversation_key(
    p_org_id, p_note_id, p_author_id, v_user_mentions, v_source, v_metadata, p_reply_to
  );
end;
$$;

-- Update V4 conversation rows mapper: handle agent_key + NULL author_id on system/AI notes cleanly
create or replace function public.kalam_internal_message_conversation_rows_v4(
  p_org_id uuid,
  p_note_id uuid,
  p_author_id uuid,
  p_mention_user_ids uuid[],
  p_mention_role_ids uuid[],
  p_source_type text,
  p_metadata jsonb,
  p_reply_to uuid,
  p_viewer_id uuid,
  p_viewer_role_id uuid,
  p_inbox_category text default null
)
returns table (conversation_key text, peer_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_group_id uuid := public.kalam_try_uuid(v_metadata->>'chat_group_id');
  v_agent_conv_key text := public.kalam_resolve_agent_conversation_key_v1(v_metadata);
  v_fallback_key text;
begin
  if p_viewer_id is null then
    return;
  end if;

  if v_group_id is not null then
    return query select 'group:' || v_group_id::text, null::uuid;
    return;
  end if;

  if v_agent_conv_key is not null then
    return query select v_agent_conv_key, null::uuid;
    return;
  end if;

  if public.kalam_internal_message_is_system_v2(
    p_source_type,
    v_metadata,
    p_inbox_category
  ) then
    return query select 'system'::text, null::uuid;
    return;
  end if;

  if p_author_id is null then
    return;
  end if;

  if p_author_id = p_viewer_id then
    if exists (
      select 1
      from public.kalam_internal_message_direct_peers_v4(
        p_org_id,
        p_author_id,
        p_mention_user_ids,
        p_mention_role_ids
      )
    ) then
      return query
      select public.kalam_direct_conversation_key(p_author_id, peer.peer_id), peer.peer_id
      from public.kalam_internal_message_direct_peers_v4(
        p_org_id,
        p_author_id,
        p_mention_user_ids,
        p_mention_role_ids
      ) peer;
      return;
    end if;

    return query select 'mine'::text, null::uuid;
    return;
  end if;

  if p_viewer_id = any(coalesce(p_mention_user_ids, '{}'::uuid[]))
    or (
      p_viewer_role_id is not null
      and p_viewer_role_id = any(coalesce(p_mention_role_ids, '{}'::uuid[]))
    ) then
    return query select public.kalam_direct_conversation_key(p_viewer_id, p_author_id), p_author_id;
    return;
  end if;

  v_fallback_key := public.kalam_internal_message_conversation_key_v3(
    p_org_id,
    p_note_id,
    p_author_id,
    coalesce(p_mention_user_ids, '{}'::uuid[]),
    coalesce(p_mention_role_ids, '{}'::uuid[]),
    p_source_type,
    v_metadata,
    p_reply_to,
    p_viewer_id,
    p_viewer_role_id,
    p_inbox_category
  );
  if nullif(trim(coalesce(v_fallback_key, '')), '') is not null then
    return query select v_fallback_key, null::uuid;
  end if;
end;
$$;

-- Update conversations V3 summary RPC to surface kind = 'agent' with Persian agent titles
create or replace function public.get_internal_communication_conversations_v3(
  p_before_cursor timestamptz default null,
  p_limit integer default 80
)
returns table (
  section text, conversation_key text, kind text, title text, subtitle text,
  avatar_url text, role_label text, note_count integer, unread_count integer,
  latest_message_at timestamptz, last_message_preview text, user_id uuid,
  group_id uuid, bot_group_id uuid, channel_type text, status text,
  counterparty_label text, bot_chat_id text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select profile.id as user_id, profile.org_id, profile.role_id
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.org_id = public.current_org_id()
    limit 1
  ), candidate as materialized (
    select distinct on (note.id, resolved.conversation_key)
      note.id as note_id,
      note.author_id,
      note.created_at,
      nullif(trim(coalesce(inbox.body, note.content, '')), '') as preview,
      resolved.conversation_key,
      resolved.peer_id
    from me
    join public.notification_inbox_items inbox
      on inbox.org_id = me.org_id
     and inbox.section = 'notes'
     and inbox.source_type = 'note'
    join public.notes note
      on note.id::text = inbox.source_id
     and note.org_id = inbox.org_id
    cross join lateral public.kalam_internal_message_conversation_rows_v4(
      note.org_id,
      note.id,
      note.author_id,
      coalesce(note.mention_user_ids, '{}'::uuid[]),
      coalesce(note.mention_role_ids, '{}'::uuid[]),
      note.source_type,
      coalesce(note.metadata, '{}'::jsonb),
      note.reply_to,
      me.user_id,
      me.role_id,
      inbox.category
    ) resolved
    where public.kalam_can_access_internal_message_v2(
      inbox.is_org_wide,
      inbox.target_user_ids,
      inbox.target_role_ids,
      note.author_id,
      note.mention_user_ids,
      note.mention_role_ids,
      note.source_type,
      note.metadata,
      inbox.category,
      me.user_id,
      me.role_id
    )
    order by note.id, resolved.conversation_key, inbox.created_at desc, inbox.id desc
  ), visible as materialized (
    select candidate.*,
      (
        candidate.author_id = me.user_id
        or read_state.read_at is not null
        or read_state.dismissed_at is not null
        or (
          cursor_state.read_through_at is not null
          and (
            candidate.created_at < cursor_state.read_through_at
            or (
              candidate.created_at = cursor_state.read_through_at
              and candidate.note_id::text <= coalesce(cursor_state.read_through_id, candidate.note_id::text)
            )
          )
        )
      ) as is_read
    from candidate
    join me on true
    left join public.notification_read_states read_state
      on read_state.org_id = me.org_id
     and read_state.user_id = me.user_id
     and read_state.section = 'notes'
     and read_state.source_type = 'note'
     and read_state.source_id = candidate.note_id::text
    left join public.communication_read_cursors cursor_state
      on cursor_state.org_id = me.org_id
     and cursor_state.user_id = me.user_id
     and cursor_state.channel = 'internal'
     and cursor_state.conversation_key = candidate.conversation_key
    where nullif(trim(coalesce(candidate.conversation_key, '')), '') is not null
      and (
        candidate.conversation_key not like 'direct:%'
        or candidate.conversation_key like 'direct:' || me.user_id::text || ':%'
        or candidate.conversation_key like 'direct:%:' || me.user_id::text
      )
  ), summary as (
    select
      conversation_key,
      count(*)::integer as note_count,
      count(*) filter (where not is_read)::integer as unread_count,
      max(created_at) as latest_message_at
    from visible
    group by conversation_key
  ), latest as (
    select distinct on (conversation_key) conversation_key, preview
    from visible
    order by conversation_key, created_at desc, note_id desc
  ), enriched as (
    select
      summary.conversation_key,
      case
        when summary.conversation_key like 'agent:%' then 'agent'
        when summary.conversation_key = 'system' then 'system'
        when summary.conversation_key = 'mine' then 'mine'
        when summary.conversation_key like 'group:%' then 'group'
        else 'direct'
      end as kind,
      case
        when summary.conversation_key like 'agent:%'
          then split_part(summary.conversation_key, ':', 2)
        else null
      end as resolved_agent_key,
      summary.note_count,
      summary.unread_count,
      summary.latest_message_at,
      latest.preview,
      case
        when summary.conversation_key like 'direct:%' then
          case
            when public.kalam_try_uuid(split_part(summary.conversation_key, ':', 2)) = me.user_id
              then public.kalam_try_uuid(split_part(summary.conversation_key, ':', 3))
            else public.kalam_try_uuid(split_part(summary.conversation_key, ':', 2))
          end
        else null::uuid
      end as resolved_user_id,
      case
        when summary.conversation_key like 'group:%'
          then public.kalam_try_uuid(split_part(summary.conversation_key, ':', 2))
        else null::uuid
      end as resolved_group_id
    from summary
    join me on true
    left join latest on latest.conversation_key = summary.conversation_key
  )
  select
    'notes'::text,
    enriched.conversation_key,
    enriched.kind,
    case
      when enriched.kind = 'agent' then public.kalam_agent_label_fa_v1(enriched.resolved_agent_key)
      when enriched.kind = 'system' then 'پیام‌های سیستم'
      when enriched.kind = 'mine' then 'یادداشت‌های من'
      when enriched.kind = 'group' then coalesce(nullif(trim(chat_group.name), ''), 'گروه داخلی')
      else coalesce(nullif(trim(other_profile.full_name), ''), 'کاربر')
    end,
    case
      when enriched.kind = 'agent' then public.kalam_agent_subtitle_fa_v1(enriched.resolved_agent_key)
      when enriched.kind = 'system' then 'اعلان‌ها و پیام‌های سیستمی'
      when enriched.kind = 'mine' then 'یادداشت‌های شخصی'
      when enriched.kind = 'group' then 'گروه داخلی'
      else nullif(trim(other_role.title), '')
    end,
    case when enriched.kind = 'direct' then other_profile.avatar_url else null end,
    case when enriched.kind = 'direct' then other_role.title else null end,
    enriched.note_count,
    enriched.unread_count,
    enriched.latest_message_at,
    enriched.preview,
    case when enriched.kind = 'direct' then enriched.resolved_user_id else null::uuid end,
    case when enriched.kind = 'group' then enriched.resolved_group_id else null::uuid end,
    null::uuid,
    null::text,
    null::text,
    case when enriched.kind = 'agent' then enriched.resolved_agent_key else null::text end,
    null::text
  from enriched
  join me on true
  left join public.chat_groups chat_group
    on enriched.kind = 'group'
   and chat_group.id = enriched.resolved_group_id
   and chat_group.org_id = me.org_id
  left join public.profiles other_profile
    on enriched.kind = 'direct'
   and other_profile.id = enriched.resolved_user_id
   and other_profile.org_id = me.org_id
  left join public.org_roles other_role
    on other_role.id = other_profile.role_id
   and other_role.org_id = me.org_id
  where p_before_cursor is null or enriched.latest_message_at < p_before_cursor
  order by enriched.latest_message_at desc nulls last, 4 asc
  limit least(greatest(coalesce(p_limit, 80), 1), 100);
$$;

-- Keep legacy system timeline strictly for non-agent system alerts
create or replace function public.get_system_communication_timeline_v1(
  p_limit integer default 40,
  p_before_cursor text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_role_id uuid := null;
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 50);
  v_before_ts timestamptz := null;
  v_before_id text := null;
begin
  if v_user_id is null or v_org_id is null then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
  end if;

  select profile.role_id into v_role_id
  from public.profiles profile
  where profile.id = v_user_id and profile.org_id = v_org_id
  limit 1;
  if not found then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
  end if;

  if nullif(trim(coalesce(p_before_cursor, '')), '') is not null then
    v_before_ts := nullif(split_part(p_before_cursor, '|', 1), '')::timestamptz;
    v_before_id := nullif(split_part(p_before_cursor, '|', 2), '');
  end if;

  return (
    with visible as materialized (
      select
        note.id, note.module_id, note.record_id, note.content, note.author_id, note.author_name,
        note.mention_user_ids, note.mention_role_ids, note.created_at, note.reply_to, note.source_type,
        note.metadata, note.is_edited, note.edited_at,
        (
          note.author_id = v_user_id
          or read_state.read_at is not null
          or read_state.dismissed_at is not null
          or (
            cursor_state.read_through_at is not null and (
              note.created_at < cursor_state.read_through_at
              or (note.created_at = cursor_state.read_through_at and note.id::text <= coalesce(cursor_state.read_through_id, note.id::text))
            )
          )
        ) as is_read
      from public.notes note
      left join lateral (
        select inbox.category, inbox.target_user_ids, inbox.target_role_ids
        from public.notification_inbox_items inbox
        where inbox.org_id = v_org_id
          and inbox.section = 'notes'
          and inbox.source_type = 'note'
          and inbox.source_id = note.id::text
        order by inbox.last_event_at desc, inbox.created_at desc, inbox.id desc
        limit 1
      ) inbox on true
      left join public.notification_read_states read_state
        on read_state.org_id = v_org_id
       and read_state.user_id = v_user_id
       and read_state.section = 'notes'
       and read_state.source_type = 'note'
       and read_state.source_id = note.id::text
      left join public.communication_read_cursors cursor_state
        on cursor_state.org_id = v_org_id
       and cursor_state.user_id = v_user_id
       and cursor_state.channel = 'internal'
       and cursor_state.conversation_key = 'system'
      where note.org_id = v_org_id
        and public.kalam_resolve_agent_conversation_key_v1(note.metadata) is null
        and public.kalam_internal_message_is_system_v2(note.source_type, note.metadata, inbox.category)
        and public.kalam_can_access_internal_message_v2(
          false,
          coalesce(inbox.target_user_ids, '{}'::uuid[]),
          coalesce(inbox.target_role_ids, '{}'::uuid[]),
          note.author_id,
          note.mention_user_ids,
          note.mention_role_ids,
          note.source_type,
          note.metadata,
          coalesce(inbox.category, 'system'),
          v_user_id,
          v_role_id
        )
    ), unread as (
      select count(*) filter (where not is_read)::integer as unread_count from visible
    ), windowed as (
      select * from visible
      where v_before_ts is null
         or created_at < v_before_ts
         or (created_at = v_before_ts and id::text < coalesce(v_before_id, ''))
      order by created_at desc, id desc
      limit v_limit + 1
    ), page_desc as (
      select * from windowed order by created_at desc, id desc limit v_limit
    ), page as (
      select * from page_desc order by created_at asc, id asc
    ), earliest as (
      select created_at, id::text as id_text from page order by created_at asc, id asc limit 1
    )
    select jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(
          to_jsonb(page) || jsonb_build_object(
            'metadata',
            coalesce(page.metadata, '{}'::jsonb) || jsonb_build_object(
              'read_receipts',
              public.kalam_message_read_receipts_v1(
                v_org_id,
                'internal',
                'system',
                page.author_id,
                page.created_at,
                page.id
              )
            )
          )
          order by page.created_at asc, page.id asc
        )
        from page
      ), '[]'::jsonb),
      'unread_count', coalesce((select unread_count from unread), 0),
      'first_unread_id', (select id::text from page where not is_read order by created_at asc, id asc limit 1),
      'has_more_before', (select count(*) > v_limit from windowed),
      'next_before_cursor', (select public.kalam_cursor_value(created_at, id_text) from earliest),
      'read_model', 'cursor'
    )
  );
end;
$$;

-- Priority-aware central overlay feed v6 (preserves v5 untouched for fallback)
create or replace function public.get_notification_overlay_feed_v6(
  p_before_cursor text default null,
  p_limit integer default 20
)
returns table (
  section text,
  source_type text,
  source_id text,
  title text,
  body text,
  created_at timestamptz,
  module_id text,
  record_id text,
  conversation_key text,
  payload jsonb,
  feed_cursor text,
  has_more boolean,
  priority integer
)
language sql
stable
security definer
set search_path = public
as $$
  with limits as (
    select least(greatest(coalesce(p_limit, 20), 1), 50) as effective_limit,
      least(greatest(least(greatest(coalesce(p_limit, 20), 1), 50) * 8, 120), 300) as candidate_limit
  ), cursor_value as (
    select
      case
        when nullif(split_part(coalesce(p_before_cursor, ''), '|', 3), '') is not null
          then coalesce(nullif(split_part(coalesce(p_before_cursor, ''), '|', 1), '')::integer, 0)
        else null::integer
      end as before_priority,
      case
        when nullif(split_part(coalesce(p_before_cursor, ''), '|', 3), '') is not null
          then nullif(split_part(coalesce(p_before_cursor, ''), '|', 2), '')::timestamptz
        else nullif(split_part(coalesce(p_before_cursor, ''), '|', 1), '')::timestamptz
      end as before_at,
      case
        when nullif(split_part(coalesce(p_before_cursor, ''), '|', 3), '') is not null
          then nullif(split_part(coalesce(p_before_cursor, ''), '|', 3), '')
        else nullif(split_part(coalesce(p_before_cursor, ''), '|', 2), '')
      end as before_key
  ), base_rows as (
    select
      f.section,
      f.source_type,
      f.source_id,
      f.title,
      f.body,
      f.created_at,
      f.module_id,
      f.record_id,
      coalesce(
        nullif(trim(coalesce(f.conversation_key, '')), ''),
        nullif(trim(coalesce(f.payload->>'conversation_key', '')), '')
      ) as resolved_conversation_key,
      f.payload,
      coalesce(f.has_more, false) as upstream_has_more
    from limits
    cross join lateral public.get_notification_overlay_feed_v5(null, limits.candidate_limit) f
  ), scored_rows as (
    select
      br.section,
      br.source_type,
      br.source_id,
      br.title,
      br.body,
      br.created_at,
      br.module_id,
      br.record_id,
      br.resolved_conversation_key as conversation_key,
      case
        when br.section = 'notes' and (
          coalesce(br.resolved_conversation_key, '') like 'agent:%'
          or nullif(trim(coalesce(br.payload->>'agent_key', '')), '') is not null
          or nullif(trim(coalesce(br.payload->>'waiting_approval_id', '')), '') is not null
        ) then greatest(
          case
            when coalesce(br.payload->>'priority', '') ~ '^-?\d+$'
              then (br.payload->>'priority')::integer
            else 10
          end,
          10
        )
        else case
          when coalesce(br.payload->>'priority', '') ~ '^-?\d+$'
            then (br.payload->>'priority')::integer
          else 0
        end
      end as resolved_priority,
      br.payload,
      concat_ws(':', br.section, br.source_type, br.source_id) as cursor_key,
      br.upstream_has_more
    from base_rows br
    where br.created_at is not null
  ), filtered_rows as (
    select sr.*
    from scored_rows sr
    cross join cursor_value cur
    where (
      cur.before_at is null
      or (
        cur.before_priority is not null and (
          sr.resolved_priority < cur.before_priority
          or (sr.resolved_priority = cur.before_priority and sr.created_at < cur.before_at)
          or (
            sr.resolved_priority = cur.before_priority
            and sr.created_at = cur.before_at
            and sr.cursor_key < coalesce(cur.before_key, '')
          )
        )
      )
      or (
        cur.before_priority is null and (
          sr.created_at < cur.before_at
          or (sr.created_at = cur.before_at and sr.cursor_key < coalesce(cur.before_key, ''))
        )
      )
    )
  ), ranked_rows as (
    select
      fr.*,
      row_number() over (
        order by fr.resolved_priority desc, fr.created_at desc nulls last, fr.cursor_key desc
      ) as rn,
      count(*) over () as candidate_count,
      bool_or(fr.upstream_has_more) over () as any_upstream_has_more
    from filtered_rows fr
  )
  select
    rr.section,
    rr.source_type,
    rr.source_id,
    rr.title,
    rr.body,
    rr.created_at,
    rr.module_id,
    rr.record_id,
    rr.conversation_key,
    coalesce(rr.payload, '{}'::jsonb) || jsonb_build_object(
      'priority', rr.resolved_priority,
      'conversation_key', rr.conversation_key
    ) as payload,
    rr.resolved_priority::text || '|' || rr.created_at::text || '|' || rr.cursor_key as feed_cursor,
    (rr.candidate_count > limits.effective_limit or rr.any_upstream_has_more) as has_more,
    rr.resolved_priority as priority
  from ranked_rows rr
  cross join limits
  where rr.rn <= limits.effective_limit
  order by rr.resolved_priority desc, rr.created_at desc nulls last, rr.cursor_key desc;
$$;

grant execute on function public.kalam_note_conversation_key(uuid, uuid, uuid, uuid[], text, jsonb, uuid) to authenticated;
grant execute on function public.get_internal_communication_conversations_v3(timestamptz, integer) to authenticated;
grant execute on function public.get_system_communication_timeline_v1(integer, text) to authenticated;
grant execute on function public.get_notification_overlay_feed_v6(text, integer) to authenticated;

revoke all on function public.kalam_note_conversation_key(uuid, uuid, uuid, uuid[], text, jsonb, uuid) from public, anon;
revoke all on function public.kalam_notes_notification_trigger() from public, anon, authenticated;
revoke all on function public.kalam_agent_label_fa_v1(text) from public, anon, authenticated;
revoke all on function public.kalam_agent_subtitle_fa_v1(text) from public, anon, authenticated;
revoke all on function public.kalam_resolve_agent_conversation_key_v1(jsonb) from public, anon, authenticated;
revoke all on function public.kalam_internal_message_conversation_key_v3(uuid, uuid, uuid, uuid[], uuid[], text, jsonb, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.kalam_internal_message_conversation_rows_v4(uuid, uuid, uuid, uuid[], uuid[], text, jsonb, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_internal_communication_conversations_v3(timestamptz, integer) from public, anon;
revoke all on function public.get_system_communication_timeline_v1(integer, text) from public, anon;
revoke all on function public.get_notification_overlay_feed_v6(text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
