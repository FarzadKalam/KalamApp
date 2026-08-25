-- Phase 468: tenant-safe advertising campaigns foundation and runtime contracts.
-- Additive and idempotent. No existing migration is modified.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Plan/module checks. Modules and channel features are deliberately separate.
-- ---------------------------------------------------------------------------
create or replace function public.org_has_plan_module(
  p_org_id uuid,
  p_module_id text,
  p_default_enabled boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_modules jsonb := '{}'::jsonb;
  v_overrides jsonb := '{}'::jsonb;
  v_key text := nullif(btrim(coalesce(p_module_id, '')), '');
  v_raw text;
begin
  if p_org_id is null or v_key is null then return false; end if;
  if public.org_is_saas_admin(p_org_id) then return true; end if;

  select coalesce(plan.enabled_modules, '{}'::jsonb),
         coalesce(settings.module_overrides, '{}'::jsonb)
    into v_modules, v_overrides
  from public.saas_org_settings settings
  left join public.saas_plans plan
    on lower(plan.code) = lower(coalesce(settings.plan_code, ''))
  where settings.org_id = p_org_id
  limit 1;

  v_raw := coalesce(v_overrides ->> v_key, v_modules ->> v_key);
  if v_raw is null then return coalesce(p_default_enabled, false); end if;
  return lower(v_raw) in ('true', '1', 'yes', 'on');
exception
  when undefined_column then
    -- Older installations may not yet expose module_overrides.
    select coalesce(plan.enabled_modules, '{}'::jsonb)
      into v_modules
    from public.saas_org_settings settings
    left join public.saas_plans plan
      on lower(plan.code) = lower(coalesce(settings.plan_code, ''))
    where settings.org_id = p_org_id
    limit 1;
    v_raw := v_modules ->> v_key;
    if v_raw is null then return coalesce(p_default_enabled, false); end if;
    return lower(v_raw) in ('true', '1', 'yes', 'on');
end;
$$;

create or replace function public.current_org_has_plan_module(
  p_module_id text,
  p_default_enabled boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and public.current_org_id() is not null
     and public.org_has_plan_module(public.current_org_id(), p_module_id, p_default_enabled)
$$;

revoke all on function public.org_has_plan_module(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.org_has_plan_module(uuid, text, boolean) to service_role;
revoke all on function public.current_org_has_plan_module(text, boolean) from public;
grant execute on function public.current_org_has_plan_module(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Core campaign records.
-- ---------------------------------------------------------------------------
create table if not exists public.advertising_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations(id) on delete cascade,
  name text not null,
  system_code text,
  status text not null default 'draft'
    check (status in ('draft','planned','active','paused','completed','canceled')),
  image_url text,
  description text,
  target_audience text,
  start_at timestamptz,
  end_at timestamptz,
  assignee_id uuid references auth.users(id) on delete set null,
  assignee_role_id uuid references public.org_roles(id) on delete set null,
  assignee_type text check (assignee_type is null or assignee_type in ('user','role')),
  viewer_user_ids uuid[] not null default '{}'::uuid[],
  viewer_role_ids uuid[] not null default '{}'::uuid[],
  tool_types text[] not null default '{}'::text[],
  is_archived boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or start_at is null or end_at >= start_at)
);

create unique index if not exists idx_advertising_campaigns_org_system_code
  on public.advertising_campaigns(org_id, upper(system_code))
  where system_code is not null and btrim(system_code) <> '';
create index if not exists idx_advertising_campaigns_org_status_dates
  on public.advertising_campaigns(org_id, status, start_at, end_at)
  where is_archived = false;
create index if not exists idx_advertising_campaigns_viewer_users
  on public.advertising_campaigns using gin(viewer_user_ids);
create index if not exists idx_advertising_campaigns_viewer_roles
  on public.advertising_campaigns using gin(viewer_role_ids);
create index if not exists idx_advertising_campaigns_tool_types
  on public.advertising_campaigns using gin(tool_types);

create table if not exists public.advertising_campaign_details (
  campaign_id uuid primary key references public.advertising_campaigns(id) on delete cascade,
  org_id uuid not null default public.current_org_id()
    references public.organizations(id) on delete cascade,
  target_module_ids text[] not null default array['marketing_leads','customers','invoices']::text[],
  currency_code text,
  vat_percent numeric(7,3) not null default 10 check (vat_percent between 0 and 100),
  settings jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_advertising_campaign_details_org
  on public.advertising_campaign_details(org_id, campaign_id);

create table if not exists public.advertising_campaign_tools (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.advertising_campaigns(id) on delete cascade,
  tool_type text not null,
  title text,
  enabled boolean not null default true,
  status text not null default 'draft'
    check (status in ('draft','ready','scheduled','running','paused','completed','failed','canceled')),
  is_automated boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  estimated_cost numeric(24,6) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(24,6) not null default 0 check (actual_cost >= 0),
  expected_leads integer not null default 0 check (expected_leads >= 0),
  actual_leads integer not null default 0 check (actual_leads >= 0),
  expected_customers integer not null default 0 check (expected_customers >= 0),
  actual_customers integer not null default 0 check (actual_customers >= 0),
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  assignee_id uuid references auth.users(id) on delete set null,
  assignee_role_id uuid references public.org_roles(id) on delete set null,
  collaborator_user_ids uuid[] not null default '{}'::uuid[],
  collaborator_role_ids uuid[] not null default '{}'::uuid[],
  process_template_id uuid references public.process_templates(id) on delete set null,
  execution_process_draft jsonb not null default '{}'::jsonb,
  result_summary text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, tool_type),
  unique (id, campaign_id),
  check (planned_end_at is null or planned_start_at is null or planned_end_at >= planned_start_at),
  check (actual_end_at is null or actual_start_at is null or actual_end_at >= actual_start_at)
);
create index if not exists idx_advertising_campaign_tools_org_campaign
  on public.advertising_campaign_tools(org_id, campaign_id, status);
create index if not exists idx_advertising_campaign_tools_due
  on public.advertising_campaign_tools(org_id, planned_start_at)
  where enabled = true and status in ('ready','scheduled');
create index if not exists idx_advertising_campaign_tools_collaborator_users
  on public.advertising_campaign_tools using gin(collaborator_user_ids);
create index if not exists idx_advertising_campaign_tools_collaborator_roles
  on public.advertising_campaign_tools using gin(collaborator_role_ids);

create or replace function public.guard_advertising_campaign_tool_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_feature text;
begin
  v_feature := case new.tool_type
    when 'sms' then 'campaign_sms'
    when 'email' then 'campaign_email'
    when 'bot_group' then 'campaign_bot_group'
    when 'bot_private' then 'campaign_bot_private'
    when 'instagram_post' then 'campaign_instagram_post'
    when 'voice_call' then 'campaign_voice_call'
    else null end;
  if new.enabled = true
     and v_feature is not null
     and not public.org_has_plan_feature(new.org_id,v_feature,false) then
    raise exception 'ابزار انتخاب‌شده در پلن سازمان فعال نیست.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_advertising_campaign_tool_plan() from public,anon,authenticated;
drop trigger if exists trg_advertising_campaign_tools_plan on public.advertising_campaign_tools;
create trigger trg_advertising_campaign_tools_plan
before insert or update of tool_type, enabled on public.advertising_campaign_tools
for each row execute function public.guard_advertising_campaign_tool_plan();

create table if not exists public.advertising_campaign_content_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.advertising_campaigns(id) on delete cascade,
  tool_id uuid not null references public.advertising_campaign_tools(id) on delete cascade,
  content_type text not null default 'media',
  title text,
  caption text,
  media_file_ids uuid[] not null default '{}'::uuid[],
  account_id uuid,
  scheduled_at timestamptz,
  published_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','in_production','pending_approval','approved','published','canceled')),
  destination_url text,
  external_record_id text,
  estimated_cost numeric(24,6) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(24,6) not null default 0 check (actual_cost >= 0),
  sort_order integer not null default 10,
  fields jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_advertising_campaign_content_tool_order
  on public.advertising_campaign_content_items(org_id, tool_id, sort_order, created_at);

create table if not exists public.advertising_campaign_loyalty_rules (
  campaign_id uuid not null references public.advertising_campaigns(id) on delete cascade,
  loyalty_rule_id uuid not null references public.customer_loyalty_rules(id) on delete cascade,
  org_id uuid not null default public.current_org_id()
    references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (campaign_id, loyalty_rule_id)
);
create index if not exists idx_campaign_loyalty_rules_org
  on public.advertising_campaign_loyalty_rules(org_id, campaign_id);

create table if not exists public.advertising_campaign_discount_codes (
  campaign_id uuid not null references public.advertising_campaigns(id) on delete cascade,
  discount_code_id uuid not null references public.customer_discount_codes(id) on delete cascade,
  org_id uuid not null default public.current_org_id()
    references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (campaign_id, discount_code_id)
);
create index if not exists idx_campaign_discount_codes_org
  on public.advertising_campaign_discount_codes(org_id, campaign_id);

-- ---------------------------------------------------------------------------
-- Audience, import, dispatch, response, and opt-out records.
-- ---------------------------------------------------------------------------
create table if not exists public.advertising_campaign_audience_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.advertising_campaigns(id) on delete cascade,
  target_module_id text not null check (target_module_id in ('marketing_leads','customers','invoices')),
  conditions_all jsonb not null default '[]'::jsonb,
  conditions_any jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, target_module_id)
);
create index if not exists idx_campaign_audience_rules_org_campaign
  on public.advertising_campaign_audience_rules(org_id, campaign_id);

