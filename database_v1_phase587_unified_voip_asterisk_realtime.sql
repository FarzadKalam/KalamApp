-- KalamApp V1 - Phase 587
-- Unified multi-provider VoIP architecture, Asterisk PJSIP Realtime tables,
-- per-tenant SIP trunks & WebRTC endpoints, and voip_webphone plan licensing.

begin;

-- 1. Extend SaaS offering catalog & plan table bindings with voip_webphone.
create or replace function public.saas_offering_keys()
returns jsonb language sql immutable set search_path=public as $$
 select '{"features": ["ai_chat", "ai_knowledge", "ai_knowledge_limited", "ai_document_analysis", "ai_web_search", "ai_voice_input", "ai_voice_output", "ai_image_generation", "ai_video_generation", "ai_deep_reasoning", "ai_legal_assistant", "ai_voip_auto_reply", "ai_staff_bot", "ai_background_agents", "taxpayer_system", "internal_realtime_notifications", "organization_email", "managed_organization_email", "webhooks", "mbti_ai_analysis", "support_tickets", "api_access", "wordpress_connection", "advanced_reports", "map_view", "multi_lane_processes", "content_calendar", "billboard_status_management", "white_label", "custom_domain", "own_payment_gateway", "online_invoice_payment", "online_catalog", "retail_sales_invoice", "reservations", "qr_scan", "instagram_inbox", "campaign_sms", "campaign_email", "campaign_bot_group", "campaign_bot_private", "campaign_instagram_post", "campaign_voice_call", "voip_webphone", "saas_account_billing", "ai_credit_topup", "sms_credit_topup", "extra_users_purchase", "business_model_canvas", "telegram_bot", "bale_bot", "rubika_bot", "internal_chat", "organization_chart", "advanced_commission", "performance_payroll_kpi", "goals", "ai_agent:lead_orchestrator", "ai_agent:sales_leads", "ai_agent:purchase_supply", "ai_agent:customer_response", "ai_agent:hr_manager", "ai_agent:reservation", "ai_agent:project_process", "ai_agent:instagrammer", "ai_agent:system_guide"], "modules": ["customers", "marketing_leads", "invoices", "sales_return_invoices", "personas", "billboard_status_changes", "price_lists", "billboards", "purchase_return_invoices", "suppliers", "purchase_invoices", "expense_documents", "assets", "products", "warehouses", "shelves", "stock_transfers", "product_bundles", "production_boms", "production_orders", "production_group_orders", "projects", "tasks", "content_calendars", "process_templates", "process_runs", "goals", "reservations", "reservation_resources", "mbti_assessments", "employees", "job_descriptions", "employee_bonus_requests", "employee_penalty_requests", "attendance_logs", "work_schedules", "leave_requests", "overtime_requests", "mission_requests", "employee_advances", "payroll_slips", "employee_contracts", "recruitment_applicants", "chart_of_accounts", "journal_entries", "cash_boxes", "bank_accounts", "petty_funds", "cheques", "barters", "cash_bank_operations", "accounting_event_rules", "cost_centers", "fiscal_years", "secretariat_documents", "advertising_campaigns", "web_forms", "surveys", "calculation_formulas", "delivery_forms", "automation_execution_reports", "sms_delivery_reports", "voip_call_reports", "counterparty_bot_groups", "instructions", "email_delivery_reports", "instagram_conversations", "instagram_interaction_events", "advertising_campaign_tools", "advertising_campaign_responses", "chat_groups", "organization_chart"], "moduleParents": {"sales_return_invoices": "invoices", "purchase_return_invoices": "purchase_invoices", "personas": "marketing_leads", "billboard_status_changes": "billboards", "production_group_orders": "production_orders", "advertising_campaign_tools": "advertising_campaigns", "advertising_campaign_responses": "advertising_campaigns", "mbti_assessments": "employees"}, "moduleFeatures": {"reservations": "reservations", "reservation_resources": "reservations", "email_delivery_reports": "organization_email", "instagram_conversations": "instagram_inbox", "instagram_interaction_events": "instagram_inbox"}}'::jsonb;
$$;
revoke all on function public.saas_offering_keys() from public,anon,authenticated;

