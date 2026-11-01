-- Preserve recipient-only system visibility on direct/realtime inbox reads,
-- including legacy organization-wide notification rows.
begin;
create or replace function public.kalam_system_inbox_recipient_guard_v1(
  p_org_id uuid, p_section text, p_source_type text, p_source_id text,
  p_category text, p_users uuid[], p_roles uuid[]
)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  viewer_org uuid := public.current_org_id();
  viewer_role uuid;
  note_source text;
  note_metadata jsonb;
  note_users uuid[];
  note_roles uuid[];
begin
  if viewer is null or viewer_org is null or p_org_id is distinct from viewer_org then return false; end if;
  select profile.role_id into viewer_role from public.profiles profile
    where profile.id = viewer and profile.org_id = viewer_org limit 1;
  if not found then return false; end if;
  if p_section = 'notes' and p_source_type = 'note' then
    select note.source_type, note.metadata, note.mention_user_ids, note.mention_role_ids
      into note_source, note_metadata, note_users, note_roles from public.notes note
      where note.org_id = viewer_org and note.id = public.kalam_try_uuid(p_source_id);
  end if;
  if not public.kalam_internal_message_is_system_v2(note_source, note_metadata, p_category) then return true; end if;
  return viewer = any(coalesce(p_users,'{}'::uuid[]) || coalesce(note_users,'{}'::uuid[]))
    or (viewer_role is not null and viewer_role = any(coalesce(p_roles,'{}'::uuid[]) || coalesce(note_roles,'{}'::uuid[])));
end;
$$;
revoke all on function public.kalam_system_inbox_recipient_guard_v1(uuid,text,text,text,text,uuid[],uuid[]) from public, anon;
grant execute on function public.kalam_system_inbox_recipient_guard_v1(uuid,text,text,text,text,uuid[],uuid[]) to authenticated;
alter table public.notification_inbox_items enable row level security;
drop policy if exists p_inbox_system_recipient_guard on public.notification_inbox_items;
create policy p_inbox_system_recipient_guard on public.notification_inbox_items as restrictive for select to authenticated
using (org_id = public.current_org_id() and public.kalam_system_inbox_recipient_guard_v1(
  org_id, section, source_type, source_id, category, target_user_ids, target_role_ids
));
notify pgrst, 'reload schema';
commit;
