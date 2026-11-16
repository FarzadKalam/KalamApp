do $$begin
 if exists(select 1 from (values('voip_ai_sessions'),('voip_ai_session_events'),('voip_ai_worker_health')) t(name)
  where has_table_privilege('authenticated','public.'||name,'select') or has_table_privilege('anon','public.'||name,'select')) then
  raise exception 'private_voice_runtime_exposed';end if;
 if (select count(*) from pg_class where oid in ('public.voip_ai_sessions'::regclass,'public.voip_ai_session_events'::regclass,'public.voip_ai_worker_health'::regclass) and relrowsecurity)<>3 then
  raise exception 'voice_runtime_rls_missing';end if;
 if not exists(select 1 from pg_indexes where tablename='voip_ai_sessions' and indexname='uq_voip_ai_active_account') then
  raise exception 'concurrent_voice_account_guard_missing';end if;
end$$;
