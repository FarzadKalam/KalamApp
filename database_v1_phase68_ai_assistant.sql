-- KalamApp V1 Phase 68
-- AI assistant foundation: org knowledge, chat audit, proposed actions, AI notes.

alter table if exists public.notes
  add column if not exists source_type text not null default 'user',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notes_source_type_check') then
    alter table public.notes
      add constraint notes_source_type_check
      check (source_type in ('user', 'system', 'ai'));
  end if;
end $$;

create index if not exists idx_notes_source_type_created_at
  on public.notes(source_type, created_at desc);

create table if not exists public.org_documents (
  id uuid primary key default gen_random_uuid()
);

alter table public.org_documents
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists title text not null default '',
  add column if not exists body text not null default '',
  add column if not exists document_type text not null default 'general',
  add column if not exists status text not null default 'active',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'org_documents_status_check') then
    alter table public.org_documents
      add constraint org_documents_status_check
      check (status in ('active', 'draft', 'archived'));
  end if;
end $$;

create index if not exists idx_org_documents_org_status_updated_at
  on public.org_documents(org_id, status, updated_at desc);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid()
);

alter table public.document_chunks
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists document_id uuid references public.org_documents(id) on delete cascade,
  add column if not exists chunk_index integer not null default 0,
  add column if not exists content text not null default '',
  add column if not exists content_hash text not null default '',
  add column if not exists token_estimate integer not null default 0,
  add column if not exists status text not null default 'active',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'document_chunks_status_check') then
    alter table public.document_chunks
      add constraint document_chunks_status_check
      check (status in ('active', 'draft', 'archived'));
  end if;
end $$;

create unique index if not exists idx_document_chunks_document_index
  on public.document_chunks(document_id, chunk_index);

create index if not exists idx_document_chunks_org_status
  on public.document_chunks(org_id, status, updated_at desc);

create table if not exists public.ai_provider_settings (
  id uuid primary key default gen_random_uuid()
);

alter table public.ai_provider_settings
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists provider text not null default 'avalai',
  add column if not exists base_url text not null default 'https://api.avalai.ir/v1',
  add column if not exists model text not null default '',
  add column if not exists api_key text not null default '',
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_ai_provider_settings_org
  on public.ai_provider_settings(org_id);

create table if not exists public.ai_threads (
  id uuid primary key default gen_random_uuid()
);

alter table public.ai_threads
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists user_id uuid references public.profiles(id) on delete set null default auth.uid(),
  add column if not exists title text not null default '',
  add column if not exists context_type text not null default 'page',
  add column if not exists context_key text,
  add column if not exists module_id text,
  add column if not exists record_id text,
  add column if not exists provider text not null default 'avalai',
  add column if not exists model text,
  add column if not exists status text not null default 'active',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_threads_status_check') then
    alter table public.ai_threads
      add constraint ai_threads_status_check
      check (status in ('active', 'archived'));
  end if;
end $$;

create index if not exists idx_ai_threads_org_user_updated_at
  on public.ai_threads(org_id, user_id, updated_at desc);

create index if not exists idx_ai_threads_org_user_context_key
  on public.ai_threads(org_id, user_id, context_key, status, updated_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid()
);

alter table public.ai_messages
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists thread_id uuid references public.ai_threads(id) on delete cascade,
  add column if not exists role text not null default 'user',
  add column if not exists content text not null default '',
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_messages_role_check') then
    alter table public.ai_messages
      add constraint ai_messages_role_check
      check (role in ('system', 'user', 'assistant', 'tool'));
  end if;
end $$;

create index if not exists idx_ai_messages_thread_created_at
  on public.ai_messages(thread_id, created_at);

create table if not exists public.ai_action_logs (
  id uuid primary key default gen_random_uuid()
);

alter table public.ai_action_logs
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists thread_id uuid references public.ai_threads(id) on delete set null,
  add column if not exists message_id uuid references public.ai_messages(id) on delete set null,
  add column if not exists action_type text not null default 'send_note',
  add column if not exists status text not null default 'proposed',
  add column if not exists module_id text,
  add column if not exists record_id text,
  add column if not exists dedupe_key text,
  add column if not exists proposed_payload jsonb not null default '{}'::jsonb,
  add column if not exists result jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists executed_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_action_logs_status_check') then
    alter table public.ai_action_logs
      add constraint ai_action_logs_status_check
      check (status in ('proposed', 'confirmed', 'executed', 'rejected', 'failed', 'skipped'));
  end if;
end $$;

create index if not exists idx_ai_action_logs_org_status_created_at
  on public.ai_action_logs(org_id, status, created_at desc);

create unique index if not exists idx_ai_action_logs_dedupe_key
  on public.ai_action_logs(org_id, dedupe_key)
  where dedupe_key is not null and dedupe_key <> '';

do $$
declare
  t text;
begin
  foreach t in array array['org_documents', 'document_chunks', 'ai_provider_settings', 'ai_threads', 'ai_action_logs']
  loop
    if exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = t
        and c.column_name = 'updated_at'
    ) then
      execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated_at', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'trg_' || t || '_updated_at', t);
    end if;
  end loop;
end $$;

grant select, insert, update, delete on public.org_documents to authenticated, service_role;
grant select, insert, update, delete on public.document_chunks to authenticated, service_role;
revoke all on public.ai_provider_settings from authenticated;
grant select, insert, update, delete on public.ai_provider_settings to service_role;
grant select, insert, update, delete on public.ai_threads to authenticated, service_role;
grant select, insert, update, delete on public.ai_messages to authenticated, service_role;
grant select, insert, update, delete on public.ai_action_logs to authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array['org_documents', 'document_chunks', 'ai_threads', 'ai_messages', 'ai_action_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'p_' || t || '_org_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id())',
      'p_' || t || '_org_all',
      t
    );
  end loop;
end $$;

alter table public.ai_provider_settings enable row level security;
drop policy if exists p_ai_provider_settings_service_role on public.ai_provider_settings;
create policy p_ai_provider_settings_service_role
on public.ai_provider_settings
for all to service_role
using (true)
with check (true);
