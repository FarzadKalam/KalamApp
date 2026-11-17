begin;

-- A bounded, current-organization snapshot for the permission editor. Commercial
-- availability is evaluated by the existing canonical entitlement functions.
create or replace function public.current_org_permission_availability()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare modules jsonb; features jsonb;
begin
  if auth.uid() is null or public.current_org_id() is null then
    raise exception 'organization_context_required' using errcode='42501';
  end if;
  select coalesce(jsonb_object_agg(value,public.current_org_has_plan_module(value,false)),'{}') into modules
    from jsonb_array_elements_text(public.saas_offering_keys()->'modules');
  select coalesce(jsonb_object_agg(value,public.current_org_has_plan_feature(value,false)),'{}') into features
    from jsonb_array_elements_text(public.saas_offering_keys()->'features');
  features:=features||jsonb_build_object('customer_club',public.current_org_has_plan_feature('customer_club',true));
  return jsonb_build_object('modules',modules,'features',features);
end $$;
revoke all on function public.current_org_permission_availability() from public,anon;
grant execute on function public.current_org_permission_availability() to authenticated;

create or replace function public.current_user_can_module_field(p_module text,p_action text,p_field text default null)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare permission jsonb; field_permission jsonb; root_action text;
begin
  if auth.uid() is null or public.current_org_id() is null or p_module is null or p_action is null or p_action not in ('view','create','edit','delete') then return false; end if;
  select r.permissions->p_module into permission
    from public.user_organization_memberships m join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
    where m.user_id=auth.uid() and m.org_id=public.current_org_id() and m.is_active limit 1;
  if not found then return false; end if;
  permission:=coalesce(permission,'{}');
  if permission->'view'='false'::jsonb then return false; end if;
  root_action:=case when p_field is not null and p_action='delete' then 'edit' else p_action end;
  if root_action='create' then
    if coalesce(permission->'create',permission->'edit','true')='false'::jsonb then return false; end if;
  elsif permission->root_action='false'::jsonb then return false;
  end if;
  if p_field is null then return true; end if;
  field_permission:=coalesce(permission->'field_actions'->p_field,'{}');
  return coalesce(permission->'fields'->p_field,'true')<>'false'::jsonb
    and coalesce(field_permission->'view','true')<>'false'::jsonb
    and coalesce(field_permission->p_action,'true')<>'false'::jsonb;
end $$;
revoke all on function public.current_user_can_module_field(text,text,text) from public,anon;
grant execute on function public.current_user_can_module_field(text,text,text) to authenticated;

-- Defense in depth for direct REST writes and RPCs: RLS remains responsible for
-- row access. This guard only narrows writes, never grants cross-tenant access.
create or replace function public.guard_module_field_actions()
returns trigger language plpgsql security definer set search_path=public as $$
declare module_key text:=tg_argv[0]; row_new jsonb; row_old jsonb; permission jsonb;
  action text; field_key text; field_rules jsonb; value_new jsonb; value_old jsonb;
  default_expr text; default_type text; default_value jsonb; pair record; root_key text; column_key text;
