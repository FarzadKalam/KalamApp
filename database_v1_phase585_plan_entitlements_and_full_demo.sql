-- Phase 585: unified entitlements, full 15-day demos and wallet warnings.
-- Catalog snapshot generated from utils/saasOfferingCatalog.ts; checked in CI.
begin;
create or replace function public.saas_offering_keys()
returns jsonb language sql immutable set search_path=public as $$
 select '{"features": ["ai_chat", "ai_knowledge", "ai_knowledge_limited", "ai_document_analysis", "ai_web_search", "ai_voice_input", "ai_voice_output", "ai_image_generation", "ai_video_generation", "ai_deep_reasoning", "ai_legal_assistant", "ai_voip_auto_reply", "ai_staff_bot", "ai_background_agents", "taxpayer_system", "internal_realtime_notifications", "organization_email", "managed_organization_email", "webhooks", "mbti_ai_analysis", "support_tickets", "api_access", "wordpress_connection", "advanced_reports", "map_view", "multi_lane_processes", "content_calendar", "billboard_status_management", "white_label", "custom_domain", "own_payment_gateway", "online_invoice_payment", "online_catalog", "retail_sales_invoice", "reservations", "qr_scan", "instagram_inbox", "campaign_sms", "campaign_email", "campaign_bot_group", "campaign_bot_private", "campaign_instagram_post", "campaign_voice_call", "saas_account_billing", "ai_credit_topup", "sms_credit_topup", "extra_users_purchase", "business_model_canvas", "bale_bot", "rubika_bot", "internal_chat", "organization_chart", "advanced_commission", "performance_payroll_kpi", "goals", "ai_agent:lead_orchestrator", "ai_agent:sales_leads", "ai_agent:purchase_supply", "ai_agent:customer_response", "ai_agent:hr_manager", "ai_agent:reservation", "ai_agent:project_process", "ai_agent:instagrammer", "ai_agent:system_guide"], "modules": ["customers", "marketing_leads", "invoices", "price_lists", "billboards", "suppliers", "purchase_invoices", "expense_documents", "assets", "products", "warehouses", "shelves", "stock_transfers", "product_bundles", "production_boms", "production_orders", "projects", "tasks", "content_calendars", "process_templates", "process_runs", "goals", "employees", "job_descriptions", "employee_bonus_requests", "employee_penalty_requests", "attendance_logs", "work_schedules", "leave_requests", "overtime_requests", "mission_requests", "employee_advances", "payroll_slips", "employee_contracts", "recruitment_applicants", "chart_of_accounts", "journal_entries", "cash_boxes", "bank_accounts", "petty_funds", "cheques", "barters", "cash_bank_operations", "accounting_event_rules", "cost_centers", "fiscal_years", "secretariat_documents", "advertising_campaigns", "web_forms", "surveys", "calculation_formulas", "delivery_forms", "automation_execution_reports", "sms_delivery_reports", "voip_call_reports", "counterparty_bot_groups", "chat_groups", "organization_chart"]}'::jsonb;
$$;
revoke all on function public.saas_offering_keys() from public,anon,authenticated;

