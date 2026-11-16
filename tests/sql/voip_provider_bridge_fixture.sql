-- Extends the isolated external-account fixture; never run against a tenant database.
create table public.user_organization_memberships(org_id uuid,user_id uuid,is_active boolean,settings jsonb,primary key(org_id,user_id));
create table public.integration_settings(id uuid primary key default gen_random_uuid(),org_id uuid,connection_type text,is_active boolean,settings jsonb);
create function public.org_has_plan_feature(uuid,text,boolean) returns boolean language sql stable as $$select coalesce(nullif(current_setting('test.plan',true),''),'true')::boolean$$;
insert into public.user_organization_memberships values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',true,'{"voip_enabled":true}');
insert into public.integration_settings(org_id,connection_type,is_active,settings) values
 ('10000000-0000-4000-8000-000000000001','voip',true,'{"usage_mode":"browser","browser_source":"external"}');
