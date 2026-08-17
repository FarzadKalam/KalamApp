-- Phase 460: private, per-user memory for the AI assistant.
-- Each statement is idempotent so the migration can be safely retried.

begin;

create table if not exists public.ai_user_memories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  memory_key text not null,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint ai_user_memories_content_length check (char_length(btrim(content)) between 1 and 600),
  constraint ai_user_memories_key_length check (char_length(memory_key) between 1 and 180),
  constraint ai_user_memories_org_user_key_unique unique (org_id, user_id, memory_key)
);

create index if not exists idx_ai_user_memories_org_user_updated_at
  on public.ai_user_memories (org_id, user_id, updated_at desc);

create or replace function public.set_ai_user_memories_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ai_user_memories_updated_at on public.ai_user_memories;
create trigger trg_ai_user_memories_updated_at
before update on public.ai_user_memories
for each row execute function public.set_ai_user_memories_updated_at();

alter table public.ai_user_memories enable row level security;

drop policy if exists ai_user_memories_select_own on public.ai_user_memories;
create policy ai_user_memories_select_own on public.ai_user_memories
  for select to authenticated
  using (org_id = public.current_org_id() and user_id = auth.uid());

drop policy if exists ai_user_memories_insert_own on public.ai_user_memories;
create policy ai_user_memories_insert_own on public.ai_user_memories
  for insert to authenticated
  with check (org_id = public.current_org_id() and user_id = auth.uid());

drop policy if exists ai_user_memories_update_own on public.ai_user_memories;
create policy ai_user_memories_update_own on public.ai_user_memories
  for update to authenticated
  using (org_id = public.current_org_id() and user_id = auth.uid())
  with check (org_id = public.current_org_id() and user_id = auth.uid());

drop policy if exists ai_user_memories_delete_own on public.ai_user_memories;
create policy ai_user_memories_delete_own on public.ai_user_memories
  for delete to authenticated
  using (org_id = public.current_org_id() and user_id = auth.uid());

grant select, insert, update, delete on public.ai_user_memories to authenticated;

commit;
