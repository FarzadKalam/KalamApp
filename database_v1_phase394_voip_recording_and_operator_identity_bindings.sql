-- TazeSystem V1 - Phase 394
-- Keep Telefonchy recording IDs and operator identity bindings tenant-safe.

begin;

create table if not exists public.voip_operator_identity_bindings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'telefonchy',
  service_id text,
  extension text,
  operator_code text,
  provider_operator_id text,
  display_name text,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_voip_operator_identity_binding_value check (
    nullif(trim(coalesce(extension, '')), '') is not null
    or nullif(trim(coalesce(operator_code, '')), '') is not null
    or nullif(trim(coalesce(provider_operator_id, '')), '') is not null
  )
);

create unique index if not exists idx_voip_operator_binding_extension
  on public.voip_operator_identity_bindings(org_id, provider, coalesce(service_id, ''), extension)
  where nullif(trim(coalesce(extension, '')), '') is not null;
create unique index if not exists idx_voip_operator_binding_code
  on public.voip_operator_identity_bindings(org_id, provider, coalesce(service_id, ''), operator_code)
  where nullif(trim(coalesce(operator_code, '')), '') is not null;
create unique index if not exists idx_voip_operator_binding_provider_id
  on public.voip_operator_identity_bindings(org_id, provider, coalesce(service_id, ''), provider_operator_id)
  where nullif(trim(coalesce(provider_operator_id, '')), '') is not null;
create index if not exists idx_voip_operator_binding_profile
  on public.voip_operator_identity_bindings(org_id, profile_id);

alter table public.voip_operator_identity_bindings enable row level security;
drop policy if exists p_voip_operator_identity_bindings_select on public.voip_operator_identity_bindings;
create policy p_voip_operator_identity_bindings_select
  on public.voip_operator_identity_bindings for select to authenticated
  using (org_id = public.current_org_id());

create or replace function public.kalam_enrich_voip_call_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lookup jsonb;
  v_phone text;
  v_assignee_id uuid;
  v_assignee_count integer := 0;
  v_assignee_name text;
  v_assignee_avatar text;
  v_binding_profile_id uuid;
  v_provider_operator_id text;
begin
  if new.org_id is null then return new; end if;

  new.extension := nullif(trim(coalesce(new.extension, '')), '');
  new.operator_code := nullif(trim(coalesce(new.operator_code, '')), '');
  new.source_number := nullif(trim(coalesce(new.source_number, '')), '');
  new.destination_number := nullif(trim(coalesce(new.destination_number, '')), '');
  new.metadata := coalesce(new.metadata, '{}'::jsonb);
  v_provider_operator_id := nullif(trim(coalesce(new.metadata->>'provider_operator_id', '')), '');

  -- A confirmed tenant binding wins over heuristic matching.
  select b.profile_id into v_binding_profile_id
  from public.voip_operator_identity_bindings b
  where b.org_id = new.org_id
    and b.provider = coalesce(nullif(trim(new.provider), ''), 'telefonchy')
    and (b.service_id is null or b.service_id = new.service_id)
    and (
      (new.extension is not null and b.extension = new.extension)
      or (new.operator_code is not null and b.operator_code = new.operator_code)
      or (v_provider_operator_id is not null and b.provider_operator_id = v_provider_operator_id)
    )
  order by case when v_provider_operator_id is not null and b.provider_operator_id = v_provider_operator_id then 0 else 1 end,
           updated_at desc
  limit 1;

  if v_binding_profile_id is not null then
    new.assignee_id := v_binding_profile_id;
  elsif new.assignee_id is null and (new.extension is not null or new.operator_code is not null) then
    select count(*), (array_agg(p.id order by p.id))[1]
      into v_assignee_count, v_assignee_id
    from public.profiles p
    where p.org_id = new.org_id
      and p.voip_enabled = true
      and (
        (new.extension is not null and nullif(trim(coalesce(p.voip_extension, '')), '') = new.extension)
        or (new.operator_code is not null and nullif(trim(coalesce(p.voip_operator_code, '')), '') = new.operator_code)
      );
    if v_assignee_count = 1 then new.assignee_id := v_assignee_id; end if;
  end if;

  if new.assignee_id is not null then
    select nullif(trim(coalesce(p.full_name, '')), ''), p.avatar_url
      into v_assignee_name, v_assignee_avatar
    from public.profiles p
    where p.id = new.assignee_id and p.org_id = new.org_id
    limit 1;
  end if;

  v_phone := case
    when coalesce(new.direction, '') = 'incoming' then new.source_number
    when coalesce(new.direction, '') = 'outgoing' then new.destination_number
    else coalesce(new.source_number, new.destination_number)
  end;
  new.phone_number_id := coalesce(new.phone_number_id, public.kalam_upsert_phone_number(new.org_id, v_phone));
  v_lookup := public.kalam_find_phone_target(new.org_id, v_phone);
  if v_lookup is not null then
    new.phone_match_status := coalesce(nullif(v_lookup->>'match_status', ''), 'unknown');
    if new.phone_number_id is null and public.kalam_try_uuid(v_lookup->>'phone_number_id') is not null then
      new.phone_number_id := public.kalam_try_uuid(v_lookup->>'phone_number_id');
    end if;
    if new.phone_match_status in ('matched', 'manual') then
      new.module_id := nullif(v_lookup->>'module_id', '');
      new.record_id := nullif(v_lookup->>'record_id', '');
      new.title := coalesce(nullif(v_lookup->>'title', ''), new.title);
    end if;
  else
    new.phone_match_status := 'unknown';
  end if;

  new.assignee_type := case
    when new.assignee_role_id is not null then 'role'
    when lower(nullif(new.assignee_type, '')) = 'role' and new.assignee_id is not null then 'role'
    when new.assignee_id is not null then coalesce(nullif(new.assignee_type, ''), 'user')
    else nullif(new.assignee_type, '')
  end;
  if new.assignee_role_id is not null then new.assignee_id := null; end if;

  new.metadata := new.metadata || jsonb_strip_nulls(jsonb_build_object(
    'operator_display_name', coalesce(v_assignee_name, nullif(trim(coalesce(new.metadata->>'provider_operator_name', '')), '')),
    'operator_avatar_url', v_assignee_avatar,
    'operator_extension', new.extension,
    'operator_code', new.operator_code,
    'operator_resolution', case
      when v_binding_profile_id is not null then 'manual'
      when new.assignee_id is not null then 'matched'
      when v_assignee_count > 1 then 'ambiguous'
      else 'unknown'
    end
  ));
  if nullif(trim(coalesce(new.title, '')), '') is null then new.title := coalesce(v_phone, 'تماس VoIP'); end if;
  return new;
