-- =====================================================
-- KalamApp - Phase 194: Notification runtime stability and fail-closed RLS
-- Date: 2026-05-25
-- Type: Performance / security / idempotent
-- =====================================================

begin;

-- The legacy timeline functions contain an unread-window branch which can
-- aggregate every unread message. Preserve the original implementation behind
-- a private name, then expose the existing API through a bounded wrapper.
do $$
begin
  if to_regprocedure('public.get_internal_conversation_timeline_legacy_unbounded(text,integer,text,boolean)') is null
     and to_regprocedure('public.get_internal_conversation_timeline(text,integer,text,boolean)') is not null then
    alter function public.get_internal_conversation_timeline(text, integer, text, boolean)
      rename to get_internal_conversation_timeline_legacy_unbounded;
  end if;

  if to_regprocedure('public.get_bot_conversation_timeline_legacy_unbounded(uuid,integer,text,boolean)') is null
     and to_regprocedure('public.get_bot_conversation_timeline(uuid,integer,text,boolean)') is not null then
    alter function public.get_bot_conversation_timeline(uuid, integer, text, boolean)
      rename to get_bot_conversation_timeline_legacy_unbounded;
  end if;
end;
$$;

create or replace function public.get_internal_conversation_timeline(
  p_conversation_key text,
  p_limit integer default 10,
  p_before_cursor text default null,
  p_include_unread_window boolean default true
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.get_internal_conversation_timeline_legacy_unbounded(
    p_conversation_key,
    least(greatest(coalesce(p_limit, 10), 1), 50),
    p_before_cursor,
    false
  );
$$;

create or replace function public.get_bot_conversation_timeline(
  p_bot_group_id uuid,
  p_limit integer default 10,
  p_before_cursor text default null,
  p_include_unread_window boolean default true
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.get_bot_conversation_timeline_legacy_unbounded(
    p_bot_group_id,
    least(greatest(coalesce(p_limit, 10), 1), 50),
    p_before_cursor,
    false
  );
$$;

comment on function public.get_internal_conversation_timeline(text, integer, text, boolean)
  is 'Bounded communication timeline API. Unread count is returned separately; items never use the legacy unbounded unread window.';
comment on function public.get_bot_conversation_timeline(uuid, integer, text, boolean)
  is 'Bounded bot timeline API. Unread count is returned separately; items never use the legacy unbounded unread window.';

grant execute on function public.get_internal_conversation_timeline(text, integer, text, boolean) to authenticated;
grant execute on function public.get_bot_conversation_timeline(uuid, integer, text, boolean) to authenticated;
revoke all on function public.get_internal_conversation_timeline(text, integer, text, boolean) from public, anon;
revoke all on function public.get_bot_conversation_timeline(uuid, integer, text, boolean) from public, anon;
revoke all on function public.get_internal_conversation_timeline_legacy_unbounded(text, integer, text, boolean) from public, anon, authenticated;
revoke all on function public.get_bot_conversation_timeline_legacy_unbounded(uuid, integer, text, boolean) from public, anon, authenticated;

create index if not exists idx_notification_inbox_timeline_lookup
  on public.notification_inbox_items (org_id, section, conversation_key, created_at desc, source_id);
create index if not exists idx_notes_notification_timeline_lookup
  on public.notes (org_id, created_at desc, id desc);
create index if not exists idx_bot_messages_timeline_lookup
  on public.counterparty_bot_messages (org_id, bot_group_id, created_at desc, id desc);

-- Remove permissive legacy policies; every tenant-owned access path must fail
-- closed when current_org_id() is null.
drop policy if exists p_notes_org_all on public.notes;
drop policy if exists p_notes_select_targeted on public.notes;
create policy p_notes_select_targeted
on public.notes
for select
to authenticated
using (
  org_id = public.current_org_id()
  and public.kalam_can_access_note(id, author_id, org_id, mention_user_ids, mention_role_ids, reply_to, coalesce(metadata, '{}'::jsonb))
);

drop policy if exists p_notes_insert_targeted on public.notes;
create policy p_notes_insert_targeted
on public.notes
for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and (author_id is null or author_id = auth.uid())
);

drop policy if exists p_notes_update_author on public.notes;
create policy p_notes_update_author
on public.notes
for update
to authenticated
using (
  org_id = public.current_org_id()
  and author_id = auth.uid()
)
with check (
  org_id = public.current_org_id()
  and author_id = auth.uid()
);

drop policy if exists p_notes_delete_author on public.notes;
create policy p_notes_delete_author
on public.notes
for delete
to authenticated
using (
  org_id = public.current_org_id()
  and author_id = auth.uid()
);

drop policy if exists p_chat_groups_select_targeted on public.chat_groups;
create policy p_chat_groups_select_targeted
on public.chat_groups
for select
to authenticated
using (
  org_id = public.current_org_id()
  and public.kalam_can_access_chat_group(id, org_id)
);

drop policy if exists p_chat_groups_insert_owner on public.chat_groups;
create policy p_chat_groups_insert_owner
on public.chat_groups
for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and created_by = auth.uid()
);