create or replace function public.saas_plan_feature_table_bindings()
returns jsonb language sql immutable set search_path=public as $$ select '{"report_definitions": "advanced_reports", "report_widgets": "advanced_reports", "report_data_sources": "advanced_reports", "goals": "goals", "goal_contributions": "goals", "goal_milestone_events": "goals", "commission_rules": "advanced_commission", "commission_drafts": "advanced_commission", "commission_entries": "advanced_commission", "activity_performance_rules": "performance_payroll_kpi", "chat_groups": "internal_chat", "voip_sip_endpoints": "voip_webphone", "voip_sip_trunks": "voip_webphone"}'::jsonb; $$;
revoke all on function public.saas_plan_feature_table_bindings() from public,anon,authenticated;

update public.saas_plans
set enabled_features = coalesce(enabled_features, '{}'::jsonb) || '{"voip_webphone": true}'::jsonb
where is_demo_default or lower(code) in ('public_demo_full', 'cloud_growth', 'cloud_enterprise');

update public.saas_plans
set enabled_features = '{"voip_webphone": false}'::jsonb || coalesce(enabled_features, '{}'::jsonb)
where not (coalesce(enabled_features, '{}'::jsonb) ? 'voip_webphone');

-- 2. Extend profiles dial mode check constraint with webphone_webrtc.
alter table if exists public.profiles
  drop constraint if exists profiles_voip_dial_mode_check;

alter table if exists public.profiles
  add constraint profiles_voip_dial_mode_check
  check (voip_dial_mode in ('webphone_webrtc', 'telefonchy_smartcall', 'sip_link', 'tel_link'));

-- 3. Multi-tenant SIP trunks (supports Telefonchy, Simotel, Novatel, AloVoIP, Issabel, DaftareShoma, FCP trunks).
create table if not exists public.voip_sip_trunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  provider text not null default 'sip_trunk',
  title text not null default 'ترانک اصلی VoIP',
  pjsip_trunk_id text,
  sip_host text,
  sip_port integer not null default 5060,
  transport text not null default 'udp',
  auth_type text not null default 'user_pass',
  sip_username text,
  sip_secret text,
  outbound_caller_id text,
  did_numbers text[] not null default '{}'::text[],
  api_base_url text,
  api_token text,
  webhook_secret text,
  extra_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_voip_sip_trunks_provider check (
    provider in (
      'telefonchy',
      'simotel',
      'novatel',
      'alovoip',
      'issabel',
      'daftareshoma',
      'asiatech',
      'shatel',
      'pishgaman',
      'respina',
      'tci',
      'sip_trunk',
      'kalamapp_cloud_pbx'
    )
  ),
  constraint chk_voip_sip_trunks_transport check (transport in ('udp', 'tcp', 'tls', 'wss')),
  constraint chk_voip_sip_trunks_auth_type check (auth_type in ('user_pass', 'ip_based', 'register')),
  constraint chk_voip_sip_trunks_port check (sip_port between 1 and 65535)
);

create index if not exists idx_voip_sip_trunks_org_active
  on public.voip_sip_trunks(org_id, is_active, is_default desc);

create unique index if not exists idx_voip_sip_trunks_pjsip_id
  on public.voip_sip_trunks(pjsip_trunk_id)
  where pjsip_trunk_id is not null;

create unique index if not exists idx_voip_sip_trunks_org_default
  on public.voip_sip_trunks(org_id)
  where is_default = true and is_active = true;

-- 4. Multi-tenant operator / AI SIP endpoints (WebRTC & softphone).
create table if not exists public.voip_sip_endpoints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  assignee_profile_id uuid references public.profiles(id) on delete set null,
  trunk_id uuid references public.voip_sip_trunks(id) on delete set null,
  extension text not null,
  display_name text,
  endpoint_kind text not null default 'operator',
  pjsip_id text not null,
  sip_secret text not null,
  webrtc_enabled boolean not null default true,
  transport text not null default 'wss',
  max_contacts integer not null default 3,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_voip_sip_endpoints_kind check (endpoint_kind in ('operator', 'ai_agent', 'queue_virtual')),
  constraint chk_voip_sip_endpoints_transport check (transport in ('wss', 'udp', 'tcp', 'tls')),
  constraint chk_voip_sip_endpoints_max_contacts check (max_contacts between 1 and 20)
);

create unique index if not exists idx_voip_sip_endpoints_pjsip_id
  on public.voip_sip_endpoints(pjsip_id);

create unique index if not exists idx_voip_sip_endpoints_org_extension_active
  on public.voip_sip_endpoints(org_id, extension)
  where is_active = true;

