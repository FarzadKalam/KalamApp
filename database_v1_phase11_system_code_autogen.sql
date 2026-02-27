-- =====================================================
-- KalamApp - Phase 11 System Code Auto Generation
-- Date: 2026-02-27
-- Type: Safe migration / backward compatible
-- Prerequisite: database_v1_full.sql + phase6 module settings
-- =====================================================

create or replace function public.assign_system_code_from_module_settings()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_current_code text;
  v_module_key text;
  v_org_id uuid;
  v_settings jsonb;
  v_prefix text;
  v_start_raw text;
  v_start_number integer := 100;
  v_last_number integer := 0;
  v_next_number integer := 0;
  v_candidate text;
  v_exists boolean;
begin
  v_current_code := coalesce(to_jsonb(new) ->> 'system_code', '');
  if nullif(btrim(v_current_code), '') is not null then
    return new;
  end if;

  v_module_key := coalesce(nullif(btrim(tg_table_name), ''), 'module');
  v_org_id := nullif(to_jsonb(new) ->> 'org_id', '')::uuid;

  v_settings := null;
  begin
    select settings
      into v_settings
    from public.integration_settings
    where connection_type = 'module_settings'
      and (v_org_id is null or org_id is null or org_id = v_org_id)
    order by case when org_id = v_org_id then 0 else 1 end
    limit 1;
  exception
    when undefined_table then
      v_settings := null;
  end;

  v_prefix := upper(left(
    coalesce(
      nullif(btrim(v_settings -> 'modules' -> v_module_key -> 'general' -> 'systemCodeNaming' ->> 'prefixLetter'), ''),
      nullif(left(v_module_key, 1), ''),
      'M'
    ),
    1
  ));
  if coalesce(v_prefix, '') = '' then
    v_prefix := 'M';
  end if;

  v_start_raw := coalesce(v_settings -> 'modules' -> v_module_key -> 'general' -> 'systemCodeNaming' ->> 'startNumber', '');
  if v_start_raw ~ '^[0-9]+$' then
    v_start_number := greatest(v_start_raw::integer, 0);
  end if;

  perform pg_advisory_xact_lock(
    hashtext(format('system_code:%s:%s:%s', v_module_key, coalesce(v_org_id::text, 'null'), v_prefix))
  );

  execute format(
    'select coalesce(max((regexp_match(system_code, ''([0-9]+)$''))[1]::int), 0)
       from public.%I
      where ($1::uuid is null or org_id = $1)
        and coalesce(system_code, '''') <> ''''
        and upper(system_code) like $2',
    v_module_key
  )
  into v_last_number
  using v_org_id, upper(v_prefix) || '%';

  v_next_number := greatest(v_start_number, v_last_number + 1);

  loop
    v_candidate := v_prefix || lpad(v_next_number::text, 3, '0');

    execute format(
      'select exists(
         select 1
           from public.%I
          where ($1::uuid is null or org_id = $1)
            and system_code = $2
       )',
      v_module_key
    )
    into v_exists
    using v_org_id, v_candidate;

    exit when not v_exists;
    v_next_number := v_next_number + 1;
  end loop;

  new.system_code := v_candidate;
  return new;
end;
$$;

do $$
declare
  r record;
  v_trigger_name text;
begin
  for r in
    select t.table_name
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and exists (
        select 1
        from information_schema.columns c
        where c.table_schema = t.table_schema
          and c.table_name = t.table_name
          and c.column_name = 'system_code'
      )
      and exists (
        select 1
        from information_schema.columns c
        where c.table_schema = t.table_schema
          and c.table_name = t.table_name
          and c.column_name = 'org_id'
      )
  loop
    v_trigger_name := 'trg_' || r.table_name || '_system_code_autogen';
    execute format('drop trigger if exists %I on public.%I', v_trigger_name, r.table_name);
    execute format(
      'create trigger %I
       before insert or update on public.%I
       for each row
       execute function public.assign_system_code_from_module_settings()',
      v_trigger_name,
      r.table_name
    );
  end loop;
end $$;

-- Optional backfill for old rows with blank system_code.
-- Note: this updates updated_at on affected rows.
-- do $$
-- declare
--   r record;
-- begin
--   for r in
--     select t.table_name
--     from information_schema.tables t
--     where t.table_schema = 'public'
--       and t.table_type = 'BASE TABLE'
--       and exists (
--         select 1
--         from information_schema.columns c
--         where c.table_schema = t.table_schema
--           and c.table_name = t.table_name
--           and c.column_name = 'system_code'
--       )
--       and exists (
--         select 1
--         from information_schema.columns c
--         where c.table_schema = t.table_schema
--           and c.table_name = t.table_name
--           and c.column_name = 'org_id'
--       )
--   loop
--     execute format(
--       'update public.%I
--           set system_code = null
--         where system_code is null or btrim(system_code) = ''''',
--       r.table_name
--     );
--   end loop;
-- end $$;
