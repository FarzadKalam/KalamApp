-- TazeSystem V1 Phase 277
-- Tenant-safe record locks with hard database mutation guard.

begin;

create table if not exists public.record_locks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  module_id text not null,
  record_id uuid not null,
  locked_at timestamptz not null default now(),
  locked_by uuid references auth.users(id) on delete set null,
  lock_reason text,
  source_type text not null default 'manual',
  source_id text,
  metadata jsonb not null default '{}'::jsonb,
  constraint record_locks_module_id_check check (btrim(module_id) <> ''),
  constraint record_locks_source_type_check check (source_type in ('manual', 'workflow', 'process_automation', 'system'))
);

create unique index if not exists record_locks_org_module_record_uidx
  on public.record_locks(org_id, module_id, record_id);

create index if not exists idx_record_locks_org_module_locked
  on public.record_locks(org_id, module_id, locked_at desc);

create index if not exists idx_record_locks_org_record
  on public.record_locks(org_id, record_id);

alter table public.record_locks enable row level security;

drop policy if exists p_record_locks_org_select on public.record_locks;
create policy p_record_locks_org_select
on public.record_locks
for select
to authenticated
using (org_id = public.current_org_id());

revoke all on table public.record_locks from public, anon, authenticated;
grant select on table public.record_locks to authenticated;
grant select, insert, update, delete on table public.record_locks to service_role;

