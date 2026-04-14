-- KalamApp V1 - Phase 82
-- Rework system_code generation to avoid statement timeouts and extend coverage.

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
  v_current_code := coalesce(to_jsonb(new) ->> 'system_code', '');
  if nullif(btrim(v_current_code), '') is not null then
    return new;
  end if;

  v_module_key := coalesce(nullif(btrim(tg_table_name), ''), 'module');
  v_org_id := nullif(to_jsonb(new) ->> 'org_id', '')::uuid;
  v_org_scope := coalesce(v_org_id::text, '__global__');
  v_start_number := case when v_module_key = 'customers' then 234 else 100 end;
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

  if v_module_key = 'customers'
     and coalesce(v_naming ->> 'numberWidth', '') = ''
     and v_prefix = 'C'
     and v_start_number = 100 then
    v_start_number := 234;
    v_number_width := 3;
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

do $$
declare
  v_table_name text;
  v_trigger_name text;
begin
  foreach v_table_name in array array[
    'barters',
    'billboards',
    'customers',
    'employees',
    'invoices',
    'marketing_leads',
    'products',
    'production_boms',
    'production_group_orders',
    'production_orders',
    'projects',
    'purchase_invoices',
    'shelves',
    'suppliers',
    'tasks',
    'warehouses',
    'profiles',
    'bank_accounts',
    'cash_boxes',
    'cheques',
    'work_schedules',
    'attendance_logs',
    'leave_requests',
    'overtime_requests',
    'mission_requests',
    'price_lists',
    'web_forms',
    'counterparty_bot_groups'
  ]
  loop
    if exists (
      select 1
      from information_schema.tables t
      where t.table_schema = 'public'
        and t.table_name = v_table_name
        and t.table_type = 'BASE TABLE'
    ) and exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_table_name
        and c.column_name = 'org_id'
    ) then
      execute format(
        'alter table public.%I add column if not exists system_code text',
        v_table_name
      );

      execute format(
        'create unique index if not exists %I on public.%I (org_id, system_code) where system_code is not null and btrim(system_code) <> ''''',
        'idx_' || v_table_name || '_org_system_code',
        v_table_name
      );

      execute format(
        'insert into public.system_code_counters (table_name, org_scope, prefix, last_number)
         select %L, org_scope, prefix, max(last_number)
           from (
             select
               coalesce(org_id::text, ''__global__'') as org_scope,
               upper(code_parts.prefix_part) as prefix,
               max(code_parts.number_part::numeric)::int as last_number
             from public.%I
             cross join lateral (
               select
                 (regexp_match(btrim(coalesce(system_code, '''')), ''^(.*?)([0-9]+)$''))[1] as prefix_part,
                 (regexp_match(btrim(coalesce(system_code, '''')), ''^(.*?)([0-9]+)$''))[2] as number_part
             ) code_parts
             where coalesce(system_code, '''') <> ''''
               and code_parts.prefix_part is not null
               and code_parts.number_part is not null
               and code_parts.number_part::numeric between 0 and 2147483647
             group by coalesce(org_id::text, ''__global__''), upper(code_parts.prefix_part)
           ) seeded
          group by org_scope, prefix
         on conflict (table_name, org_scope, prefix) do update
           set last_number = greatest(public.system_code_counters.last_number, excluded.last_number),
               updated_at = now()',
        v_table_name,
        v_table_name
      );

      v_trigger_name := 'trg_' || v_table_name || '_system_code_autogen';
      execute format('drop trigger if exists %I on public.%I', v_trigger_name, v_table_name);
      execute format(
        'create trigger %I
         before insert or update on public.%I
         for each row
         execute function public.assign_system_code_from_module_settings()',
        v_trigger_name,
        v_table_name
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
