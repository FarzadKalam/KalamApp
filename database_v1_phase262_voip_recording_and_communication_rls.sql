-- TazeSystem V1 - Phase 262
-- Secure tenant communication data and optimize chronological report lists.

begin;

alter table if exists public.voip_call_logs enable row level security;
alter table if exists public.outbound_messages enable row level security;

drop policy if exists p_voip_call_logs_org_all on public.voip_call_logs;
create policy p_voip_call_logs_org_all on public.voip_call_logs
  for all
  to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop policy if exists p_outbound_messages_org_all on public.outbound_messages;
create policy p_outbound_messages_org_all on public.outbound_messages
  for all
  to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

create index if not exists idx_voip_call_logs_org_started
  on public.voip_call_logs(org_id, started_at desc, id desc);

create index if not exists idx_outbound_messages_org_sms_message_at
  on public.outbound_messages(
    org_id,
    channel_type,
    (coalesce(received_at, sent_at, created_at)) desc,
    id desc
  )
  where channel_type = 'sms';

do $$
begin
  if to_regclass('public.voip_call_logs') is not null then
    alter table public.voip_call_logs replica identity full;

    if to_regprocedure('public.kalam_emit_module_list_invalidation()') is not null then
      drop trigger if exists trg_voip_call_logs_module_list_invalidation on public.voip_call_logs;
      create trigger trg_voip_call_logs_module_list_invalidation
        after insert or update or delete on public.voip_call_logs
        for each row execute function public.kalam_emit_module_list_invalidation('voip_call_reports');
    end if;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
