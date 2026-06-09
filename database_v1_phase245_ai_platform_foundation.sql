-- TazeSystem V1 Phase 245
-- AI platform foundation: central AvalAI gateway, per-org AI settings, model catalog,
-- wallet/usage ledger, thread management support, and document embedding metadata.

create extension if not exists vector;

-- ─── Global model catalog ────────────────────────────────────────────────────
create table if not exists public.ai_model_catalog (
  id text primary key,
  provider text not null default 'avalai',
  display_name_fa text not null default '',
  capability_tags text[] not null default '{}'::text[],
  input_usd_per_1m numeric not null default 0,
  cached_input_usd_per_1m numeric,
  output_usd_per_1m numeric not null default 0,
  specific_cost_usd numeric,
  specific_cost_unit text,
  exchange_rate_irt numeric not null default 0,
  margin_percent numeric not null default 30,
  is_active boolean not null default true,
  is_coming_soon boolean not null default false,
  pricing_source text not null default 'avalai',
  pricing_updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_model_catalog enable row level security;
drop policy if exists p_ai_model_catalog_select_active on public.ai_model_catalog;
create policy p_ai_model_catalog_select_active
on public.ai_model_catalog
for select to authenticated
using (is_active = true);

grant select on public.ai_model_catalog to authenticated, service_role;
grant insert, update, delete on public.ai_model_catalog to service_role;

-- Legacy per-org provider keys are intentionally removed. AI requests now go
-- through the central TazeSystem AvalAI gateway only.
drop table if exists public.ai_provider_settings cascade;

-- ─── Per-org AI configuration ────────────────────────────────────────────────
create table if not exists public.org_ai_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  selected_models jsonb not null default '{}'::jsonb,
  feature_flags jsonb not null default '{}'::jsonb,
  daily_limit_irt numeric,
  monthly_limit_irt numeric,
  require_human_approval boolean not null default true,
  default_margin_percent numeric not null default 30,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_org_ai_settings_org
  on public.org_ai_settings(org_id);

alter table public.org_ai_settings enable row level security;
drop policy if exists p_org_ai_settings_org_all on public.org_ai_settings;
create policy p_org_ai_settings_org_all
on public.org_ai_settings
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

grant select, insert, update, delete on public.org_ai_settings to authenticated, service_role;

-- ─── Per-org AI wallet ───────────────────────────────────────────────────────
create table if not exists public.org_ai_wallets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  balance_irt numeric not null default 0,
  included_quota_irt numeric not null default 0,
  reserved_irt numeric not null default 0,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_ai_wallets_status_check check (status in ('active', 'blocked', 'disabled'))
);

create unique index if not exists idx_org_ai_wallets_org
  on public.org_ai_wallets(org_id);

alter table public.org_ai_wallets enable row level security;
drop policy if exists p_org_ai_wallets_org_read on public.org_ai_wallets;
create policy p_org_ai_wallets_org_read
on public.org_ai_wallets
for select to authenticated
using (org_id = public.current_org_id());

grant select on public.org_ai_wallets to authenticated, service_role;
grant insert, update, delete on public.org_ai_wallets to service_role;

-- ─── Usage ledger ────────────────────────────────────────────────────────────
create table if not exists public.org_ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  user_id uuid references public.profiles(id) on delete set null,
  thread_id uuid references public.ai_threads(id) on delete set null,
  message_id uuid references public.ai_messages(id) on delete set null,
  avalai_request_id text,
  capability text not null default 'dashboard_chat',
  model text not null default '',
  provider text not null default 'avalai',
  status text not null default 'pending',
  raw_cost_unit numeric not null default 0,
  raw_cost_irt numeric not null default 0,
  billed_amount_irt numeric not null default 0,
  margin_percent numeric not null default 30,
  exchange_rate_irt numeric not null default 0,
  usage jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint org_ai_usage_ledger_status_check check (status in ('pending', 'finalized', 'refunded', 'failed', 'skipped'))
);

create index if not exists idx_org_ai_usage_ledger_org_created_at
  on public.org_ai_usage_ledger(org_id, created_at desc);

create index if not exists idx_org_ai_usage_ledger_org_model_created_at
  on public.org_ai_usage_ledger(org_id, model, created_at desc);

create unique index if not exists idx_org_ai_usage_ledger_avalai_request
  on public.org_ai_usage_ledger(org_id, avalai_request_id)
  where avalai_request_id is not null and avalai_request_id <> '';

alter table public.org_ai_usage_ledger enable row level security;
drop policy if exists p_org_ai_usage_ledger_org_read on public.org_ai_usage_ledger;
create policy p_org_ai_usage_ledger_org_read
on public.org_ai_usage_ledger
for select to authenticated
using (org_id = public.current_org_id());

grant select on public.org_ai_usage_ledger to authenticated, service_role;
grant insert, update, delete on public.org_ai_usage_ledger to service_role;

