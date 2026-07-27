-- TazeSystem - Phase 408: ویرایش پیام‌های خودکار گروه بات توسط اعضای مجاز

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
        and public.kalam_can_access_bot_group(bot_group_id, org_id)
        and (
          created_by = auth.uid()
          or (
            created_by is null
            and direction = 'outbound'
            and (
              lower(coalesce(payload ->> 'sender_kind', '')) = 'ai'
              or lower(coalesce(payload ->> 'sender_type', '')) = 'ai'
              or lower(coalesce(payload ->> 'message_source', '')) = 'ai'
              or coalesce(payload ->> 'ai_generated', 'false') = 'true'
              or coalesce(payload ->> 'ai_answer', 'false') = 'true'
              or coalesce(payload ->> 'workflow_ai_prompt', 'false') = 'true'
              or lower(coalesce(payload ->> 'sender_kind', '')) in ('system', 'workflow', 'automation', 'scheduled_report')
              or lower(coalesce(payload ->> 'sender_type', '')) in ('system', 'workflow', 'automation', 'scheduled_report')
              or lower(coalesce(payload ->> 'message_source', '')) in ('system', 'workflow', 'automation', 'scheduled_report')
              or payload ? 'workflow_action_type'
              or payload ? 'process_automation_rule_id'
              or payload ? 'scheduled_report_id'
            )
          )
        )
      )
      with check (
        org_id = public.current_org_id()
        and bot_group_id is not null
        and public.kalam_can_access_bot_group(bot_group_id, org_id)
        and (
          created_by = auth.uid()
          or (
            created_by is null
            and direction = 'outbound'
            and (
              lower(coalesce(payload ->> 'sender_kind', '')) = 'ai'
              or lower(coalesce(payload ->> 'sender_type', '')) = 'ai'
              or lower(coalesce(payload ->> 'message_source', '')) = 'ai'
              or coalesce(payload ->> 'ai_generated', 'false') = 'true'
              or coalesce(payload ->> 'ai_answer', 'false') = 'true'
              or coalesce(payload ->> 'workflow_ai_prompt', 'false') = 'true'
              or lower(coalesce(payload ->> 'sender_kind', '')) in ('system', 'workflow', 'automation', 'scheduled_report')
              or lower(coalesce(payload ->> 'sender_type', '')) in ('system', 'workflow', 'automation', 'scheduled_report')
              or lower(coalesce(payload ->> 'message_source', '')) in ('system', 'workflow', 'automation', 'scheduled_report')
              or payload ? 'workflow_action_type'
              or payload ? 'process_automation_rule_id'
              or payload ? 'scheduled_report_id'
            )
          )
        )
      );
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
