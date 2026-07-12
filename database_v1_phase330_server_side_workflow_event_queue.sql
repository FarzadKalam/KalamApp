-- Phase 330: durable server-side workflow events
-- Every tenant record change is captured once, then consumed by the workflow Edge Function.
-- This keeps UI writes responsive and prevents a repeated confirmation click from sending a rule twice.

begin;

create table if not exists public.workflow_event_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  source_table text not null,
  record_id uuid not null,
  event_type text not null check (event_type in ('create', 'upsert')),
  record_snapshot jsonb not null default '{}'::jsonb,
  previous_snapshot jsonb,
  actor_user_id uuid,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_workflow_event_queue_pending
  on public.workflow_event_queue (available_at, created_at)
  where status = 'pending';
create index if not exists idx_workflow_event_queue_org_record
  on public.workflow_event_queue (org_id, source_table, record_id, created_at desc);

alter table public.workflow_event_queue enable row level security;

drop policy if exists workflow_event_queue_select_org on public.workflow_event_queue;
create policy workflow_event_queue_select_org on public.workflow_event_queue
  for select to authenticated
  using (org_id = public.current_org_id());

revoke all on public.workflow_event_queue from public, anon, authenticated;
grant select on public.workflow_event_queue to authenticated;

create or replace function public.enqueue_workflow_event_from_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_previous jsonb;
  v_org_id uuid;
begin
  if tg_op = 'INSERT' then
    v_row := to_jsonb(new);
    v_previous := null;
  else
    -- Do not queue no-op updates. This is the database-level duplicate guard
    -- for repeated inline-save clicks. Audit timestamps alone are not a
    -- meaningful workflow event.
    if (to_jsonb(new) - 'updated_at' - 'last_seen_at')
       is not distinct from (to_jsonb(old) - 'updated_at' - 'last_seen_at') then
      return new;
    end if;
    v_row := to_jsonb(new);
    v_previous := to_jsonb(old);
  end if;

  v_org_id := nullif(v_row ->> 'org_id', '')::uuid;
  if v_org_id is null or nullif(v_row ->> 'id', '') is null then
    return new;
  end if;

  -- Tasks always carry per-process automation rules. Other tables are queued
  -- only when the same organization has an active event workflow for them.
  if tg_table_name <> 'tasks' and not exists (
    select 1
    from public.workflows w
    cross join lateral unnest(
      array_prepend(coalesce(w.module_id, ''), coalesce(w.module_ids, '{}'::text[]))
    ) module_ref(module_id)
    where w.org_id = v_org_id
      and w.is_active = true
      and w.trigger_type in ('on_create', 'on_upsert')
      and lower(regexp_replace(module_ref.module_id, '([a-z0-9])([A-Z])', '\1_\2', 'g')) = tg_table_name
    limit 1
  ) then
    return new;
  end if;

  insert into public.workflow_event_queue (
    org_id, source_table, record_id, event_type, record_snapshot, previous_snapshot, actor_user_id
  ) values (
    v_org_id,
    tg_table_name,
    (v_row ->> 'id')::uuid,
    case when tg_op = 'INSERT' then 'create' else 'upsert' end,
    v_row,
    v_previous,
    auth.uid()
  );

  return new;
end;
$$;

revoke all on function public.enqueue_workflow_event_from_row() from public;

-- Attach only to tenant-owned record tables. The runner later selects only
-- workflow definitions whose module resolves to the same source table.
do $$
declare
  v_table record;
begin
  for v_table in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name = 'org_id'
      and exists (
        select 1 from information_schema.columns id_col
        where id_col.table_schema = c.table_schema
          and id_col.table_name = c.table_name
          and id_col.column_name = 'id'
      )
      and c.table_name not in (
        'workflow_event_queue', 'workflow_logs', 'workflows', 'automation_execution_reports',
        'recycle_bin_records', 'record_activities', 'record_locks', 'notes',
        'sms_delivery_reports', 'notification_alerts', 'notifications',
        'org_roles', 'saas_org_settings', 'dynamic_options', 'tags'
      )
  loop
    execute format('drop trigger if exists workflow_event_queue_row on public.%I', v_table.table_name);
    execute format(
      'create trigger workflow_event_queue_row after insert or update on public.%I for each row execute function public.enqueue_workflow_event_from_row()',
      v_table.table_name
    );
  end loop;
end;
$$;

create or replace function public.claim_workflow_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.workflow_event_queue
  set status = 'processing', claimed_at = now(), attempts = attempts + 1
  where id = p_event_id
    and status = 'pending'
    and available_at <= now();
  return found;
end;
$$;

revoke all on function public.claim_workflow_event(uuid) from public, authenticated;
grant execute on function public.claim_workflow_event(uuid) to service_role;

create or replace function public.requeue_stale_workflow_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.workflow_event_queue
  set status = 'pending', claimed_at = null, available_at = now()
  where status = 'processing'
    and claimed_at < now() - interval '10 minutes'
    and attempts < 5;
  get diagnostics v_count = row_count;

  update public.workflow_event_queue
  set status = 'failed', completed_at = now(), last_error = coalesce(last_error, 'حداکثر تلاش برای اجرای رویداد انجام شد.')
  where status = 'processing'
    and claimed_at < now() - interval '10 minutes'
    and attempts >= 5;
  return v_count;
end;
$$;

revoke all on function public.requeue_stale_workflow_events() from public, authenticated;
grant execute on function public.requeue_stale_workflow_events() to service_role;

create or replace function public.trigger_workflow_event_runner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supabase_url text;
  v_service_key text;
begin
  v_supabase_url := current_setting('app.supabase_url', true);
  v_service_key := current_setting('app.service_role_key', true);
  if coalesce(v_supabase_url, '') = '' or coalesce(v_service_key, '') = '' then
    return null;
  end if;
  perform net.http_post(
    url := rtrim(v_supabase_url, '/') || '/functions/v1/workflow-interval-runner',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
    body := jsonb_build_object('action', 'drain_events')
  );
  return null;
end;
$$;

revoke all on function public.trigger_workflow_event_runner() from public, authenticated;
drop trigger if exists workflow_event_queue_dispatch on public.workflow_event_queue;
create trigger workflow_event_queue_dispatch
  after insert on public.workflow_event_queue
  for each statement execute function public.trigger_workflow_event_runner();

commit;
