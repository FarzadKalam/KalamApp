do $$declare first_session jsonb;second_session jsonb;
begin
 first_session:=public.prepare_voip_provider_bridge('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 second_session:=public.prepare_voip_provider_bridge('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 if first_session->>'browser_secret'= 'fixture-secret' then raise exception 'provider password exposed';end if;
 if first_session->>'id'<>second_session->>'id' then raise exception 'duplicate provider registration';end if;
 if first_session->>'registration_status'<>'pending' then raise exception 'unconfirmed registration accepted';end if;
 if (first_session->>'lease_until')::timestamptz<=now() then raise exception 'missing lease';end if;
 if has_table_privilege('authenticated','public.voip_provider_bridges','select') or has_table_privilege('anon','public.voip_provider_bridges','select') then raise exception 'browser secrets accessible';end if;
 if has_function_privilege('authenticated','public.prepare_voip_provider_bridge(uuid,uuid)','execute') then raise exception 'untrusted bridge provisioning';end if;
 begin
  perform public.prepare_voip_provider_bridge('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001');
  raise exception 'foreign membership accepted';
 exception when others then if sqlerrm<>'voip_bridge_member_disabled' then raise;end if;end;
 perform set_config('test.plan','false',true);
 begin
  perform public.prepare_voip_provider_bridge('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
  raise exception 'disabled plan accepted';
 exception when others then if sqlerrm<>'voip_bridge_plan_disabled' then raise;end if;end;
 perform set_config('test.plan','true',true);
 update public.integration_settings set settings='{"usage_mode":"reports"}';
 begin
  perform public.prepare_voip_provider_bridge('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
  raise exception 'reports mode issued SIP credentials';
 exception when others then if sqlerrm<>'voip_bridge_mode_disabled' then raise;end if;end;
 update public.integration_settings set settings='{"usage_mode":"browser","browser_source":"external"}';
 update public.voip_provider_bridges set registration_status='registered',synced_revision=revision,last_checked_at=now()-interval '1 minute';
 second_session:=public.prepare_voip_provider_bridge('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 if second_session->>'registration_status'<>'pending' then raise exception 'stale worker reported ready';end if;
 update public.voip_provider_bridges set last_checked_at=now();
 second_session:=public.prepare_voip_provider_bridge('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 if second_session->>'registration_status'<>'registered' then raise exception 'live registration not exposed';end if;
end$$;