-- ─── Document embedding metadata ─────────────────────────────────────────────
alter table public.document_chunks
  add column if not exists embedding vector(1536),
  add column if not exists embedding_model text not null default 'text-embedding-3-small',
  add column if not exists embedding_dimension integer not null default 1536,
  add column if not exists embedding_status text not null default 'pending',
  add column if not exists embedding_updated_at timestamptz,
  add column if not exists embedding_error text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'document_chunks_embedding_status_check') then
    alter table public.document_chunks
      add constraint document_chunks_embedding_status_check
      check (embedding_status in ('pending', 'ready', 'failed', 'skipped'));
  end if;
end $$;

create index if not exists idx_document_chunks_org_embedding_status
  on public.document_chunks(org_id, embedding_status, updated_at desc);

create index if not exists idx_document_chunks_embedding_cosine
  on public.document_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100)
  where embedding is not null;

create or replace function public.match_ai_document_chunks(
  p_org_id uuid,
  p_user_id uuid,
  p_role_id uuid,
  p_query_embedding vector(1536),
  p_match_count integer default 6
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index integer,
  content text,
  metadata jsonb,
  updated_at timestamptz,
  similarity double precision
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.document_id,
    c.chunk_index,
    c.content,
    c.metadata,
    c.updated_at,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.document_chunks c
  where c.org_id = p_org_id
    and c.status = 'active'
    and c.embedding_status = 'ready'
    and c.embedding is not null
    and (
      (
        coalesce(array_length(c.allowed_user_ids, 1), 0) = 0
        and coalesce(array_length(c.allowed_role_ids, 1), 0) = 0
      )
      or p_user_id = any(c.allowed_user_ids)
      or p_role_id = any(c.allowed_role_ids)
    )
  order by c.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 6), 20));
$$;

revoke all on function public.match_ai_document_chunks(uuid, uuid, uuid, vector, integer) from public;
revoke all on function public.match_ai_document_chunks(uuid, uuid, uuid, vector, integer) from authenticated;
grant execute on function public.match_ai_document_chunks(uuid, uuid, uuid, vector, integer) to service_role;

create table if not exists public.ai_document_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  document_id uuid references public.org_documents(id) on delete cascade,
  status text not null default 'queued',
  job_type text not null default 'embedding',
  processed_chunks integer not null default 0,
  failed_chunks integer not null default 0,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_document_ingestion_jobs_status_check check (status in ('queued', 'running', 'completed', 'failed', 'skipped'))
);

create index if not exists idx_ai_document_ingestion_jobs_org_status
  on public.ai_document_ingestion_jobs(org_id, status, created_at desc);

alter table public.ai_document_ingestion_jobs enable row level security;
drop policy if exists p_ai_document_ingestion_jobs_org_all on public.ai_document_ingestion_jobs;
create policy p_ai_document_ingestion_jobs_org_all
on public.ai_document_ingestion_jobs
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

grant select, insert, update, delete on public.ai_document_ingestion_jobs to authenticated, service_role;

do $$
begin
  if to_regclass('public.ai_action_logs') is not null then
    alter table public.ai_action_logs
      add column if not exists avalai_request_id text;
    create index if not exists idx_ai_action_logs_org_avalai_request
      on public.ai_action_logs(org_id, avalai_request_id)
      where avalai_request_id is not null and avalai_request_id <> '';
  end if;
end $$;

-- ─── Thread list performance ────────────────────────────────────────────────
create index if not exists idx_ai_messages_org_thread_created_at
  on public.ai_messages(org_id, thread_id, created_at desc);

alter table public.ai_threads
  add column if not exists pinned_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists shared_user_ids uuid[] not null default '{}'::uuid[],
  add column if not exists shared_role_ids uuid[] not null default '{}'::uuid[],
  add column if not exists is_shared boolean not null default false;

create index if not exists idx_ai_threads_shared_users_gin
  on public.ai_threads using gin (shared_user_ids);

create index if not exists idx_ai_threads_shared_roles_gin
  on public.ai_threads using gin (shared_role_ids);

drop policy if exists p_ai_threads_org_all on public.ai_threads;
drop policy if exists p_ai_threads_select_owner_or_shared on public.ai_threads;
create policy p_ai_threads_select_owner_or_shared
on public.ai_threads
for select to authenticated
using (
  org_id = public.current_org_id()
  and (
    user_id = auth.uid()
    or auth.uid() = any(shared_user_ids)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.org_id = public.current_org_id()
        and p.role_id = any(shared_role_ids)
    )
  )
);

drop policy if exists p_ai_threads_insert_owner on public.ai_threads;
create policy p_ai_threads_insert_owner
on public.ai_threads
for insert to authenticated
with check (
  org_id = public.current_org_id()
  and user_id = auth.uid()
);

drop policy if exists p_ai_threads_update_owner on public.ai_threads;
create policy p_ai_threads_update_owner
on public.ai_threads
for update to authenticated
using (
  org_id = public.current_org_id()
  and user_id = auth.uid()
)
with check (
  org_id = public.current_org_id()
  and user_id = auth.uid()
);