create table if not exists public.advertising_campaign_imports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.advertising_campaigns(id) on delete cascade,
  tool_id uuid not null references public.advertising_campaign_tools(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed','canceled')),
  file_ids uuid[] not null default '{}'::uuid[],
  total_rows integer not null default 0 check (total_rows >= 0),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  error_summary jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_campaign_imports_org_tool_time
  on public.advertising_campaign_imports(org_id, tool_id, created_at desc);

create table if not exists public.advertising_campaign_import_rows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.advertising_campaigns(id) on delete cascade,
  tool_id uuid not null references public.advertising_campaign_tools(id) on delete cascade,
  import_id uuid not null references public.advertising_campaign_imports(id) on delete cascade,
  parse_run_id uuid not null,
  source_file_name text,
  source_row_number integer not null check (source_row_number > 0),
  contact_value text not null,
  contact_key text not null,
  display_name text,
  variables jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_id, contact_key)
);
create index if not exists idx_campaign_import_rows_org_tool
  on public.advertising_campaign_import_rows(org_id, tool_id, created_at);
create index if not exists idx_campaign_import_rows_import_run
  on public.advertising_campaign_import_rows(import_id, parse_run_id);

create table if not exists public.advertising_campaign_dispatches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.advertising_campaigns(id) on delete cascade,
  tool_id uuid not null references public.advertising_campaign_tools(id) on delete cascade,
  channel_type text not null,
  status text not null default 'draft'
    check (status in ('draft','queued','processing','paused','succeeded','partial','failed','canceled')),
  scheduled_at timestamptz,
  audience_snapshot jsonb not null default '{}'::jsonb,
  message_snapshot jsonb not null default '{}'::jsonb,
  idempotency_key text not null default gen_random_uuid()::text,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  processed_count integer not null default 0 check (processed_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  estimated_cost numeric(24,6) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(24,6) not null default 0 check (actual_cost >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);
create index if not exists idx_campaign_dispatches_due
  on public.advertising_campaign_dispatches(available_at, created_at)
  where status = 'queued';
create index if not exists idx_campaign_dispatches_org_tool_time
  on public.advertising_campaign_dispatches(org_id, tool_id, created_at desc);

create table if not exists public.advertising_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.advertising_campaigns(id) on delete cascade,
  tool_id uuid not null references public.advertising_campaign_tools(id) on delete cascade,
  dispatch_id uuid not null references public.advertising_campaign_dispatches(id) on delete cascade,
  source_type text not null default 'internal' check (source_type in ('internal','file')),
  source_module_id text,
  source_record_id uuid,
  contact_value text not null,
  contact_key text not null,
  display_name text,
  variables jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed','skipped','suppressed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  outbound_message_id uuid references public.outbound_messages(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dispatch_id, contact_key)
);
create index if not exists idx_campaign_recipients_dispatch_status
  on public.advertising_campaign_recipients(dispatch_id, status, created_at);
