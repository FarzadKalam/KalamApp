-- TazeSystem V1 Phase 518
-- کنترل یکپارچهٔ دسترسی، اعتبارها و سابقهٔ حساب سازمان توسط مدیر SaaS.

begin;

create table if not exists public.saas_account_admin_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  title text not null,
  status text not null default 'completed',
  amount_irt numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_saas_account_admin_history_org_created
  on public.saas_account_admin_history(org_id, created_at desc);

alter table public.saas_account_admin_history enable row level security;
drop policy if exists p_saas_account_admin_history_org_read on public.saas_account_admin_history;
create policy p_saas_account_admin_history_org_read
  on public.saas_account_admin_history for select to authenticated
  using (org_id = public.current_org_id());
revoke all on public.saas_account_admin_history from public, anon, authenticated;
grant select on public.saas_account_admin_history to authenticated;

create table if not exists public.org_ai_credit_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  amount_irt numeric not null check (amount_irt > 0),
  reason text,
  granted_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_org_ai_credit_grants_org_created
  on public.org_ai_credit_grants(org_id, created_at desc);
alter table public.org_ai_credit_grants enable row level security;
drop policy if exists p_org_ai_credit_grants_org_read on public.org_ai_credit_grants;
create policy p_org_ai_credit_grants_org_read
  on public.org_ai_credit_grants for select to authenticated
  using (org_id = public.current_org_id());
revoke all on public.org_ai_credit_grants from public, anon, authenticated;
grant select on public.org_ai_credit_grants to authenticated;

create or replace function public.current_user_is_saas_admin_org()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.org_is_saas_admin(public.current_org_id());
$$;
revoke all on function public.current_user_is_saas_admin_org() from public, anon;
grant execute on function public.current_user_is_saas_admin_org() to authenticated;

-- permission نقش به‌تنهایی کافی نیست؛ نقشِ دارای این کلید در tenant نباید
-- بتواند پنل لایهٔ SaaS را باز کند.
create or replace function public.current_user_has_saas_admin_permission(required_field text default null)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  role_permissions jsonb;
  root_permission jsonb;
  root_fields jsonb;
  field_name text := nullif(trim(coalesce(required_field, '')), '');
  root_edit boolean := false;
  has_view boolean := false;
  current_org uuid;
begin
  select coalesce(p.org_id, r.org_id), r.permissions
    into current_org, role_permissions
  from public.profiles p
  join public.org_roles r on r.id = p.role_id
  where p.id = auth.uid()
  limit 1;
  if role_permissions is null or not public.org_is_saas_admin(current_org) then return false; end if;
  root_permission := role_permissions -> '__saas_admin';
  if root_permission is null or jsonb_typeof(root_permission) <> 'object' then return false; end if;
  root_fields := coalesce(root_permission -> 'fields', '{}'::jsonb);
  root_edit := coalesce((root_permission ->> 'edit')::boolean, false);
  has_view := coalesce((root_permission ->> 'view')::boolean, false)
    or root_edit
    or coalesce((root_fields ->> 'edit_orgs')::boolean, false)
    or coalesce((root_fields ->> 'edit_requests')::boolean, false)
    or coalesce((root_fields ->> 'edit_user_announcements')::boolean, false)
    or coalesce((root_fields ->> 'demo_override')::boolean, false);
  if not has_view then return false; end if;
  if field_name is null or field_name = 'view' then return true; end if;
  return coalesce((root_permission ->> field_name)::boolean, false)
    or coalesce((root_fields ->> field_name)::boolean, false);
end;
$$;
revoke all on function public.current_user_has_saas_admin_permission(text) from public, anon;
grant execute on function public.current_user_has_saas_admin_permission(text) to authenticated;

create or replace function public.admin_adjust_saas_org_account(
  p_org_id uuid,
  p_sms_delta numeric default 0,
  p_ai_delta_irt numeric default 0,
  p_billing_wallet_delta_irt numeric default 0,
  p_reason text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_sms numeric := coalesce(p_sms_delta, 0);
  v_ai numeric := coalesce(p_ai_delta_irt, 0);
  v_wallet numeric := coalesce(p_billing_wallet_delta_irt, 0);
  v_old numeric := 0;
  v_new numeric := 0;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'تغییر دستی مدیر تازه سیستم');
