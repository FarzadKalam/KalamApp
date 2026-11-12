create extension if not exists pgcrypto;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create role anon;
create role authenticated;
create role service_role;
create table organizations(id uuid primary key default gen_random_uuid(),internal boolean default false);
create table saas_plans(id uuid primary key default gen_random_uuid(),code text unique,is_active boolean default true,is_demo_default boolean default false,trial_days int default 30,sort_order int default 1,enabled_modules jsonb default '{}',enabled_features jsonb default '{}');
create table saas_org_settings(org_id uuid primary key references organizations,plan_code text,status text default 'active',is_demo boolean default false,is_readonly boolean default false,trial_ends_at timestamptz,feature_overrides jsonb default '{}',module_overrides jsonb default '{}',request_id uuid);
create table saas_org_entitlements(org_id uuid,item_kind text,entitlement_code text,state text,expires_at timestamptz);
create table local_deployment_runtime(org_id uuid,features jsonb,modules jsonb);
create table org_ai_wallets(org_id uuid primary key,balance_irt numeric default 0,included_quota_irt numeric default 0,reserved_irt numeric default 0,status text,updated_at timestamptz);
create table org_sms_wallets(like org_ai_wallets including all);
create table saas_consumption_credit_gifts(org_id uuid,gift_kind text,ai_amount_irt numeric,sms_amount_irt numeric,primary key(org_id,gift_kind));
create table org_sms_wallet_transactions(org_id uuid,kind text,amount_irt numeric,balance_after_irt numeric,description text,metadata jsonb);
create table org_ai_credit_grants(org_id uuid,amount_irt numeric,reason text,metadata jsonb);
create table org_api_tokens(org_id uuid,token text);
create table org_webhooks(org_id uuid);
alter table org_api_tokens enable row level security;
alter table org_webhooks enable row level security;
grant select on org_api_tokens,org_webhooks to authenticated;
create table saas_onboarding_requests(id uuid primary key,org_id uuid);
create table saas_user_announcements(id int primary key,kind text,title text,body text,conditions_all jsonb);
create function org_is_saas_admin(uuid) returns boolean language sql stable as $$ select coalesce((select internal from organizations where id=$1),false) $$;
create function current_org_id() returns uuid language sql stable as $$ select nullif(current_setting('test.org',true),'')::uuid $$;
create function current_user_has_saas_admin_permission(text default null) returns boolean language sql stable as $$ select coalesce(current_setting('test.admin',true),'')='yes' $$;
-- Offline dispatcher signatures from phase 576.
create function org_has_plan_feature(uuid,text,boolean default false) returns boolean language plpgsql stable security definer set search_path=public as $$ begin return cloud_org_has_plan_feature($1,$2,$3); end; $$;
create function current_org_has_plan_feature(text,boolean default false) returns boolean language plpgsql stable security definer set search_path=public as $$ begin return org_has_plan_feature(current_org_id(),$1,$2); end; $$;
insert into saas_plans(code,is_demo_default,enabled_modules,enabled_features) values
 ('public_demo_full',true,'{"tasks":true}','{"ai_chat":true}'),
 ('paid',false,'{"tasks":true}','{"api_access":true,"ai_chat":true,"ai_agent:lead_orchestrator":false}');
insert into organizations(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into saas_org_settings(org_id,plan_code) select id,'paid' from organizations;
insert into org_api_tokens values('00000000-0000-0000-0000-000000000001','test');
insert into saas_user_announcements values(1,'header','AI','old','[{"field":"ai_wallet_remaining_irt","operator":"lte","value":100000}]'),(2,'header','SMS','old','[{"field":"sms_wallet_remaining_irt","operator":"lte","value":100000}]');

create function trg_grant_saas_consumption_welcome_credit() returns trigger language plpgsql as $$ begin
 if new.is_demo then perform grant_saas_consumption_welcome_credit(new.org_id,'demo',new.plan_code); end if; return new;
end; $$;
create trigger trg_saas_consumption_welcome_credit after insert or update of is_demo,plan_code on saas_org_settings for each row execute function trg_grant_saas_consumption_welcome_credit();