create index if not exists idx_campaign_recipients_org_contact
  on public.advertising_campaign_recipients(org_id, contact_key, created_at desc);

create table if not exists public.advertising_campaign_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.advertising_campaigns(id) on delete cascade,
  tool_id uuid not null references public.advertising_campaign_tools(id) on delete cascade,
  dispatch_id uuid references public.advertising_campaign_dispatches(id) on delete set null,
  inbound_message_id uuid references public.outbound_messages(id) on delete set null,
  source_module_id text,
  source_record_id uuid,
  sender text not null,
  receiver text,
  message_text text not null,
  normalized_message text not null default '',
  match_status text not null default 'matched'
    check (match_status in ('matched','ambiguous','unmatched')),
  workflow_status text not null default 'pending'
    check (workflow_status in ('pending','processing','succeeded','failed','ignored')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, inbound_message_id)
);
create index if not exists idx_campaign_responses_org_tool_time
  on public.advertising_campaign_responses(org_id, tool_id, created_at desc);

create table if not exists public.campaign_contact_suppressions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  channel_type text not null check (channel_type in ('sms','email','bot_private')),
  contact_value text not null,
  contact_key text not null,
  reason text,
  source_response_id uuid references public.advertising_campaign_responses(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_campaign_suppressions_org_channel_contact
  on public.campaign_contact_suppressions(org_id, channel_type, contact_key)
  where is_active = true;

-- ---------------------------------------------------------------------------
-- Attribution and canonical outbound linkage.
-- ---------------------------------------------------------------------------
alter table if exists public.marketing_leads
  add column if not exists advertising_campaign_id uuid references public.advertising_campaigns(id) on delete set null,
  add column if not exists advertising_campaign_tool_id uuid references public.advertising_campaign_tools(id) on delete set null;
alter table if exists public.customers
  add column if not exists advertising_campaign_id uuid references public.advertising_campaigns(id) on delete set null,
  add column if not exists advertising_campaign_tool_id uuid references public.advertising_campaign_tools(id) on delete set null;
alter table if exists public.invoices
  add column if not exists advertising_campaign_id uuid references public.advertising_campaigns(id) on delete set null,
  add column if not exists advertising_campaign_tool_id uuid references public.advertising_campaign_tools(id) on delete set null;
alter table if exists public.outbound_messages
  add column if not exists advertising_campaign_id uuid references public.advertising_campaigns(id) on delete set null,
  add column if not exists advertising_campaign_tool_id uuid references public.advertising_campaign_tools(id) on delete set null,
  add column if not exists advertising_campaign_dispatch_id uuid references public.advertising_campaign_dispatches(id) on delete set null;

do $$
begin
  if exists (select 1 from pg_constraint where conname='chk_outbound_messages_channel_type' and conrelid='public.outbound_messages'::regclass) then
    alter table public.outbound_messages drop constraint chk_outbound_messages_channel_type;
  end if;
  alter table public.outbound_messages add constraint chk_outbound_messages_channel_type
    check (channel_type in ('sms','email','telegram','bale','rubika','portal')) not valid;
end $$;

create index if not exists idx_marketing_leads_advertising_campaign
  on public.marketing_leads(org_id, advertising_campaign_id, advertising_campaign_tool_id)
  where advertising_campaign_id is not null;
create index if not exists idx_customers_advertising_campaign
  on public.customers(org_id, advertising_campaign_id, advertising_campaign_tool_id)
  where advertising_campaign_id is not null;
create index if not exists idx_invoices_advertising_campaign
  on public.invoices(org_id, advertising_campaign_id, advertising_campaign_tool_id)
  where advertising_campaign_id is not null;
create index if not exists idx_outbound_messages_advertising_dispatch
  on public.outbound_messages(org_id, advertising_campaign_dispatch_id, created_at desc)
  where advertising_campaign_id is not null;

-- Keep campaign/tool/org pairs consistent even when writes come from imports/API.
create or replace function public.validate_advertising_campaign_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_campaign_org uuid;
  v_tool_campaign uuid;
  v_tool_org uuid;
  v_source text;
begin
  v_source := case tg_table_name
    when 'marketing_leads' then nullif(btrim(coalesce(new.source,'')),'')
    when 'customers' then nullif(btrim(coalesce(new.lead_source,'')),'')
    when 'invoices' then nullif(btrim(coalesce(new.sale_source,'')),'')
    else null
  end;
  if new.advertising_campaign_id is null and new.advertising_campaign_tool_id is null then
    if v_source='advertising_campaign' then
      raise exception 'با انتخاب منبع کمپین تبلیغاتی، انتخاب کمپین الزامی است.' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.advertising_campaign_id is null and new.advertising_campaign_tool_id is not null then
    select campaign_id, org_id into v_tool_campaign, v_tool_org
    from public.advertising_campaign_tools where id = new.advertising_campaign_tool_id;
    new.advertising_campaign_id := v_tool_campaign;
  end if;
  select org_id into v_campaign_org from public.advertising_campaigns where id = new.advertising_campaign_id;
  if v_campaign_org is null or v_campaign_org is distinct from new.org_id then
    raise exception 'کمپین تبلیغاتی متعلق به سازمان جاری نیست.' using errcode = '23514';
  end if;
  if new.advertising_campaign_tool_id is not null then
    select campaign_id, org_id into v_tool_campaign, v_tool_org
    from public.advertising_campaign_tools where id = new.advertising_campaign_tool_id;
    if v_tool_campaign is distinct from new.advertising_campaign_id or v_tool_org is distinct from new.org_id then
      raise exception 'ابزار تبلیغاتی با کمپین انتخاب‌شده همخوان نیست.' using errcode = '23514';
    end if;
  end if;
  -- Imports, APIs and quick-create paths remain attributable even when they
  -- submit the campaign relation without the conditional source field.
  if tg_table_name='marketing_leads' then new.source := 'advertising_campaign'; end if;
  if tg_table_name='customers' then new.lead_source := 'advertising_campaign'; end if;
  if tg_table_name='invoices' then new.sale_source := 'advertising_campaign'; end if;
  return new;
end;
$$;

drop trigger if exists trg_marketing_leads_campaign_link on public.marketing_leads;
create trigger trg_marketing_leads_campaign_link
before insert or update of advertising_campaign_id, advertising_campaign_tool_id, source
on public.marketing_leads for each row execute function public.validate_advertising_campaign_link();

drop trigger if exists trg_customers_campaign_link on public.customers;
create trigger trg_customers_campaign_link
before insert or update of advertising_campaign_id, advertising_campaign_tool_id, lead_source
on public.customers for each row execute function public.validate_advertising_campaign_link();

drop trigger if exists trg_invoices_campaign_link on public.invoices;
create trigger trg_invoices_campaign_link
before insert or update of advertising_campaign_id, advertising_campaign_tool_id, sale_source
on public.invoices for each row execute function public.validate_advertising_campaign_link();

drop trigger if exists trg_outbound_messages_campaign_link on public.outbound_messages;
create trigger trg_outbound_messages_campaign_link
before insert or update of advertising_campaign_id, advertising_campaign_tool_id
on public.outbound_messages for each row execute function public.validate_advertising_campaign_link();

-- ---------------------------------------------------------------------------
-- Audit/system code and org consistency guards.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_advertising_campaigns_system_code_autogen on public.advertising_campaigns;
create trigger trg_advertising_campaigns_system_code_autogen
before insert or update on public.advertising_campaigns
for each row execute function public.assign_system_code_from_module_settings();

create or replace function public.guard_advertising_campaign_child_org()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_org uuid; v_campaign uuid;
begin
  if to_jsonb(new) ? 'campaign_id' then
    select org_id into v_org from public.advertising_campaigns where id = new.campaign_id;
    if v_org is null or new.org_id is distinct from v_org then
      raise exception 'سازمان رکورد با کمپین همخوان نیست.' using errcode = '23514';
    end if;
  end if;
  if to_jsonb(new) ? 'tool_id' and nullif(to_jsonb(new)->>'tool_id','') is not null then
    select org_id, campaign_id into v_org, v_campaign
    from public.advertising_campaign_tools where id = (to_jsonb(new)->>'tool_id')::uuid;
    if v_org is null or new.org_id is distinct from v_org
       or (to_jsonb(new) ? 'campaign_id' and new.campaign_id is distinct from v_campaign) then
      raise exception 'ابزار با کمپین و سازمان همخوان نیست.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'advertising_campaign_details','advertising_campaign_tools','advertising_campaign_content_items',
    'advertising_campaign_loyalty_rules','advertising_campaign_discount_codes',
    'advertising_campaign_audience_rules','advertising_campaign_imports','advertising_campaign_import_rows',
    'advertising_campaign_dispatches','advertising_campaign_recipients','advertising_campaign_responses'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || v_table || '_org_guard', v_table);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.guard_advertising_campaign_child_org()', 'trg_' || v_table || '_org_guard', v_table);
  end loop;
