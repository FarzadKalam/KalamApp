begin;
insert into public.ps_contacts(id,uri,expiration_time,qualify_frequency,qualify_timeout,
 authenticate_qualify,outbound_proxy,path,user_agent,endpoint,reg_server,via_addr,via_port,call_id,prune_on_boot)
values('fixture-contact','sip:fixture@127.0.0.1:5060;transport=ws',extract(epoch from now())::bigint+300,
 30,3.0,'no','','','fixture-agent','fixture-endpoint','','127.0.0.1',5060,'fixture-call','no');
do $$begin
 if not exists(select 1 from public.ps_contacts where id='fixture-contact' and expiration_time>extract(epoch from now()) and qualify_timeout=3.0) then
  raise exception 'dynamic_contact_not_persisted';end if;
 if has_table_privilege('authenticated','public.ps_contacts','select') or has_table_privilege('anon','public.ps_contacts','select') then
  raise exception 'private_contact_exposed';end if;
 if not(select relrowsecurity from pg_class where oid='public.ps_contacts'::regclass) then
  raise exception 'private_contact_rls_missing';end if;
 if not has_table_privilege('service_role','public.ps_contacts','insert') then raise exception 'runtime_contact_write_disabled';end if;
end$$;
rollback;
