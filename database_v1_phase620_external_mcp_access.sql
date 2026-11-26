-- KalamApp V1 - Phase 620
-- External MCP Server (ChatGPT/Codex, Gemini, Claude) OAuth 2.0 + Personal Tokens,
-- per-org/per-user authorization, and cloud_enterprise plan entitlement + homepage bullet.

begin;

-- 1. Extend SaaS offering catalog keys with mcp_access.
create or replace function public.saas_offering_keys()
returns jsonb language sql immutable set search_path=public as $$
 select '{"features": ["ai_chat", "ai_knowledge", "ai_knowledge_limited", "ai_document_analysis", "ai_web_search", "ai_voice_input", "ai_voice_output", "ai_image_generation", "ai_video_generation", "ai_deep_reasoning", "ai_legal_assistant", "ai_voip_auto_reply", "ai_staff_bot", "ai_background_agents", "mcp_access", "taxpayer_system", "internal_realtime_notifications", "organization_email", "managed_organization_email", "webhooks", "mbti_ai_analysis", "support_tickets", "api_access", "wordpress_connection", "advanced_reports", "map_view", "multi_lane_processes", "content_calendar", "billboard_status_management", "white_label", "custom_domain", "own_payment_gateway", "online_invoice_payment", "online_catalog", "retail_sales_invoice", "reservations", "qr_scan", "instagram_inbox", "campaign_sms", "campaign_email", "campaign_bot_group", "campaign_bot_private", "campaign_instagram_post", "campaign_voice_call", "voip_webphone", "saas_account_billing", "ai_credit_topup", "sms_credit_topup", "extra_users_purchase", "business_model_canvas", "telegram_bot", "bale_bot", "rubika_bot", "internal_chat", "organization_chart", "advanced_commission", "performance_payroll_kpi", "goals", "ai_agent:lead_orchestrator", "ai_agent:sales_leads", "ai_agent:purchase_supply", "ai_agent:customer_response", "ai_agent:hr_manager", "ai_agent:reservation", "ai_agent:project_process", "ai_agent:instagrammer", "ai_agent:system_guide"], "modules": ["customers", "marketing_leads", "invoices", "sales_return_invoices", "personas", "billboard_status_changes", "price_lists", "billboards", "purchase_return_invoices", "suppliers", "purchase_invoices", "expense_documents", "assets", "products", "warehouses", "shelves", "stock_transfers", "product_bundles", "production_boms", "production_orders", "production_group_orders", "projects", "tasks", "content_calendars", "process_templates", "process_runs", "goals", "reservations", "reservation_resources", "mbti_assessments", "employees", "job_descriptions", "employee_bonus_requests", "employee_penalty_requests", "attendance_logs", "work_schedules", "leave_requests", "overtime_requests", "mission_requests", "employee_advances", "payroll_slips", "employee_contracts", "recruitment_applicants", "chart_of_accounts", "journal_entries", "cash_boxes", "bank_accounts", "petty_funds", "cheques", "barters", "cash_bank_operations", "accounting_event_rules", "cost_centers", "fiscal_years", "secretariat_documents", "advertising_campaigns", "web_forms", "surveys", "calculation_formulas", "delivery_forms", "automation_execution_reports", "sms_delivery_reports", "voip_call_reports", "counterparty_bot_groups", "instructions", "email_delivery_reports", "instagram_conversations", "instagram_interaction_events", "advertising_campaign_tools", "advertising_campaign_responses", "chat_groups", "organization_chart"], "moduleParents": {"sales_return_invoices": "invoices", "purchase_return_invoices": "purchase_invoices", "personas": "marketing_leads", "billboard_status_changes": "billboards", "production_group_orders": "production_orders", "advertising_campaign_tools": "advertising_campaigns", "advertising_campaign_responses": "advertising_campaigns", "mbti_assessments": "employees"}, "moduleFeatures": {"reservations": "reservations", "reservation_resources": "reservations", "email_delivery_reports": "organization_email", "instagram_conversations": "instagram_inbox", "instagram_interaction_events": "instagram_inbox"}}'::jsonb;
$$;
revoke all on function public.saas_offering_keys() from public,anon,authenticated;

-- 2. Enable mcp_access on the 3rd sales plan (cloud_enterprise) and demo plans;
--    keep explicit false on starter/growth if unset.
update public.saas_plans
set enabled_features = coalesce(enabled_features, '{}'::jsonb) || '{"mcp_access": true}'::jsonb,
    updated_at = now()
