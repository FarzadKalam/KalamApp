begin;

create table if not exists public.saas_sales_customer_links (
  org_id uuid not null references public.organizations(id) on delete cascade,
  tenant_org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  primary key (org_id, tenant_org_id),
  unique (org_id, customer_id),
  check (org_id <> tenant_org_id)
);
alter table public.saas_sales_customer_links enable row level security;
revoke all on public.saas_sales_customer_links from public, anon, authenticated;

create or replace function public.resolve_saas_sales_customer(p_provider uuid,p_tenant uuid,p_customer uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare linked uuid; candidate_ids uuid[]; source jsonb; business text; source_email text; source_mobile text;
begin
  if p_provider is null or p_provider is distinct from public.support_provider_org_id()
    or p_tenant is null or p_tenant=p_provider or public.org_is_saas_admin(p_tenant) then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('saas-sales-customers:'||p_provider::text,0));
  select l.customer_id into linked from public.saas_sales_customer_links l
  join public.customers c on c.id=l.customer_id and c.org_id=l.org_id
  where l.org_id=p_provider and l.tenant_org_id=p_tenant;
  if linked is not null then
    if p_customer is not null and p_customer<>linked then raise exception 'سازمان مشتری دیگری دارد.'; end if;
    return linked;
  end if;
  select to_jsonb(c) into source from public.saas_admin_org_candidates_view c
    where c.id=p_tenant and c.source_kind='org';
  if not found then return null; end if;
  business:=nullif(trim(source->>'org_name'),'');
  source_email:=nullif(lower(trim(source->>'owner_email')),'');
  source_mobile:=public.normalize_iran_mobile_e164(source->>'primary_contact_mobile');
  if p_customer is not null then
    select id into linked from public.customers where id=p_customer and org_id=p_provider for update;
    if linked is null then raise exception 'مشتری در سازمان فروشنده پیدا نشد.' using errcode='42501'; end if;
  else
    select array(select c.id from public.customers c where c.org_id=p_provider and
      (lower(trim(c.business_name))=lower(business) or lower(trim(c.full_name))=lower(business)
        or lower(trim(c.email))=source_email or public.normalize_iran_mobile_e164(c.mobile_1)=source_mobile)
      order by c.id limit 2) into candidate_ids;
    if cardinality(candidate_ids)=1 then
      select c.id into linked from public.customers c where c.org_id=p_provider and c.id=candidate_ids[1]
        and lower(trim(coalesce(nullif(c.business_name,''),c.full_name)))=lower(business)
        and (lower(trim(c.email))=source_email or public.normalize_iran_mobile_e164(c.mobile_1)=source_mobile)
        and not exists(select 1 from public.saas_sales_customer_links l where l.org_id=p_provider and l.customer_id=c.id);
    end if;
    if linked is null and cardinality(candidate_ids)>0 then return null; end if;
    if linked is null then
      if business is null then return null; end if;
      insert into public.customers(org_id,full_name,business_name,email,mobile_1)
      values(p_provider,business,business,source_email,source_mobile) returning id into linked;
    end if;
  end if;
  insert into public.saas_sales_customer_links(org_id,tenant_org_id,customer_id) values(p_provider,p_tenant,linked);
  return linked;
