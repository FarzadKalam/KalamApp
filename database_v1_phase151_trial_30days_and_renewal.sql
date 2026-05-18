-- =====================================================
-- KalamApp - Phase 151: Trial 30 days + Renewal requests + Admin ops
-- Date: 2026-05-17
-- Type: Additive / non-breaking
-- Changes:
--   1) Demo plan trial_days → 30
--   2) provision_self_service_demo fallback → 30 days
--   3) RPC: get_current_org_saas_status (برای tenant banner)
--   4) saas_renewal_requests table
--   5) RPC: tenant_request_trial_renewal
--   6) RPC: admin_saas_extend_org_trial
--   7) RPC: admin_saas_set_org_status
-- =====================================================

begin;

-- ── 1. Demo plan → 30 days ──────────────────────────────────────────────────
update public.saas_plans
set trial_days = 30
where is_demo_default = true
   or lower(code) = 'public_demo_full';

-- ── 2. Fix provision function fallback 15 → 30 ──────────────────────────────
create or replace function public.provision_self_service_demo(
  p_full_name         text,
  p_mobile            text,
  p_business_name     text,
  p_employee_count_band text default null,
  p_discovery_source  text default null,
  p_requested_slug    text default null,
  p_owner_email       text default null,
  p_industry          text default null,
  p_brand_palette_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  calling_user_id uuid;
  calling_user    auth.users%rowtype;
  norm_phone      text;
  norm_email      text;
  norm_slug       text;
  final_slug      text;
  target_org_id   uuid;
  new_profile_id  uuid;
  target_plan     public.saas_plans%rowtype;
  target_trial_days integer := 30;
  new_onboarding_id uuid;
  new_settings_id   uuid;
  host_suffix       text := '.tazesystem.ir';
  resolved          text;
begin
  -- ── Caller ──────────────────────────────────────────────────────────────
  calling_user_id := auth.uid();
  if calling_user_id is null then
    return jsonb_build_object(
      'success', false,
      'failure_code', 'unauthenticated',
      'message', 'باید وارد حساب کاربری شوید.'
    );
  end if;

  select * into calling_user from auth.users where id = calling_user_id;

  -- ── Normalise inputs ────────────────────────────────────────────────────
  norm_phone := public.normalize_iran_mobile_e164(coalesce(p_mobile, ''));
  norm_email := lower(trim(coalesce(p_owner_email, '')));
  if norm_email = '' then norm_email := null; end if;

  -- ── Demo limit per phone ─────────────────────────────────────────────────
  if norm_phone is not null then
    if exists (
      select 1 from public.saas_onboarding_requests
      where public.normalize_iran_mobile_e164(mobile_1) = norm_phone
        and status not in ('rejected', 'cancelled')
    ) then
      return jsonb_build_object(
        'success', false,
        'failure_code', 'demo_limit_reached',
        'message', 'این شماره قبلاً از نسخه دمو استفاده کرده است.'
      );
    end if;
  end if;

  -- ── Slug ────────────────────────────────────────────────────────────────
  norm_slug := regexp_replace(
    lower(trim(coalesce(p_requested_slug, ''))),
    '[^a-z0-9\-]', '', 'g'
  );
  if length(norm_slug) < 3 then
    norm_slug := 'org' || to_char(now(), 'YYMMDDHHMI');
  end if;

  -- ensure uniqueness
  final_slug := norm_slug;
  declare slug_counter integer := 0;
  begin
    loop
      exit when not exists (
        select 1 from public.saas_org_settings where slug = final_slug
      );
      slug_counter := slug_counter + 1;
      final_slug := norm_slug || slug_counter::text;
      if slug_counter > 99 then
        return jsonb_build_object(
          'success', false,
          'failure_code', 'slug_unavailable',
          'message', 'آدرس انتخابی در دسترس نیست.'
        );
      end if;
    end loop;
  end;

  resolved := final_slug || host_suffix;

  -- ── Demo plan ────────────────────────────────────────────────────────────
  select * into target_plan
  from public.saas_plans
  where is_active = true
    and (is_demo_default = true or lower(code) = 'public_demo_full')
  order by is_demo_default desc
  limit 1;

  if target_plan.id is null then
    return jsonb_build_object(
      'success', false,
      'failure_code', 'demo_plan_missing',
      'message', 'پلن دمو در سیستم تعریف نشده است.'
    );
  end if;

  target_trial_days := greatest(coalesce(target_plan.trial_days, 30), 1);

  -- ── Create org ───────────────────────────────────────────────────────────
  insert into public.organizations (name, created_at, updated_at)
  values (trim(coalesce(p_business_name, p_full_name, 'سازمان دمو')), now(), now())
  returning id into target_org_id;

  -- ── org_role (system admin) ──────────────────────────────────────────────
  insert into public.org_roles (org_id, title, permissions, is_system)
  values (
    target_org_id,
    'ادمین',
    '{}'::jsonb,
    true
  )
  on conflict do nothing;

  -- ── Profile ──────────────────────────────────────────────────────────────
  new_profile_id := calling_user_id;

  insert into public.profiles (
    id, org_id, full_name, mobile_1, email, role,
    role_id, is_active, created_at, updated_at
  )
  values (
    new_profile_id,
    target_org_id,
    trim(coalesce(p_full_name, '')),
    norm_phone,
    norm_email,
    'admin',
    (select id from public.org_roles where org_id = target_org_id and is_system = true limit 1),
    true,
    now(),
    now()
  )
  on conflict (id) do update
    set org_id    = excluded.org_id,
        role      = excluded.role,
        role_id   = excluded.role_id,
        is_active = true,
        updated_at = now();

  -- ── company_settings ─────────────────────────────────────────────────────
  insert into public.company_settings (
    org_id, company_full_name, trade_name, mobile,
    brand_palette_key, created_at, updated_at
  )
  values (
    target_org_id,
    trim(coalesce(p_business_name, p_full_name, 'سازمان دمو')),
    trim(coalesce(p_business_name, p_full_name, 'سازمان دمو')),
    coalesce(
      public.normalize_iran_mobile_e164(coalesce(p_mobile,'')),
      norm_phone
    ),
    coalesce(nullif(trim(p_brand_palette_key),''), 'default'),
    now(),
    now()
  )
  on conflict do nothing;

  -- ── saas_org_settings ─────────────────────────────────────────────────────
  insert into public.saas_org_settings (
    org_id,
    slug,
    status,
    plan_code,
    trial_ends_at,
    is_demo,
    is_readonly,
    resolved_host,
    dns_status,
    provisioning_source,
    provisioned_at,
    primary_contact_mobile,
    created_at,
    updated_at
  )
  values (
    target_org_id,
    final_slug,
    'trial',
    target_plan.code,
    now() + make_interval(days => target_trial_days),
    true,
    false,
    resolved,
    'pending',
    'self_service',
    now(),
    norm_phone,
    now(),
    now()
  );

  -- ── saas_onboarding_requests ──────────────────────────────────────────────
  insert into public.saas_onboarding_requests (
    org_id,
    full_name,
    first_name,
    last_name,
    mobile_1,
    email,
    organization_name,
    industry,
    approx_user_count,
    discovery_source,
    status,
    created_at,
    updated_at
  )
  values (
    target_org_id,
    trim(coalesce(p_full_name, '')),
    split_part(trim(coalesce(p_full_name, '')), ' ', 1),
    nullif(trim(substring(coalesce(p_full_name, '') from position(' ' in coalesce(p_full_name, '')))), ''),
    norm_phone,
    norm_email,
    trim(coalesce(p_business_name, '')),
    nullif(trim(coalesce(p_industry, '')), ''),
    nullif(trim(coalesce(p_employee_count_band, '')), ''),
    nullif(trim(coalesce(p_discovery_source, '')), ''),
    'provisioned',
    now(),
    now()
  )
  returning id into new_onboarding_id;

  return jsonb_build_object(
    'success',       true,
    'org_id',        target_org_id,
    'slug',          final_slug,
    'redirect_host', resolved,
    'trial_days',    target_trial_days,
    'plan_code',     target_plan.code
  );

exception when others then
  return jsonb_build_object(
    'success',       false,
    'failure_code',  'unexpected_error',
    'message',       sqlerrm
  );
end;
$$;

revoke all on function public.provision_self_service_demo from public;
grant execute on function public.provision_self_service_demo to authenticated;

-- ── 3. RPC: get_current_org_saas_status ─────────────────────────────────────
create or replace function public.get_current_org_saas_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id_val uuid := public.current_org_id();
  rec record;
begin
  if org_id_val is null then
    return null;
  end if;

  select status, is_demo, is_readonly, trial_ends_at, plan_code, slug
  into rec
  from public.saas_org_settings
  where org_id = org_id_val
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'status',        rec.status,
    'is_demo',       rec.is_demo,
    'is_readonly',   rec.is_readonly or (rec.trial_ends_at is not null and rec.trial_ends_at < now()),
    'trial_ends_at', rec.trial_ends_at,
    'plan_code',     rec.plan_code,
    'slug',          rec.slug
  );
