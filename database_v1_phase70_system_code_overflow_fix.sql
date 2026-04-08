-- KalamApp V1 - Phase 70
-- Fix system_code sequence lookup when legacy/bad timestamp-like codes exist.

begin;

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
    hashtext(format('system_code:%s:%s:%s', v_module_key, coalesce(v_org_id::text, 'null'), v_prefix))
  );

  execute format(
    'select coalesce(max(suffix_value)::int, 0)
       from (
         select substring(upper(system_code) from $2) as suffix_text
           from public.%I
          where ($1::uuid is null or org_id = $1)
            and left(upper(coalesce(system_code, '''')), $2 - 1) = $3
            and substring(upper(system_code) from $2) ~ ''^[0-9]+$''
       ) matching_codes
       cross join lateral (
         select suffix_text::numeric as suffix_value
       ) normalized_codes
      where suffix_value between 0 and $4',
    v_module_key
  )
  into v_last_number
  using v_org_id, char_length(v_prefix) + 1, v_prefix, v_max_sequence;

  v_next_number := greatest(v_start_number, v_last_number + 1);

  loop
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
    v_next_number := v_next_number + 1;
  end loop;

  new.system_code := v_candidate;
  return new;
end;
$$;

commit;
