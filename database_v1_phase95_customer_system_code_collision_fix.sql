-- KalamApp V1 - Phase 95
-- Keep customer system_code generation server-side and recover from duplicate
-- customer codes submitted by older clients.

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

create or replace function public.assign_system_code_from_module_settings()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_current_code text;
  v_current_record_id uuid;
  v_current_code_conflicts boolean := false;
  v_module_key text;
  v_org_id uuid;
  v_org_scope text;
  v_settings jsonb;
  v_naming jsonb;
  v_prefix text;
  v_start_raw text;
  v_width_raw text;
  v_start_number integer;
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
  v_org_id := nullif(to_jsonb(new) ->> 'org_id', '')::uuid;
  v_org_scope := coalesce(v_org_id::text, '__global__');

  if nullif(btrim(v_current_code), '') is not null then
    if v_module_key <> 'customers' then
      return new;
    end if;

    perform pg_advisory_xact_lock(
      hashtext(format('system_code_submitted:%s:%s:%s', v_module_key, v_org_scope, upper(btrim(v_current_code))))
    );

    v_current_record_id := nullif(to_jsonb(new) ->> 'id', '')::uuid;
    select exists(
      select 1
      from public.customers c
      where (v_org_id is null or c.org_id = v_org_id)
        and upper(c.system_code) = upper(v_current_code)
        and (v_current_record_id is null or c.id <> v_current_record_id)
    )
    into v_current_code_conflicts;

    if not v_current_code_conflicts then
      return new;
    end if;

    new.system_code := null;
  end if;

  v_start_number := 100;
  v_number_width := case when v_module_key = 'customers' then 3 else null end;

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

  v_start_raw := coalesce(v_naming ->> 'startNumber', '');
  if v_start_raw ~ '^[0-9]+$' then
    if v_start_raw::numeric <= v_max_sequence then
      v_start_number := greatest(v_start_raw::numeric, 0)::integer;
    end if;
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

  insert into public.system_code_counters (table_name, org_scope, prefix, last_number)
  values (v_module_key, v_org_scope, v_prefix, greatest(v_start_number - 1, 0))
  on conflict (table_name, org_scope, prefix) do nothing;

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

    v_last_number := public.find_system_code_last_number(v_module_key, v_org_id, v_prefix, v_max_sequence);
    update public.system_code_counters
       set last_number = greatest(last_number, v_last_number),
           updated_at = now()
     where table_name = v_module_key
       and org_scope = v_org_scope
       and prefix = v_prefix;
  end loop;

  new.system_code := v_candidate;
  return new;
end;
$$;

notify pgrst, 'reload schema';

commit;
