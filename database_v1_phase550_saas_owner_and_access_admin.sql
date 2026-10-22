-- Phase 550: keep owner details visible to SaaS admins and make manual
-- access extensions permission-scoped and consistent with billing periods.
begin;

create or replace function public.fill_saas_org_owner_projection()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_email text; v_mobile text;
begin
  if nullif(trim(coalesce(new.owner_name, '')), '') is not null
    and nullif(trim(coalesce(new.owner_email, '')), '') is not null then return new; end if;
  select p.full_name, p.email, coalesce(p.mobile_1,p.mobile)
    into v_name,v_email,v_mobile
  from public.user_organization_memberships m
  join public.profiles p on p.id = m.user_id
  where m.org_id = new.org_id and m.is_owner and m.is_active
  order by m.created_at limit 1;
  if v_name is null and v_email is null and new.created_by is not null then
    select p.full_name,p.email,coalesce(p.mobile_1,p.mobile)
      into v_name,v_email,v_mobile from public.profiles p where p.id = new.created_by;
  end if;
  new.owner_name := coalesce(nullif(trim(new.owner_name), ''), nullif(trim(v_name), ''), new.owner_name);
  new.owner_email := coalesce(nullif(trim(new.owner_email), ''), nullif(trim(v_email), ''), new.owner_email);
  new.primary_contact_mobile := coalesce(nullif(trim(new.primary_contact_mobile), ''), nullif(trim(v_mobile), ''), new.primary_contact_mobile);
  return new;
end;
$$;
drop trigger if exists fill_saas_org_owner_projection on public.saas_org_settings;
create trigger fill_saas_org_owner_projection before insert or update of owner_name,owner_email,created_by,request_id
on public.saas_org_settings for each row execute function public.fill_saas_org_owner_projection();

update public.saas_org_settings
set owner_name = owner_name, owner_email = owner_email
where nullif(trim(coalesce(owner_name, '')), '') is null
   or nullif(trim(coalesce(owner_email, '')), '') is null;

create or replace function public.admin_get_saas_org_owner(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_settings public.saas_org_settings%rowtype; v_name text; v_email text; v_mobile text; v_access_ends_at timestamptz;
begin
  if not public.current_user_has_saas_admin_permission() then raise exception 'permission denied' using errcode='42501'; end if;
  select * into v_settings from public.saas_org_settings where org_id = p_org_id;
  if v_settings.id is null then return null; end if;
  select p.full_name,p.email,coalesce(p.mobile_1,p.mobile)
    into v_name,v_email,v_mobile from public.user_organization_memberships m
    join public.profiles p on p.id = m.user_id
    where m.org_id = p_org_id and m.is_owner and m.is_active
    order by m.created_at limit 1;
  if v_settings.is_demo then
    v_access_ends_at := v_settings.trial_ends_at;
  else
    select current_period_ends_at into v_access_ends_at from public.saas_recurring_subscriptions
      where org_id=p_org_id and item_kind='plan' and status in ('active','grace')
      order by current_period_ends_at desc limit 1;
  end if;
  return jsonb_build_object(
    'owner_name',coalesce(nullif(trim(v_name),''),nullif(trim(v_settings.owner_name),'')),
    'owner_email',coalesce(nullif(trim(v_email),''),nullif(trim(v_settings.owner_email),'')),
    'primary_contact_mobile',coalesce(nullif(trim(v_mobile),''),nullif(trim(v_settings.primary_contact_mobile),'')),
    'access_ends_at',v_access_ends_at,'access_mode',case when v_settings.is_demo then 'demo' else 'subscription' end);
end;
$$;
revoke all on function public.admin_get_saas_org_owner(uuid) from public, anon;
grant execute on function public.admin_get_saas_org_owner(uuid) to authenticated;

create or replace function public.admin_saas_extend_org_trial(p_org_id uuid, p_days integer default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_new_end timestamptz;
begin
  if not public.current_user_has_saas_admin_permission('edit_orgs') then
    raise exception 'permission denied' using errcode='42501'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'invalid_extension_days' using errcode='22023'; end if;
  update public.saas_org_settings
    set trial_ends_at = greatest(coalesce(trial_ends_at,now()),now()) + make_interval(days=>p_days),
        is_readonly = false, status = case when status='suspended' then 'trial' else status end,
        updated_at = now(), updated_by = auth.uid()
    where org_id = p_org_id and is_demo
    returning trial_ends_at into v_new_end;
  if v_new_end is null then raise exception 'demo_org_not_found' using errcode='P0002'; end if;
  update public.saas_renewal_requests set status='extended',resolved_at=now(),resolved_by=auth.uid(),updated_at=now()
    where org_id=p_org_id and status='pending';
  return jsonb_build_object('success',true,'new_trial_ends_at',v_new_end,'mode','demo');
end;
$$;
revoke all on function public.admin_saas_extend_org_trial(uuid,integer) from public,anon;
grant execute on function public.admin_saas_extend_org_trial(uuid,integer) to authenticated;

create or replace function public.admin_saas_extend_org_access(p_org_id uuid,p_days integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_settings public.saas_org_settings%rowtype; v_subscription public.saas_recurring_subscriptions%rowtype;
  v_new_end timestamptz;
begin
  if not public.current_user_has_saas_admin_permission('edit_orgs') then
    raise exception 'permission denied' using errcode='42501'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'invalid_extension_days' using errcode='22023'; end if;
  select * into v_settings from public.saas_org_settings where org_id=p_org_id for update;
  if v_settings.id is null then raise exception 'saas_org_not_found' using errcode='P0002'; end if;
  if v_settings.is_demo then return public.admin_saas_extend_org_trial(p_org_id,p_days); end if;
  select * into v_subscription from public.saas_recurring_subscriptions
    where org_id=p_org_id and item_kind='plan' and status in ('active','grace')
    order by current_period_ends_at desc limit 1 for update;
  if v_subscription.id is null then raise exception 'active_subscription_not_found' using errcode='P0002'; end if;
  if exists(select 1 from public.saas_subscription_invoices
    where subscription_id=v_subscription.id and status in ('issued','overdue')) then
    raise exception 'subscription_invoice_pending' using errcode='23514'; end if;
  v_new_end := greatest(v_subscription.current_period_ends_at,now())+make_interval(days=>p_days);
  update public.saas_recurring_subscriptions
    set current_period_ends_at=v_new_end,next_invoice_at=greatest(now(),v_new_end-interval '7 days'),
      status='active',updated_at=now()
    where id=v_subscription.id;
  update public.saas_org_settings set billing_readonly=false,billing_readonly_at=null,updated_at=now(),updated_by=auth.uid()
    where org_id=p_org_id;
  return jsonb_build_object('success',true,'new_access_ends_at',v_new_end,'mode','subscription');
end;
$$;
revoke all on function public.admin_saas_extend_org_access(uuid,integer) from public,anon;
grant execute on function public.admin_saas_extend_org_access(uuid,integer) to authenticated;

notify pgrst,'reload schema';
commit;
