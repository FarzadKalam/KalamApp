alter table public.ai_threads
  add column if not exists message_history_revision bigint not null default 0;

create or replace function public.delete_ai_conversation_message(
  p_org_id uuid,
  p_user_id uuid,
  p_thread_id uuid,
  p_message_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_metadata jsonb;
  v_rejected_actions jsonb;
  v_now timestamptz := now();
begin
  -- The Edge Function obtains the actor and organization from the authenticated session.
  perform 1 from public.ai_threads
  where id = p_thread_id and org_id = p_org_id and user_id = p_user_id and status = 'active'
  for update;
  if not found then
    return null;
  end if;

  select metadata into v_metadata from public.ai_messages
  where id = p_message_id and thread_id = p_thread_id and org_id = p_org_id
    and role in ('user', 'assistant')
  for update;
  if not found then
    return null;
  end if;

  if v_metadata ->> 'deleted_at' is null then
    update public.ai_messages
    set content = '', metadata = jsonb_build_object('deleted_at', v_now)
    where id = p_message_id and thread_id = p_thread_id and org_id = p_org_id;

    update public.ai_action_logs
    set status = 'rejected'
    where org_id = p_org_id and thread_id = p_thread_id
      and message_id = p_message_id and status = 'proposed';

    update public.ai_threads
    set compaction_summary = null,
        compaction_cursor_message_id = null,
        working_state = '{}'::jsonb,
        cached_prefix_hash = null,
        metadata = coalesce(metadata, '{}'::jsonb) - array[
          'compressed_context', 'task_bundle_context', 'record_intake_context',
          'last_message_preview', 'last_action_log_id'
        ],
        message_history_revision = message_history_revision + 1,
        updated_at = v_now
    where id = p_thread_id and org_id = p_org_id and user_id = p_user_id;
  end if;

  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_rejected_actions
  from public.ai_action_logs
  where org_id = p_org_id and thread_id = p_thread_id
    and message_id = p_message_id and status = 'rejected';

  return jsonb_build_object('rejectedActionIds', v_rejected_actions);
end;
$$;

revoke all on function public.delete_ai_conversation_message(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_ai_conversation_message(uuid, uuid, uuid, uuid) to service_role;

create or replace function public.protect_deleted_ai_conversation_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.metadata ->> 'deleted_at' is not null then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_deleted_ai_conversation_message on public.ai_messages;
create trigger protect_deleted_ai_conversation_message
  before update on public.ai_messages
  for each row execute function public.protect_deleted_ai_conversation_message();

revoke all on function public.protect_deleted_ai_conversation_message() from public, anon, authenticated;

notify pgrst, 'reload schema';
