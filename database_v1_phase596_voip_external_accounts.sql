-- External provider credentials must never provision a local Asterisk endpoint.
begin;
create table if not exists public.voip_external_accounts (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references public.organizations(id),
 assignee_profile_id uuid not null references public.profiles(id),
 extension text not null,
 display_name text not null default '',
 sip_secret text not null,
 metadata jsonb not null default '{}',
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,assignee_profile_id)
);
create index if not exists idx_voip_external_org_extension on public.voip_external_accounts(org_id,extension);
alter table public.voip_external_accounts enable row level security;
drop policy if exists voip_external_org on public.voip_external_accounts;
create policy voip_external_org on public.voip_external_accounts to authenticated
using(org_id=public.current_org_id()) with check(org_id=public.current_org_id());
-- Secrets only pass through the authenticated, membership-scoped voip-session function.
revoke all on public.voip_external_accounts from public,anon,authenticated;
grant select,insert,update,delete on public.voip_external_accounts to service_role;

-- Preserve identifiable legacy provider accounts; do not reinterpret a SIP host as a WSS URL.
insert into public.voip_external_accounts(org_id,assignee_profile_id,extension,display_name,sip_secret,metadata,is_active)
select distinct on(e.org_id,e.assignee_profile_id) e.org_id,e.assignee_profile_id,e.extension,coalesce(e.display_name,''),e.sip_secret,
 (coalesce(e.metadata,'{}') - 'wss_url' - 'sip_domain') || jsonb_build_object(
   'legacy_endpoint_id',e.id,'legacy_sip_host',coalesce(e.metadata->>'server_url',e.metadata->>'wss_url'),
   'wss_url',case when e.metadata->>'wss_url' ~ '^wss://' then e.metadata->>'wss_url' else '' end,
   'sip_domain',case when e.metadata->>'sip_domain' !~ '[/@[:space:]]' then e.metadata->>'sip_domain' else '' end),
 e.is_active
from public.voip_sip_endpoints e
where e.assignee_profile_id is not null and coalesce(e.sip_secret,'')<>''
 and coalesce(e.metadata->>'provider','') not in ('','kalamapp_cloud_pbx')
 and (coalesce(e.metadata->>'wss_url','')<>'' or coalesce(e.metadata->>'server_url','')<>'')
order by e.org_id,e.assignee_profile_id,e.updated_at desc,e.id
on conflict(org_id,assignee_profile_id) do nothing;

-- Disable only the legacy local copy that was successfully preserved above.
-- The existing Realtime trigger removes that local auth; no external provider is modified.
update public.voip_sip_endpoints e set is_active=false
where e.is_active=true and exists(select 1 from public.voip_external_accounts a
 where a.org_id=e.org_id and a.assignee_profile_id=e.assignee_profile_id and a.metadata->>'legacy_endpoint_id'=e.id::text);
notify pgrst,'reload schema';
commit;
