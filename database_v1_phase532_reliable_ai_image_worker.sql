-- TazeSystem - Phase 532
-- اجرای مستقل و بلندمدت صف تصویر؛ هیچ درخواست تصویری نباید به‌دلیل سقف کوتاه
-- اجرای workflow runner رها شود.

begin;

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.ai_image_worker_execution_leases (
  lease_key text primary key,
  lease_token uuid not null default gen_random_uuid(),
  lease_expires_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_image_worker_execution_leases enable row level security;
revoke all on table public.ai_image_worker_execution_leases from public, anon, authenticated;

insert into public.ai_image_worker_execution_leases (lease_key, lease_expires_at)
values ('ai-image-worker', now() - interval '1 second')
on conflict (lease_key) do nothing;

create or replace function public.acquire_ai_image_worker_lease(
  p_lease_seconds integer default 1020
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 1020), 300), 1800);
begin
  insert into public.ai_image_worker_execution_leases (
    lease_key,
    lease_token,
    lease_expires_at,
    updated_at
  )
  values (
    'ai-image-worker',
    gen_random_uuid(),
    now() + make_interval(secs => v_lease_seconds),
    now()
  )
  on conflict (lease_key) do update
  set
    lease_token = excluded.lease_token,
    lease_expires_at = excluded.lease_expires_at,
    updated_at = now()
  where public.ai_image_worker_execution_leases.lease_expires_at <= now()
  returning lease_token into v_token;

  return v_token;
end;
$$;

create or replace function public.release_ai_image_worker_lease(
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_image_worker_execution_leases
  set
    lease_token = gen_random_uuid(),
    lease_expires_at = now(),
    updated_at = now()
  where lease_key = 'ai-image-worker'
    and lease_token = p_lease_token;

  return found;
end;
$$;

revoke all on function public.acquire_ai_image_worker_lease(integer) from public, anon, authenticated;
revoke all on function public.release_ai_image_worker_lease(uuid) from public, anon, authenticated;
grant execute on function public.acquire_ai_image_worker_lease(integer) to service_role;
grant execute on function public.release_ai_image_worker_lease(uuid) to service_role;

-- تلاش‌های قبلی که با سقف ۶۰ ثانیه‌ای worker قطع شده‌اند، هنوز درخواست معتبر
-- هستند؛ آن‌ها را برای worker جدید به صف برگردان.
update public.ai_image_generation_jobs
set
  status = 'pending',
  available_at = now(),
  locked_at = null,
  updated_at = now(),
  last_error = coalesce(last_error, 'اجرای قبلی worker پیش از تکمیل متوقف شد.')
where status = 'running'
  and attempts < 12
  and locked_at < now() - interval '15 minutes';

create or replace function public.claim_ai_image_generation_job(p_lease_seconds integer default 900)
returns setof public.ai_image_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.ai_image_generation_jobs;
  v_lease integer := least(greatest(coalesce(p_lease_seconds, 900), 300), 1800);
  v_max_attempts constant integer := 12;
begin
  -- هیچ job ای در حالت running رها نمی‌شود: lease منقضی‌شده یا دوباره صف
  -- می‌شود یا، پس از سقف منطقی تلاش‌ها، نتیجهٔ نهایی failed می‌گیرد.
  update public.ai_image_generation_jobs
  set
    status = 'failed',
    completed_at = now(),
    locked_at = null,
    updated_at = now(),
    last_error = coalesce(last_error, 'پردازش تصویر پس از چند تلاش کامل نشد.')
  where attempts >= v_max_attempts
    and (
      status = 'pending'
      or (status = 'running' and locked_at < now() - make_interval(secs => v_lease))
    );

  update public.ai_image_generation_jobs
  set
    status = 'pending',
    available_at = now(),
    locked_at = null,
    updated_at = now(),
    last_error = coalesce(last_error, 'اجرای قبلی worker پیش از تکمیل متوقف شد.')
  where status = 'running'
    and locked_at < now() - make_interval(secs => v_lease)
    and attempts < v_max_attempts;

  select * into v_job
  from public.ai_image_generation_jobs
  where status = 'pending'
    and available_at <= now()
    and attempts < v_max_attempts
  order by available_at asc, created_at asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.ai_image_generation_jobs
  set
    status = 'running',
    attempts = attempts + 1,
    locked_at = now(),
    started_at = coalesce(started_at, now()),
    updated_at = now()
  where id = v_job.id
  returning * into v_job;

  return next v_job;
end;
$$;

revoke all on function public.claim_ai_image_generation_job(integer) from public, anon, authenticated;
grant execute on function public.claim_ai_image_generation_job(integer) to service_role;

create or replace function public.trigger_ai_image_worker()
returns void
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
    raise warning 'trigger_ai_image_worker: server configuration is incomplete';
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_supabase_url, '/') || '/functions/v1/ai-image-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 900000
  );
end;
$$;

revoke all on function public.trigger_ai_image_worker() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('run-ai-image-worker');
exception when others then null;
end $$;

select cron.schedule(
  'run-ai-image-worker',
  '* * * * *',
  'select public.trigger_ai_image_worker()'
);

notify pgrst, 'reload schema';

commit;