end;
$$;

create or replace function public.bind_voip_operator_identity(
  p_provider text,
  p_service_id text,
  p_extension text,
  p_operator_code text,
  p_provider_operator_id text,
  p_display_name text,
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_provider text := coalesce(nullif(trim(p_provider), ''), 'telefonchy');
  v_service_id text := nullif(trim(coalesce(p_service_id, '')), '');
  v_extension text := nullif(trim(coalesce(p_extension, '')), '');
  v_operator_code text := nullif(trim(coalesce(p_operator_code, '')), '');
  v_provider_operator_id text := nullif(trim(coalesce(p_provider_operator_id, '')), '');
  v_binding_id uuid;
begin
  if v_org_id is null or p_profile_id is null then raise exception 'اطلاعات اتصال اپراتور معتبر نیست.'; end if;
  if v_extension is null and v_operator_code is null and v_provider_operator_id is null then raise exception 'داخلی یا کد اپراتور لازم است.'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.org_id = v_org_id) then
    raise exception 'کاربر انتخاب‌شده در این سازمان یافت نشد.';
  end if;

  delete from public.voip_operator_identity_bindings b
  where b.org_id = v_org_id and b.provider = v_provider and coalesce(b.service_id, '') = coalesce(v_service_id, '')
    and (
      (v_extension is not null and b.extension = v_extension)
      or (v_operator_code is not null and b.operator_code = v_operator_code)
      or (v_provider_operator_id is not null and b.provider_operator_id = v_provider_operator_id)
    );

  insert into public.voip_operator_identity_bindings (
    org_id, provider, service_id, extension, operator_code, provider_operator_id, display_name, profile_id
  ) values (
    v_org_id, v_provider, v_service_id, v_extension, v_operator_code, v_provider_operator_id,
    nullif(trim(coalesce(p_display_name, '')), ''), p_profile_id
  ) returning id into v_binding_id;

  update public.profiles p
  set voip_enabled = true,
      voip_extension = coalesce(v_extension, p.voip_extension),
      voip_operator_code = coalesce(v_operator_code, p.voip_operator_code)
  where p.id = p_profile_id and p.org_id = v_org_id;

  update public.voip_call_logs c
  set assignee_id = p_profile_id,
      assignee_type = 'user',
      metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'provider_operator_name', nullif(trim(coalesce(p_display_name, '')), ''),
        'provider_operator_id', v_provider_operator_id
      ))
  where c.org_id = v_org_id and c.provider = v_provider
    and (v_service_id is null or c.service_id = v_service_id)
    and (
      (v_extension is not null and c.extension = v_extension)
      or (v_operator_code is not null and c.operator_code = v_operator_code)
      or (v_provider_operator_id is not null and c.metadata->>'provider_operator_id' = v_provider_operator_id)
    );
  return v_binding_id;
