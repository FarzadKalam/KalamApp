-- SaaS workflow sources are control-plane data. Only the service runner may
-- use these adapters, on behalf of an active, authorized provider operator.
begin;

create or replace function public.saas_workflow_actor_allowed(p_provider_org_id uuid, p_actor_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_provider_org_id = public.support_provider_org_id() and exists (
    select 1 from public.profiles p join public.org_roles r on r.id=p.role_id and r.org_id=p.org_id
    where p.id=p_actor_user_id and p.org_id=p_provider_org_id and p.is_active is distinct from false
      and r.permissions->'__saas_admin'->>'view'='true'
      and r.permissions->'__saas_admin'->'fields'->>'saas_workflows'='true'
  ),false);
$$;
revoke all on function public.saas_workflow_actor_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.saas_workflow_actor_allowed(uuid,uuid) to service_role;

create or replace function public.read_saas_workflow_source(
  p_provider_org_id uuid, p_actor_user_id uuid, p_module_id text,
  p_record_id uuid default null, p_limit integer default 100, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if auth.role() is distinct from 'service_role' or not public.saas_workflow_actor_allowed(p_provider_org_id,p_actor_user_id) then
    raise exception 'saas_workflow_access_denied' using errcode='42501';
  end if;
  if p_module_id='saas_orgs' then
    select coalesce(jsonb_agg(x.row order by x.id),'[]'::jsonb) into result from (
      select c.id, to_jsonb(c) || jsonb_build_object('org_id',p_provider_org_id,'customer_org_id',c.id) as row
      from public.saas_admin_org_candidates_view c join public.saas_org_settings s on s.org_id=c.id
      where c.source_kind='org' and (p_record_id is null or c.id=p_record_id or s.id=p_record_id)
      order by c.id limit greatest(1,least(coalesce(p_limit,100),200)) offset greatest(coalesce(p_offset,0),0)
    ) x;
  elsif p_module_id='saas_demo_requests' then
    select coalesce(jsonb_agg(x.row order by x.id),'[]'::jsonb) into result from (
      select r.id, jsonb_build_object('id',r.id,'org_id',p_provider_org_id,'customer_org_id',r.org_id,
        'full_name',r.full_name,'organization_name',coalesce(r.organization_name,r.business_name),
        'mobile',r.mobile,'email',r.email,'requested_slug',r.requested_slug,'demo_url',r.demo_url,
        'status',r.status,'is_demo_request',r.is_demo_request,'failure_code',r.failure_code,
        'created_at',r.created_at,'updated_at',r.updated_at) as row
      from public.saas_onboarding_requests r where p_record_id is null or r.id=p_record_id
      order by r.id limit greatest(1,least(coalesce(p_limit,100),200)) offset greatest(coalesce(p_offset,0),0)
    ) x;
  elsif p_module_id='saas_users' then
    select coalesce(jsonb_agg(x.row order by x.id),'[]'::jsonb) into result from (
      select p.id,jsonb_build_object('id',p.id,'org_id',p_provider_org_id,'customer_org_id',p.org_id,
        'full_name',p.full_name,'email',p.email,'mobile',coalesce(p.mobile_1,p.mobile),'is_active',p.is_active) as row
      from public.profiles p where p.org_id is not null and (p_record_id is null or p.id=p_record_id)
      order by p.id limit greatest(1,least(coalesce(p_limit,100),200)) offset greatest(coalesce(p_offset,0),0)
    ) x;
  else raise exception 'unsupported_saas_workflow_source'; end if;
  return result;
end; $$;
revoke all on function public.read_saas_workflow_source(uuid,uuid,text,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.read_saas_workflow_source(uuid,uuid,text,uuid,integer,integer) to service_role;

alter table public.invoices add column if not exists saas_tenant_org_id uuid references public.organizations(id);
alter table public.invoices add column if not exists saas_demo_request_id uuid references public.saas_onboarding_requests(id);
alter table public.invoices add column if not exists workflow_saas_origin_key text;
create unique index if not exists invoices_saas_workflow_origin_once on public.invoices(org_id,workflow_saas_origin_key)
  where workflow_saas_origin_key is not null;
create index if not exists invoices_saas_tenant_org_idx on public.invoices(org_id,saas_tenant_org_id) where saas_tenant_org_id is not null;
create index if not exists invoices_saas_demo_request_idx on public.invoices(org_id,saas_demo_request_id) where saas_demo_request_id is not null;

create or replace function public.guard_workflow_saas_invoice_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.saas_tenant_org_id is not null or new.saas_demo_request_id is not null or new.workflow_saas_origin_key is not null then
    if new.org_id is distinct from public.support_provider_org_id() then
      raise exception 'saas_invoice_provider_required' using errcode='42501';
    end if;
    if auth.role() is distinct from 'service_role' and not public.saas_workflow_actor_allowed(new.org_id,auth.uid()) then
      raise exception 'saas_invoice_link_access_denied' using errcode='42501';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.guard_workflow_saas_invoice_links() from public,anon,authenticated;
drop trigger if exists guard_workflow_saas_invoice_links on public.invoices;
create trigger guard_workflow_saas_invoice_links before insert or update on public.invoices
  for each row execute function public.guard_workflow_saas_invoice_links();

create or replace function public.workflow_create_saas_related_invoice(
  p_provider_org_id uuid,p_actor_user_id uuid,p_module_id text,p_record_id uuid,p_input jsonb,p_execution_key text
) returns uuid language plpgsql security definer set search_path = public as $$
declare source jsonb; payload jsonb; result uuid; columns_sql text; values_sql text;
begin
  source := public.read_saas_workflow_source(p_provider_org_id,p_actor_user_id,p_module_id,p_record_id,1,0)->0;
  if source is null or p_module_id not in ('saas_orgs','saas_demo_requests') then raise exception 'saas_workflow_source_not_found'; end if;
  if nullif(trim(p_execution_key),'') is null or length(p_execution_key)>2000 then raise exception 'saas_workflow_execution_key_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider_org_id::text||p_execution_key,0));
  select id into result from public.invoices where org_id=p_provider_org_id and workflow_saas_origin_key=p_execution_key;
  if result is not null then return result; end if;
  if nullif(trim(p_input->>'name'),'') is null then raise exception 'invoice_name_required'; end if;
  if coalesce(p_input->>'status','proforma') not in ('created','proforma') or coalesce((p_input->>'total_received_amount')::numeric,0)<>0
    or coalesce(p_input->'payments','[]'::jsonb)<>'[]'::jsonb then raise exception 'workflow_invoice_must_be_unpaid'; end if;
  if nullif(p_input->>'customer_id','') is not null and not exists (
    select 1 from public.customers where id=(p_input->>'customer_id')::uuid and org_id=p_provider_org_id
  ) then raise exception 'invoice_customer_outside_provider' using errcode='42501'; end if;
  select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) into payload from jsonb_each(coalesce(p_input,'{}'::jsonb)) e
    where e.key=any(array['name','invoice_date','status','customer_id','invoiceItems','description','total_invoice_amount','remaining_balance']);
  payload := payload || jsonb_build_object('org_id',p_provider_org_id,'created_by',p_actor_user_id,'updated_by',p_actor_user_id,
    'status',coalesce(p_input->>'status','proforma'),'invoice_date',coalesce(p_input->>'invoice_date',current_date::text),
    'workflow_saas_origin_key',p_execution_key,'saas_tenant_org_id',source->>'customer_org_id',
    'saas_demo_request_id',case when p_module_id='saas_demo_requests' then source->>'id' else null end);
  -- Only actual columns from the explicit allowlist are inserted. Defaults on
  -- all other invoice columns continue to be supplied by the existing schema.
  select string_agg(format('%I',k.key),',' order by k.key),string_agg(format('r.%I',k.key),',' order by k.key)
    into columns_sql,values_sql from jsonb_object_keys(payload) k(key)
    join information_schema.columns c on c.table_schema='public' and c.table_name='invoices' and c.column_name=k.key;
  execute format('insert into public.invoices(%s) select %s from jsonb_populate_record(null::public.invoices,$1) r returning id',columns_sql,values_sql)
    into result using payload;
  return result;
end; $$;
revoke all on function public.workflow_create_saas_related_invoice(uuid,uuid,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.workflow_create_saas_related_invoice(uuid,uuid,text,uuid,jsonb,text) to service_role;

notify pgrst,'reload schema';
commit;