create index if not exists idx_voip_sip_endpoints_org_profile
  on public.voip_sip_endpoints(org_id, assignee_profile_id)
  where assignee_profile_id is not null;

-- 5. Asterisk PJSIP Realtime backend tables (strictly inaccessible to anon/authenticated).
create table if not exists public.ps_aors (
  id text primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  contact text,
  default_expiration integer default 600,
  mailboxes text,
  max_contacts integer default 3,
  minimum_expiration integer default 60,
  remove_existing text default 'yes',
  qualify_frequency integer default 30,
  authenticate_qualify text default 'no',
  maximum_expiration integer default 7200,
  outbound_proxy text,
  support_path text default 'yes'
);

create table if not exists public.ps_auths (
  id text primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  auth_type text not null default 'userpass',
  nonce_lifetime integer default 32,
  md5_cred text,
  password text,
  realm text,
  username text
);

create table if not exists public.ps_endpoints (
  id text primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  transport text default 'transport-wss',
  aors text,
  auth text,
  outbound_auth text,
  context text not null default 'from-internal',
  disallow text default 'all',
  allow text default 'opus,alaw,ulaw',
  direct_media text default 'no',
  force_rport text default 'yes',
  ice_support text default 'yes',
  mailboxes text,
  moh_suggest text default 'default',
  rewrite_contact text default 'yes',
  rtp_symmetric text default 'yes',
  send_diversion text default 'yes',
  send_pai text default 'yes',
  webrtc text default 'yes',
  dtls_auto_generate_cert text default 'yes',
  dtls_verify text default 'fingerprint',
  dtls_setup text default 'actpass',
  media_encryption text default 'dtls',
  use_avpf text default 'yes',
  media_use_received_transport text default 'yes',
  rtcp_mux text default 'yes',
  callerid text,
  from_user text,
  from_domain text,
  outbound_proxy text,
  identify_by text default 'username,auth_username'
);

create table if not exists public.ps_registrations (
  id text primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  transport text default 'transport-udp',
  outbound_auth text,
  server_uri text,
  client_uri text,
  contact_user text,
  retry_interval integer default 60,
  forbidden_retry_interval integer default 600,
  expiration integer default 3600,
  line text default 'yes',
  endpoint text
);

create table if not exists public.ps_identify (
  id text primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  endpoint text not null,
  match text not null
);

create table if not exists public.ps_contacts (
  id text primary key,
  uri text,
  expiration_time bigint,
  qualify_frequency integer,
  outbound_proxy text,
  path text,
  user_agent text,
  via_addr text,
  via_port integer,
  call_id text,
  endpoint text,
  prune_on_boot text
);

create index if not exists idx_ps_endpoints_org on public.ps_endpoints(org_id);
create index if not exists idx_ps_auths_org on public.ps_auths(org_id);
create index if not exists idx_ps_aors_org on public.ps_aors(org_id);
create index if not exists idx_ps_registrations_org on public.ps_registrations(org_id);
create index if not exists idx_ps_identify_org on public.ps_identify(org_id);

revoke all on public.ps_endpoints, public.ps_auths, public.ps_aors, public.ps_registrations, public.ps_identify, public.ps_contacts from public, anon, authenticated;
grant select, insert, update, delete on public.ps_endpoints, public.ps_auths, public.ps_aors, public.ps_registrations, public.ps_identify, public.ps_contacts to service_role;

-- 6. Deterministic tenant-isolated PJSIP Realtime sync helpers & triggers.
create or replace function public.voip_org_namespace(p_org_id uuid)
returns text
language sql
immutable
set search_path = public
as $$
  select 'k_' || left(replace(coalesce(p_org_id, '00000000-0000-0000-0000-000000000000'::uuid)::text, '-', ''), 12);
$$;
revoke all on function public.voip_org_namespace(uuid) from public, anon, authenticated;

create or replace function public.voip_sync_endpoint_realtime()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ns text;
  v_ext_clean text;
  v_pjsip_id text;
  v_context text;
  v_transport text;
  v_callerid text;