end $$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'advertising_campaigns','advertising_campaign_details','advertising_campaign_tools',
    'advertising_campaign_content_items','advertising_campaign_audience_rules','advertising_campaign_imports',
    'advertising_campaign_import_rows','advertising_campaign_dispatches','advertising_campaign_recipients','advertising_campaign_responses',
    'campaign_contact_suppressions'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || v_table || '_updated_at', v_table);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'trg_' || v_table || '_updated_at', v_table);
  end loop;
end $$;

-- Campaign responses are durable workflow event sources.
drop trigger if exists workflow_event_queue_row on public.advertising_campaign_responses;
create trigger workflow_event_queue_row
after insert or update on public.advertising_campaign_responses
for each row execute function public.enqueue_workflow_event_from_row();

-- ---------------------------------------------------------------------------
-- Access helpers and strict tenant policies.
-- ---------------------------------------------------------------------------
create or replace function public.current_user_advertising_campaign_role_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.role_id from public.profiles p
  where p.id = auth.uid() and p.org_id = public.current_org_id()
  limit 1
$$;

create or replace function public.can_view_advertising_campaign(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.advertising_campaigns c
    where c.id = p_campaign_id
      and c.org_id = public.current_org_id()
      and public.current_org_has_plan_module('advertising_campaigns', false)
      and public.current_user_has_role_permission_entry('advertising_campaigns','view',null,true)
      and (
        c.created_by = auth.uid()
        or (c.assignee_type = 'user' and c.assignee_id = auth.uid())
        or (c.assignee_type = 'role' and c.assignee_role_id = public.current_user_advertising_campaign_role_id())
        or auth.uid() = any(c.viewer_user_ids)
        or public.current_user_advertising_campaign_role_id() = any(c.viewer_role_ids)
        or public.current_user_has_role_permission_entry('advertising_campaigns','view','all_campaigns',false)
      )
  )
