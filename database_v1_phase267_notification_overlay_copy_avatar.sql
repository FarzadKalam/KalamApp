-- =====================================================
-- TazeSystem - Phase 267: Notification overlay copy and avatars
-- Date: 2026-06-17
-- Type: Bug fix / idempotent
-- =====================================================

begin;

create or replace function public.get_notification_overlay_feed_v2(
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
    case
      when feed.section = 'responsibilities' then
        coalesce(feed.payload, '{}'::jsonb)
        || jsonb_build_object(
          'action', nullif(trim(coalesce(nii.action, feed.payload->>'action', '')), ''),
          'module_id', nullif(trim(coalesce(feed.module_id, feed.payload->>'module_id', '')), '')
        )
      else coalesce(feed.payload, '{}'::jsonb)
    end as payload,
    feed.feed_cursor,
    feed.has_more
  from public.get_notification_overlay_feed_v1(p_before_cursor, p_limit) feed
  left join public.notification_inbox_items nii
    on nii.org_id = public.current_org_id()
   and nii.section = feed.section
   and nii.source_type = feed.source_type
   and nii.source_id = feed.source_id;
$$;

grant execute on function public.get_notification_overlay_feed_v2(text, integer) to authenticated;
revoke all on function public.get_notification_overlay_feed_v2(text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
