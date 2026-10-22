-- Phase 549: SaaS organizations, users, and demo requests use the existing
-- durable workflow queue, always in the TazeSystem provider organization.
begin;

alter table public.saas_onboarding_requests
  add column if not exists demo_url text generated always as
    (case when status = 'provisioned' and nullif(trim(requested_slug), '') is not null
      then 'https://' || trim(requested_slug) || '.tazesystem.ir' else null end) stored;

create or replace function public.saas_lifecycle_workflows_allowed()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_org_id() = public.support_provider_org_id() and exists (
    select 1 from public.profiles p
    join public.org_roles r on r.id = p.role_id and r.org_id = p.org_id
    where p.id = auth.uid() and p.is_active is distinct from false
      and p.org_id = public.support_provider_org_id()
      and coalesce((r.permissions -> '__saas_admin' ->> 'view')::boolean, false)
      and coalesce((r.permissions -> '__saas_admin' -> 'fields' ->> 'saas_workflows')::boolean, false)
  );
$$;
revoke all on function public.saas_lifecycle_workflows_allowed() from public, anon;
grant execute on function public.saas_lifecycle_workflows_allowed() to authenticated, service_role;

update public.org_roles r
set permissions = jsonb_set(
  r.permissions,
  '{__saas_admin,fields}',
  coalesce(r.permissions -> '__saas_admin' -> 'fields', '{}'::jsonb)
    || jsonb_build_object('saas_workflows',
      coalesce((r.permissions -> '__saas_admin' ->> 'edit')::boolean, false)),
  true
)
where r.org_id = public.support_provider_org_id()
  and r.permissions ? '__saas_admin'
  and not (coalesce(r.permissions -> '__saas_admin' -> 'fields', '{}'::jsonb) ? 'saas_workflows');

drop policy if exists saas_lifecycle_workflows_scope on public.workflows;
create policy saas_lifecycle_workflows_scope on public.workflows as restrictive
for all to authenticated
using (
  (coalesce(module_id, '') <> all(array['saas_orgs','saas_users','saas_demo_requests'])
    and not (coalesce(module_ids, '{}'::text[]) && array['saas_orgs','saas_users','saas_demo_requests']::text[]))
  or (org_id = public.support_provider_org_id() and public.saas_lifecycle_workflows_allowed())
)
with check (
  (coalesce(module_id, '') <> all(array['saas_orgs','saas_users','saas_demo_requests'])
    and not (coalesce(module_ids, '{}'::text[]) && array['saas_orgs','saas_users','saas_demo_requests']::text[]))
  or (org_id = public.support_provider_org_id() and public.saas_lifecycle_workflows_allowed())
);

drop policy if exists saas_lifecycle_workflow_events_scope on public.workflow_event_queue;
create policy saas_lifecycle_workflow_events_scope on public.workflow_event_queue as restrictive
for select to authenticated using (
  source_table <> all(array['saas_orgs','saas_users','saas_demo_requests','saas_support_tickets'])
  or (org_id = public.support_provider_org_id() and
    case when source_table = 'saas_support_tickets'
      then public.support_is_operator('support_view')
      else public.saas_lifecycle_workflows_allowed() end)
);

create or replace function public.guard_saas_lifecycle_workflow_mutation()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_row public.workflows%rowtype;
  v_modules text[] := array['saas_orgs','saas_users','saas_demo_requests'];
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  if v_row.module_id = any(v_modules)
    or coalesce(v_row.module_ids, '{}'::text[]) && v_modules
    or (tg_op = 'UPDATE' and
      (old.module_id = any(v_modules) or coalesce(old.module_ids, '{}'::text[]) && v_modules)) then
    if v_row.org_id is distinct from public.support_provider_org_id()
      or not (auth.role() = 'service_role' or public.saas_lifecycle_workflows_allowed()) then
      raise exception 'saas_workflow_access_denied' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists guard_saas_lifecycle_workflow_mutation on public.workflows;
create trigger guard_saas_lifecycle_workflow_mutation
before insert or update or delete on public.workflows
for each row execute function public.guard_saas_lifecycle_workflow_mutation();

