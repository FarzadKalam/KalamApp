begin;

do $$
begin
  if to_regclass('public.counterparty_bot_direct_threads') is not null then
    alter table public.counterparty_bot_direct_threads enable row level security;

    drop policy if exists p_counterparty_bot_direct_threads_tenant_insert on public.counterparty_bot_direct_threads;
    drop policy if exists p_counterparty_bot_direct_threads_tenant_update on public.counterparty_bot_direct_threads;

    create policy p_counterparty_bot_direct_threads_tenant_insert
      on public.counterparty_bot_direct_threads
      for insert
      to authenticated
      with check (org_id = public.current_org_id());

    create policy p_counterparty_bot_direct_threads_tenant_update
      on public.counterparty_bot_direct_threads
      for update
      to authenticated
      using (org_id = public.current_org_id())
      with check (org_id = public.current_org_id());
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
