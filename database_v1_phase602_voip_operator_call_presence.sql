-- Private operational bridge state; no new client grants or tenant policy changes.
begin;
alter table public.voip_provider_bridges add column if not exists active_call_count integer not null default 0;
notify pgrst,'reload schema';
commit;