begin
  if auth.uid() is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op<>'DELETE' then row_new:=to_jsonb(new); end if;
  if tg_op<>'INSERT' then row_old:=to_jsonb(old); end if;
  if public.current_org_id() is null
    or (tg_op<>'DELETE' and nullif(row_new->>'org_id','')::uuid is distinct from public.current_org_id())
    or (tg_op<>'INSERT' and nullif(row_old->>'org_id','')::uuid is distinct from public.current_org_id()) then
    raise exception 'سازمان رکورد با سازمان جاری همخوانی ندارد.' using errcode='42501';
  end if;
  -- Reviewed database triggers maintain derived stock, accounting and process
  -- values on behalf of the authorized parent write. Do not require users to
  -- acquire direct editing rights to those dependent modules.
  if pg_trigger_depth()>1 then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  action:=case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'edit' else 'delete' end;
  if not public.current_user_can_module_field(module_key,action) then
    raise exception 'دسترسی انجام این عملیات در ماژول را ندارید.' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  select r.permissions->module_key into permission from public.user_organization_memberships m
    join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
    where m.user_id=auth.uid() and m.org_id=public.current_org_id() and m.is_active limit 1;
  for field_key,field_rules in select key,value from jsonb_each(coalesce(permission->'field_actions','{}')) loop
    if field_key in ('id','org_id','system_code','created_at','created_by','updated_at','updated_by') then continue; end if;
    if field_key like '\_\_%' escape '\' then continue; end if;
    if position('.' in field_key)>0 then
      root_key:=split_part(field_key,'.',1); column_key:=split_part(field_key,'.',2);
      if jsonb_typeof(row_new->root_key)<>'array' and jsonb_typeof(row_old->root_key)<>'array' then continue; end if;
      -- Stable row identities preserve permissions when table rows are reordered.
      for pair in
        with n as (select coalesce(value->>'id',value->>'key',ordinality::text) id,value from jsonb_array_elements(case when jsonb_typeof(row_new->root_key)='array' then row_new->root_key else '[]'::jsonb end) with ordinality),
             o as (select coalesce(value->>'id',value->>'key',ordinality::text) id,value from jsonb_array_elements(case when jsonb_typeof(row_old->root_key)='array' then row_old->root_key else '[]'::jsonb end) with ordinality)
        select coalesce(n.value->column_key,n.value->'specs'->column_key) nv,coalesce(o.value->column_key,o.value->'specs'->column_key) ov,
          o.id is null added from n full join o using(id)
      loop
        if pair.nv is not distinct from pair.ov then continue; end if;
        if coalesce(pair.nv,'null') not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb) and not public.current_user_can_module_field(module_key,case when pair.added then 'create' else 'edit' end,field_key)
          or not pair.added and not public.current_user_can_module_field(module_key,'edit',field_key)
          or not pair.added and coalesce(pair.nv,'null') in ('null'::jsonb,'""'::jsonb,'[]'::jsonb) and not public.current_user_can_module_field(module_key,'delete',field_key) then
          raise exception 'دسترسی تغییر این ستون جدول را ندارید.' using errcode='42501';
        end if;
      end loop;
      continue;
    end if;
    if not(row_new?field_key) then continue; end if;
    value_new:=row_new->field_key; value_old:=row_old->field_key;
    if tg_op='UPDATE' and value_new is not distinct from value_old then continue; end if;
    if tg_op='INSERT' and coalesce(value_new,'null') in ('null'::jsonb,'""'::jsonb,'[]'::jsonb) then continue; end if;
    if not public.current_user_can_module_field(module_key,action,field_key) then
      -- Omitting a denied field may still produce a database default. Allow
      -- exactly that default; clients cannot use this to choose another value.
      if tg_op='INSERT' then
        select pg_get_expr(d.adbin,d.adrelid),format_type(a.atttypid,a.atttypmod) into default_expr,default_type
          from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
          where a.attrelid=tg_relid and a.attname=field_key;
        if default_expr is not null then
          execute format('select to_jsonb((%s)::%s)',default_expr,default_type) into default_value;
          if value_new is not distinct from default_value then continue; end if;
        end if;
      end if;
      raise exception 'دسترسی تغییر این فیلد را ندارید.' using errcode='42501';
    end if;
    if tg_op='UPDATE' and coalesce(value_new,'null') in ('null'::jsonb,'""'::jsonb,'[]'::jsonb)
      and not public.current_user_can_module_field(module_key,'delete',field_key) then
      raise exception 'دسترسی پاک‌کردن مقدار این فیلد را ندارید.' using errcode='42501';
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.guard_module_field_actions() from public,anon,authenticated;

do $$ declare module_key text; table_key text; begin
  for module_key in select jsonb_array_elements_text(public.saas_offering_keys()->'modules') loop
    table_key:=case module_key when 'voip_call_reports' then 'voip_call_logs' else module_key end;
    if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=table_key and c.relkind in ('r','p'))
      and exists(select 1 from information_schema.columns where table_schema='public' and table_name=table_key and column_name='org_id') then
      execute format('drop trigger if exists z_guard_module_field_actions on public.%I',table_key);
      execute format('create trigger z_guard_module_field_actions before insert or update or delete on public.%I for each row execute function public.guard_module_field_actions(%L)',table_key,module_key);
    end if;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
