-- =====================================================
-- TazeSystem - Phase 503: Notification inbox trigger and backfill repair
-- Restores inbox creation for UUID-backed notes and repairs rows missed while
-- the UUID parser returned null. Existing notes and read states stay untouched.
-- =====================================================

begin;

-- Keep the public helper fail-closed for malformed identifiers, while allowing
-- every valid RFC UUID accepted by PostgreSQL. The prior implementation was
-- observed to resolve valid values to null in production.
create or replace function public.kalam_try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  v_normalized text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if v_normalized is null then
    return null;
  end if;

  v_normalized := regexp_replace(
    v_normalized,
    '^(process_run_stage|process_run|process_template_stage|process_template|task|user|role)[_:]',
    '',
    'i'
  );

  if v_normalized !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;

  return cast(v_normalized as uuid);
exception
  when others then
    return null;
end;
$$;

-- Reconstruct only absent inbox rows. The note itself, its timestamps and
-- read state are never changed. New rows use the exact recipient scope of the
-- active note trigger, so direct, role, group, system and automation delivery
-- remain tenant-bound and fail closed.
with missing_notes as (
  select
    note.*,
    coalesce(note.metadata, '{}'::jsonb) as normalized_metadata,
    lower(trim(coalesce(
      nullif(note.source_type, ''),
      nullif(note.metadata->>'source_type', ''),
      'user'
    ))) as note_source,
    public.kalam_try_uuid(note.metadata->>'chat_group_id') as group_id
  from public.notes note
  where note.org_id is not null
    and not exists (
      select 1
      from public.notification_inbox_items inbox
      where inbox.org_id = note.org_id
        and inbox.source_type = 'note'
        and inbox.source_id = note.id::text
    )
), scoped_notes as (
  select
    note.*,
    coalesce(group_row.user_ids, '{}'::uuid[]) as group_user_ids,
    coalesce(group_row.role_ids, '{}'::uuid[]) as group_role_ids,
    (
      note.note_source in ('system', 'ai', 'assistant')
      or note.normalized_metadata ?| array[
        'workflow_id', 'automation_rule_id', 'process_automation_rule_id',
        'workflow_action_type', 'scheduled_report_id'
      ]
    ) as is_system
  from missing_notes note
  left join public.chat_groups group_row
    on group_row.id = note.group_id
   and group_row.org_id = note.org_id
), prepared_rows as (
  select
    note.*,
    public.kalam_distinct_uuid_array(
      coalesce(note.mention_user_ids, '{}'::uuid[])
      || note.group_user_ids
      || case when note.author_id is null then '{}'::uuid[] else array[note.author_id] end
    ) as target_user_ids,
    public.kalam_distinct_uuid_array(
      coalesce(note.mention_role_ids, '{}'::uuid[]) || note.group_role_ids
    ) as target_role_ids
  from scoped_notes note
)
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
  case
    when note.note_source in ('ai', 'assistant') then 'assistant'
    when note.is_system then 'system'
    when note.group_id is not null then 'group'
    else 'internal'
  end,
  'upsert',
  case
    when note.note_source in ('ai', 'assistant') then 'پیام هوش مصنوعی'
    when note.is_system then 'پیام سیستم'
    else 'پیام داخلی'
  end,
  nullif(left(coalesce(note.content, ''), 240), ''),
  nullif(trim(coalesce(note.module_id, '')), ''),
  nullif(trim(coalesce(note.record_id, '')), ''),
  note.target_user_ids,
  note.target_role_ids,
  (
    lower(trim(coalesce(note.normalized_metadata->>'is_org_wide', 'false'))) in ('true', '1', 'yes')
    or lower(trim(coalesce(note.normalized_metadata->>'org_wide', 'false'))) in ('true', '1', 'yes')
    or (note.is_system and cardinality(note.target_user_ids) = 0 and cardinality(note.target_role_ids) = 0)
  ),
  jsonb_build_object(
    'note_source', note.note_source,
    'chat_group_id', note.group_id,
    'reply_to', note.reply_to,
    'conversation_key', case
      when note.group_id is not null then 'group:' || note.group_id::text
      when note.is_system then 'system'
      when lower(trim(coalesce(note.normalized_metadata->>'saved_message', 'false'))) in ('true', '1', 'yes') then 'mine'
      when nullif(trim(note.normalized_metadata->>'conversation_key'), '') is not null then trim(note.normalized_metadata->>'conversation_key')
      when note.author_id is not null and cardinality(coalesce(note.mention_user_ids, '{}'::uuid[])) = 1
        then public.kalam_direct_conversation_key(note.author_id, note.mention_user_ids[1])
      when note.author_id is not null then 'mine'
      else null
    end
  ),
  case
    when note.group_id is not null then 'group:' || note.group_id::text
    when note.is_system then 'system'
    when lower(trim(coalesce(note.normalized_metadata->>'saved_message', 'false'))) in ('true', '1', 'yes') then 'mine'
    when nullif(trim(note.normalized_metadata->>'conversation_key'), '') is not null then trim(note.normalized_metadata->>'conversation_key')
    when note.author_id is not null and cardinality(coalesce(note.mention_user_ids, '{}'::uuid[])) = 1
      then public.kalam_direct_conversation_key(note.author_id, note.mention_user_ids[1])
    when note.author_id is not null then 'mine'
    else null
  end,
  coalesce(note.updated_at, note.created_at, now())
from prepared_rows note
on conflict (org_id, source_type, source_id) do nothing;

grant execute on function public.kalam_try_uuid(text) to authenticated;
revoke all on function public.kalam_try_uuid(text) from public, anon;

notify pgrst, 'reload schema';

commit;