create or replace function public.enqueue_saas_lifecycle_workflow_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_provider uuid := public.support_provider_org_id();
  v_module text;
  v_row jsonb;
  v_old jsonb;
  v_org_name text;
  v_org_slug text;
  v_org_demo boolean;
  v_mobile text;
  v_role_title text;
  v_old_role_title text;
begin
  if v_provider is null then return new; end if;
  if tg_table_name = 'saas_org_settings' then
    v_module := 'saas_orgs';
    select name into v_org_name from public.organizations where id = new.org_id;
    select mobile into v_mobile from public.saas_onboarding_requests
      where org_id = new.org_id and status = 'provisioned'
      order by created_at desc limit 1;
    v_row := jsonb_build_object('id',new.id,'org_id',v_provider,
      'customer_org_id',new.org_id,'org_name',v_org_name,'slug',new.slug,
      'status',new.status,'plan_code',new.plan_code,'is_demo',new.is_demo,
      'resolved_host',new.resolved_host,'primary_contact_mobile',coalesce(new.primary_contact_mobile,v_mobile),
      'trial_ends_at',new.trial_ends_at,'is_readonly',new.is_readonly,
      'owner_name',new.owner_name,'owner_email',new.owner_email,
      'provisioning_source',new.provisioning_source,'provisioned_at',new.created_at);
    if tg_op = 'UPDATE' then
      v_old := jsonb_build_object('id',old.id,'org_id',v_provider,
        'customer_org_id',old.org_id,'org_name',v_org_name,'slug',old.slug,
        'status',old.status,'plan_code',old.plan_code,'is_demo',old.is_demo,
        'resolved_host',old.resolved_host,'primary_contact_mobile',coalesce(old.primary_contact_mobile,v_mobile),
        'trial_ends_at',old.trial_ends_at,'is_readonly',old.is_readonly,
        'owner_name',old.owner_name,'owner_email',old.owner_email,
        'provisioning_source',old.provisioning_source,'provisioned_at',old.created_at);
    end if;
  elsif tg_table_name = 'profiles' then
    if new.org_id is null then return new; end if;
    v_module := 'saas_users';
    select o.name,o.slug,s.is_demo into v_org_name,v_org_slug,v_org_demo
      from public.organizations o left join public.saas_org_settings s on s.org_id=o.id
      where o.id=new.org_id;
    select title into v_role_title from public.org_roles where id = new.role_id;
    v_row := jsonb_build_object('id',new.id,'org_id',v_provider,
      'customer_org_id',new.org_id,'org_name',v_org_name,'org_slug',v_org_slug,
      'is_demo',v_org_demo,'full_name',new.full_name,'email',new.email,
      'mobile',coalesce(new.mobile_1,new.mobile),'role',new.role,
      'role_id',new.role_id,'role_title',v_role_title,
      'software_role',new.role,'profile_exists',true,
      'is_active',new.is_active);
    if tg_op = 'UPDATE' then
      select title into v_old_role_title from public.org_roles where id = old.role_id;
      v_old := jsonb_build_object('id',old.id,'org_id',v_provider,
        'customer_org_id',old.org_id,'org_name',v_org_name,'org_slug',v_org_slug,
        'is_demo',v_org_demo,'full_name',old.full_name,'email',old.email,
        'mobile',coalesce(old.mobile_1,old.mobile),'role',old.role,
        'role_id',old.role_id,'role_title',v_old_role_title,
        'software_role',old.role,'profile_exists',true,
        'is_active',old.is_active);
    end if;
  elsif tg_table_name = 'saas_onboarding_requests' then
    v_module := 'saas_demo_requests';
    v_row := jsonb_build_object('id',new.id,'org_id',v_provider,
      'customer_org_id',new.org_id,'full_name',new.full_name,
      'organization_name',coalesce(new.organization_name,new.business_name),
      'mobile',new.mobile,'requested_slug',new.requested_slug,
      'demo_url',new.demo_url,
      'status',new.status,'failure_code',new.failure_code,
      'is_demo_request',new.is_demo_request,'industry',new.industry,
      'email',new.email,'business_name',new.business_name,
      'employee_count_band',new.employee_count_band,
      'discovery_source',new.discovery_source,'notes',new.notes,
      'provision_attempts',new.provision_attempts,
      'failure_message',new.failure_message,
      'created_at',new.created_at,'updated_at',new.updated_at);
    if tg_op = 'UPDATE' then
      v_old := jsonb_build_object('id',old.id,'org_id',v_provider,
        'customer_org_id',old.org_id,'full_name',old.full_name,
        'organization_name',coalesce(old.organization_name,old.business_name),
        'mobile',old.mobile,'requested_slug',old.requested_slug,
        'demo_url',old.demo_url,
        'status',old.status,'failure_code',old.failure_code,
        'is_demo_request',old.is_demo_request,'industry',old.industry,
        'email',old.email,'business_name',old.business_name,
        'employee_count_band',old.employee_count_band,
        'discovery_source',old.discovery_source,'notes',old.notes,
        'provision_attempts',old.provision_attempts,
        'failure_message',old.failure_message,
        'created_at',old.created_at,'updated_at',old.updated_at);
    end if;
  else
    return new;
  end if;
  if v_old is not distinct from v_row then return new; end if;
  if not exists (
    select 1 from public.workflows w
    where w.org_id=v_provider and w.is_active=true
      and (w.module_id=v_module or v_module=any(coalesce(w.module_ids,'{}'::text[])))
      and w.trigger_type in ('on_create','on_upsert')
  ) then return new; end if;
  insert into public.workflow_event_queue
    (org_id,source_table,record_id,event_type,record_snapshot,previous_snapshot,actor_user_id,priority)
  values (v_provider,v_module,(v_row->>'id')::uuid,
    case when tg_op='INSERT' then 'create' else 'upsert' end,
    v_row,v_old,auth.uid(),100);
  return new;
