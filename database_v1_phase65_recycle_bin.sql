create table if not exists public.recycle_bin_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  module_id text not null,
  source_table text not null,
  source_record_id uuid not null,
  record_title text,
  snapshot jsonb not null,
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_by_name text
);

create unique index if not exists idx_recycle_bin_unique_source
  on public.recycle_bin_records (source_table, source_record_id);

create index if not exists idx_recycle_bin_org_deleted_at
  on public.recycle_bin_records (org_id, deleted_at desc);

create index if not exists idx_recycle_bin_expires_at
  on public.recycle_bin_records (expires_at);

create index if not exists idx_recycle_bin_module_id
  on public.recycle_bin_records (module_id);

create or replace function public.recycle_bin_record_title(p_snapshot jsonb)
returns text
language sql
immutable
as $$
  select nullif(
    trim(
      coalesce(
        p_snapshot->>'name',
        p_snapshot->>'title',
        p_snapshot->>'business_name',
        p_snapshot->>'full_name',
        concat_ws(' ', p_snapshot->>'first_name', p_snapshot->>'last_name'),
        p_snapshot->>'subject',
        p_snapshot->>'system_code',
        p_snapshot->>'manual_code',
        p_snapshot->>'code',
        p_snapshot->>'id'
      )
    ),
    ''
  );
$$;

create or replace function public.resolve_recycle_bin_source_table(p_source_table text)
returns text
language plpgsql
stable
as $$
declare
  v_table text := trim(coalesce(p_source_table, ''));
  v_has_table boolean := false;
  v_has_id_column boolean := false;
begin
  if v_table = '' then
    return null;
  end if;

  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = v_table
  )
  into v_has_table;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = v_table
      and column_name = 'id'
  )
  into v_has_id_column;

  if not v_has_table or not v_has_id_column then
    return null;
  end if;

  return v_table;
end;
$$;

create or replace function public.move_records_to_recycle_bin(
  p_module_id text,
  p_source_table text,
  p_record_ids uuid[],
  p_deleted_by uuid default auth.uid(),
  p_deleted_by_name text default null,
  p_org_id uuid default public.current_org_id()
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_source_table text;
  v_record_id uuid;
  v_snapshot jsonb;
  v_count integer := 0;
begin
  v_source_table := public.resolve_recycle_bin_source_table(p_source_table);
  if v_source_table is null then
    raise exception 'Recycle bin source table % is not valid', p_source_table;
  end if;

  foreach v_record_id in array coalesce(p_record_ids, array[]::uuid[])
  loop
    execute format(
      'select to_jsonb(t) from public.%I t where t.id = $1',
      v_source_table
    )
    into v_snapshot
    using v_record_id;

    if v_snapshot is null then
      raise exception 'Record % in module % was not found or is already deleted', v_record_id, p_module_id;
    end if;

    delete from public.recycle_bin_records
    where source_table = v_source_table
      and source_record_id = v_record_id;

    insert into public.recycle_bin_records (
      org_id,
      module_id,
      source_table,
      source_record_id,
      record_title,
      snapshot,
      deleted_by,
      deleted_by_name
    )
    values (
      coalesce(p_org_id, (v_snapshot->>'org_id')::uuid, public.current_org_id()),
      trim(coalesce(p_module_id, '')),
      v_source_table,
      v_record_id,
      public.recycle_bin_record_title(v_snapshot),
      v_snapshot,
      p_deleted_by,
      nullif(trim(coalesce(p_deleted_by_name, '')), '')
    );

    execute format(
      'delete from public.%I where id = $1',
      v_source_table
    )
    using v_record_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.restore_recycle_bin_records(
  p_recycle_ids uuid[]
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_recycle_id uuid;
  v_row public.recycle_bin_records%rowtype;
  v_columns text;
  v_count integer := 0;
begin
  foreach v_recycle_id in array coalesce(p_recycle_ids, array[]::uuid[])
  loop
    select *
    into v_row
    from public.recycle_bin_records
    where id = v_recycle_id;

    if not found then
      raise exception 'Recycle bin record % was not found', v_recycle_id;
    end if;

    if v_row.expires_at < now() then
      delete from public.recycle_bin_records where id = v_recycle_id;
      raise exception 'Restore window for recycle bin record % has expired', v_recycle_id;
    end if;

    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into v_columns
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_row.source_table
      and v_row.snapshot ? c.column_name;

    if v_columns is null then
      raise exception 'No matching columns were found for table %', v_row.source_table;
    end if;

    execute format(
      'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
      v_row.source_table,
      v_columns,
      v_columns,
      v_row.source_table
    )
    using v_row.snapshot;

    delete from public.recycle_bin_records where id = v_recycle_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.purge_expired_recycle_bin_records()
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  delete from public.recycle_bin_records
  where expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant select, insert, update, delete on public.recycle_bin_records to authenticated, service_role;
grant execute on function public.recycle_bin_record_title(jsonb) to authenticated, service_role;
grant execute on function public.resolve_recycle_bin_source_table(text) to authenticated, service_role;
grant execute on function public.move_records_to_recycle_bin(text, text, uuid[], uuid, text, uuid) to authenticated, service_role;
grant execute on function public.restore_recycle_bin_records(uuid[]) to authenticated, service_role;
grant execute on function public.purge_expired_recycle_bin_records() to authenticated, service_role;

alter table public.recycle_bin_records enable row level security;

drop policy if exists p_recycle_bin_records_org_all on public.recycle_bin_records;
create policy p_recycle_bin_records_org_all
on public.recycle_bin_records
for all to authenticated
using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id is null or org_id = public.current_org_id());
