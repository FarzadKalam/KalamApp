-- Phase 422: بازگردانی مسیر inbox برای پیام‌های سیستمی و اتوماسیون
-- یادداشت‌های سیستمی باید در همان transaction به notification_inbox_items وارد
-- شوند تا پیام‌رسان V2 بتواند آن‌ها را با دامنهٔ دقیق گیرنده نمایش دهد.

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
    || case when v_author_id is null then '{}'::uuid[] else array[v_author_id] end
  );
  v_target_roles := public.kalam_distinct_uuid_array(
    public.kalam_jsonb_uuid_array(v_row->'mention_role_ids') || coalesce(v_group_roles, '{}'::uuid[])
  );
  v_is_org_wide := lower(trim(coalesce(v_metadata->>'is_org_wide', 'false'))) in ('true', '1', 'yes')
    or lower(trim(coalesce(v_metadata->>'org_wide', 'false'))) in ('true', '1', 'yes')
    or (v_is_system and cardinality(v_target_users) = 0 and cardinality(v_target_roles) = 0);

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
create trigger trg_notes_notification_inbox
  after insert or update on public.notes
  for each row execute function public.kalam_notes_notification_trigger();

-- فقط پیام‌های سیستمیِ جاافتادهٔ اخیر را وارد inbox می‌کنیم؛ note اصلی و
-- وضعیت خوانده‌شدن آن دست‌نخورده می‌ماند و conflict نیز idempotent است.
insert into public.notification_inbox_items (
  org_id, source_type, source_id, section, category, action, title, body,
  module_id, record_id, target_user_ids, target_role_ids, is_org_wide,
  payload, conversation_key, last_event_at
)
select
  note.org_id,
  'note',
  note.id::text,
  'notes',
  case when lower(trim(coalesce(note.source_type, note.metadata->>'source_type', ''))) in ('ai', 'assistant')
       then 'assistant' else 'system' end,
  'upsert',
  'پیام سیستم',
  nullif(left(coalesce(note.content, ''), 240), ''),
  note.module_id,
  note.record_id,
  public.kalam_distinct_uuid_array(
    coalesce(note.mention_user_ids, '{}'::uuid[])
    || case when note.author_id is null then '{}'::uuid[] else array[note.author_id] end
  ),
  public.kalam_distinct_uuid_array(coalesce(note.mention_role_ids, '{}'::uuid[])),
  lower(trim(coalesce(note.metadata->>'is_org_wide', 'false'))) in ('true', '1', 'yes')
    or lower(trim(coalesce(note.metadata->>'org_wide', 'false'))) in ('true', '1', 'yes')
    or (
      cardinality(coalesce(note.mention_user_ids, '{}'::uuid[])) = 0
      and cardinality(coalesce(note.mention_role_ids, '{}'::uuid[])) = 0
      and note.author_id is null
    ),
  jsonb_build_object(
    'note_source', lower(trim(coalesce(note.source_type, note.metadata->>'source_type', 'system'))),
    'chat_group_id', null,
    'reply_to', note.reply_to,
    'conversation_key', 'system'
  ),
  'system',
  coalesce(note.updated_at, note.created_at, now())
from public.notes note
where note.created_at >= now() - interval '30 days'
  and note.org_id is not null
  and public.kalam_try_uuid(note.metadata->>'chat_group_id') is null
  and not exists (
    select 1
    from public.notification_inbox_items existing_inbox
    where existing_inbox.org_id = note.org_id
      and existing_inbox.source_type = 'note'
      and existing_inbox.source_id = note.id::text
  )
  and (
    lower(trim(coalesce(note.source_type, note.metadata->>'source_type', ''))) in ('system', 'ai', 'assistant')
    or coalesce(note.metadata, '{}'::jsonb) ?| array[
      'workflow_id', 'automation_rule_id', 'process_automation_rule_id',
      'workflow_action_type', 'scheduled_report_id'
    ]
  )
on conflict (org_id, source_type, source_id) do update set
  section = excluded.section,
  category = excluded.category,
  action = excluded.action,
  title = excluded.title,
  body = excluded.body,
  module_id = excluded.module_id,
  record_id = excluded.record_id,
  target_user_ids = excluded.target_user_ids,
  target_role_ids = excluded.target_role_ids,
  is_org_wide = excluded.is_org_wide,
  payload = public.notification_inbox_items.payload || excluded.payload,
  conversation_key = 'system',
  last_event_at = greatest(public.notification_inbox_items.last_event_at, excluded.last_event_at),
  updated_at = now();

revoke all on function public.kalam_notes_notification_trigger() from public, anon, authenticated;
notify pgrst, 'reload schema';

commit;
