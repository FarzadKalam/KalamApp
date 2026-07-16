begin;

-- Phase 320/323 communication fast paths classified system notes correctly,
-- but an OR branch admitted every system conversation before recipient checks.
-- Patch the latest installed definitions in-place so subsequent function
-- improvements are preserved while the recipient bypass is removed.
do $$
declare
  v_signature regprocedure;
  v_sql text;
  v_next text;
begin
  foreach v_signature in array array[
    to_regprocedure('public.get_communication_conversations_v2(text,timestamp with time zone,integer)'),
    to_regprocedure('public.get_notification_unread_summary_v1(text)'),
    to_regprocedure('public.get_notification_overlay_feed_v4(text,integer)')
  ]
  loop
    if v_signature is null then
      continue;
    end if;

    v_sql := pg_get_functiondef(v_signature);
    v_next := regexp_replace(
      v_sql,
      E'\\s+or\\s+conv\\.conversation_key\\s*=\\s*''system''',
      '',
      'gi'
    );

    if v_next ~* E'or\\s+conv\\.conversation_key\\s*=\\s*''system''' then
      raise exception 'Unsafe system-conversation recipient bypass remains in %', v_signature;
    end if;

    if v_next is distinct from v_sql then
      execute v_next;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
