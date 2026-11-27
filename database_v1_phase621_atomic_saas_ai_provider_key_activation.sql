begin;

create or replace function public.activate_saas_ai_provider_key(p_provider text, p_key_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('saas_ai_provider_keys:' || p_provider, 0));

  perform 1
  from public.saas_ai_provider_keys
  where provider = p_provider and id = p_key_id
  for update;
  if not found then
    return false;
  end if;

  update public.saas_ai_provider_keys
  set is_active = false, updated_at = now()
  where provider = p_provider and is_active and id <> p_key_id;

  update public.saas_ai_provider_keys
  set is_active = true, activated_at = now(), updated_at = now()
  where provider = p_provider and id = p_key_id;
  return true;
end;
$$;

revoke all on function public.activate_saas_ai_provider_key(text, uuid) from public, anon, authenticated;
grant execute on function public.activate_saas_ai_provider_key(text, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
