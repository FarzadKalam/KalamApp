-- Phase 619: Central SaaS AI provider API keys table (AvalAI key management)

begin;
set local lock_timeout = '3s';

create table if not exists public.saas_ai_provider_keys (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'avalai',
  label text,
  key_masked text not null,
  key_sha256 text not null,
  api_key_ciphertext text not null,
  is_active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  last_tested_at timestamptz,
  last_test_status text,
  last_test_message text
);

create unique index if not exists idx_saas_ai_provider_keys_provider_sha256
  on public.saas_ai_provider_keys (provider, key_sha256);

create unique index if not exists idx_saas_ai_provider_keys_single_active
  on public.saas_ai_provider_keys (provider)
  where is_active = true;

create index if not exists idx_saas_ai_provider_keys_provider_created
  on public.saas_ai_provider_keys (provider, created_at desc);

alter table public.saas_ai_provider_keys enable row level security;

revoke all on table public.saas_ai_provider_keys from public, anon, authenticated;
grant select, insert, update, delete on table public.saas_ai_provider_keys to service_role;

notify pgrst, 'reload schema';

commit;