begin
  if tg_op = 'DELETE' then
    delete from public.ps_endpoints where id = old.pjsip_id;
    delete from public.ps_auths where id = old.pjsip_id;
    delete from public.ps_aors where id = old.pjsip_id;
    return old;
  end if;

  v_ns := public.voip_org_namespace(new.org_id);
  v_ext_clean := regexp_replace(coalesce(new.extension, ''), '[^a-zA-Z0-9_]', '', 'g');
  if v_ext_clean = '' then
    raise exception 'شماره داخلی SIP معتبر نیست.';
  end if;

  if nullif(trim(coalesce(new.sip_secret, '')), '') is null then
    new.sip_secret := encode(gen_random_bytes(18), 'base64');
  end if;

  v_pjsip_id := v_ns || '_' || v_ext_clean;
  if tg_op = 'UPDATE' and old.pjsip_id is distinct from v_pjsip_id then
    delete from public.ps_endpoints where id = old.pjsip_id;
    delete from public.ps_auths where id = old.pjsip_id;
    delete from public.ps_aors where id = old.pjsip_id;
  end if;

  new.pjsip_id := v_pjsip_id;
  v_context := 'kalam-org-router';
  v_transport := case coalesce(new.transport, 'wss')
    when 'wss' then 'transport-wss'
    when 'tls' then 'transport-tls'
    when 'tcp' then 'transport-tcp'
    else 'transport-udp'
  end;
  v_callerid := format('%s <%s>', coalesce(nullif(trim(new.display_name), ''), v_ext_clean), v_ext_clean);

  if not coalesce(new.is_active, true) then
    delete from public.ps_endpoints where id = v_pjsip_id;
    delete from public.ps_auths where id = v_pjsip_id;
    delete from public.ps_aors where id = v_pjsip_id;
    return new;
  end if;

  insert into public.ps_aors (id, org_id, max_contacts, remove_existing, qualify_frequency)
  values (v_pjsip_id, new.org_id, coalesce(new.max_contacts, 3), 'yes', 30)
  on conflict (id) do update set
    org_id = excluded.org_id,
    max_contacts = excluded.max_contacts,
    remove_existing = excluded.remove_existing,
    qualify_frequency = excluded.qualify_frequency;

  insert into public.ps_auths (id, org_id, auth_type, username, password)
  values (v_pjsip_id, new.org_id, 'userpass', v_pjsip_id, new.sip_secret)
  on conflict (id) do update set
    org_id = excluded.org_id,
    auth_type = excluded.auth_type,
    username = excluded.username,
    password = excluded.password;

  insert into public.ps_endpoints (
    id, org_id, transport, aors, auth, context, disallow, allow,
    direct_media, force_rport, ice_support, rewrite_contact, rtp_symmetric,
    webrtc, dtls_auto_generate_cert, dtls_verify, dtls_setup,
    media_encryption, use_avpf, media_use_received_transport, rtcp_mux,
    callerid, identify_by
  )
  values (
    v_pjsip_id,
    new.org_id,
    v_transport,
    v_pjsip_id,
    v_pjsip_id,
    v_context,
    'all',
    case when coalesce(new.webrtc_enabled, true) then 'opus,alaw,ulaw' else 'alaw,ulaw' end,
    'no',
    'yes',
    case when coalesce(new.webrtc_enabled, true) then 'yes' else 'no' end,
    'yes',
    'yes',
    case when coalesce(new.webrtc_enabled, true) then 'yes' else 'no' end,
    case when coalesce(new.webrtc_enabled, true) then 'yes' else 'no' end,
    'fingerprint',
    'actpass',
    case when coalesce(new.webrtc_enabled, true) then 'dtls' else 'no' end,
    case when coalesce(new.webrtc_enabled, true) then 'yes' else 'no' end,
    case when coalesce(new.webrtc_enabled, true) then 'yes' else 'no' end,
    case when coalesce(new.webrtc_enabled, true) then 'yes' else 'no' end,
    v_callerid,
    'username,auth_username'
  )
  on conflict (id) do update set
    org_id = excluded.org_id,
    transport = excluded.transport,
    aors = excluded.aors,
    auth = excluded.auth,
    context = excluded.context,
    allow = excluded.allow,
    ice_support = excluded.ice_support,
    webrtc = excluded.webrtc,
    dtls_auto_generate_cert = excluded.dtls_auto_generate_cert,
    media_encryption = excluded.media_encryption,
    use_avpf = excluded.use_avpf,
    media_use_received_transport = excluded.media_use_received_transport,
    rtcp_mux = excluded.rtcp_mux,
    callerid = excluded.callerid;

  return new;
end;
$$;
revoke all on function public.voip_sync_endpoint_realtime() from public, anon, authenticated;

drop trigger if exists trg_voip_sip_endpoints_sync on public.voip_sip_endpoints;
create trigger trg_voip_sip_endpoints_sync
  before insert or update or delete on public.voip_sip_endpoints
  for each row execute function public.voip_sync_endpoint_realtime();