end;
$$;

revoke all on function public.get_current_org_saas_status() from public;
grant execute on function public.get_current_org_saas_status() to authenticated;

-- ── 4. saas_renewal_requests ─────────────────────────────────────────────────
create table if not exists public.saas_renewal_requests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  requested_by  uuid references auth.users(id) on delete set null,
  status        text not null default 'pending',
  notes         text,
  admin_notes   text,
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.saas_renewal_requests
  add constraint chk_renewal_status
  check (status in ('pending', 'reviewed', 'extended', 'rejected'));

create index if not exists idx_saas_renewal_requests_org
  on public.saas_renewal_requests(org_id, created_at desc);

create index if not exists idx_saas_renewal_requests_status
  on public.saas_renewal_requests(status, created_at desc);

drop trigger if exists trg_saas_renewal_updated_at on public.saas_renewal_requests;
create trigger trg_saas_renewal_updated_at
before update on public.saas_renewal_requests
for each row execute function public.set_updated_at();

grant select, insert on public.saas_renewal_requests to authenticated;
grant select, insert, update, delete on public.saas_renewal_requests to service_role;

alter table public.saas_renewal_requests enable row level security;

drop policy if exists p_saas_renewal_requests_org_select on public.saas_renewal_requests;
create policy p_saas_renewal_requests_org_select on public.saas_renewal_requests
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists p_saas_renewal_requests_org_insert on public.saas_renewal_requests;
create policy p_saas_renewal_requests_org_insert on public.saas_renewal_requests
for insert to authenticated
with check (org_id = public.current_org_id());

