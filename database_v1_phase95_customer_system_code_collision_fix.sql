-- KalamApp V1 - Phase 95
-- Make system_code generation collision-safe without relying on older phases.

begin;

create table if not exists public.system_code_counters (
  table_name text not null,
  org_scope text not null,
  prefix text not null,
  last_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (table_name, org_scope, prefix)
);

create or replace function public.find_system_code_last_number(
  p_table_name text,
  p_org_id uuid,
  p_prefix text,
  p_max_sequence integer default 2147483647
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_table_name text := nullif(btrim(p_table_name), '');
  v_prefix text := upper(btrim(coalesce(p_prefix, '')));
  v_prefix_length integer := char_length(v_prefix);
  v_last_number integer := 0;
begin
  if v_table_name is null or v_prefix = '' then
    return 0;
  end if;

  execute format(
    'select coalesce(max(suffix_value)::int, 0)
       from (
         select substring(upper(system_code) from %s) as suffix_text
           from public.%I
          where ($1::uuid is null or org_id = $1)
            and coalesce(system_code, '''') <> ''''
            and left(upper(system_code), %s) = $2
       ) matching_codes
       cross join lateral (
         select case
           when suffix_text ~ ''^[0-9]+$''
             and suffix_text::numeric between 0 and $3
             then suffix_text::numeric
           else null
         end as suffix_value
       ) normalized_codes
      where suffix_value is not null',
    v_prefix_length + 1,
    v_table_name,
    v_prefix_length
  )
  into v_last_number
  using p_org_id, v_prefix, greatest(coalesce(p_max_sequence, 2147483647), 0);

  return coalesce(v_last_number, 0);
end;
$$;

create or replace function public.assign_system_code_from_module_settings()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_current_code text;
  v_current_record_id text;
  v_current_code_conflicts boolean := false;
  v_module_key text;
  v_org_id uuid;
  v_org_scope text;
  v_settings jsonb;
  v_naming jsonb;
  v_prefix text;
  v_prefix_length integer;
  v_start_raw text;
  v_width_raw text;
  v_start_number integer := 100;
  v_number_width integer;
  v_last_number integer := 0;
  v_next_number integer := 0;
  v_candidate text;
  v_exists boolean;
  v_max_sequence integer := 2147483647;
  v_max_width integer := 20;
begin
  v_module_key := coalesce(nullif(btrim(tg_table_name), ''), 'module');
  v_current_code := coalesce(to_jsonb(new) ->> 'system_code', '');
  v_current_record_id := nullif(to_jsonb(new) ->> 'id', '');
  v_org_id := nullif(to_jsonb(new) ->> 'org_id', '')::uuid;
  v_org_scope := coalesce(v_org_id::text, '__global__');
  v_number_width := case when v_module_key = 'customers' then 3 else null end;

  if nullif(btrim(v_current_code), '') is not null then
    perform pg_advisory_xact_lock(
      hashtext(format('system_code_submitted:%s:%s:%s', v_module_key, v_org_scope, upper(btrim(v_current_code))))
    );

    execute format(
      'select exists(
         select 1
           from public.%I
          where ($1::uuid is null or org_id = $1)
            and upper(system_code) = upper($2)
            and ($3::text is null or id::text <> $3)
       )',
      v_module_key
    )
    into v_current_code_conflicts
    using v_org_id, v_current_code, v_current_record_id;

    if not v_current_code_conflicts then
      return new;
    end if;

    new.system_code := null;
  end if;

  v_settings := null;
  begin
    select settings
      into v_settings
    from public.integration_settings
    where connection_type = 'module_settings'
      and (v_org_id is null or org_id is null or org_id = v_org_id)
    order by case when org_id = v_org_id then 0 else 1 end, created_at desc
    limit 1;
  exception
    when undefined_table then
      v_settings := null;
  end;

  v_naming := coalesce(v_settings -> 'modules' -> v_module_key -> 'general' -> 'systemCodeNaming', '{}'::jsonb);
  v_prefix := upper(regexp_replace(coalesce(
    nullif(btrim(v_naming ->> 'prefix'), ''),
    nullif(btrim(v_naming ->> 'prefixLetter'), ''),
    nullif(left(v_module_key, 1), ''),
    'M'
  ), '[[:space:]]+', '', 'g'));
  if coalesce(v_prefix, '') = '' then
    v_prefix := 'M';
  end if;
  v_prefix_length := char_length(v_prefix);

  v_start_raw := coalesce(v_naming ->> 'startNumber', '');
  if v_start_raw ~ '^[0-9]+$' and v_start_raw::numeric <= v_max_sequence then
    v_start_number := greatest(v_start_raw::numeric, 0)::integer;
  end if;

  v_width_raw := coalesce(v_naming ->> 'numberWidth', '');
  if v_width_raw ~ '^[0-9]+$' then
    if v_width_raw::numeric between 1 and v_max_width then
      v_number_width := v_width_raw::integer;
    else
      v_number_width := null;
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(format('system_code:%s:%s:%s', v_module_key, v_org_scope, v_prefix))
  );

  v_last_number := public.find_system_code_last_number(v_module_key, v_org_id, v_prefix, v_max_sequence);

  insert into public.system_code_counters (table_name, org_scope, prefix, last_number)
  values (v_module_key, v_org_scope, v_prefix, greatest(v_start_number - 1, coalesce(v_last_number, 0), 0))
  on conflict (table_name, org_scope, prefix) do update
    set last_number = greatest(public.system_code_counters.last_number, excluded.last_number),
        updated_at = now();

  loop
    update public.system_code_counters
       set last_number = greatest(last_number + 1, v_start_number),
           updated_at = now()
     where table_name = v_module_key
       and org_scope = v_org_scope
       and prefix = v_prefix
     returning last_number into v_next_number;

    v_candidate := v_prefix || case
      when v_number_width is null then v_next_number::text
      else lpad(v_next_number::text, v_number_width, '0')
    end;

    execute format(
      'select exists(
         select 1
           from public.%I
          where ($1::uuid is null or org_id = $1)
            and upper(system_code) = upper($2)
       )',
      v_module_key
    )
    into v_exists
    using v_org_id, v_candidate;

    exit when not v_exists;
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
          and c.column_name = 'id'
      )
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

notify pgrst, 'reload schema';

commit;