create or replace function public.voip_sync_trunk_realtime()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ns text;
  v_trunk_id text;
  v_transport text;
  v_host text;
  v_port integer;
  v_server_uri text;
  v_client_uri text;
  v_contact_uri text;
begin
  if tg_op = 'DELETE' then
    if old.pjsip_trunk_id is not null then
      delete from public.ps_registrations where id = old.pjsip_trunk_id;
      delete from public.ps_identify where id = old.pjsip_trunk_id;
      delete from public.ps_endpoints where id = old.pjsip_trunk_id;
      delete from public.ps_auths where id = old.pjsip_trunk_id;
      delete from public.ps_aors where id = old.pjsip_trunk_id;
    end if;
    return old;
  end if;

  v_ns := public.voip_org_namespace(new.org_id);
  v_trunk_id := v_ns || '_trk_' || left(replace(new.id::text, '-', ''), 8);
  new.pjsip_trunk_id := v_trunk_id;
  v_host := nullif(trim(coalesce(new.sip_host, '')), '');
  v_port := coalesce(new.sip_port, 5060);
  v_transport := case coalesce(new.transport, 'udp')
    when 'wss' then 'transport-wss'
    when 'tls' then 'transport-tls'
    when 'tcp' then 'transport-tcp'
    else 'transport-udp'
  end;

  if not coalesce(new.is_active, true) or v_host is null then
    delete from public.ps_registrations where id = v_trunk_id;
    delete from public.ps_identify where id = v_trunk_id;
    delete from public.ps_endpoints where id = v_trunk_id;
    delete from public.ps_auths where id = v_trunk_id;
    delete from public.ps_aors where id = v_trunk_id;
    return new;
  end if;

  v_contact_uri := format('sip:%s:%s', v_host, v_port);

  insert into public.ps_aors (id, org_id, contact, max_contacts, qualify_frequency)
  values (v_trunk_id, new.org_id, v_contact_uri, 1, 60)
  on conflict (id) do update set
    org_id = excluded.org_id,
    contact = excluded.contact,
    qualify_frequency = excluded.qualify_frequency;

  if coalesce(new.auth_type, 'user_pass') <> 'ip_based' and nullif(trim(coalesce(new.sip_username, '')), '') is not null then
    insert into public.ps_auths (id, org_id, auth_type, username, password)
    values (v_trunk_id, new.org_id, 'userpass', trim(new.sip_username), coalesce(new.sip_secret, ''))
    on conflict (id) do update set
      org_id = excluded.org_id,
      username = excluded.username,
      password = excluded.password;
  else
    delete from public.ps_auths where id = v_trunk_id;
  end if;

  insert into public.ps_endpoints (
    id, org_id, transport, aors, outbound_auth, context, disallow, allow,
    direct_media, force_rport, ice_support, rewrite_contact, rtp_symmetric,
    webrtc, dtls_auto_generate_cert, media_encryption, use_avpf,
    media_use_received_transport, rtcp_mux, from_user, from_domain, identify_by
  )
  values (
    v_trunk_id,
    new.org_id,
    v_transport,
    v_trunk_id,
    case when coalesce(new.auth_type, 'user_pass') <> 'ip_based' and nullif(trim(coalesce(new.sip_username, '')), '') is not null then v_trunk_id else null end,
    'from-trunk',
    'all',
    'alaw,ulaw,opus',
    'no',
    'yes',
    'no',
    'yes',
    'yes',
    'no',
    'no',
    'no',
    'no',
    'no',
    'no',
    nullif(trim(coalesce(new.sip_username, '')), ''),
    v_host,
    'ip,username'
  )
  on conflict (id) do update set
    org_id = excluded.org_id,
    transport = excluded.transport,
    aors = excluded.aors,
    outbound_auth = excluded.outbound_auth,
    context = excluded.context,
    from_user = excluded.from_user,
    from_domain = excluded.from_domain;

  insert into public.ps_identify (id, org_id, endpoint, match)
  values (v_trunk_id, new.org_id, v_trunk_id, v_host)
  on conflict (id) do update set
    org_id = excluded.org_id,
    endpoint = excluded.endpoint,
    match = excluded.match;

  if coalesce(new.auth_type, 'user_pass') <> 'ip_based' and nullif(trim(coalesce(new.sip_username, '')), '') is not null then
    v_server_uri := format('sip:%s:%s', v_host, v_port);
    v_client_uri := format('sip:%s@%s:%s', trim(new.sip_username), v_host, v_port);
    insert into public.ps_registrations (
      id, org_id, transport, outbound_auth, server_uri, client_uri, contact_user, endpoint
    )
    values (
      v_trunk_id, new.org_id, v_transport, v_trunk_id, v_server_uri, v_client_uri, trim(new.sip_username), v_trunk_id
    )
    on conflict (id) do update set
      org_id = excluded.org_id,
      transport = excluded.transport,
      outbound_auth = excluded.outbound_auth,
      server_uri = excluded.server_uri,
      client_uri = excluded.client_uri,
      contact_user = excluded.contact_user,
      endpoint = excluded.endpoint;
  else
    delete from public.ps_registrations where id = v_trunk_id;
  end if;

  return new;
