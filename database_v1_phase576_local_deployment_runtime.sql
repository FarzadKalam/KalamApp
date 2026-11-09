-- Empty on the cloud. Only the dedicated offline installer provisions this table.
begin;
create table if not exists public.local_deployment_runtime (
 org_id uuid primary key references public.organizations(id), code text not null, version text not null,
 features jsonb not null default '{}', modules jsonb not null default '{}',
 activated boolean not null default false, last_report jsonb, report_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.local_deployment_runtime enable row level security;
revoke all on public.local_deployment_runtime from public,anon,authenticated;
grant all on public.local_deployment_runtime to service_role;

do $$ begin
 if to_regprocedure('public.cloud_org_has_plan_feature(uuid,text,boolean)') is null then
  alter function public.org_has_plan_feature(uuid,text,boolean) rename to cloud_org_has_plan_feature;
 end if;
 if to_regprocedure('public.cloud_org_has_plan_module(uuid,text,boolean)') is null then
  alter function public.org_has_plan_module(uuid,text,boolean) rename to cloud_org_has_plan_module;
 end if;
end $$;
revoke all on function public.cloud_org_has_plan_feature(uuid,text,boolean),public.cloud_org_has_plan_module(uuid,text,boolean) from public,anon,authenticated;
create or replace function public.org_has_plan_feature(p_org_id uuid,p_feature_key text,p_default_enabled boolean default false)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare policy jsonb;
begin
 if p_org_id is null or nullif(trim(p_feature_key),'') is null then return false; end if;
 select features into policy from public.local_deployment_runtime where org_id=p_org_id;
 if found then return coalesce(policy->p_feature_key,'false'::jsonb)='true'::jsonb; end if;
 return public.cloud_org_has_plan_feature(p_org_id,p_feature_key,p_default_enabled);
end $$;
create or replace function public.org_has_plan_module(p_org_id uuid,p_module_id text,p_default_enabled boolean default false)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare policy jsonb;
begin
 if p_org_id is null or nullif(trim(p_module_id),'') is null then return false; end if;
 select modules into policy from public.local_deployment_runtime where org_id=p_org_id;
 if found then return coalesce(policy->p_module_id,'false'::jsonb)='true'::jsonb; end if;
 return public.cloud_org_has_plan_module(p_org_id,p_module_id,p_default_enabled);
end $$;
revoke all on function public.org_has_plan_feature(uuid,text,boolean),public.org_has_plan_module(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.org_has_plan_feature(uuid,text,boolean),public.org_has_plan_module(uuid,text,boolean) to service_role;

create or replace function public.get_local_installation_status()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r public.local_deployment_runtime;
begin
 if auth.uid() is null or not exists(select 1 from public.user_organization_memberships
  where org_id=public.current_org_id() and user_id=auth.uid() and is_active and (is_owner or software_role='admin'))
 then raise exception using errcode='42501',message='داشبورد نصب فقط برای مدیر سازمان در دسترس است.'; end if;
 select * into r from public.local_deployment_runtime where org_id=public.current_org_id();
 if not found then raise exception 'این سازمان در نصب اختصاصی نیست.'; end if;
 return jsonb_build_object('code',r.code,'version',r.version,'last_report',r.last_report,'generated_at',r.report_at,'activated',r.activated,'features',r.features,'modules',r.modules);
end $$;
revoke all on function public.get_local_installation_status() from public,anon;
grant execute on function public.get_local_installation_status() to authenticated;

create or replace function public.set_local_installation_availability(p_features jsonb,p_modules jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform public.get_local_installation_status();
 if jsonb_typeof(p_features)<>'object' or jsonb_typeof(p_modules)<>'object'
  or exists(select 1 from jsonb_each(p_features) where jsonb_typeof(value)<>'boolean')
  or exists(select 1 from jsonb_each(p_modules) where jsonb_typeof(value)<>'boolean') then raise exception 'تنظیم قابلیت‌ها معتبر نیست.'; end if;
 update public.local_deployment_runtime set features=p_features,modules=p_modules,updated_at=now() where org_id=public.current_org_id();
end $$;
revoke all on function public.set_local_installation_availability(jsonb,jsonb) from public,anon;
grant execute on function public.set_local_installation_availability(jsonb,jsonb) to authenticated;
commit;
