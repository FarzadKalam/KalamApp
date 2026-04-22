-- Phase 118: keep internal chat/message bodies effectively unlimited.
-- PostgreSQL text has no application-level character cap here; these ALTERs
-- repair older databases that may have been created with varchar-limited columns.

do $$
begin
  if to_regclass('public.notes') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notes'
        and column_name = 'content'
    )
  then
    alter table public.notes
      alter column content type text using content::text,
      alter column content set default '';
  end if;

  if to_regclass('public.counterparty_bot_messages') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'counterparty_bot_messages'
        and column_name = 'content_text'
    )
  then
    alter table public.counterparty_bot_messages
      alter column content_text type text using content_text::text;
  end if;

  if to_regclass('public.sms_delivery_reports') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'sms_delivery_reports'
        and column_name = 'message_text'
    )
  then
    alter table public.sms_delivery_reports
      alter column message_text type text using message_text::text;
  end if;
end $$;
