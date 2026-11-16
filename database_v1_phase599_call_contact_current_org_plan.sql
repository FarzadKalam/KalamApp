-- The history RPCs are SECURITY INVOKER. The global plan helper is deliberately
-- service-role-only; use the existing caller-bound plan helper instead.
-- Do not grant authenticated access to cross-organization plan functions.
begin;
do $$declare signature text;definition text;patched text;begin
 foreach signature in array array[
  'public.filter_call_contact_identities(text,uuid[])',
  'public.search_call_contact_identities(text,text)',
  'public.read_call_contact_history(text,uuid,text,integer)'
 ]loop
  definition:=pg_get_functiondef(signature::regprocedure);
  patched:=replace(definition,'public.org_has_plan_module(public.current_org_id(),','public.current_org_has_plan_module(');
  patched:=replace(patched,'public.org_has_plan_module(org,','public.current_org_has_plan_module(');
  patched:=replace(patched,'public.org_has_plan_module(v_org,','public.current_org_has_plan_module(');
  if patched<>definition then execute patched;end if;
 end loop;
end$$;
notify pgrst,'reload schema';
commit;
