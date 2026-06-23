-- TazeSystem - Phase 281: Notification overlay attachment previews
-- Date: 2026-06-23
-- Type: Feature / idempotent
-- =====================================================

begin;

create or replace function public.kalam_extract_note_attachment_previews(p_content text)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  if nullif(trim(coalesce(p_content, '')), '') is null then
    return '[]'::jsonb;
  end if;

  begin
    v_payload := p_content::jsonb;
  exception when others then
    return '[]'::jsonb;
  end;

  if jsonb_typeof(v_payload) <> 'object'
     or jsonb_typeof(v_payload -> 'attachments') <> 'array' then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'name', coalesce(nullif(trim(item ->> 'name'), ''), nullif(trim(item ->> 'file_name'), ''), 'فایل'),
        'url', nullif(trim(coalesce(item ->> 'url', item ->> 'file_url', '')), ''),
        'mime_type', nullif(trim(coalesce(item ->> 'mimeType', item ->> 'mime_type', '')), ''),
        'file_type', nullif(trim(coalesce(item ->> 'fileType', item ->> 'file_type', '')), '')
      )
    ) filter (where nullif(trim(coalesce(item ->> 'url', item ->> 'file_url', '')), '') is not null), '[]'::jsonb)
    from jsonb_array_elements(v_payload -> 'attachments') item
  );
end;
$$;

revoke all on function public.kalam_extract_note_attachment_previews(text) from public, anon;
grant execute on function public.kalam_extract_note_attachment_previews(text) to authenticated;

create or replace function public.get_notification_overlay_feed_v3(
  p_before_cursor text default null,
  p_limit integer default 20
)
returns table (
  section text,
  source_type text,
  source_id text,
  title text,
  body text,
  created_at timestamptz,
  module_id text,
  record_id text,
  conversation_key text,
  payload jsonb,
  feed_cursor text,
  has_more boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    feed.section,
    feed.source_type,
    feed.source_id,
    feed.title,
    feed.body,
    feed.created_at,
    feed.module_id,
    feed.record_id,
    feed.conversation_key,
    coalesce(feed.payload, '{}'::jsonb)
      || case
        when feed.section = 'notes' and n.id is not null then
          jsonb_build_object(
            'attachment_previews',
            public.kalam_extract_note_attachment_previews(n.content)
          )
        when feed.section = 'bot_messages' and m.id is not null then
          jsonb_build_object(
            'attachment_previews',
            (
              case
                when jsonb_typeof(coalesce(m.payload, '{}'::jsonb) -> 'attachments') = 'array'
                  then coalesce(m.payload, '{}'::jsonb) -> 'attachments'
                else '[]'::jsonb
              end
            )
            || case
              when nullif(trim(coalesce(m.file_url, '')), '') is not null then
                jsonb_build_array(jsonb_build_object(
                  'name', coalesce(nullif(trim(m.file_name), ''), 'فایل'),
                  'url', nullif(trim(m.file_url), ''),
                  'mime_type', nullif(trim(coalesce(m.mime_type, '')), ''),
                  'file_type', nullif(trim(coalesce(m.message_type, '')), '')
                ))
              else '[]'::jsonb
            end
          )
        else '{}'::jsonb
      end as payload,
    feed.feed_cursor,
    feed.has_more
  from public.get_notification_overlay_feed_v2(p_before_cursor, p_limit) feed
  left join public.notes n
    on feed.section = 'notes'
   and feed.source_type = 'note'
   and feed.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and n.org_id = public.current_org_id()
   and n.id = feed.source_id::uuid
  left join public.counterparty_bot_messages m
    on feed.section = 'bot_messages'
   and feed.source_type = 'counterparty_bot_message'
   and feed.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and m.org_id = public.current_org_id()
   and m.id = feed.source_id::uuid;
$$;

grant execute on function public.get_notification_overlay_feed_v3(text, integer) to authenticated;
revoke all on function public.get_notification_overlay_feed_v3(text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
