-- Append-only audit trail for user-initiated external connector synchronization.
begin;
create table if not exists public.external_sync_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.external_connections(id) on delete cascade,
  module_key text not null check (module_key in ('products','customers','invoices')),
  action text not null check (action in ('sync_record','sync_orders')),
  direction text not null check (direction in ('from_site','to_site')),
  source text not null default 'manual' check (source in ('manual','webhook','system')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('started','succeeded','partial','failed')),
  actor_user_id uuid references auth.users(id) on delete set null,
  rows_received integer not null default 0 check (rows_received >= 0),
  rows_created integer not null default 0 check (rows_created >= 0),
  rows_updated integer not null default 0 check (rows_updated >= 0),
  rows_failed integer not null default 0 check (rows_failed >= 0),
  changed_fields text[] not null default '{}',
  error_code text,
  constraint external_sync_history_error_code_safe check (error_code is null or error_code ~ '^[a-z0-9_]{1,64}$')
);
create index if not exists external_sync_history_org_connection_started_idx
  on public.external_sync_history (org_id, connection_id, started_at desc, id desc);
create index if not exists external_sync_history_org_module_status_idx
  on public.external_sync_history (org_id, module_key, status, started_at desc);
alter table public.external_sync_history enable row level security;
revoke all on public.external_sync_history from anon, authenticated;
grant select on public.external_sync_history to authenticated;
grant all on public.external_sync_history to service_role;
drop policy if exists external_sync_history_member_select on public.external_sync_history;
create policy external_sync_history_member_select on public.external_sync_history
  for select to authenticated using (
    org_id = public.current_org_id()
    and exists (select 1 from public.user_organization_memberships m
      where m.user_id = auth.uid() and m.org_id = external_sync_history.org_id and m.is_active = true)
  );
-- No authenticated insert/update/delete policy: writes are service-role-only and the application only
-- updates a started row once to finalize it. UI/API never store payloads, credentials or PII.
commit;
