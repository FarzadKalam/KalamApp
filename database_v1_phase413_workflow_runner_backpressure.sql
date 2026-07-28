-- TazeSystem - Phase 413: جلوگیری از هم‌پوشانی اجراکنندهٔ گردش‌کار
-- صف و lease زیرساخت سراسری هستند و دادهٔ سازمانی محسوب نمی‌شوند؛
-- هیچ نقش کاربری دسترسی مستقیم به آن‌ها ندارد.

begin;

create table if not exists public.workflow_runner_execution_leases (
  lease_key text primary key,
  lease_token uuid not null default gen_random_uuid(),
  lease_expires_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workflow_runner_execution_leases enable row level security;
revoke all on table public.workflow_runner_execution_leases from public, anon, authenticated;

insert into public.workflow_runner_execution_leases (lease_key, lease_expires_at)
values ('workflow-interval-runner', now() - interval '1 second')
on conflict (lease_key) do nothing;

create or replace function public.acquire_workflow_runner_lease(
  p_lease_seconds integer default 240
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 240), 60), 600);
begin
  insert into public.workflow_runner_execution_leases (
    lease_key,
    lease_token,
    lease_expires_at,
    updated_at
  )
  values (
    'workflow-interval-runner',
    gen_random_uuid(),
    now() + make_interval(secs => v_lease_seconds),
    now()
  )
  on conflict (lease_key) do update
  set
    lease_token = excluded.lease_token,
    lease_expires_at = excluded.lease_expires_at,
    updated_at = excluded.updated_at
  where public.workflow_runner_execution_leases.lease_expires_at <= now()
  returning lease_token into v_token;

  return v_token;
end;
$$;

create or replace function public.release_workflow_runner_lease(
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.workflow_runner_execution_leases
  set
    lease_token = gen_random_uuid(),
    lease_expires_at = now(),
    updated_at = now()
  where lease_key = 'workflow-interval-runner'
    and lease_token = p_lease_token;

  return found;
end;
$$;

revoke all on function public.acquire_workflow_runner_lease(integer) from public, anon, authenticated;
revoke all on function public.release_workflow_runner_lease(uuid) from public, anon, authenticated;
grant execute on function public.acquire_workflow_runner_lease(integer) to service_role;
grant execute on function public.release_workflow_runner_lease(uuid) to service_role;

create table if not exists public.workflow_runner_dispatch_state (
  dispatch_key text primary key,
  last_dispatched_at timestamptz not null default now() - interval '1 hour',
  updated_at timestamptz not null default now()
);

alter table public.workflow_runner_dispatch_state enable row level security;
revoke all on table public.workflow_runner_dispatch_state from public, anon, authenticated;

insert into public.workflow_runner_dispatch_state (dispatch_key, last_dispatched_at)
values ('workflow-event-queue', now() - interval '1 hour')
on conflict (dispatch_key) do nothing;

-- requeue_stale_workflow_events فقط ردیف‌های processing را بررسی می‌کند؛
-- این index از اسکن کامل صف و timeout در صف‌های بزرگ جلوگیری می‌کند.
create index if not exists idx_workflow_event_queue_processing_claimed_at
  on public.workflow_event_queue (claimed_at)
  where status = 'processing';

-- هر ثبت رویداد فقط صف را بیدار می‌کند. اجرای واقعی با lease در Edge Function
-- کنترل می‌شود و حداکثر هر 45 ثانیه یک درخواست بیدارکننده می‌فرستیم.
create or replace function public.trigger_workflow_event_runner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supabase_url text;
  v_service_key text;
  v_should_dispatch boolean := false;
begin
  v_supabase_url := current_setting('app.supabase_url', true);
  v_service_key := current_setting('app.service_role_key', true);
  if coalesce(v_supabase_url, '') = '' or coalesce(v_service_key, '') = '' then
    return null;
  end if;

  update public.workflow_runner_dispatch_state
  set
    last_dispatched_at = now(),
    updated_at = now()
  where dispatch_key = 'workflow-event-queue'
    and last_dispatched_at <= now() - interval '45 seconds'
  returning true into v_should_dispatch;

  if coalesce(v_should_dispatch, false) then
    perform net.http_post(
      url := rtrim(v_supabase_url, '/') || '/functions/v1/workflow-interval-runner',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
      body := jsonb_build_object('action', 'drain_events')
    );
  end if;

  return null;
end;
$$;

revoke all on function public.trigger_workflow_event_runner() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