end;
$$;
revoke all on function public.voip_sync_trunk_realtime() from public, anon, authenticated;

drop trigger if exists trg_voip_sip_trunks_sync on public.voip_sip_trunks;
create trigger trg_voip_sip_trunks_sync
  before insert or update or delete on public.voip_sip_trunks
  for each row execute function public.voip_sync_trunk_realtime();

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_voip_sip_trunks_updated_at on public.voip_sip_trunks;
    create trigger trg_voip_sip_trunks_updated_at
      before update on public.voip_sip_trunks
      for each row execute function public.set_updated_at();

    drop trigger if exists trg_voip_sip_endpoints_updated_at on public.voip_sip_endpoints;
    create trigger trg_voip_sip_endpoints_updated_at
      before update on public.voip_sip_endpoints
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- 7. Strict per-org RLS + restrictive plan-feature gates on voip_sip_trunks & voip_sip_endpoints.
alter table public.voip_sip_trunks enable row level security;
alter table public.voip_sip_endpoints enable row level security;

drop policy if exists p_voip_sip_trunks_org_admin_all on public.voip_sip_trunks;
create policy p_voip_sip_trunks_org_admin_all on public.voip_sip_trunks
  for all to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_user_has_role_permission_entry('__settings_tabs', 'edit', null, true)
  )
  with check (
    org_id = public.current_org_id()
    and public.current_user_has_role_permission_entry('__settings_tabs', 'edit', null, true)
  );

drop policy if exists p_plan_feature_availability on public.voip_sip_trunks;
create policy p_plan_feature_availability on public.voip_sip_trunks
  as restrictive for all to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.current_org_has_plan_feature('voip_webphone', true))
  )
  with check (
    org_id = (select public.current_org_id())
    and (select public.current_org_has_plan_feature('voip_webphone', true))
  );

drop policy if exists p_voip_sip_endpoints_select on public.voip_sip_endpoints;
create policy p_voip_sip_endpoints_select on public.voip_sip_endpoints
  for select to authenticated
  using (
    org_id = public.current_org_id()
    and (
      assignee_profile_id = auth.uid()
      or public.current_user_has_role_permission_entry('__settings_tabs', 'view', null, true)
      or public.current_user_has_role_permission_entry('profiles', 'edit', null, true)
    )
  );

drop policy if exists p_voip_sip_endpoints_write on public.voip_sip_endpoints;
create policy p_voip_sip_endpoints_write on public.voip_sip_endpoints
  for all to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.current_user_has_role_permission_entry('__settings_tabs', 'edit', null, true)
      or public.current_user_has_role_permission_entry('profiles', 'edit', null, true)
    )
  )
  with check (
    org_id = public.current_org_id()
    and (
      public.current_user_has_role_permission_entry('__settings_tabs', 'edit', null, true)
      or public.current_user_has_role_permission_entry('profiles', 'edit', null, true)
    )
  );

drop policy if exists p_plan_feature_availability on public.voip_sip_endpoints;
create policy p_plan_feature_availability on public.voip_sip_endpoints
  as restrictive for all to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.current_org_has_plan_feature('voip_webphone', true))
  )
  with check (
    org_id = (select public.current_org_id())
    and (select public.current_org_has_plan_feature('voip_webphone', true))
  );

grant select, insert, update, delete on public.voip_sip_trunks to authenticated;
grant select, insert, update, delete on public.voip_sip_endpoints to authenticated;
grant all on public.voip_sip_trunks, public.voip_sip_endpoints to service_role;

notify pgrst, 'reload schema';

commit;
