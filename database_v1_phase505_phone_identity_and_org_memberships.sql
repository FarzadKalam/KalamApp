-- =====================================================
-- KalamApp - Phase 505: Phone identity and organization memberships
-- Date: 2026-09-15
-- Type: Corrective / additive / idempotent
-- Goal:
--   Keep one Auth identity per phone while allowing that identity to access
--   multiple organizations, with exactly one optional owner organization.
-- =====================================================

begin;

create table if not exists public.user_organization_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  role_id uuid references public.org_roles(id) on delete set null,
  software_role text,
  is_owner boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, org_id)
);

create index if not exists idx_user_organization_memberships_user_active
  on public.user_organization_memberships (user_id, is_active, org_id);
create index if not exists idx_user_organization_memberships_org_active
  on public.user_organization_memberships (org_id, is_active, user_id);

-- هر حساب فقط می‌تواند صاحب یک سازمان باشد؛ عضویت عادی در هر تعداد سازمان مجاز است.
create unique index if not exists idx_user_organization_memberships_one_owner
  on public.user_organization_memberships (user_id)
  where is_owner;

-- identity شماره باید در سطح پروفایل نیز یکتا بماند. عضویت در سازمان‌های دیگر
-- در جدول membership نگه‌داری می‌شود، نه با ساختن پروفایل دوم برای همان شماره.
create unique index if not exists idx_profiles_unique_normalized_mobile
  on public.profiles (
    public.normalize_iran_mobile_e164(
      coalesce(nullif(trim(mobile_1), ''), nullif(trim(mobile), ''))
    )
  )
  where public.normalize_iran_mobile_e164(
    coalesce(nullif(trim(mobile_1), ''), nullif(trim(mobile), ''))
  ) is not null;

alter table public.user_organization_memberships enable row level security;

drop policy if exists p_user_organization_memberships_select_own on public.user_organization_memberships;
create policy p_user_organization_memberships_select_own
on public.user_organization_memberships
for select to authenticated
using (user_id = auth.uid());

-- نوشتن فقط از RPCهای کنترل‌شده یا service role انجام می‌شود.
revoke all on public.user_organization_memberships from public, anon;
grant select on public.user_organization_memberships to authenticated;

insert into public.user_organization_memberships (
  user_id, org_id, role_id, software_role, is_active
)
select p.id, p.org_id, p.role_id, p.role, coalesce(p.is_active, true)
from public.profiles p
join auth.users u on u.id = p.id
where p.org_id is not null
on conflict (user_id, org_id) do update
set role_id = excluded.role_id,
    software_role = excluded.software_role,
    is_active = excluded.is_active,
    updated_at = now();

-- مالک‌های SaaS از دادهٔ صریح onboarding/settings استخراج می‌شوند، نه از عنوان نقش.
with owner_candidates as (
  select
    m.user_id,
    m.org_id,
    row_number() over (
      partition by m.user_id
      order by s.created_at asc nulls last, m.created_at asc
    ) as owner_rank
  from public.user_organization_memberships m
  join public.profiles p on p.id = m.user_id and p.org_id = m.org_id
  join public.saas_org_settings s on s.org_id = p.org_id
  left join public.saas_onboarding_requests r on r.id = s.request_id
  left join public.saas_demo_issuance d on d.auth_user_id = p.id and d.org_id = p.org_id
  where d.id is not null
     or lower(nullif(trim(p.email), '')) = lower(coalesce(
       nullif(trim(s.owner_email), ''),
       nullif(trim(r.owner_email), '')
     ))
)
update public.user_organization_memberships m
set is_owner = true,
    updated_at = now()
from owner_candidates c
where m.user_id = c.user_id
  and m.org_id = c.org_id
  and c.owner_rank = 1;

create or replace function public.sync_profile_organization_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.org_id is not null then
    insert into public.user_organization_memberships (
      user_id, org_id, role_id, software_role, is_active
    ) values (
      new.id, new.org_id, new.role_id, new.role, coalesce(new.is_active, true)
    )
    on conflict (user_id, org_id) do update
    set role_id = excluded.role_id,
        software_role = excluded.software_role,
        is_active = excluded.is_active,
        updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_profile_organization_membership on public.profiles;
create trigger trg_sync_profile_organization_membership
after insert or update of org_id, role_id, role, is_active on public.profiles
for each row execute function public.sync_profile_organization_membership();

create or replace function public.mark_demo_organization_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_organization_memberships
  set is_owner = true,
      updated_at = now()
  where user_id = new.auth_user_id
    and org_id = new.org_id;
  return new;
end;
$$;

drop trigger if exists trg_mark_demo_organization_owner_membership on public.saas_demo_issuance;
create trigger trg_mark_demo_organization_owner_membership
after insert on public.saas_demo_issuance
for each row execute function public.mark_demo_organization_owner_membership();

create or replace function public.get_current_user_organization_accesses()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'org_id', m.org_id,
      'org_name', o.name,
      'role_name', coalesce(r.title, m.software_role, 'کاربر'),
      'is_owner', m.is_owner,
      'slug', s.slug,
      'resolved_host', s.resolved_host,
      'is_saas_org', s.org_id is not null
    ) order by m.is_owner desc, o.name asc
  ), '[]'::jsonb)
  from public.user_organization_memberships m
  join public.organizations o on o.id = m.org_id and coalesce(o.is_active, true)
  left join public.org_roles r on r.id = m.role_id and r.org_id = m.org_id
  left join public.saas_org_settings s on s.org_id = m.org_id
  where m.user_id = auth.uid()
    and m.is_active = true;
$$;

create or replace function public.activate_current_user_organization(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  membership public.user_organization_memberships%rowtype;
  organization_name text;
  resolved_host text;
begin
  if auth.uid() is null or p_org_id is null then
    raise exception using errcode = '42501', message = 'organization_access_denied';
  end if;

  select * into membership
  from public.user_organization_memberships
  where user_id = auth.uid() and org_id = p_org_id and is_active = true
  limit 1;
  if membership.user_id is null then
    raise exception using errcode = '42501', message = 'organization_access_denied';
  end if;

  if membership.role_id is not null and not exists (
    select 1 from public.org_roles r where r.id = membership.role_id and r.org_id = p_org_id
  ) then
    raise exception using errcode = '23514', message = 'organization_role_mismatch';
  end if;

  update public.profiles
  set org_id = membership.org_id,
      role_id = membership.role_id,
      role = membership.software_role,
      updated_at = now()
  where id = auth.uid();

  if not found then
    raise exception using errcode = '23503', message = 'organization_profile_missing';
  end if;

  select o.name, s.resolved_host into organization_name, resolved_host
  from public.organizations o
  left join public.saas_org_settings s on s.org_id = o.id
  where o.id = p_org_id;

  return jsonb_build_object(
    'success', true,
    'organization_name', organization_name,
    'resolved_host', resolved_host
  );
end;
$$;

revoke all on function public.get_current_user_organization_accesses() from public, anon;
grant execute on function public.get_current_user_organization_accesses() to authenticated;
revoke all on function public.activate_current_user_organization(uuid) from public, anon;
grant execute on function public.activate_current_user_organization(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