where is_demo_default = true or lower(coalesce(code, '')) in ('public_demo_full', 'cloud_enterprise');

update public.saas_plans
set enabled_features = '{"mcp_access": false}'::jsonb || coalesce(enabled_features, '{}'::jsonb),
    updated_at = now()
where not (coalesce(enabled_features, '{}'::jsonb) ? 'mcp_access');

-- 3. Add MCP connection bullet to cloud_enterprise (3rd sales plan) and mark it featured (homepage card).
--    Preserve all existing items and keep at most 6 featured items so homepage cards stay concise.
with target_plan as (
  select id,
         case
           when jsonb_typeof(display_features) = 'array' then display_features
           else '[]'::jsonb
         end as raw_features
  from public.saas_plans
  where lower(coalesce(code, '')) = 'cloud_enterprise'
),
normalized as (
  select tp.id,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'text',
               coalesce(
                 case when jsonb_typeof(item.value) = 'string' then item.value #>> '{}' end,
                 item.value ->> 'text',
                 ''
               ),
               'featured',
               case
                 when coalesce(
                   case when jsonb_typeof(item.value) = 'string' then item.value #>> '{}' end,
                   item.value ->> 'text',
                   ''
                 ) = 'اتصال به ChatGPT، Gemini و Claude (MCP)' then true
                 when jsonb_typeof(item.value) = 'object' and (item.value ? 'featured') then coalesce((item.value ->> 'featured')::boolean, false)
                 else item.ordinality <= 5
               end
             )
             order by item.ordinality
           ) filter (
             where nullif(trim(coalesce(
               case when jsonb_typeof(item.value) = 'string' then item.value #>> '{}' end,
               item.value ->> 'text',
               ''
             )), '') is not null
           ),
           '[]'::jsonb
         ) as items
  from target_plan tp
  left join lateral jsonb_array_elements(tp.raw_features) with ordinality as item(value, ordinality) on true
  group by tp.id
),
with_mcp as (
  select n.id,
         case
           when exists (
             select 1
             from jsonb_array_elements(n.items) el
             where el ->> 'text' = 'اتصال به ChatGPT، Gemini و Claude (MCP)'
           ) then n.items
           else (
             with numbered as (
               select el.value, el.ordinality,
                      row_number() over (order by case when coalesce((el.value ->> 'featured')::boolean, false) then 0 else 1 end, el.ordinality) as feat_rank
               from jsonb_array_elements(n.items) with ordinality as el(value, ordinality)
             )
             select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'text', value ->> 'text',
                   'featured', coalesce((value ->> 'featured')::boolean, false) and feat_rank <= 5
                 )
                 order by ordinality
               ),
               '[]'::jsonb
             ) || jsonb_build_array(jsonb_build_object('text', 'اتصال به ChatGPT، Gemini و Claude (MCP)', 'featured', true))
             from numbered
           )
         end as next_display_features
  from normalized n
)
update public.saas_plans p
set display_features = w.next_display_features,
    updated_at = now()
from with_mcp w
where p.id = w.id
  and p.display_features is distinct from w.next_display_features;

-- 4. OAuth 2.0 Dynamic Clients (service-only).
create table if not exists public.mcp_oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  client_secret_hash text,
  client_name text not null default 'External MCP Client',
  redirect_uris text[] not null default '{}'::text[],
  grant_types text[] not null default array['authorization_code', 'refresh_token']::text[],
  response_types text[] not null default array['code']::text[],
  scope text not null default 'mcp:read mcp:write',
  token_endpoint_auth_method text not null default 'none',
  client_kind text not null default 'custom',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mcp_oauth_clients enable row level security;
revoke all on public.mcp_oauth_clients from public, anon, authenticated;
grant select, insert, update, delete on public.mcp_oauth_clients to service_role;

-- 5. Short-lived PKCE Authorization Codes (service-only).
create table if not exists public.mcp_oauth_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  redirect_uri text not null,
  scope text not null default 'mcp:read mcp:write',
  code_challenge text not null,
  code_challenge_method text not null default 'S256' check (code_challenge_method = 'S256'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_mcp_oauth_codes_user_org on public.mcp_oauth_codes (org_id, user_id);
create index if not exists idx_mcp_oauth_codes_expires on public.mcp_oauth_codes (expires_at);

alter table public.mcp_oauth_codes enable row level security;
revoke all on public.mcp_oauth_codes from public, anon, authenticated;
grant select, insert, update, delete on public.mcp_oauth_codes to service_role;

-- 6. OAuth Access & Refresh Tokens bound strictly to (org_id, user_id).
create table if not exists public.mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  access_token_hash text not null unique,
  refresh_token_hash text unique,
  scope text not null default 'mcp:read mcp:write',
  expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  client_label text,
  created_at timestamptz not null default now()
);