end;
$$;

-- Bring unassigned historical calls through the current resolver.
update public.voip_call_logs
set metadata = coalesce(metadata, '{}'::jsonb)
where org_id is not null and assignee_id is null
  and (nullif(trim(coalesce(extension, '')), '') is not null or nullif(trim(coalesce(operator_code, '')), '') is not null);

-- PostgreSQL does not allow CREATE OR REPLACE to change OUT columns.
-- The function has no dependent views; recreate it with the expanded safe payload.
drop function if exists public.get_accessible_voip_call_logs_page(integer, timestamptz, uuid);

create or replace function public.get_accessible_voip_call_logs_page(
  p_limit integer default 80,
  p_before_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid, title text, provider text, service_id text, direction text, status text, source_number text, destination_number text, extension text, operator_code text,
  module_id text, record_id text, related_module_id text, related_record_id uuid, phone_number_id uuid, phone_match_status text,
  assignee_id uuid, assignee_type text, assignee_role_id uuid, started_at timestamptz, ended_at timestamptz,
  created_at timestamptz, talk_seconds integer, wait_seconds integer, call_id text, file_id text, recording_url text,
  operator_display_name text, provider_operator_id text
)
language sql stable security definer set search_path = public
as $$
  with limits as (select least(greatest(coalesce(p_limit, 80), 1), 200) as effective_limit),
  candidate_calls as (
    select c.* from public.voip_call_logs c cross join limits
    where c.org_id = public.current_org_id()
      and (p_before_at is null or coalesce(c.started_at, c.created_at) < p_before_at
        or (coalesce(c.started_at, c.created_at) = p_before_at and p_before_id is not null and c.id < p_before_id))
    order by c.started_at desc nulls last, c.created_at desc, c.id desc
    limit least(greatest((select effective_limit from limits) * 20, 400), 2000)
  )
  select c.id, c.title, c.provider, c.service_id, c.direction, c.status, c.source_number, c.destination_number, c.extension, c.operator_code,
    c.module_id, c.record_id, c.related_module_id, public.kalam_try_uuid(c.related_record_id), c.phone_number_id,
    c.phone_match_status, c.assignee_id, c.assignee_type, c.assignee_role_id, c.started_at, c.ended_at,
    c.created_at, c.talk_seconds, c.wait_seconds, c.call_id, c.file_id, c.recording_url,
    coalesce(nullif(trim(c.metadata->>'operator_display_name'), ''), nullif(trim(c.metadata->>'provider_operator_name'), '')),
    nullif(trim(c.metadata->>'provider_operator_id'), '')
  from candidate_calls c
  where public.kalam_can_view_communication_record_v3(
    'voip', public.current_org_id(), c.assignee_type, c.assignee_id, c.assignee_role_id,
    c.module_id, public.kalam_try_uuid(c.record_id), c.related_module_id, public.kalam_try_uuid(c.related_record_id),
    null::uuid, c.source_number, c.destination_number, c.extension
  )
  order by c.started_at desc nulls last, c.created_at desc, c.id desc
  limit (select effective_limit from limits);
$$;

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.trigger_telefonchy_recording_reconciliation()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supabase_url text := current_setting('app.supabase_url', true);
  v_service_key text := current_setting('app.service_role_key', true);
begin
  if coalesce(v_supabase_url, '') = '' or coalesce(v_service_key, '') = '' then
    raise warning 'Telefonchy recording reconciliation is not configured: app.supabase_url or app.service_role_key is empty';
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_supabase_url, '/') || '/functions/v1/telefonchy_smartcall',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
    body := jsonb_build_object('action', 'reconcile_recordings')
  );
end;
$$;

revoke all on function public.trigger_telefonchy_recording_reconciliation() from public, authenticated;
do $$ begin perform cron.unschedule('reconcile-telefonchy-recordings'); exception when others then null; end $$;
select cron.schedule(
  'reconcile-telefonchy-recordings',
  '*/10 * * * *',
  'select public.trigger_telefonchy_recording_reconciliation()'
);

grant select on public.voip_operator_identity_bindings to authenticated;
grant execute on function public.bind_voip_operator_identity(text, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.get_accessible_voip_call_logs_page(integer, timestamptz, uuid) to authenticated;
revoke all on function public.bind_voip_operator_identity(text, text, text, text, text, text, uuid) from public, anon;
revoke all on function public.get_accessible_voip_call_logs_page(integer, timestamptz, uuid) from public, anon;

notify pgrst, 'reload schema';
commit;
