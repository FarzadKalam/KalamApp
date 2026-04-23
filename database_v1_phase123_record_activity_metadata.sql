alter table public.changelogs
  add column if not exists metadata jsonb;

create index if not exists idx_changelogs_user_created_at
  on public.changelogs(user_id, created_at desc);

create index if not exists idx_changelogs_metadata_gin
  on public.changelogs
  using gin (metadata);
