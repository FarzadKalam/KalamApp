-- Phase 470: wake the durable campaign dispatcher without coupling UI requests to delivery.

begin;

create or replace function public.trigger_advertising_campaign_runtime()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_supabase_url text; v_service_key text;
begin
  if new.status <> 'queued' or (tg_op='UPDATE' and old.status is not distinct from new.status) then
    return null;
  end if;
  v_supabase_url := current_setting('app.supabase_url', true);
  v_service_key := current_setting('app.service_role_key', true);
  if coalesce(v_supabase_url,'')='' or coalesce(v_service_key,'')='' then return null; end if;
  perform net.http_post(
    url := rtrim(v_supabase_url,'/') || '/functions/v1/campaign-runtime',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_service_key,'x-kalam-internal','database-dispatch'),
    body := jsonb_build_object('action','drain','limit',10)
  );
  return null;
end;
$$;

revoke all on function public.trigger_advertising_campaign_runtime() from public,anon,authenticated;
drop trigger if exists advertising_campaign_dispatch_wakeup on public.advertising_campaign_dispatches;
create trigger advertising_campaign_dispatch_wakeup
after insert or update of status on public.advertising_campaign_dispatches
for each row execute function public.trigger_advertising_campaign_runtime();

notify pgrst, 'reload schema';
commit;