create or replace function public.resolve_record_lock_table_name(p_module_id text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_module_id text := btrim(coalesce(p_module_id, ''));
begin
  return case v_module_id
    when 'sales_return_invoices' then 'invoices'
    when 'purchase_return_invoices' then 'purchase_invoices'
    when 'saas_orgs' then 'saas_admin_org_candidates_view'
    when 'saas_demo_requests' then 'saas_onboarding_requests'
    when 'saas_users' then 'saas_admin_users_view'
    else v_module_id
  end;
end;
$$;

create or replace function public.record_lock_user_can(p_module_id text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_user_id uuid := auth.uid();
  v_module_id text := btrim(coalesce(p_module_id, ''));
  v_action text := btrim(coalesce(p_action, ''));
  v_permission_key text;
  v_role text;
  v_permissions jsonb := '{}'::jsonb;
begin
  if v_org_id is null or v_user_id is null or v_module_id = '' then
    return false;
  end if;

  v_permission_key := case v_action
    when 'unlock' then '__record_unlock'
    else '__record_lock'
  end;

  select p.role, coalesce(r.permissions, '{}'::jsonb)
    into v_role, v_permissions
  from public.profiles p
  left join public.org_roles r
    on r.id = p.role_id
   and r.org_id = p.org_id
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  if lower(coalesce(v_role, '')) in ('super_admin', 'admin') then
    return true;
  end if;

  return coalesce((v_permissions -> v_module_id ->> 'view')::boolean, true) = true
    and coalesce((v_permissions -> v_module_id -> 'fields' ->> v_permission_key)::boolean, false) = true;
exception
  when others then
    return false;
end;
$$;

create or replace function public.record_lock_target_exists(
  p_module_id text,
  p_record_id uuid,
  p_org_id uuid default public.current_org_id()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table_name text := public.resolve_record_lock_table_name(p_module_id);
  v_table_regclass regclass;
  v_exists boolean := false;
begin
  if p_org_id is null or p_record_id is null or btrim(coalesce(v_table_name, '')) = '' then
    return false;
  end if;

  select to_regclass(format('public.%I', v_table_name)) into v_table_regclass;
  if v_table_regclass is null then
    return false;
  end if;

  execute format('select exists (select 1 from public.%I where id = $1 and org_id = $2)', v_table_name)
    into v_exists
    using p_record_id, p_org_id;

  return coalesce(v_exists, false);
exception
  when undefined_column then
    execute format('select exists (select 1 from public.%I where id = $1)', v_table_name)
      into v_exists
      using p_record_id;
    return coalesce(v_exists, false);
  when others then
    return false;
end;
$$;

create or replace function public.lock_record(
  p_module_id text,
  p_record_id uuid,
  p_reason text default null,
  p_source_type text default 'manual',
  p_source_id text default null
)
returns public.record_locks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_module_id text := btrim(coalesce(p_module_id, ''));
  v_source_type text := btrim(coalesce(p_source_type, 'manual'));
  v_table_name text := public.resolve_record_lock_table_name(p_module_id);
  v_row public.record_locks;
begin
  if v_org_id is null or auth.uid() is null then
    raise exception 'دسترسی سازمانی معتبر برای قفل کردن رکورد پیدا نشد.';
  end if;
  if v_module_id = '' or p_record_id is null then
    raise exception 'رکورد انتخاب‌شده برای قفل کردن معتبر نیست.';
  end if;
  if not public.record_lock_user_can(v_module_id, 'lock') then
    raise exception 'دسترسی قفل کردن این رکورد را ندارید.';
  end if;
  if not public.record_lock_target_exists(v_module_id, p_record_id, v_org_id) then
    raise exception 'رکورد انتخاب‌شده در این سازمان پیدا نشد.';
  end if;

  insert into public.record_locks(org_id, module_id, record_id, locked_by, lock_reason, source_type, source_id, metadata)
  values (
    v_org_id,
    v_module_id,
    p_record_id,
    auth.uid(),
    nullif(p_reason, ''),
    case when v_source_type in ('manual', 'workflow', 'process_automation', 'system') then v_source_type else 'manual' end,
    nullif(p_source_id, ''),
    jsonb_build_object('table_name', v_table_name)
  )
  on conflict (org_id, module_id, record_id)
  do update set
    locked_at = public.record_locks.locked_at,
    locked_by = public.record_locks.locked_by,
    lock_reason = coalesce(public.record_locks.lock_reason, excluded.lock_reason),
    source_type = public.record_locks.source_type,
    source_id = coalesce(public.record_locks.source_id, excluded.source_id),
    metadata = public.record_locks.metadata || excluded.metadata
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.unlock_record(
  p_module_id text,
  p_record_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_module_id text := btrim(coalesce(p_module_id, ''));
begin
  if v_org_id is null or auth.uid() is null then
    raise exception 'دسترسی سازمانی معتبر برای باز کردن رکورد پیدا نشد.';
  end if;
  if v_module_id = '' or p_record_id is null then
    raise exception 'رکورد انتخاب‌شده برای باز کردن معتبر نیست.';
  end if;
  if not public.record_lock_user_can(v_module_id, 'unlock') then
    raise exception 'دسترسی باز کردن این رکورد را ندارید.';
  end if;

  delete from public.record_locks
  where org_id = v_org_id
    and module_id = v_module_id
    and record_id = p_record_id;

  return true;
end;
$$;

create or replace function public.is_record_locked(
  p_module_id text,
  p_record_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.record_locks rl
    where rl.org_id = public.current_org_id()
      and rl.record_id = p_record_id
      and (
        rl.module_id = btrim(coalesce(p_module_id, ''))
        or rl.metadata ->> 'table_name' = public.resolve_record_lock_table_name(p_module_id)
      )
  );
$$;

create or replace function public.get_record_lock_map(
  p_module_id text,
  p_record_ids uuid[]
)
returns table (
  record_id uuid,
  module_id text,
  locked_at timestamptz,
  locked_by uuid,
  lock_reason text,
  source_type text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rl.record_id,
    rl.module_id,
    rl.locked_at,
    rl.locked_by,
    rl.lock_reason,
    rl.source_type
  from public.record_locks rl
  where rl.org_id = public.current_org_id()
    and rl.record_id = any(coalesce(p_record_ids, '{}'::uuid[]))
    and (
      rl.module_id = btrim(coalesce(p_module_id, ''))
      or rl.metadata ->> 'table_name' = public.resolve_record_lock_table_name(p_module_id)
    );
$$;

create or replace function public.prevent_locked_record_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean := false;
begin
  if tg_op not in ('UPDATE', 'DELETE') then
    return coalesce(new, old);
  end if;

  select exists (
    select 1
    from public.record_locks rl
    where rl.org_id = old.org_id
      and rl.record_id = old.id
      and (
        rl.module_id = tg_table_name
        or rl.metadata ->> 'table_name' = tg_table_name
      )
  )
  into v_locked;

  if v_locked then
    raise exception 'این رکورد قفل شده و قابل تغییر یا حذف نیست.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  v_table record;
begin
  for v_table in
    select c.table_name
    from information_schema.columns c
    join information_schema.columns org_col
      on org_col.table_schema = c.table_schema
     and org_col.table_name = c.table_name
     and org_col.column_name = 'org_id'
    where c.table_schema = 'public'
      and c.column_name = 'id'
      and c.table_name not in (
        'record_locks',
        'record_files',
        'file_assets',
        'file_entries',
        'file_folders',
        'file_entry_links',
        'app_schema_migrations',
        'system_code_counters',
        'payment_transactions'
      )
      and exists (
        select 1
        from information_schema.tables t
        where t.table_schema = c.table_schema
          and t.table_name = c.table_name
          and t.table_type = 'BASE TABLE'
      )
  loop
    execute format('drop trigger if exists trg_prevent_locked_record_mutation on public.%I', v_table.table_name);
    execute format(
      'create trigger trg_prevent_locked_record_mutation before update or delete on public.%I for each row execute function public.prevent_locked_record_mutation()',
      v_table.table_name
    );
  end loop;
end;
$$;

grant execute on function public.resolve_record_lock_table_name(text) to authenticated, service_role;
grant execute on function public.record_lock_user_can(text, text) to authenticated, service_role;
grant execute on function public.lock_record(text, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.unlock_record(text, uuid) to authenticated, service_role;
grant execute on function public.is_record_locked(text, uuid) to authenticated, service_role;
grant execute on function public.get_record_lock_map(text, uuid[]) to authenticated, service_role;

commit;