drop policy if exists p_chat_groups_update_owner on public.chat_groups;
create policy p_chat_groups_update_owner
on public.chat_groups
for update
to authenticated
using (
  org_id = public.current_org_id()
  and created_by = auth.uid()
)
with check (
  org_id = public.current_org_id()
  and created_by = auth.uid()
);

drop policy if exists p_chat_groups_delete_owner on public.chat_groups;
create policy p_chat_groups_delete_owner
on public.chat_groups
for delete
to authenticated
using (
  org_id = public.current_org_id()
  and created_by = auth.uid()
);

drop policy if exists p_counterparty_bot_groups_select_targeted on public.counterparty_bot_groups;
create policy p_counterparty_bot_groups_select_targeted
on public.counterparty_bot_groups
for select
to authenticated
using (
  org_id = public.current_org_id()
  and public.kalam_can_access_bot_group(id, org_id)
);

drop policy if exists p_counterparty_bot_groups_insert_targeted on public.counterparty_bot_groups;
create policy p_counterparty_bot_groups_insert_targeted
on public.counterparty_bot_groups
for insert
to authenticated
with check (
  org_id = public.current_org_id()
);

drop policy if exists p_counterparty_bot_groups_update_targeted on public.counterparty_bot_groups;
create policy p_counterparty_bot_groups_update_targeted
on public.counterparty_bot_groups
for update
to authenticated
using (
  org_id = public.current_org_id()
  and public.kalam_can_access_bot_group(id, org_id)
)
with check (
  org_id = public.current_org_id()
  and public.kalam_can_access_bot_group(id, org_id)
);

drop policy if exists p_counterparty_bot_groups_delete_targeted on public.counterparty_bot_groups;
create policy p_counterparty_bot_groups_delete_targeted
on public.counterparty_bot_groups
for delete
to authenticated
using (
  org_id = public.current_org_id()
  and public.kalam_can_access_bot_group(id, org_id)
);

drop policy if exists p_counterparty_bot_messages_select_targeted on public.counterparty_bot_messages;
create policy p_counterparty_bot_messages_select_targeted
on public.counterparty_bot_messages
for select
to authenticated
using (
  org_id = public.current_org_id()
  and bot_group_id is not null
  and public.kalam_can_access_bot_group(bot_group_id, org_id)
);

drop policy if exists p_counterparty_bot_messages_insert_targeted on public.counterparty_bot_messages;
create policy p_counterparty_bot_messages_insert_targeted
on public.counterparty_bot_messages
for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and bot_group_id is not null
  and public.kalam_can_access_bot_group(bot_group_id, org_id)
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists p_counterparty_bot_messages_update_targeted on public.counterparty_bot_messages;
create policy p_counterparty_bot_messages_update_targeted
on public.counterparty_bot_messages
for update
to authenticated
using (
  org_id = public.current_org_id()
  and bot_group_id is not null
  and public.kalam_can_access_bot_group(bot_group_id, org_id)
)
with check (
  org_id = public.current_org_id()
  and bot_group_id is not null
  and public.kalam_can_access_bot_group(bot_group_id, org_id)
);

drop policy if exists p_counterparty_bot_messages_delete_targeted on public.counterparty_bot_messages;
create policy p_counterparty_bot_messages_delete_targeted
on public.counterparty_bot_messages
for delete
to authenticated
using (
  org_id = public.current_org_id()
  and bot_group_id is not null
  and public.kalam_can_access_bot_group(bot_group_id, org_id)
);

notify pgrst, 'reload schema';

commit;