-- Canonical service-only snapshot. Purchasing an add-on, disabling it and an
-- organization override have the same precedence for AI and other integrations.
create or replace function public.get_org_plan_access_context(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
 s public.saas_org_settings%rowtype; p public.saas_plans%rowtype;
 f jsonb := '{}'::jsonb; m jsonb := '{}'::jsonb; inherited_f jsonb; inherited_m jsonb;
 e record; internal_org boolean; available boolean; local_policy record;
begin
 if p_org_id is null then return jsonb_build_object('available',false,'features','{}'::jsonb,'enabledModules','{}'::jsonb); end if;
 select * into s from public.saas_org_settings where org_id=p_org_id;
 internal_org := public.org_is_saas_admin(p_org_id);
 select * into p from public.saas_plans where lower(code)=lower(s.plan_code) and is_active limit 1;
 -- Keep the expiry rule explicit: paid accounts do not expire from an old trial date.
 available := (p.id is not null or internal_org) and (s.org_id is not null or internal_org)
   and coalesce(s.status,'active') not in ('suspended','failed','draft')
   and not ((coalesce(s.is_demo,false) or coalesce(s.status,'') in ('trial','demo'))
     and (s.trial_ends_at is null or s.trial_ends_at <= now()));
 if internal_org then
   select coalesce(jsonb_object_agg(value,true),'{}') into f from jsonb_array_elements_text(public.saas_offering_keys()->'features');
   select coalesce(jsonb_object_agg(value,true),'{}') into m from jsonb_array_elements_text(public.saas_offering_keys()->'modules');
 end if;
 f := f || coalesce(p.enabled_features,'{}'); m := m || coalesce(p.enabled_modules,'{}');
 for e in select item_kind,entitlement_code,bool_and(state='enabled') as enabled
   from public.saas_org_entitlements where org_id=p_org_id and item_kind in ('feature','module')
   and (expires_at is null or expires_at>now()) group by item_kind,entitlement_code loop
   if e.item_kind='feature' then f:=f||jsonb_build_object(e.entitlement_code,e.enabled);
   else m:=m||jsonb_build_object(e.entitlement_code,e.enabled); end if;
 end loop;
 inherited_f:=f; inherited_m:=m;
 f:=f||coalesce(s.feature_overrides,'{}'); m:=m||coalesce(s.module_overrides,'{}');
 -- Offline installations use their signed per-org availability contract.
 select features,modules into local_policy from public.local_deployment_runtime where org_id=p_org_id;
 if found then f:=local_policy.features; m:=local_policy.modules; inherited_f:=f; inherited_m:=m; available:=true; end if;
 -- Normalize legacy representations once, retain unknown keys for forward compatibility.
 select coalesce(jsonb_object_agg(key, coalesce(value='true'::jsonb or lower(value#>>'{}') in ('true','1','yes','on','enabled','full','limited') or value->'enabled'='true'::jsonb or value->'available'='true'::jsonb,false)),'{}') into f from jsonb_each(f);
 select coalesce(jsonb_object_agg(key, coalesce(value='true'::jsonb or lower(value#>>'{}') in ('true','1','yes','on','enabled'),false)),'{}') into m from jsonb_each(m);
 return jsonb_build_object('available',coalesce(available,false),'planCode',s.plan_code,
   'features',f,'enabledModules',m,'moduleOverrides',coalesce(s.module_overrides,'{}'),
   'featureOverrides',coalesce(s.feature_overrides,'{}'),'inheritedFeatures',inherited_f,'inheritedModules',inherited_m,
   'status',s.status,'isReadonly',coalesce(s.is_readonly,false),
   'reason',case when internal_org then 'internal_organization' when not available then 'plan_unavailable' else null end);
end; $$;
revoke all on function public.get_org_plan_access_context(uuid) from public,anon,authenticated;
grant execute on function public.get_org_plan_access_context(uuid) to service_role;

create or replace function public.admin_get_saas_org_access(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.current_user_has_saas_admin_permission() then raise exception 'permission denied' using errcode='42501'; end if;
 return public.get_org_plan_access_context(p_org_id);
end; $$;
revoke all on function public.admin_get_saas_org_access(uuid) from public,anon;
grant execute on function public.admin_get_saas_org_access(uuid) to authenticated;

-- Keep the public signatures used by existing policies and functions.
create or replace function public.cloud_org_has_plan_feature(p_org_id uuid,p_feature_key text,p_default_enabled boolean default false)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare ctx jsonb;
begin
 if p_org_id is null or nullif(trim(p_feature_key),'') is null then return false; end if;
 ctx:=public.get_org_plan_access_context(p_org_id);
 if ctx->'available' is distinct from 'true'::jsonb then return false; end if;
 return coalesce((ctx->'features'->>p_feature_key)::boolean,p_default_enabled,false);
end; $$;
create or replace function public.cloud_org_has_plan_module(p_org_id uuid,p_module_id text,p_default_enabled boolean default false)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare ctx jsonb;
begin
 if p_org_id is null or nullif(trim(p_module_id),'') is null then return false; end if;
 ctx:=public.get_org_plan_access_context(p_org_id);
 if ctx->'available' is distinct from 'true'::jsonb then return false; end if;
 return coalesce((ctx->'enabledModules'->>p_module_id)::boolean,p_default_enabled,false);
end; $$;
revoke all on function public.cloud_org_has_plan_feature(uuid,text,boolean),public.cloud_org_has_plan_module(uuid,text,boolean) from public,anon,authenticated;

-- A webhook flag is distinct from its count quota. Preserve API-enabled plans.
update public.saas_plans set enabled_features=coalesce(enabled_features,'{}')||jsonb_build_object('webhooks',coalesce(enabled_features->'api_access','false'::jsonb)) where not coalesce(enabled_features,'{}')?'webhooks';

-- Demo uses every known offering plus custom offerings already present in plans.
-- Does not change paid plans or reset any existing demo expiry/explicit override.
with features as (
 select coalesce(jsonb_object_agg(key,true),'{}') value from (
  select jsonb_array_elements_text(public.saas_offering_keys()->'features') key
  union select jsonb_object_keys(coalesce(enabled_features,'{}')) from public.saas_plans where is_active
 ) keys
), modules as (
 select coalesce(jsonb_object_agg(key,true),'{}') value from (
  select jsonb_array_elements_text(public.saas_offering_keys()->'modules') key
  union select jsonb_object_keys(coalesce(enabled_modules,'{}')) from public.saas_plans where is_active
 ) keys
)
update public.saas_plans set trial_days=15,enabled_features=features.value,enabled_modules=modules.value
from features,modules where is_demo_default or lower(code)='public_demo_full';

create or replace function public.apply_full_demo_plan_defaults()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.is_demo and (tg_op='INSERT' or old.is_demo is distinct from true) then
   select code into new.plan_code from public.saas_plans where is_active and is_demo_default order by sort_order,code limit 1;
   if new.plan_code is null then raise exception 'demo_plan_not_found'; end if;
   new.trial_ends_at:=now()+interval '15 days';
 end if;
 return new;
end; $$;
revoke all on function public.apply_full_demo_plan_defaults() from public,anon,authenticated;
drop trigger if exists trg_full_demo_plan_defaults on public.saas_org_settings;
create trigger trg_full_demo_plan_defaults before insert or update of is_demo on public.saas_org_settings for each row execute function public.apply_full_demo_plan_defaults();

create or replace function public.grant_saas_consumption_welcome_credit(p_org_id uuid,p_gift_kind text,p_plan_code text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ai numeric:=0; v_sms numeric:=0; previous_ai numeric:=0; previous_sms numeric:=0; sms_balance numeric;
begin
 if p_org_id is null or p_gift_kind not in ('demo','first_paid_plan') then return jsonb_build_object('success',false); end if;
 -- Serialize before checking the receipt, so retries/concurrent provisioning cannot double-credit.
 perform pg_advisory_xact_lock(hashtextextended(p_org_id::text,585));
 select ai_amount_irt,sms_amount_irt into previous_ai,previous_sms from public.saas_consumption_credit_gifts where org_id=p_org_id and gift_kind=p_gift_kind;
 previous_ai:=coalesce(previous_ai,0); previous_sms:=coalesce(previous_sms,0);
 if p_gift_kind='demo' then
   v_ai:=greatest(0,100000-previous_ai); v_sms:=greatest(0,100000-previous_sms);
 else
   if found then return jsonb_build_object('success',true,'already_granted',true); end if;
   case lower(coalesce(p_plan_code,'')) when 'cloud_starter' then v_ai:=120000; v_sms:=120000;
    when 'cloud_growth' then v_ai:=250000; v_sms:=250000;
    when 'cloud_enterprise' then v_ai:=500000; v_sms:=500000;
    else return jsonb_build_object('success',false,'reason','not_paid_plan'); end case;
   select coalesce(sum(ai_amount_irt),0),coalesce(sum(sms_amount_irt),0) into previous_ai,previous_sms from public.saas_consumption_credit_gifts where org_id=p_org_id;
   v_ai:=greatest(0,v_ai-previous_ai); v_sms:=greatest(0,v_sms-previous_sms);
   previous_ai:=0; previous_sms:=0;
 end if;
 if v_ai=0 and v_sms=0 then return jsonb_build_object('success',true,'already_granted',true); end if;
 insert into public.org_ai_wallets(org_id,status) values(p_org_id,'active') on conflict(org_id) do nothing;
 insert into public.org_sms_wallets(org_id,status) values(p_org_id,'active') on conflict(org_id) do nothing;
 update public.org_ai_wallets set included_quota_irt=included_quota_irt+v_ai,updated_at=now() where org_id=p_org_id;
 update public.org_sms_wallets set included_quota_irt=included_quota_irt+v_sms,updated_at=now() where org_id=p_org_id returning balance_irt into sms_balance;
 insert into public.saas_consumption_credit_gifts(org_id,gift_kind,ai_amount_irt,sms_amount_irt) values(p_org_id,p_gift_kind,previous_ai+v_ai,previous_sms+v_sms)
 on conflict(org_id,gift_kind) do update set ai_amount_irt=excluded.ai_amount_irt,sms_amount_irt=excluded.sms_amount_irt;
 if v_sms>0 then insert into public.org_sms_wallet_transactions(org_id,kind,amount_irt,balance_after_irt,description,metadata) values(p_org_id,'gift',v_sms,sms_balance,'هدیه اعتبار پیامک',jsonb_build_object('gift_kind',p_gift_kind)); end if;
 if v_ai>0 then insert into public.org_ai_credit_grants(org_id,amount_irt,reason,metadata) values(p_org_id,v_ai,'هدیه اعتبار هوش مصنوعی',jsonb_build_object('gift_kind',p_gift_kind)); end if;
 return jsonb_build_object('success',true,'ai_amount_irt',v_ai,'sms_amount_irt',v_sms);
end; $$;
revoke all on function public.grant_saas_consumption_welcome_credit(uuid,text,text) from public,anon,authenticated;
grant execute on function public.grant_saas_consumption_welcome_credit(uuid,text,text) to service_role;
-- Top up only the ungranted difference for still-active demos; never refill spent credit.
select public.grant_saas_consumption_welcome_credit(org_id,'demo',plan_code) from public.saas_org_settings
where is_demo and trial_ends_at>now() and status in ('demo','trial','active');

-- Editing integrations remains org-scoped AND plan-scoped; disabled plans cannot create tokens through direct REST.
drop policy if exists org_members_manage_api_tokens on public.org_api_tokens;
create policy org_members_manage_api_tokens on public.org_api_tokens for all to authenticated
using(org_id=public.current_org_id() and public.current_org_has_plan_feature('api_access',false))
with check(org_id=public.current_org_id() and public.current_org_has_plan_feature('api_access',false));
drop policy if exists org_members_manage_webhooks on public.org_webhooks;
create policy org_members_manage_webhooks on public.org_webhooks for all to authenticated
using(org_id=public.current_org_id() and public.current_org_has_plan_feature('webhooks',false))
with check(org_id=public.current_org_id() and public.current_org_has_plan_feature('webhooks',false));

-- Update the existing credit notices by semantic condition, preserving target audiences and dismissal records.
update public.saas_user_announcements a set
 conditions_all=(select jsonb_agg(case when c->>'field' in ('ai_wallet_remaining_irt','sms_wallet_remaining_irt') and c->>'operator' in ('lte','lt') then c||'{"operator":"lt","value":50000}'::jsonb else c end order by ord) from jsonb_array_elements(a.conditions_all) with ordinality t(c,ord)),
 body=case when exists(select 1 from jsonb_array_elements(a.conditions_all) c where c->>'field'='ai_wallet_remaining_irt')
 then 'اعتبار باقی‌ماندهٔ هوش مصنوعی سازمان کمتر از ۵۰٬۰۰۰ تومان است. از تنظیمات حساب آن را شارژ کنید.'
 else 'اعتبار باقی‌ماندهٔ پیامک سازمان کمتر از ۵۰٬۰۰۰ تومان است. از تنظیمات حساب آن را شارژ کنید.' end
where a.kind='header' and exists(select 1 from jsonb_array_elements(a.conditions_all) c where c->>'field' in ('ai_wallet_remaining_irt','sms_wallet_remaining_irt') and c->>'operator' in ('lte','lt') and c->>'value'='100000');


-- Atomic manual provisioning: conversion and access selection succeed together.
create or replace function public.admin_provision_demo_request_with_access(
 p_request_id uuid,p_plan_code text default null,p_module_overrides jsonb default '{}',p_feature_overrides jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; target uuid; request_org uuid;
begin
 if not public.current_user_has_saas_admin_permission('edit_orgs') then raise exception 'permission denied' using errcode='42501'; end if;
 if jsonb_typeof(p_module_overrides) is distinct from 'object' or jsonb_typeof(p_feature_overrides) is distinct from 'object'
  or exists(select 1 from jsonb_each(p_module_overrides||p_feature_overrides) where jsonb_typeof(value)<>'boolean') then raise exception 'invalid_access_overrides'; end if;
 perform 1 from public.saas_onboarding_requests where id=p_request_id for update;
 if not found then return jsonb_build_object('success',false,'message','درخواست دمو یافت نشد.'); end if;
 select org_id into request_org from public.saas_org_settings where request_id=p_request_id limit 1;
 if request_org is not null then return jsonb_build_object('success',true,'org_id',request_org,'message','این درخواست قبلاً به سازمان متصل شده است.'); end if;
 result:=public.admin_convert_demo_request_to_org(p_request_id);
 if result->'success' is distinct from 'true'::jsonb then return result; end if;
 target:=coalesce(result->>'org_id',result->>'source_id')::uuid;
 if target is null then raise exception 'provisioned_org_missing'; end if;
 perform public.admin_update_saas_org_account(target,coalesce(p_plan_code,(select plan_code from public.saas_org_settings where org_id=target)),p_module_overrides,p_feature_overrides,'{}');
 return result;
end; $$;
revoke all on function public.admin_provision_demo_request_with_access(uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.admin_provision_demo_request_with_access(uuid,text,jsonb,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