drop policy if exists p_ai_threads_delete_owner on public.ai_threads;
create policy p_ai_threads_delete_owner
on public.ai_threads
for delete to authenticated
using (
  org_id = public.current_org_id()
  and user_id = auth.uid()
);

drop policy if exists p_ai_messages_org_all on public.ai_messages;
drop policy if exists p_ai_messages_select_thread_owner_or_shared on public.ai_messages;
create policy p_ai_messages_select_thread_owner_or_shared
on public.ai_messages
for select to authenticated
using (
  org_id = public.current_org_id()
  and exists (
    select 1
    from public.ai_threads t
    where t.id = ai_messages.thread_id
      and t.org_id = public.current_org_id()
      and (
        t.user_id = auth.uid()
        or auth.uid() = any(t.shared_user_ids)
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.org_id = public.current_org_id()
            and p.role_id = any(t.shared_role_ids)
        )
      )
  )
);

drop policy if exists p_ai_messages_insert_own_thread on public.ai_messages;
create policy p_ai_messages_insert_own_thread
on public.ai_messages
for insert to authenticated
with check (
  org_id = public.current_org_id()
  and exists (
    select 1
    from public.ai_threads t
    where t.id = ai_messages.thread_id
      and t.org_id = public.current_org_id()
      and t.user_id = auth.uid()
  )
);

-- ─── Updated-at triggers ─────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_model_catalog',
    'org_ai_settings',
    'org_ai_wallets',
    'ai_document_ingestion_jobs'
  ]
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'updated_at'
    ) then
      execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated_at', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'trg_' || t || '_updated_at', t);
    end if;
  end loop;
end $$;

-- ─── Initial catalog ─────────────────────────────────────────────────────────
insert into public.ai_model_catalog (
  id, provider, display_name_fa, capability_tags, input_usd_per_1m,
  cached_input_usd_per_1m, output_usd_per_1m, specific_cost_usd,
  specific_cost_unit, margin_percent, is_active, is_coming_soon, metadata
) values
  ('gpt-4o-mini', 'openai', 'GPT-4o Mini اقتصادی', array['dashboard_chat','record_chat','customer_reply_suggestion','document_analysis','workflow_ai_prompt'], 0.15, 0.075, 0.60, null, null, 30, true, false, '{"tier":"economy"}'::jsonb),
  ('gpt-4.1-mini', 'openai', 'GPT-4.1 Mini متعادل', array['dashboard_chat','record_chat','customer_reply_suggestion','document_analysis','workflow_ai_prompt'], 0.40, 0.10, 1.60, null, null, 30, true, false, '{"tier":"balanced"}'::jsonb),
  ('gpt-5-mini', 'openai', 'GPT-5 Mini دقیق', array['dashboard_chat','record_chat','customer_reply_suggestion','document_analysis','workflow_ai_prompt'], 0.25, 0.025, 2.00, null, null, 30, true, false, '{"tier":"smart"}'::jsonb),
  ('text-embedding-3-small', 'openai', 'Embedding اقتصادی اسناد', array['embedding','document_analysis'], 0.02, 0.01, 0, null, null, 30, true, false, '{"dimension":1536}'::jsonb),
  ('gpt-4o-mini-transcribe', 'openai', 'تبدیل صوت به متن', array['voice_input'], 1.25, 0.75, 5.00, 0.00005, 'second_input', 30, true, true, '{"phase":"next"}'::jsonb),
  ('gpt-4o-mini-tts', 'openai', 'تولید پاسخ صوتی', array['voice_output'], 0.60, 0.30, 0.015, 0.00025, 'second_output', 30, true, true, '{"phase":"next"}'::jsonb),
  ('gpt-image-1-mini', 'openai', 'تولید تصویر اقتصادی', array['image_generation'], 5.00, 1.25, 40.00, 0.011, 'image_low', 30, true, true, '{"phase":"next"}'::jsonb),
  ('sora-2', 'openai', 'تولید ویدیو استاندارد', array['video_generation'], 0, null, 0, 0.10, 'video_second', 30, true, true, '{"phase":"next"}'::jsonb)
on conflict (id) do update
set
  display_name_fa = excluded.display_name_fa,
  capability_tags = excluded.capability_tags,
  input_usd_per_1m = excluded.input_usd_per_1m,
  cached_input_usd_per_1m = excluded.cached_input_usd_per_1m,
  output_usd_per_1m = excluded.output_usd_per_1m,
  specific_cost_usd = excluded.specific_cost_usd,
  specific_cost_unit = excluded.specific_cost_unit,
  margin_percent = excluded.margin_percent,
  is_active = excluded.is_active,
  is_coming_soon = excluded.is_coming_soon,
  metadata = excluded.metadata,
  updated_at = now();

comment on table public.org_ai_usage_ledger is
  'Source of truth for tenant AI billing. AvalAI User API is used only for reconciliation and provider cost lookup.';