end;
$$;

drop trigger if exists saas_lifecycle_workflow_event on public.saas_org_settings;
create trigger saas_lifecycle_workflow_event after insert or update on public.saas_org_settings
for each row execute function public.enqueue_saas_lifecycle_workflow_event();
drop trigger if exists saas_lifecycle_workflow_event on public.profiles;
create trigger saas_lifecycle_workflow_event after insert or update on public.profiles
for each row execute function public.enqueue_saas_lifecycle_workflow_event();
drop trigger if exists saas_lifecycle_workflow_event on public.saas_onboarding_requests;
create trigger saas_lifecycle_workflow_event after insert or update on public.saas_onboarding_requests
for each row execute function public.enqueue_saas_lifecycle_workflow_event();

create or replace function public.enqueue_saas_org_name_workflow_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_provider uuid := public.support_provider_org_id();
  v_settings public.saas_org_settings%rowtype;
  v_snapshot jsonb;
begin
  if new.name is not distinct from old.name or v_provider is null then return new; end if;
  select * into v_settings from public.saas_org_settings where org_id = new.id;
  if v_settings.id is null then return new; end if;
  if not exists (select 1 from public.workflows w where w.org_id = v_provider
    and w.is_active and w.trigger_type = 'on_upsert'
    and (w.module_id = 'saas_orgs' or 'saas_orgs' = any(coalesce(w.module_ids, '{}'::text[]))))
    then return new;
  end if;
  v_snapshot := jsonb_build_object('id',v_settings.id,'org_id',v_provider,
    'customer_org_id',new.id,'org_name',new.name,'slug',v_settings.slug,
    'status',v_settings.status,'plan_code',v_settings.plan_code,
    'is_demo',v_settings.is_demo,'resolved_host',v_settings.resolved_host,
    'primary_contact_mobile',v_settings.primary_contact_mobile,
    'trial_ends_at',v_settings.trial_ends_at);
  insert into public.workflow_event_queue
    (org_id,source_table,record_id,event_type,record_snapshot,previous_snapshot,actor_user_id,priority)
  values (v_provider,'saas_orgs',v_settings.id,'upsert',v_snapshot,
    jsonb_set(v_snapshot,'{org_name}',to_jsonb(old.name)),auth.uid(),100);
  return new;
end;
$$;
drop trigger if exists saas_org_name_workflow_event on public.organizations;
create trigger saas_org_name_workflow_event after update of name on public.organizations
for each row execute function public.enqueue_saas_org_name_workflow_event();

notify pgrst, 'reload schema';
commit;