create index if not exists idx_mcp_oauth_tokens_org_user on public.mcp_oauth_tokens (org_id, user_id) where revoked_at is null;
create index if not exists idx_mcp_oauth_tokens_expires on public.mcp_oauth_tokens (expires_at);

alter table public.mcp_oauth_tokens enable row level security;
revoke all on public.mcp_oauth_tokens from public, anon, authenticated;
grant select, update on public.mcp_oauth_tokens to authenticated;
grant select, insert, update, delete on public.mcp_oauth_tokens to service_role;

drop policy if exists p_mcp_oauth_tokens_own_select on public.mcp_oauth_tokens;
create policy p_mcp_oauth_tokens_own_select on public.mcp_oauth_tokens
  for select to authenticated
  using (
    org_id = public.current_org_id()
    and (user_id = auth.uid() or public.current_user_can_manage_org_integrations(false))
  );

drop policy if exists p_mcp_oauth_tokens_own_update on public.mcp_oauth_tokens;
create policy p_mcp_oauth_tokens_own_update on public.mcp_oauth_tokens
  for update to authenticated
  using (
    org_id = public.current_org_id()
    and (user_id = auth.uid() or public.current_user_can_manage_org_integrations(true))
  )
  with check (
    org_id = public.current_org_id()
    and (user_id = auth.uid() or public.current_user_can_manage_org_integrations(true))
  );

-- 7. Personal User MCP Bearer Tokens (for Codex CLI / Gemini CLI / Claude Code).
--    Strictly bound to (org_id, user_id) so external AI inherits exact user + org permissions.
create table if not exists public.mcp_user_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  token_prefix text not null,
  token_hash text not null unique,
  client_hint text not null default 'codex' check (client_hint in ('codex', 'chatgpt', 'gemini', 'claude', 'custom')),
  scopes text[] not null default array['mcp:read', 'mcp:write']::text[],
  is_active boolean not null default true,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mcp_user_tokens_org_user on public.mcp_user_tokens (org_id, user_id) where is_active = true and revoked_at is null;

alter table public.mcp_user_tokens enable row level security;
revoke all on public.mcp_user_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.mcp_user_tokens to authenticated;
grant select, insert, update, delete on public.mcp_user_tokens to service_role;

drop policy if exists p_mcp_user_tokens_select on public.mcp_user_tokens;
create policy p_mcp_user_tokens_select on public.mcp_user_tokens
  for select to authenticated
  using (
    org_id = public.current_org_id()
    and (user_id = auth.uid() or public.current_user_can_manage_org_integrations(false))
  );

drop policy if exists p_mcp_user_tokens_insert on public.mcp_user_tokens;
create policy p_mcp_user_tokens_insert on public.mcp_user_tokens
  for insert to authenticated
  with check (
    org_id = public.current_org_id()
    and user_id = auth.uid()
    and public.current_org_has_plan_feature('mcp_access', false)
  );

drop policy if exists p_mcp_user_tokens_update on public.mcp_user_tokens;
create policy p_mcp_user_tokens_update on public.mcp_user_tokens
  for update to authenticated
  using (
    org_id = public.current_org_id()
    and (user_id = auth.uid() or public.current_user_can_manage_org_integrations(true))
  )
  with check (
    org_id = public.current_org_id()
    and (user_id = auth.uid() or public.current_user_can_manage_org_integrations(true))
  );

drop policy if exists p_mcp_user_tokens_delete on public.mcp_user_tokens;
create policy p_mcp_user_tokens_delete on public.mcp_user_tokens
  for delete to authenticated
  using (
    org_id = public.current_org_id()
    and (user_id = auth.uid() or public.current_user_can_manage_org_integrations(true))
  );

do $$ begin
  if to_regprocedure('public.refresh_saas_sales_catalog()') is not null
     and to_regprocedure('public.support_provider_org_id()') is not null
     and public.support_provider_org_id() is not null then
    perform public.refresh_saas_sales_catalog();
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
