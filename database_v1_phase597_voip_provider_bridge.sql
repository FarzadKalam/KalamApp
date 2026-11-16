-- The provider-facing SIP account and the browser-facing WebRTC identity are different secrets.
-- Private runtime table: read/write only by the controlled Edge Function and platform worker.
begin;
create table if not exists public.voip_provider_bridges(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references public.organizations(id),
 account_id uuid not null references public.voip_external_accounts(id) on delete cascade,
 browser_secret text not null default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),
 revision text not null default '',
 synced_revision text not null default '',
 lease_until timestamptz not null default now(),
 registration_status text not null default 'pending',
 failure_code text,
 last_checked_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,account_id)
);
create index if not exists idx_voip_provider_bridge_lease on public.voip_provider_bridges(lease_until,org_id);
alter table public.voip_provider_bridges enable row level security;
drop policy if exists voip_provider_bridge_org on public.voip_provider_bridges;
create policy voip_provider_bridge_org on public.voip_provider_bridges to authenticated
using(org_id=public.current_org_id()) with check(org_id=public.current_org_id());
revoke all on public.voip_provider_bridges from public,anon,authenticated;
grant select,insert,update,delete on public.voip_provider_bridges to service_role;

-- Called only with a server-verified active organization/user context.
create or replace function public.prepare_voip_provider_bridge(p_org_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.voip_external_accounts%rowtype; b public.voip_provider_bridges%rowtype;
 settings jsonb; v_revision text;
begin
 if p_org_id is null or p_user_id is null then raise exception 'voip_bridge_scope_required';end if;
 if not public.org_has_plan_feature(p_org_id,'voip_webphone',true) then raise exception 'voip_bridge_plan_disabled';end if;
 if not exists(select 1 from public.user_organization_memberships m where m.org_id=p_org_id and m.user_id=p_user_id
   and m.is_active and coalesce((m.settings->>'voip_enabled')::boolean,false)) then raise exception 'voip_bridge_member_disabled';end if;
 select i.settings into settings from public.integration_settings i where i.org_id=p_org_id and i.connection_type='voip' and i.is_active order by i.id limit 1;
 if coalesce(settings->>'usage_mode',case when settings->>'default_dial_mode'='webphone_webrtc' then 'browser' else 'reports' end)<>'browser'
   or coalesce(settings->>'browser_source','external')<>'external' then raise exception 'voip_bridge_mode_disabled';end if;
 select * into a from public.voip_external_accounts where org_id=p_org_id and assignee_profile_id=p_user_id and is_active;
 if not found then raise exception 'voip_bridge_account_missing';end if;
 if coalesce(a.metadata->>'connection_strategy','auto')='direct' then raise exception 'voip_bridge_route_disabled';end if;
 v_revision:=md5(a.extension||a.sip_secret||a.metadata::text);
 insert into public.voip_provider_bridges(org_id,account_id,revision,lease_until)
 values(p_org_id,a.id,v_revision,now()+interval '5 minutes')
 on conflict(org_id,account_id) do update set revision=excluded.revision,lease_until=excluded.lease_until,updated_at=now()
 returning * into b;
 return jsonb_build_object('id',b.id,'browser_username','b_'||replace(b.id::text,'-','')||'_browser',
   'browser_secret',b.browser_secret,'registration_status',case when b.revision=b.synced_revision and b.last_checked_at>now()-interval '30 seconds' then b.registration_status else 'pending' end,
   'failure_code',b.failure_code,'lease_until',b.lease_until);
end;$$;
revoke all on function public.prepare_voip_provider_bridge(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_voip_provider_bridge(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