end $$;
revoke all on function public.resolve_saas_sales_customer(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.link_saas_sales_customer_after_provision()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.resolve_saas_sales_customer(public.support_provider_org_id(),new.org_id);
  return new;
exception when others then
  -- CRM retry remains available from the organization drawer or invoice.
  raise warning 'SaaS CRM sync deferred (%).',sqlstate;
  return new;
end $$;
revoke all on function public.link_saas_sales_customer_after_provision() from public,anon,authenticated;
drop trigger if exists link_saas_sales_customer_after_provision on public.saas_org_settings;
create trigger link_saas_sales_customer_after_provision after insert on public.saas_org_settings
  for each row execute function public.link_saas_sales_customer_after_provision();

create or replace function public.admin_saas_sales_customer(p_tenant uuid,p_mode text default 'read',p_customer uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare provider uuid:=public.support_provider_org_id(); linked uuid;
begin
  if not coalesce(public.saas_lifecycle_workflows_allowed(),false) then raise exception 'saas_workflow_access_denied' using errcode='42501'; end if;
  if p_mode='resolve' then
    linked:=public.resolve_saas_sales_customer(provider,p_tenant,p_customer);
  elsif p_mode='read' then
    select customer_id into linked from public.saas_sales_customer_links where org_id=provider and tenant_org_id=p_tenant;
  else raise exception 'invalid_customer_link_action';
  end if;
  return coalesce((select jsonb_build_object('id',c.id,'name',coalesce(nullif(c.business_name,''),c.full_name,'مشتری'),'code',c.system_code)
    from public.customers c where c.id=linked and c.org_id=provider),'null'::jsonb);
end $$;
revoke all on function public.admin_saas_sales_customer(uuid,text,uuid) from public,anon;
grant execute on function public.admin_saas_sales_customer(uuid,text,uuid) to authenticated;

create or replace function public.admin_search_saas_sales_customers(p_search text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare provider uuid:=public.support_provider_org_id();
begin
  if not coalesce(public.saas_lifecycle_workflows_allowed(),false) then raise exception 'saas_workflow_access_denied' using errcode='42501'; end if;
  if length(trim(coalesce(p_search,'')))<2 then return '[]'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(c) order by c.name,c.id),'[]') from (
    select c.id,coalesce(nullif(c.business_name,''),c.full_name,'مشتری') as name,c.system_code as code
    from public.customers c where c.org_id=provider
      and not exists(select 1 from public.saas_sales_customer_links l where l.org_id=provider and l.customer_id=c.id)
      and (c.full_name ilike '%'||p_search||'%' or c.business_name ilike '%'||p_search||'%' or c.system_code ilike p_search||'%')
    order by name,c.id limit 30
  ) c);
end $$;
revoke all on function public.admin_search_saas_sales_customers(text) from public,anon;
grant execute on function public.admin_search_saas_sales_customers(text) to authenticated;

create table if not exists public.saas_sales_catalog_links (
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check(kind in ('plan','module','feature','addon')),
  code text not null,
  product_id uuid references public.products(id) on delete set null,
  bundle_id uuid references public.product_bundles(id) on delete set null,
  primary key(org_id,kind,code),
  unique(org_id,product_id), unique(org_id,bundle_id),
  check(product_id is null or bundle_id is null)
);
alter table public.saas_sales_catalog_links enable row level security;
revoke all on public.saas_sales_catalog_links from public,anon,authenticated;