begin
  if not public.current_user_has_saas_admin_permission('edit_orgs') then
    raise exception 'permission denied';
  end if;
  if not exists (select 1 from public.saas_org_settings where org_id = p_org_id) then
    raise exception 'saas_org_not_found';
  end if;
  if v_sms = 0 and v_ai = 0 and v_wallet = 0 then
    raise exception 'admin_adjustment_empty';
  end if;

  if v_sms <> 0 then
    select coalesce(sum(quantity), 0) into v_old
    from public.saas_org_entitlements
    where org_id = p_org_id and item_kind = 'quota'
      and entitlement_code = 'sms_credit' and source = 'admin_adjustment'
      and state = 'enabled';
    v_new := greatest(v_old + v_sms, 0);
    delete from public.saas_org_entitlements
    where org_id = p_org_id and item_kind = 'quota'
      and entitlement_code = 'sms_credit' and source = 'admin_adjustment';
    if v_new > 0 then
      insert into public.saas_org_entitlements(org_id, item_kind, entitlement_code, quantity, state, source, created_by, metadata)
      values (p_org_id, 'quota', 'sms_credit', v_new, 'enabled', 'admin_adjustment', auth.uid(), jsonb_build_object('reason', v_reason));
    end if;
  end if;

  if v_ai <> 0 then
    insert into public.org_ai_wallets(org_id, balance_irt, status)
    values (p_org_id, 0, 'active')
    on conflict (org_id) do nothing;
    update public.org_ai_wallets
      set balance_irt = balance_irt + v_ai,
          updated_at = now(), status = case when balance_irt + v_ai > 0 then 'active' else status end
      where org_id = p_org_id and balance_irt + v_ai >= 0;
    if not found then raise exception 'ai_wallet_negative_balance'; end if;
    if v_ai > 0 then
      insert into public.org_ai_credit_grants(org_id, amount_irt, reason, granted_by, metadata)
      values (p_org_id, v_ai, v_reason, auth.uid(), jsonb_build_object('source', 'admin_adjustment'));
    end if;
  end if;

  if v_wallet <> 0 then
    insert into public.org_billing_wallets(org_id, balance_irt, status)
    values (p_org_id, 0, 'active')
    on conflict (org_id) do nothing;
    update public.org_billing_wallets
      set balance_irt = balance_irt + v_wallet, updated_at = now()
      where org_id = p_org_id and balance_irt + v_wallet >= 0;
    if not found then raise exception 'billing_wallet_negative_balance'; end if;
    select balance_irt into v_new from public.org_billing_wallets where org_id = p_org_id;
    insert into public.org_billing_wallet_transactions(org_id, kind, amount_irt, balance_after_irt, description, metadata, created_by)
    values (p_org_id, 'admin_adjustment', v_wallet, v_new, v_reason, jsonb_build_object('source', 'admin_adjustment'), auth.uid());
  end if;

  insert into public.saas_account_admin_history(org_id, kind, title, amount_irt, metadata, created_by)
  values (p_org_id, 'admin_adjustment', v_reason, nullif(v_ai + v_wallet, 0), jsonb_build_object('sms_delta', v_sms, 'ai_delta_irt', v_ai, 'billing_wallet_delta_irt', v_wallet), auth.uid());

  return public.saas_account_overview_payload(p_org_id);
end;
$$;

