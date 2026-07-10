begin;

-- Align system-message visibility across the conversation list, unread summary,
-- and overlay feed. Timeline RPC already requires targeted notification inbox
-- access for system messages; these three functions must not expose unscoped
-- system rows as unread or previews.
do $$
declare
  v_signature regprocedure;
  v_sql text;
  v_next text;
begin
  foreach v_signature in array array[
    'public.get_communication_conversations_v2(text,timestamp with time zone,integer)'::regprocedure,
    'public.get_notification_unread_summary_v1(text)'::regprocedure,
    'public.get_notification_overlay_feed_v4(text,integer)'::regprocedure
  ]
  loop
    v_sql := pg_get_functiondef(v_signature);
    v_next := replace(v_sql, E'\n        or conv.conversation_key = ''system''', '');
    v_next := replace(v_next, E'\r\n        or conv.conversation_key = ''system''', E'\r\n');

    if v_next is distinct from v_sql then
      execute v_next;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