create or replace function public.refresh_saas_sales_catalog()
returns jsonb language plpgsql security definer set search_path=public as $$
declare provider uuid:=public.support_provider_org_id(); entry record; target uuid; lines jsonb; updated_count int:=0;
begin
  if provider is null then raise exception 'saas_workflow_access_denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('saas-sales-catalog:'||provider::text,0));
  for entry in
    with keys as (
      select distinct 'module' as kind, k as code from public.saas_plans p cross join lateral jsonb_object_keys(coalesce(p.enabled_modules,'{}')) k
      union select distinct 'feature', k from public.saas_plans p cross join lateral jsonb_object_keys(coalesce(p.enabled_features,'{}')) k
    )
    select k.kind,k.code,coalesce((select c.title from public.saas_catalog_items c where c.item_kind=k.kind and c.entitlement_code=k.code order by c.code limit 1),k.code) as title from keys k
    union all select 'addon',c.code,c.title from public.saas_catalog_items c
  loop
    select product_id into target from public.saas_sales_catalog_links where org_id=provider and kind=entry.kind and code=entry.code;
    if target is null then
      insert into public.products(org_id,name,product_type) values(provider,entry.title,'service') returning id into target;
      insert into public.saas_sales_catalog_links(org_id,kind,code,product_id) values(provider,entry.kind,entry.code,target)
      on conflict(org_id,kind,code) do update set product_id=excluded.product_id;
    end if;
    updated_count:=updated_count+1;
  end loop;
  for entry in select code,title,enabled_modules,enabled_features from public.saas_plans loop
    select coalesce(jsonb_agg(jsonb_build_object('product_id',l.product_id,'quantity',1,'unit_price',0,'total_price',0) order by l.kind,l.code),'[]') into lines
    from public.saas_sales_catalog_links l where l.org_id=provider and l.product_id is not null
      and ((l.kind='module' and lower(entry.enabled_modules->>l.code) in ('true','1','enabled','on'))
        or (l.kind='feature' and (lower(entry.enabled_features->>l.code) in ('true','1','enabled','on','full','limited')
          or entry.enabled_features->l.code->>'enabled'='true' or entry.enabled_features->l.code->>'available'='true')));
    select bundle_id into target from public.saas_sales_catalog_links where org_id=provider and kind='plan' and code=entry.code;
    if target is null then
      insert into public.product_bundles(org_id,name,products) values(provider,entry.title,lines) returning id into target;
      insert into public.saas_sales_catalog_links(org_id,kind,code,bundle_id) values(provider,'plan',entry.code,target)
      on conflict(org_id,kind,code) do update set bundle_id=excluded.bundle_id;
    else
      update public.product_bundles set name=entry.title,products=lines where id=target and org_id=provider
        and (name,products) is distinct from (entry.title,lines);
    end if;
    updated_count:=updated_count+1;
  end loop;
  return jsonb_build_object('synced',updated_count);
end $$;
revoke all on function public.refresh_saas_sales_catalog() from public,anon,authenticated;

create or replace function public.admin_refresh_saas_sales_catalog() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.saas_lifecycle_workflows_allowed(),false) then raise exception 'saas_workflow_access_denied' using errcode='42501'; end if;
  return public.refresh_saas_sales_catalog();
end $$;
revoke all on function public.admin_refresh_saas_sales_catalog() from public,anon;
grant execute on function public.admin_refresh_saas_sales_catalog() to authenticated;

create or replace function public.admin_search_saas_invoice_items(p_search text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare provider uuid:=public.support_provider_org_id();
begin
  if not coalesce(public.saas_lifecycle_workflows_allowed(),false) then raise exception 'saas_workflow_access_denied' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.name,x.id),'[]') from (
    select * from (
      select id,name,'products'::text as module_id from public.products where org_id=provider
      union all select id,name,'product_bundles' from public.product_bundles where org_id=provider
    ) items where nullif(trim(p_search),'') is null or name ilike '%'||trim(p_search)||'%'
    order by name,id limit 40
  ) x);
end $$;
revoke all on function public.admin_search_saas_invoice_items(text) from public,anon;
grant execute on function public.admin_search_saas_invoice_items(text) to authenticated;

create or replace function public.saas_sales_catalog_changed() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if public.support_provider_org_id() is not null then perform public.refresh_saas_sales_catalog(); end if;
  return null;
end $$;
revoke all on function public.saas_sales_catalog_changed() from public,anon,authenticated;
drop trigger if exists saas_sales_catalog_changed on public.saas_plans;
create trigger saas_sales_catalog_changed after insert or update of title,enabled_modules,enabled_features on public.saas_plans
  for each statement execute function public.saas_sales_catalog_changed();
drop trigger if exists saas_sales_catalog_changed on public.saas_catalog_items;
create trigger saas_sales_catalog_changed after insert or update of title on public.saas_catalog_items
  for each statement execute function public.saas_sales_catalog_changed();

do $$ begin
  if public.support_provider_org_id() is not null then perform public.refresh_saas_sales_catalog(); end if;
end $$;
notify pgrst,'reload schema';
commit;