-- نسخهٔ کامل payload: پلن/توضیحات، سابقهٔ دمو، تغییرات دستی، کیف‌پول و خریدها.
create or replace function public.saas_account_overview_payload(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  settings_row public.saas_org_settings%rowtype;
  plan_row public.saas_plans%rowtype;
  enabled_modules jsonb; enabled_features jsonb; quotas jsonb; plan_quotas jsonb := '{}'::jsonb;
  member_count integer; ai_wallet jsonb; billing_wallet jsonb; instagram_count integer;
  is_saas_admin_org boolean := false; history_rows jsonb;
begin
  select * into settings_row from public.saas_org_settings where org_id = p_org_id;
  if settings_row.org_id is null then return jsonb_build_object('is_saas_org', false); end if;
  is_saas_admin_org := public.org_is_saas_admin(p_org_id);
  select * into plan_row from public.saas_plans where lower(code) = lower(coalesce(settings_row.plan_code, '')) limit 1;
  plan_quotas := coalesce(plan_row.included_quotas, '{}'::jsonb);
  select coalesce(jsonb_object_agg(code, enabled), '{}'::jsonb) into enabled_modules from (
    select key as code, lower(value #>> '{}') in ('true','1','yes','on') as enabled from jsonb_each(coalesce(plan_row.enabled_modules, '{}'::jsonb))
    union all select entitlement_code, state = 'enabled' from public.saas_org_entitlements where org_id = p_org_id and item_kind = 'module' and state <> 'expired' and (expires_at is null or expires_at > now())
  ) source;
  enabled_modules := enabled_modules || coalesce(settings_row.module_overrides, '{}'::jsonb);
  select coalesce(jsonb_object_agg(code, enabled), '{}'::jsonb) into enabled_features from (
    select key as code, lower(value #>> '{}') in ('true','1','yes','on') as enabled from jsonb_each(coalesce(plan_row.enabled_features, '{}'::jsonb))
    union all select entitlement_code, state = 'enabled' from public.saas_org_entitlements where org_id = p_org_id and item_kind = 'feature' and state <> 'expired' and (expires_at is null or expires_at > now())
  ) source;
  enabled_features := enabled_features || coalesce(settings_row.feature_overrides, '{}'::jsonb);
  select coalesce(jsonb_object_agg(entitlement_code, total), '{}'::jsonb) into quotas from (
    select entitlement_code, sum(case when state = 'enabled' then quantity else 0 end) as total from public.saas_org_entitlements where org_id = p_org_id and item_kind = 'quota' and state <> 'expired' and (expires_at is null or expires_at > now()) group by entitlement_code
  ) source;
  select count(*) into member_count from public.user_organization_memberships where org_id = p_org_id and is_active;
  select to_jsonb(wallet) into ai_wallet from public.org_ai_wallets wallet where wallet.org_id = p_org_id;
  select to_jsonb(wallet) into billing_wallet from public.org_billing_wallets wallet where wallet.org_id = p_org_id;
  select count(*) into instagram_count from public.instagram_accounts where org_id = p_org_id and is_active;
  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb) into history_rows from (
    select jsonb_build_object('kind','order','title','خرید حساب','status',status,'amount_irt',total_irt,'created_at',created_at) row_data, created_at from public.saas_orders where org_id=p_org_id
    union all select jsonb_build_object('kind','demo','title','دریافت نسخه دمو','status','completed','amount_irt',0,'created_at',issued_at), issued_at from public.saas_demo_issuance where org_id=p_org_id
    union all select jsonb_build_object('kind','admin_adjustment','title',title,'status',status,'amount_irt',amount_irt,'created_at',created_at,'metadata',metadata), created_at from public.saas_account_admin_history where org_id=p_org_id
    union all select jsonb_build_object('kind','wallet','title',coalesce(description,'تغییر کیف پول'),'status','completed','amount_irt',amount_irt,'created_at',created_at), created_at from public.org_billing_wallet_transactions where org_id=p_org_id
  ) history;
  return jsonb_build_object(
    'is_saas_org', true,
    'organization', jsonb_build_object('name',(select name from public.organizations where id=p_org_id),'status',settings_row.status,'is_demo',settings_row.is_demo,'trial_ends_at',settings_row.trial_ends_at,'billing_readonly',settings_row.billing_readonly),
    'plan', jsonb_build_object('code',plan_row.code,'title',plan_row.title,'description',plan_row.description,'short_description',plan_row.short_description,'display_features',plan_row.display_features,'enabled_modules',plan_row.enabled_modules,'enabled_features',plan_row.enabled_features,'price_monthly',plan_row.price_monthly,'included_users',plan_row.included_users,'max_users',plan_row.max_users,'storage_gb',plan_row.storage_gb,'included_quotas',plan_row.included_quotas),
    'access', jsonb_build_object('modules',enabled_modules,'features',enabled_features,'full_access',is_saas_admin_org),
    'management', jsonb_build_object('plan_code',settings_row.plan_code,'module_overrides',settings_row.module_overrides,'feature_overrides',settings_row.feature_overrides,'quota_adjustments',quotas),
    'quotas', jsonb_build_object('users_used',member_count,'users_included',coalesce(plan_row.included_users,0),'users_extra',coalesce((quotas->>'users')::numeric,0),'storage_gb',coalesce(plan_row.storage_gb,0)+coalesce((quotas->>'storage_gb')::numeric,0),'scheduled_runs',coalesce((plan_quotas->>'scheduled_runs')::numeric,0)+coalesce((quotas->>'scheduled_runs')::numeric,0),'active_workflows',coalesce((plan_quotas->>'active_workflows')::numeric,0)+coalesce((quotas->>'active_workflows')::numeric,0),'sms_credit',coalesce((quotas->>'sms_credit')::numeric,0),'instagram_accounts_used',instagram_count,'instagram_accounts',coalesce((quotas->>'instagram_accounts')::numeric,0)),
    'ai_wallet',coalesce(ai_wallet,'{}'::jsonb),'billing_wallet',coalesce(billing_wallet,'{}'::jsonb),'history',history_rows
  );
end; $$;

revoke all on function public.admin_adjust_saas_org_account(uuid,numeric,numeric,numeric,text) from public, anon;
grant execute on function public.admin_adjust_saas_org_account(uuid,numeric,numeric,numeric,text) to authenticated;
notify pgrst, 'reload schema';
commit;