-- ── 5. RPC: tenant_request_trial_renewal ────────────────────────────────────
create or replace function public.tenant_request_trial_renewal(p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id  uuid := auth.uid();
  org_id_val uuid := public.current_org_id();
  existing_id uuid;
begin
  if caller_id is null or org_id_val is null then
    return jsonb_build_object('success', false, 'message', 'احراز هویت ناموفق بود.');
  end if;

  -- بررسی وجود درخواست pending قبلی
  select id into existing_id
  from public.saas_renewal_requests
  where org_id = org_id_val
    and status = 'pending'
  limit 1;

  if existing_id is not null then
    return jsonb_build_object(
      'success', true,
      'already_exists', true,
      'request_id', existing_id,
      'message', 'درخواست تمدید قبلی شما هنوز در انتظار بررسی است.'
    );
  end if;

  insert into public.saas_renewal_requests (org_id, requested_by, notes)
  values (org_id_val, caller_id, nullif(trim(coalesce(p_notes, '')), ''))
  returning id into existing_id;

  return jsonb_build_object(
    'success', true,
    'already_exists', false,
    'request_id', existing_id,
    'message', 'درخواست تمدید ثبت شد. تیم ما در اسرع وقت بررسی می‌کند.'
  );
end;
$$;

revoke all on function public.tenant_request_trial_renewal(text) from public;
grant execute on function public.tenant_request_trial_renewal(text) to authenticated;

-- ── 6. RPC: admin_saas_extend_org_trial ─────────────────────────────────────
create or replace function public.admin_saas_extend_org_trial(
  p_org_id uuid,
  p_days   integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id    uuid := auth.uid();
  caller_role  text;
  new_trial_at timestamptz;
begin
  -- فقط super_admin یا admin داخلی مجاز
  select role into caller_role
  from public.profiles
  where id = caller_id
  limit 1;

  if caller_role not in ('super_admin', 'admin') then
    return jsonb_build_object('success', false, 'message', 'دسترسی کافی ندارید.');
  end if;

  -- تمدید از الان یا از پایان trial فعلی هر کدام که دیرتر است
  update public.saas_org_settings
  set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days),
      is_readonly   = false,
      status        = case when status = 'suspended' then 'trial' else status end,
      updated_at    = now()
  where org_id = p_org_id
  returning trial_ends_at into new_trial_at;

  if not found then
    return jsonb_build_object('success', false, 'message', 'سازمان پیدا نشد.');
  end if;

  -- علامت‌گذاری درخواست‌های renewal pending به عنوان extended
  update public.saas_renewal_requests
  set status      = 'extended',
      resolved_at = now(),
      resolved_by = caller_id,
      updated_at  = now()
  where org_id = p_org_id
    and status  = 'pending';

  return jsonb_build_object(
    'success',       true,
    'new_trial_ends_at', new_trial_at,
    'message',       'Trial تمدید شد.'
  );
end;
$$;

revoke all on function public.admin_saas_extend_org_trial(uuid, integer) from public;
grant execute on function public.admin_saas_extend_org_trial(uuid, integer) to authenticated;

-- ── 7. RPC: admin_saas_set_org_status ────────────────────────────────────────
create or replace function public.admin_saas_set_org_status(
  p_org_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id   uuid := auth.uid();
  caller_role text;
begin
  if p_status not in ('active', 'trial', 'suspended', 'cancelled') then
    return jsonb_build_object('success', false, 'message', 'وضعیت نامعتبر است.');
  end if;

  select role into caller_role
  from public.profiles
  where id = caller_id
  limit 1;

  if caller_role not in ('super_admin', 'admin') then
    return jsonb_build_object('success', false, 'message', 'دسترسی کافی ندارید.');
  end if;

  update public.saas_org_settings
  set status     = p_status,
      is_readonly = (p_status = 'suspended') or (is_readonly and p_status not in ('active','trial')),
      updated_at  = now()
  where org_id = p_org_id;

  if not found then
    return jsonb_build_object('success', false, 'message', 'سازمان پیدا نشد.');
  end if;

  return jsonb_build_object('success', true, 'message', 'وضعیت سازمان به‌روز شد.');
end;
$$;

revoke all on function public.admin_saas_set_org_status(uuid, text) from public;
grant execute on function public.admin_saas_set_org_status(uuid, text) to authenticated;

commit;