$$;

create or replace function public.can_edit_advertising_campaign(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_view_advertising_campaign(p_campaign_id)
     and public.current_user_has_role_permission_entry('advertising_campaigns','edit',null,true)
$$;

create or replace function public.can_collaborate_advertising_campaign_tool(p_tool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.advertising_campaign_tools t
    where t.id = p_tool_id
      and t.org_id = public.current_org_id()
      and public.current_org_has_plan_module('advertising_campaigns', false)
      and public.current_user_has_role_permission_entry('advertising_campaigns','view',null,true)
      and (
        public.can_view_advertising_campaign(t.campaign_id)
        or auth.uid() = any(t.collaborator_user_ids)
        or public.current_user_advertising_campaign_role_id() = any(t.collaborator_role_ids)
      )
  )
$$;

create or replace function public.update_advertising_campaign_collaboration_tool(
  p_tool_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_tool public.advertising_campaign_tools%rowtype; v_patch jsonb:=coalesce(p_patch,'{}'::jsonb);
        v_config_patch jsonb:='{}'::jsonb; v_status text; v_actual_start timestamptz; v_actual_end timestamptz;
begin
  if auth.uid() is null or public.current_org_id() is null
     or not public.current_org_has_plan_module('advertising_campaigns',false)
     or not public.current_user_has_role_permission_entry('advertising_campaigns','view',null,true)
     or not public.can_collaborate_advertising_campaign_tool(p_tool_id) then
    raise exception 'دسترسی همکاری روی این ابزار را ندارید.' using errcode='42501';
  end if;
  select * into v_tool from public.advertising_campaign_tools
  where id=p_tool_id and org_id=public.current_org_id();
  if v_tool.id is null then raise exception 'ابزار کمپین پیدا نشد.' using errcode='P0002'; end if;

  if v_patch ? 'status' then
    v_status:=lower(btrim(coalesce(v_patch->>'status','')));
    if v_status not in ('ready','running','paused','completed','failed') then
      raise exception 'وضعیت ابزار برای همکاری مجاز نیست.' using errcode='22023';
    end if;
  else v_status:=v_tool.status; end if;
  begin
    v_actual_start:=case when v_patch ? 'actual_start_at' then nullif(v_patch->>'actual_start_at','')::timestamptz else v_tool.actual_start_at end;
    v_actual_end:=case when v_patch ? 'actual_end_at' then nullif(v_patch->>'actual_end_at','')::timestamptz else v_tool.actual_end_at end;
  exception when invalid_datetime_format then
    raise exception 'زمان واقعی ابزار معتبر نیست.' using errcode='22007';
  end;
  if v_actual_start is not null and v_actual_end is not null and v_actual_end < v_actual_start then
    raise exception 'پایان واقعی نمی‌تواند قبل از شروع واقعی باشد.' using errcode='23514';
  end if;
  if jsonb_typeof(v_patch->'config')='object' then
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_config_patch
    from jsonb_each(v_patch->'config')
    where key in ('result_notes','result_metrics','result_attachments','actual_reach','actual_impressions','actual_clicks','actual_responses','completion_percentage');
  end if;

  update public.advertising_campaign_tools set
    status=v_status,
    actual_cost=case when v_patch ? 'actual_cost' then greatest(coalesce((v_patch->>'actual_cost')::numeric,0),0) else actual_cost end,
    actual_leads=case when v_patch ? 'actual_leads' then greatest(coalesce((v_patch->>'actual_leads')::integer,0),0) else actual_leads end,
    actual_customers=case when v_patch ? 'actual_customers' then greatest(coalesce((v_patch->>'actual_customers')::integer,0),0) else actual_customers end,
    actual_start_at=v_actual_start,actual_end_at=v_actual_end,
    result_summary=case when v_patch ? 'result_summary' then left(nullif(btrim(v_patch->>'result_summary'),''),10000) else result_summary end,
    config=config || v_config_patch,updated_by=auth.uid()
  where id=v_tool.id and org_id=v_tool.org_id
  returning * into v_tool;
  return jsonb_build_object(
    'id',v_tool.id,'campaign_id',v_tool.campaign_id,'tool_type',v_tool.tool_type,
    'status',v_tool.status,'actual_cost',v_tool.actual_cost,'actual_leads',v_tool.actual_leads,
    'actual_customers',v_tool.actual_customers,'actual_start_at',v_tool.actual_start_at,
    'actual_end_at',v_tool.actual_end_at,'result_summary',v_tool.result_summary,
    'config',v_tool.config,'updated_at',v_tool.updated_at
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'مقادیر واقعی ابزار معتبر نیست.' using errcode='22023';
end;
$$;

revoke all on function public.current_user_advertising_campaign_role_id() from public, anon;
revoke all on function public.can_view_advertising_campaign(uuid) from public, anon;
revoke all on function public.can_edit_advertising_campaign(uuid) from public, anon;
revoke all on function public.can_collaborate_advertising_campaign_tool(uuid) from public, anon;
revoke all on function public.update_advertising_campaign_collaboration_tool(uuid,jsonb) from public,anon;
grant execute on function public.current_user_advertising_campaign_role_id() to authenticated;
grant execute on function public.can_view_advertising_campaign(uuid) to authenticated;
grant execute on function public.can_edit_advertising_campaign(uuid) to authenticated;
grant execute on function public.can_collaborate_advertising_campaign_tool(uuid) to authenticated;
grant execute on function public.update_advertising_campaign_collaboration_tool(uuid,jsonb) to authenticated;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'advertising_campaigns','advertising_campaign_details','advertising_campaign_tools',
    'advertising_campaign_content_items','advertising_campaign_loyalty_rules',
    'advertising_campaign_discount_codes','advertising_campaign_audience_rules',
    'advertising_campaign_imports','advertising_campaign_import_rows','advertising_campaign_dispatches',
    'advertising_campaign_recipients','advertising_campaign_responses','campaign_contact_suppressions'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from public, anon, authenticated', v_table);
    execute format('grant all on public.%I to service_role', v_table);
  end loop;
end $$;

grant select, insert, update, delete on public.advertising_campaigns to authenticated;
grant select, insert, update, delete on public.advertising_campaign_details to authenticated;
grant select, insert, update, delete on public.advertising_campaign_tools to authenticated;
grant select, insert, update, delete on public.advertising_campaign_content_items to authenticated;
grant select, insert, delete on public.advertising_campaign_loyalty_rules to authenticated;
grant select, insert, delete on public.advertising_campaign_discount_codes to authenticated;
grant select, insert, update, delete on public.advertising_campaign_audience_rules to authenticated;
grant select, insert on public.advertising_campaign_imports to authenticated;
grant select on public.advertising_campaign_import_rows to authenticated;
grant select on public.advertising_campaign_dispatches to authenticated;
grant select on public.advertising_campaign_recipients to authenticated;
grant select on public.advertising_campaign_responses to authenticated;
grant select on public.campaign_contact_suppressions to authenticated;

drop policy if exists advertising_campaigns_select on public.advertising_campaigns;
create policy advertising_campaigns_select on public.advertising_campaigns for select to authenticated
using (org_id = public.current_org_id() and public.can_view_advertising_campaign(id));
drop policy if exists advertising_campaigns_insert on public.advertising_campaigns;
create policy advertising_campaigns_insert on public.advertising_campaigns for insert to authenticated
with check (
  org_id = public.current_org_id()
  and public.current_org_has_plan_module('advertising_campaigns', false)
  and public.current_user_has_role_permission_entry('advertising_campaigns','create',null,true)
  and created_by = auth.uid()
);
drop policy if exists advertising_campaigns_update on public.advertising_campaigns;
create policy advertising_campaigns_update on public.advertising_campaigns for update to authenticated
using (org_id = public.current_org_id() and public.can_edit_advertising_campaign(id))
with check (org_id = public.current_org_id() and public.can_edit_advertising_campaign(id));
drop policy if exists advertising_campaigns_delete on public.advertising_campaigns;
create policy advertising_campaigns_delete on public.advertising_campaigns for delete to authenticated
using (
  org_id = public.current_org_id() and public.can_edit_advertising_campaign(id)
  and public.current_user_has_role_permission_entry('advertising_campaigns','delete',null,true)
);

-- Full-viewer child records.
do $$
declare v_table text; v_parent_col text;
begin
  foreach v_table in array array[
    'advertising_campaign_details','advertising_campaign_loyalty_rules','advertising_campaign_discount_codes',
    'advertising_campaign_audience_rules','advertising_campaign_imports','advertising_campaign_import_rows','advertising_campaign_dispatches',
    'advertising_campaign_recipients','advertising_campaign_responses'
  ] loop
    v_parent_col := case when v_table = 'advertising_campaign_details' then 'campaign_id' else 'campaign_id' end;
    execute format('drop policy if exists %I on public.%I', v_table || '_full_access', v_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (org_id = public.current_org_id() and public.can_view_advertising_campaign(%I)) with check (org_id = public.current_org_id() and public.can_edit_advertising_campaign(%I))',
      v_table || '_full_access', v_table, v_parent_col, v_parent_col
    );
  end loop;
end $$;

drop policy if exists advertising_campaign_tools_select on public.advertising_campaign_tools;
create policy advertising_campaign_tools_select on public.advertising_campaign_tools for select to authenticated
using (org_id = public.current_org_id() and public.can_view_advertising_campaign(campaign_id));
drop policy if exists advertising_campaign_tools_write on public.advertising_campaign_tools;
create policy advertising_campaign_tools_write on public.advertising_campaign_tools for all to authenticated
using (org_id = public.current_org_id() and public.can_edit_advertising_campaign(campaign_id))
with check (org_id = public.current_org_id() and public.can_edit_advertising_campaign(campaign_id));

drop policy if exists advertising_campaign_content_items_select on public.advertising_campaign_content_items;
create policy advertising_campaign_content_items_select on public.advertising_campaign_content_items for select to authenticated
using (org_id = public.current_org_id() and public.can_collaborate_advertising_campaign_tool(tool_id));
drop policy if exists advertising_campaign_content_items_write on public.advertising_campaign_content_items;
create policy advertising_campaign_content_items_write on public.advertising_campaign_content_items for all to authenticated
using (org_id = public.current_org_id() and public.can_collaborate_advertising_campaign_tool(tool_id))
with check (org_id = public.current_org_id() and public.can_collaborate_advertising_campaign_tool(tool_id));

drop policy if exists campaign_contact_suppressions_select on public.campaign_contact_suppressions;
create policy campaign_contact_suppressions_select on public.campaign_contact_suppressions for select to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_has_role_permission_entry('advertising_campaigns','view','manage_suppressions',false)
);
drop policy if exists campaign_contact_suppressions_write on public.campaign_contact_suppressions;
create policy campaign_contact_suppressions_write on public.campaign_contact_suppressions for all to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_has_role_permission_entry('advertising_campaigns','edit','manage_suppressions',false)
)
with check (
  org_id = public.current_org_id()
  and public.current_user_has_role_permission_entry('advertising_campaigns','edit','manage_suppressions',false)
);

-- Realtime is used only with tenant/campaign/tool filters in clients. Publication
-- membership is made idempotent for installations where it already exists.
do $$
declare v_table text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach v_table in array array[
      'advertising_campaigns','advertising_campaign_tools','advertising_campaign_content_items',
      'advertising_campaign_imports','advertising_campaign_dispatches',
      'advertising_campaign_recipients','advertising_campaign_responses'
    ] loop
      if not exists(
        select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename=v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I',v_table);
      end if;
    end loop;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
