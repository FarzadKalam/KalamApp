-- =====================================================
-- KalamApp - Phase 195: Communication read cursors
-- Date: 2026-05-25
-- Type: Data model / security / idempotent
-- =====================================================

begin;

create table if not exists public.communication_read_cursors (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('internal', 'bot', 'sms', 'voip')),
  conversation_key text not null,
  read_through_at timestamptz not null,
  read_through_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id, channel, conversation_key)
);

alter table public.communication_read_cursors enable row level security;

create index if not exists idx_communication_read_cursors_user_updated
  on public.communication_read_cursors (org_id, user_id, updated_at desc);

drop policy if exists p_communication_read_cursors_select_own on public.communication_read_cursors;
create policy p_communication_read_cursors_select_own
on public.communication_read_cursors
for select
to authenticated
using (
  org_id = public.current_org_id()
  and user_id = auth.uid()
);

-- Writes are intentionally RPC-only.
revoke all on table public.communication_read_cursors from public, anon, authenticated;
grant select on table public.communication_read_cursors to authenticated;

create or replace function public.mark_communication_read(
  p_channel text,
  p_conversation_key text,
  p_read_through_at timestamptz,
  p_read_through_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_role_id uuid := null;
  v_section text;
  v_key text := nullif(trim(coalesce(p_conversation_key, '')), '');
begin
  if v_user_id is null or v_org_id is null or v_key is null or p_read_through_at is null then
    return false;
  end if;

  v_section := case trim(coalesce(p_channel, ''))
    when 'internal' then 'notes'
    when 'bot' then 'bot_messages'
    when 'sms' then 'sms'
    when 'voip' then 'voip_calls'
    else null
  end;
  if v_section is null then
    return false;
  end if;

  select p.role_id into v_role_id
  from public.profiles p
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  if not exists (
    select 1
    from public.notification_inbox_items nii
    where nii.org_id = v_org_id
      and nii.section = v_section
      and coalesce(nii.conversation_key, nullif(trim(nii.payload->>'conversation_key'), '')) = v_key
      and (
        nii.is_org_wide = true
        or v_user_id = any(nii.target_user_ids)
        or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
      )
  ) then
    return false;
  end if;

  insert into public.communication_read_cursors (
    org_id,
    user_id,
    channel,
    conversation_key,
    read_through_at,
    read_through_id,
    updated_at
  )
  values (
    v_org_id,
    v_user_id,
    trim(p_channel),
    v_key,
    p_read_through_at,
    nullif(trim(coalesce(p_read_through_id, '')), ''),
    now()
  )
  on conflict (org_id, user_id, channel, conversation_key) do update
  set read_through_at = greatest(public.communication_read_cursors.read_through_at, excluded.read_through_at),
      read_through_id = case
        when excluded.read_through_at >= public.communication_read_cursors.read_through_at
          then excluded.read_through_id
        else public.communication_read_cursors.read_through_id
      end,
      updated_at = now();

  return true;
end;
$$;

grant execute on function public.mark_communication_read(text, text, timestamptz, text) to authenticated;
revoke all on function public.mark_communication_read(text, text, timestamptz, text) from public, anon;

notify pgrst, 'reload schema';

commit;
