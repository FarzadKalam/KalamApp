-- Fix system notifications accidentally addressed to their execution author.
begin;

create or replace function public.kalam_notes_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_metadata jsonb := coalesce(v_row->'metadata', '{}'::jsonb);
  v_org_id uuid := public.kalam_try_uuid(v_row->>'org_id');
  v_note_id text := nullif(v_row->>'id', '');
  v_author_id uuid := public.kalam_try_uuid(v_row->>'author_id');
  v_channel_type text := lower(trim(coalesce(v_row->>'channel_type', '')));
  v_group_id uuid;
  v_group_users uuid[] := '{}'::uuid[];
  v_group_roles uuid[] := '{}'::uuid[];
  v_target_users uuid[] := '{}'::uuid[];
  v_target_roles uuid[] := '{}'::uuid[];
  v_note_source text;
  v_category text;
  v_conversation_key text;
  v_is_system boolean := false;
  v_is_org_wide boolean := false;
begin
  if v_org_id is null or v_note_id is null or v_channel_type = 'sms' then
    return new;
  end if;

  v_note_source := lower(trim(coalesce(
    nullif(v_row->>'source_type', ''),
    nullif(v_metadata->>'source_type', ''),
    'user'
  )));
  v_is_system := v_note_source in ('system', 'ai', 'assistant')
    or v_metadata ?| array[
      'workflow_id', 'automation_rule_id', 'process_automation_rule_id',
      'workflow_action_type', 'scheduled_report_id'
    ];
  v_category := case
    when v_note_source in ('ai', 'assistant') then 'assistant'
    when v_is_system then 'system'
    when nullif(trim(v_metadata->>'chat_group_id'), '') is not null then 'group'
    else 'internal'
  end;

  v_group_id := public.kalam_try_uuid(v_metadata->>'chat_group_id');
  if v_group_id is not null then
    select coalesce(group_row.user_ids, '{}'::uuid[]), coalesce(group_row.role_ids, '{}'::uuid[])
      into v_group_users, v_group_roles
    from public.chat_groups group_row
    where group_row.id = v_group_id and group_row.org_id = v_org_id
    limit 1;
  end if;

  v_target_users := public.kalam_distinct_uuid_array(
    public.kalam_jsonb_uuid_array(v_row->'mention_user_ids')
    || coalesce(v_group_users, '{}'::uuid[])
    || case when v_is_system or v_author_id is null then '{}'::uuid[] else array[v_author_id] end
  );
  v_target_roles := public.kalam_distinct_uuid_array(
    public.kalam_jsonb_uuid_array(v_row->'mention_role_ids') || coalesce(v_group_roles, '{}'::uuid[])
  );
  v_is_org_wide := not v_is_system and (
    lower(trim(coalesce(v_metadata->>'is_org_wide', 'false'))) in ('true', '1', 'yes')
    or lower(trim(coalesce(v_metadata->>'org_wide', 'false'))) in ('true', '1', 'yes')
  );

  v_conversation_key := case
    when v_group_id is not null then 'group:' || v_group_id::text
    when v_is_system then 'system'
    when lower(trim(coalesce(v_metadata->>'saved_message', 'false'))) in ('true', '1', 'yes') then 'mine'
    when nullif(trim(v_metadata->>'conversation_key'), '') is not null then trim(v_metadata->>'conversation_key')
    when v_author_id is not null
      and cardinality(public.kalam_jsonb_uuid_array(v_row->'mention_user_ids')) = 1
      then public.kalam_direct_conversation_key(v_author_id, (public.kalam_jsonb_uuid_array(v_row->'mention_user_ids'))[1])
    when v_author_id is not null then 'mine'
    else null
  end;

  perform public.kalam_upsert_notification_item(
    v_org_id, 'note', v_note_id, 'notes', v_category, lower(tg_op),
    case when v_category = 'assistant' then 'پیام هوش مصنوعی'
         when v_category = 'system' then 'پیام سیستم' else 'پیام داخلی' end,
    nullif(left(coalesce(v_row->>'content', ''), 240), ''),
    nullif(v_row->>'module_id', ''), nullif(v_row->>'record_id', ''),
    v_target_users, v_target_roles, v_is_org_wide,
    jsonb_build_object(
      'note_source', v_note_source,
      'chat_group_id', v_group_id,
      'reply_to', nullif(v_row->>'reply_to', ''),
      'conversation_key', v_conversation_key
    ),
    coalesce(nullif(v_row->>'updated_at', '')::timestamptz, nullif(v_row->>'created_at', '')::timestamptz, now())
  );

  return new;
end;
$$;

drop trigger if exists trg_notes_notification_inbox on public.notes;
create trigger trg_notes_notification_inbox after insert or update on public.notes
for each row execute function public.kalam_notes_notification_trigger();


-- Remove only the implicit sender. Keep genuine user/role/group recipients,
-- message content, timestamps, read states and independently targeted users.
-- This repairs delivery metadata, not a new message. Suppress only the inbox
-- broadcast trigger during the repair to avoid replaying thousands of alerts.
do $$
declare prior_state text;
begin
 select tgenabled::text into prior_state from pg_trigger
 where tgrelid='public.notification_inbox_items'::regclass and tgname='trg_notification_inbox_items_broadcast' and not tgisinternal;
 perform set_config('kalam.migration571_broadcast_state',coalesce(prior_state,''),true);
 if prior_state in ('O','A','R') then alter table public.notification_inbox_items disable trigger trg_notification_inbox_items_broadcast; end if;
end $$;

with repairs as (
  select inbox.id,
    case when note.author_id is not null
      and not (note.author_id = any(coalesce(note.mention_user_ids, '{}'::uuid[])))
      and not (note.author_id = any(coalesce(chat.user_ids, '{}'::uuid[])))
      then array_remove(coalesce(inbox.target_user_ids, '{}'::uuid[]), note.author_id)
      else coalesce(inbox.target_user_ids, '{}'::uuid[]) end as recipients
  from public.notification_inbox_items inbox
  join public.notes note on note.org_id = inbox.org_id and note.id = public.kalam_try_uuid(inbox.source_id)
  left join public.chat_groups chat on chat.org_id = note.org_id
    and chat.id = public.kalam_try_uuid(note.metadata->>'chat_group_id')
  where inbox.section = 'notes' and inbox.source_type = 'note'
    and public.kalam_internal_message_is_system_v2(note.source_type, note.metadata, inbox.category)
    and (inbox.is_org_wide or (note.author_id = any(coalesce(inbox.target_user_ids, '{}'::uuid[]))
      and not (note.author_id = any(coalesce(note.mention_user_ids, '{}'::uuid[])))
      and not (note.author_id = any(coalesce(chat.user_ids, '{}'::uuid[])))))
)
update public.notification_inbox_items inbox
set target_user_ids = repairs.recipients, is_org_wide = false
from repairs where repairs.id = inbox.id
  and (inbox.target_user_ids is distinct from repairs.recipients or inbox.is_org_wide);

do $$
begin
 case current_setting('kalam.migration571_broadcast_state',true)
 when 'O' then alter table public.notification_inbox_items enable trigger trg_notification_inbox_items_broadcast;
 when 'A' then alter table public.notification_inbox_items enable always trigger trg_notification_inbox_items_broadcast;
 when 'R' then alter table public.notification_inbox_items enable replica trigger trg_notification_inbox_items_broadcast;
 else null;
 end case;
end $$;

notify pgrst, 'reload schema';
commit;
