do $$begin
 if (select count(*) from voip_external_accounts)<>2 then raise exception 'legacy accounts missing or duplicated';end if;
 if (select count(*) from voip_sip_endpoints where is_active)<>1 then raise exception 'local and external identity not separated';end if;
 if exists(select 1 from voip_external_accounts where metadata->>'wss_url'='192.0.2.10') then raise exception 'invented WSS URL';end if;
 if not exists(select 1 from voip_external_accounts where extension='101' and sip_secret='fixture-secret' and metadata->>'legacy_sip_host'='192.0.2.10') then raise exception 'credentials or original SIP host lost';end if;
 if has_table_privilege('authenticated','public.voip_external_accounts','select') or has_table_privilege('anon','public.voip_external_accounts','select') then raise exception 'credentials directly exposed';end if;
 if not (select relrowsecurity from pg_class where oid='public.voip_external_accounts'::regclass) then raise exception 'RLS missing';end if;
end$$;
-- A temporary test grant exercises the policy; production migration never grants it.
grant usage on schema public to authenticated;
grant select on public.voip_external_accounts to authenticated;
set role authenticated;
select set_config('test.org','10000000-0000-4000-8000-000000000001',false);
do $$begin if (select count(*) from public.voip_external_accounts)<>1 then raise exception 'tenant isolation failed';end if;end$$;
select set_config('test.org','',false);
do $$begin if exists(select 1 from public.voip_external_accounts) then raise exception 'null organization leaked secrets';end if;end$$;
reset role;
revoke select on public.voip_external_accounts from authenticated;
