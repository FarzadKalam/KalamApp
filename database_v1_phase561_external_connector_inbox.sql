-- زیرساخت سازمانی اتصال‌های خارجی و صندوق ورودی سفارش‌ها.
begin;

create table if not exists public.external_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('woocommerce', 'sepidar', 'mahak')),
  name text not null default '',
  base_url text not null,
  credentials_encrypted text not null,
  webhook_secret_encrypted text not null,
  webhook_key text not null unique default encode(gen_random_bytes(18), 'hex'),
  is_active boolean not null default false,
  last_checked_at timestamptz,
  last_check_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider, base_url)
);

alter table public.external_connections enable row level security;
revoke all on public.external_connections from anon, authenticated;
grant select, insert, update, delete on public.external_connections to service_role;
create index if not exists external_connections_org_provider_idx
  on public.external_connections(org_id, provider);

create table if not exists public.external_order_inbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.external_connections(id) on delete cascade,
  external_id text not null,
  external_status text,
  source_updated_at timestamptz,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processed', 'ignored', 'error')),
  unique (connection_id, external_id)
);

alter table public.external_order_inbox enable row level security;
revoke all on public.external_order_inbox from anon, authenticated;
grant select, insert, update, delete on public.external_order_inbox to service_role;
create index if not exists external_order_inbox_org_status_idx
  on public.external_order_inbox(org_id, processing_status, received_at desc);

create or replace function public.store_external_order(
  p_connection_id uuid,
  p_external_id text,
  p_external_status text,
  p_source_updated_at timestamptz,
  p_payload jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select org_id into v_org_id
  from public.external_connections
  where id = p_connection_id and is_active = true;
  if v_org_id is null or nullif(trim(p_external_id), '') is null
     or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid external order';
  end if;

  insert into public.external_order_inbox
    (org_id, connection_id, external_id, external_status, source_updated_at, payload)
  values
    (v_org_id, p_connection_id, p_external_id, p_external_status, p_source_updated_at, p_payload)
  on conflict (connection_id, external_id) do update
    set external_status = excluded.external_status,
        source_updated_at = excluded.source_updated_at,
        payload = excluded.payload,
        received_at = now(),
        processing_status = 'pending'
  where coalesce(excluded.source_updated_at, '-infinity'::timestamptz)
      >= coalesce(public.external_order_inbox.source_updated_at, '-infinity'::timestamptz)
    and excluded.payload is distinct from public.external_order_inbox.payload;
end;
$$;
revoke all on function public.store_external_order(uuid, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.store_external_order(uuid, text, text, timestamptz, jsonb) to service_role;

-- فرم وب‌هوک عمومی باید بتواند شناسهٔ سازمان جاری را بدون اعتماد به کلاینت ثبت کند.
alter table if exists public.org_webhooks
  alter column org_id set default public.current_org_id();

commit;
