do $$
declare a uuid:='00000000-0000-0000-0000-000000000001'; b uuid:='00000000-0000-0000-0000-000000000002'; result jsonb;
begin
 if not public.org_has_plan_feature(a,'api_access') then raise exception 'Paid API missing'; end if;
 if public.org_has_plan_feature(null,'api_access',true) then raise exception 'Null org leaked'; end if;
 if public.org_has_plan_feature(a,'ai_agent:lead_orchestrator') then raise exception 'Disabled agent re-enabled'; end if;
 update saas_org_settings set feature_overrides='{"api_access":false}' where org_id=a;
 if public.org_has_plan_feature(a,'api_access',true) then raise exception 'Explicit off ignored'; end if;
 insert into saas_org_entitlements values(a,'feature','api_access','enabled',null);
 if public.org_has_plan_feature(a,'api_access') then raise exception 'Purchase bypassed override'; end if;
 update saas_org_settings set feature_overrides='{}' where org_id=a;
 if not public.org_has_plan_feature(a,'api_access') then raise exception 'Inheritance failed'; end if;
 insert into saas_org_entitlements values(a,'feature','api_access','disabled',null);
 if public.org_has_plan_feature(a,'api_access') then raise exception 'Disabled entitlement ignored'; end if;
 delete from saas_org_entitlements;
 update organizations set internal=true where id=a;
 update saas_org_settings set feature_overrides='{"api_access":false}' where org_id=a;
 if public.org_has_plan_feature(a,'api_access') then raise exception 'Internal organization bypassed explicit off'; end if;
 update organizations set internal=false where id=a;
 update saas_plans set enabled_features=enabled_features-'ai_agent:lead_orchestrator' where code='paid';
 update saas_org_settings set feature_overrides='{"ai_agent:lead_orchestrator":false}' where org_id=a;
 if public.org_has_plan_feature(a,'ai_agent:lead_orchestrator') or not public.org_has_plan_feature(a,'ai_agent:project_process') then raise exception 'One legacy agent override disabled other agents'; end if;
 update saas_org_settings set is_demo=true where org_id=a;
 select to_jsonb(s) into result from saas_org_settings s where org_id=a;
 if result->>'plan_code'<>'public_demo_full' or abs(extract(epoch from ((result->>'trial_ends_at')::timestamptz-now()))-15*86400)>1 then raise exception 'Demo defaults invalid'; end if;
 if (select included_quota_irt from org_ai_wallets where org_id=a)<>100000 or (select included_quota_irt from org_sms_wallets where org_id=a)<>100000 then raise exception 'Provisioning did not grant both wallets'; end if;
 update saas_org_settings set feature_overrides='{}',trial_ends_at=now()-interval '1 second' where org_id=a;
 if public.org_has_plan_feature(a,'ai_chat') then raise exception 'Expired demo still enabled'; end if;
 update saas_org_settings set is_demo=false,status='active',plan_code='paid' where org_id=a;
 if not public.org_has_plan_feature(a,'ai_chat') then raise exception 'Paid account retained expired trial restriction'; end if;
 if (select trial_days from saas_plans where is_demo_default)<>15 then raise exception 'Demo trial duration invalid'; end if;
 if exists(select 1 from jsonb_array_elements_text(saas_offering_keys()->'features') k where (select enabled_features->>k from saas_plans where is_demo_default) is distinct from 'true') then raise exception 'Full demo misses catalog feature'; end if;
 perform grant_saas_consumption_welcome_credit(a,'demo');
 perform grant_saas_consumption_welcome_credit(a,'demo');
 if (select included_quota_irt from org_ai_wallets where org_id=a)<>100000 or (select included_quota_irt from org_sms_wallets where org_id=a)<>100000 then raise exception 'Credit wrong or repeated'; end if;
 update org_ai_wallets set included_quota_irt=60000 where org_id=a;
 perform grant_saas_consumption_welcome_credit(a,'demo');
 if (select included_quota_irt from org_ai_wallets where org_id=a)<>60000 then raise exception 'Spent gift refilled'; end if;
 insert into saas_consumption_credit_gifts values(b,'demo',80000,10000);
 insert into org_ai_wallets(org_id,included_quota_irt) values(b,50000);
 insert into org_sms_wallets(org_id,included_quota_irt) values(b,5000);
 perform grant_saas_consumption_welcome_credit(b,'demo');
 if (select included_quota_irt from org_ai_wallets where org_id=b)<>70000 or (select included_quota_irt from org_sms_wallets where org_id=b)<>95000 then raise exception 'Legacy gift upgrade lost consumption'; end if;
 if (select count(*) from saas_user_announcements where conditions_all->0->>'operator'='lt' and conditions_all->0->>'value'='50000')<>2 then raise exception 'Notice threshold wrong'; end if;
end $$;
-- Real policy execution with a tenant identity, then disabled and missing-org contexts.
select set_config('test.uid','00000000-0000-0000-0000-000000000003',false);
select set_config('test.org','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
do $$ begin
 if (select count(*) from org_api_tokens)<>1 then raise exception 'Allowed tenant token inaccessible'; end if;
 begin
  insert into org_api_tokens values('00000000-0000-0000-0000-000000000002','cross-org');
  raise exception 'Cross-org insert escaped RLS';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('test.uid','00000000-0000-0000-0000-000000000004',false);
set role authenticated;
do $$ begin if exists(select 1 from org_api_tokens) then raise exception 'Non-member read integration tokens'; end if; end $$;
reset role;
select set_config('test.uid','00000000-0000-0000-0000-000000000003',false);
update user_organization_memberships set is_owner=false,software_role='viewer';
set role authenticated;
do $$ begin if exists(select 1 from org_api_tokens) then raise exception 'Viewer read integration tokens'; end if; end $$;
reset role;
update user_organization_memberships set is_owner=true,software_role='admin';
update saas_org_settings set feature_overrides='{"api_access":false}' where org_id=current_org_id();
set role authenticated;
do $$ begin if exists(select 1 from org_api_tokens) then raise exception 'Disabled API REST bypass'; end if; end $$;
reset role;
select set_config('test.org','',false);
set role authenticated;
do $$ begin if exists(select 1 from org_api_tokens) then raise exception 'No-org REST bypass'; end if; end $$;
reset role;

select set_config('test.admin','yes',false);
do $$
declare v_request_id uuid:=gen_random_uuid(); result jsonb; target uuid; before_count int;
begin
 insert into saas_onboarding_requests(id) values(v_request_id);
 select count(*) into before_count from organizations;
 begin
  perform admin_provision_demo_request_with_access(v_request_id,'simulate_save_failure','{}','{}');
  raise exception 'Save failure was swallowed';
 exception when raise_exception then
  if sqlerrm<>'simulated_access_save_failure' then raise; end if;
 end;
 if (select count(*) from organizations)<>before_count or exists(select 1 from saas_org_settings where saas_org_settings.request_id=v_request_id) then raise exception 'Failed access save left a partial organization'; end if;
 result:=admin_provision_demo_request_with_access(v_request_id,'public_demo_full','{}','{"api_access":false}');
 target:=(result->>'org_id')::uuid;
 if result->'success' is distinct from 'true'::jsonb or public.org_has_plan_feature(target,'api_access') then raise exception 'Manual access choice not applied'; end if;
 perform admin_provision_demo_request_with_access(v_request_id,'public_demo_full','{}','{"api_access":true}');
 if public.org_has_plan_feature(target,'api_access') or (select count(*) from saas_consumption_credit_gifts where org_id=target and gift_kind='demo')<>1 then raise exception 'Retry changed existing access or repeated credit'; end if;
end $$;
