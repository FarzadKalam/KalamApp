-- =====================================================
-- KalamApp - Phase 209: Communication thread performance
-- Date: 2026-05-27
-- Type: Performance / idempotent
-- =====================================================

begin;

-- Hot path for get_communication_timeline('bot', ...): newest page, older
-- pagination, and unread checks all scope by org_id + bot_group_id.
create index if not exists idx_counterparty_bot_messages_org_group_created_id
  on public.counterparty_bot_messages(org_id, bot_group_id, created_at desc, id desc);

create index if not exists idx_counterparty_bot_messages_org_group_inbound_created_id
  on public.counterparty_bot_messages(org_id, bot_group_id, created_at desc, id desc)
  where direction = 'inbound';

-- Smaller partial index for normal internal conversations. System/assistant
-- notifications stay out of the communication sidebar hot path.
create index if not exists idx_notification_inbox_internal_conversation_hot
  on public.notification_inbox_items(org_id, conversation_key, created_at desc, source_id)
  where section = 'notes'
    and source_type = 'note'
    and category not in ('system', 'assistant')
    and conversation_key is not null
    and conversation_key <> 'system';

-- Phone-based grouping in the communication tabs should use the counterparty
-- number, not the linked record. These expression indexes support server-side
-- lookup/pagination by normalized phone when the tab grows beyond the current
-- lightweight client page.
create index if not exists idx_outbound_messages_sms_counterparty_phone_time
  on public.outbound_messages(
    org_id,
    public.kalam_phone_lookup_key(case when direction = 'inbound' then sender else recipient end),
    coalesce(received_at, sent_at, created_at) desc,
    id desc
  )
  where channel_type = 'sms';

create index if not exists idx_voip_call_logs_counterparty_phone_time
  on public.voip_call_logs(
    org_id,
    public.kalam_phone_lookup_key(case when direction = 'incoming' then source_number else destination_number end),
    coalesce(started_at, created_at) desc,
    id desc
  );

notify pgrst, 'reload schema';

commit;
