begin;

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  expires_at timestamptz,
  last_used_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_web_push_subscriptions_org_user_endpoint unique (org_id, user_id, endpoint)
);

create index if not exists idx_web_push_subscriptions_org_user_active
  on public.web_push_subscriptions (org_id, user_id, updated_at desc)
  where disabled_at is null;

create table if not exists public.web_push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.web_push_subscriptions(id) on delete cascade,
  event_key text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'expired')),
  provider_status integer,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_web_push_delivery_attempt unique (org_id, subscription_id, event_key)
);

create index if not exists idx_web_push_delivery_attempts_org_time
  on public.web_push_delivery_attempts (org_id, created_at desc);

alter table public.web_push_subscriptions enable row level security;
alter table public.web_push_delivery_attempts enable row level security;

revoke all on public.web_push_subscriptions from public, anon, authenticated;
revoke all on public.web_push_delivery_attempts from public, anon, authenticated;

create or replace function public.register_web_push_subscription_v1(
  p_subscription jsonb,
  p_user_agent text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_endpoint text := nullif(trim(coalesce(p_subscription->>'endpoint', '')), '');
  v_p256dh text := nullif(trim(coalesce(p_subscription#>>'{keys,p256dh}', '')), '');
  v_auth text := nullif(trim(coalesce(p_subscription#>>'{keys,auth}', '')), '');
  v_expiration numeric;
begin
  if v_user_id is null or v_org_id is null or v_endpoint is null or v_p256dh is null or v_auth is null then
    return false;
  end if;

  if not exists (
    select 1 from public.user_organization_memberships membership
    where membership.user_id = v_user_id
      and membership.org_id = v_org_id
      and membership.is_active
  ) then
    return false;
  end if;

  begin
    v_expiration := nullif(p_subscription->>'expirationTime', '')::numeric;
  exception when others then
    v_expiration := null;
  end;

  insert into public.web_push_subscriptions (
    org_id, user_id, endpoint, p256dh, auth_key, user_agent, expires_at, disabled_at, failure_count
  ) values (
    v_org_id,
    v_user_id,
    v_endpoint,
    v_p256dh,
    v_auth,
    nullif(left(coalesce(p_user_agent, ''), 500), ''),
    case when v_expiration is null then null else to_timestamp(v_expiration / 1000.0) end,
    null,
    0
  )
  on conflict (org_id, user_id, endpoint) do update set
    p256dh = excluded.p256dh,
    auth_key = excluded.auth_key,
    user_agent = excluded.user_agent,
    expires_at = excluded.expires_at,
    disabled_at = null,
    failure_count = 0,
    updated_at = now();

  return true;
end;
$$;

create or replace function public.unregister_web_push_subscription_v1(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
begin
  if v_user_id is null or v_org_id is null or nullif(trim(coalesce(p_endpoint, '')), '') is null then
    return false;
  end if;

  update public.web_push_subscriptions
  set disabled_at = now(), updated_at = now()
  where org_id = v_org_id
    and user_id = v_user_id
    and endpoint = trim(p_endpoint);

  return found;
end;
$$;

create or replace function public.has_current_web_push_subscription_v1(p_endpoint text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.current_org_id() is not null
    and exists (
      select 1
      from public.web_push_subscriptions subscription
      where subscription.org_id = public.current_org_id()
        and subscription.user_id = auth.uid()
        and subscription.endpoint = nullif(trim(coalesce(p_endpoint, '')), '')
        and subscription.disabled_at is null
        and (subscription.expires_at is null or subscription.expires_at > now())
    );
$$;

grant execute on function public.register_web_push_subscription_v1(jsonb, text) to authenticated;
grant execute on function public.unregister_web_push_subscription_v1(text) to authenticated;
grant execute on function public.has_current_web_push_subscription_v1(text) to authenticated;
revoke all on function public.register_web_push_subscription_v1(jsonb, text) from public, anon;
revoke all on function public.unregister_web_push_subscription_v1(text) from public, anon;
revoke all on function public.has_current_web_push_subscription_v1(text) from public, anon;

notify pgrst, 'reload schema';

commit;
