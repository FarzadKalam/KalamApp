-- TazeSystem - Phase 407: ویرایش پیام بات فقط توسط فرستنده

begin;

do $$
begin
  if to_regclass('public.counterparty_bot_messages') is not null then
    drop policy if exists p_counterparty_bot_messages_update_targeted on public.counterparty_bot_messages;
    create policy p_counterparty_bot_messages_update_targeted
      on public.counterparty_bot_messages
      for update
      to authenticated
      using (
        org_id = public.current_org_id()
        and bot_group_id is not null
        and created_by = auth.uid()
        and public.kalam_can_access_bot_group(bot_group_id, org_id)
      )
      with check (
        org_id = public.current_org_id()
        and bot_group_id is not null
        and created_by = auth.uid()
        and public.kalam_can_access_bot_group(bot_group_id, org_id)
      );
  end if;

  if to_regclass('public.counterparty_bot_direct_messages') is not null then
    drop policy if exists p_counterparty_bot_direct_messages_tenant_update on public.counterparty_bot_direct_messages;
    create policy p_counterparty_bot_direct_messages_tenant_update
      on public.counterparty_bot_direct_messages
      for update
      to authenticated
      using (
        org_id = public.current_org_id()
        and direct_thread_id is not null
        and created_by = auth.uid()
        and public.kalam_can_access_bot_direct_thread(direct_thread_id, org_id)
      )
      with check (
        org_id = public.current_org_id()
        and direct_thread_id is not null
        and created_by = auth.uid()
        and public.kalam_can_access_bot_direct_thread(direct_thread_id, org_id)
      );
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
