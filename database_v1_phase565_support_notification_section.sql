-- TazeSystem V1 - Phase 565
-- Support notifications use their own inbox section so ticket creation cannot
-- fail when the notification trigger runs.

begin;

alter table public.notification_inbox_items
  drop constraint if exists chk_notification_inbox_items_section;

alter table public.notification_inbox_items
  add constraint chk_notification_inbox_items_section
  check (section in ('notes', 'bot_messages', 'tasks', 'responsibilities', 'voip_calls', 'sms', 'system', 'support'));

notify pgrst, 'reload schema';

commit;
