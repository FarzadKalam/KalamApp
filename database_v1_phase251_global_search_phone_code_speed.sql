begin;

create extension if not exists pg_trgm;

create or replace function public.global_search_normalize_text(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                translate(coalesce(value, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'),
                chr(8204),
                ' '
              ),
              'ك',
              'ک'
            ),
            'ي',
            'ی'
          ),
          'ى',
          'ی'
        ),
        'ۀ',
        'ه'
      ),
      'ة',
      'ه'
    ),
    '\s+',
    ' ',
    'g'
  );
$$;

create or replace function public.global_search_phone_digits(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(public.global_search_normalize_text(value), '\D', '', 'g');
$$;

create or replace function public.global_search_phone_variants(value text)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  digits text := public.global_search_phone_digits(value);
  variants text[] := array[]::text[];
begin
  if digits = '' then
    return variants;
  end if;

  variants := variants || digits;

  if digits like '0098%' then
    variants := variants || substr(digits, 3);
    variants := variants || ('0' || substr(digits, 5));
    variants := variants || substr(digits, 5);
  elsif digits like '98%' then
    variants := variants || ('0' || substr(digits, 3));
    variants := variants || substr(digits, 3);
  elsif digits like '0%' then
    variants := variants || ('98' || substr(digits, 2));
    variants := variants || substr(digits, 2);
  else
    variants := variants || ('0' || digits);
    variants := variants || ('98' || digits);
  end if;

  return array(select distinct item from unnest(variants) item where item <> '');
end;
$$;

revoke all on function public.global_search_normalize_text(text) from public;
revoke all on function public.global_search_phone_digits(text) from public;
revoke all on function public.global_search_phone_variants(text) from public;
grant execute on function public.global_search_normalize_text(text) to authenticated, service_role;
grant execute on function public.global_search_phone_digits(text) to authenticated, service_role;
grant execute on function public.global_search_phone_variants(text) to authenticated, service_role;

create or replace function public.global_search_records(
  p_query text,
  p_modules text[] default null,
  p_limit_per_module integer default 5,
  p_offset integer default 0
)
returns table (
  module_id text,
  record_id text,
  title text,
  subtitle text,
  matched_fields jsonb,
  payload jsonb,
  score numeric,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_query text := lower(public.global_search_normalize_text(p_query));
  v_phone_variants text[] := public.global_search_phone_variants(p_query);
  v_limit integer := greatest(1, least(coalesce(p_limit_per_module, 5), 30));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_module text;
  v_columns text[];
  v_keys text[];
  v_phone_keys text[];
  v_title_keys text[];
  v_subtitle_keys text[];
  v_text_expr text;
  v_phone_expr text;
  v_match_expr text;
  v_title_expr text;
  v_subtitle_expr text;
  v_phone_condition text;
  v_org_condition text;
  v_created_expr text;
  v_sql text;
begin
  if v_query = '' or length(v_query) < 2 then
    return;
  end if;

  foreach v_module in array coalesce(p_modules, array[]::text[])
  loop
    if v_module !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' then
      continue;
    end if;

    select array_agg(column_name::text order by ordinal_position)
      into v_columns
    from information_schema.columns
    where table_schema = 'public'
      and table_name = v_module;

    if v_columns is null or not ('id' = any(v_columns)) then
      continue;
    end if;

    select array_agg(column_name::text order by ordinal_position)
      into v_keys
    from information_schema.columns
    where table_schema = 'public'
      and table_name = v_module
      and data_type in ('text', 'character varying', 'character', 'uuid')
      and column_name ~* '(name|title|code|number|phone|mobile|tel|email|subject|description|notes|status|city|address|category|type|source|identifier|department|goal|body|external|indicator|sender|recipient|destination|national)';

    if v_keys is null or cardinality(v_keys) = 0 then
      continue;
    end if;

    select array_agg(key)
      into v_phone_keys
    from unnest(v_keys) key
    where key ~* '(phone|mobile|tel|sender|recipient|source_number|destination_number|respondent_phone)';

    v_title_keys := array(select key from unnest(array['full_name','business_name','legal_name','name','title','first_name','last_name','system_code']) key where key = any(v_columns));
    v_subtitle_keys := array(select key from unnest(array['system_code','manual_code','catalog_code','legacy_contact_code','legacy_system_code','legacy_invoice_number','accounting_code','external_number','indicator_number','mobile','mobile_1','phone']) key where key = any(v_columns));

    select format('lower(public.global_search_normalize_text(concat_ws('' '', %s)))', string_agg(format('t.%I::text', key), ', ' order by ord))
      into v_text_expr
    from unnest(v_keys) with ordinality as keys(key, ord);

    select 'coalesce(' || string_agg(format('nullif(t.%I::text, '''')', key), ', ') || ', t.id::text)'
      into v_title_expr
    from unnest(v_title_keys) key;

    if v_title_expr is null then
      v_title_expr := 't.id::text';
    end if;

    select 'coalesce(' || string_agg(format('nullif(t.%I::text, '''')', key), ', ') || ', '''')'
      into v_subtitle_expr
    from unnest(v_subtitle_keys) key;

    if v_subtitle_expr is null then
      v_subtitle_expr := '''''';
    end if;

    select 'coalesce(jsonb_agg(key), ''[]''::jsonb) from (values ' ||
      string_agg(
        format(
          '(%L, (%s like ''%%'' || $1 || ''%%''%s))',
          key,
          format('lower(public.global_search_normalize_text(coalesce(t.%I::text, '''')))', key),
          case
            when key ~* '(phone|mobile|tel|sender|recipient|source_number|destination_number|respondent_phone)' then
              format(' or exists (select 1 from unnest($2::text[]) q where q <> '''' and public.global_search_phone_digits(coalesce(t.%I::text, '''')) like ''%%'' || q || ''%%'')', key)
            else ''
          end
        ),
        ', '
        order by ord
      ) ||
      ') matches(key, matched) where matched'
      into v_match_expr
    from unnest(v_keys) with ordinality as keys(key, ord);

    if v_phone_keys is not null and cardinality(v_phone_keys) > 0 then
      select format('public.global_search_phone_digits(concat_ws('' '', %s))', string_agg(format('t.%I::text', key), ', ' order by ord))
        into v_phone_expr
      from unnest(v_phone_keys) with ordinality as keys(key, ord);
      v_phone_condition := format('exists (select 1 from unnest($2::text[]) q where q <> '''' and %s like ''%%'' || q || ''%%'')', v_phone_expr);
    else
      v_phone_condition := 'false';
    end if;

    v_org_condition := case
      when 'org_id' = any(v_columns) then 't.org_id = public.current_org_id()'
      else 'true'
    end;
    v_created_expr := case when 'created_at' = any(v_columns) then 't.created_at' else 'null::timestamptz' end;

    v_sql := format(
      'select %L::text as module_id,
              t.id::text as record_id,
              %s::text as title,
              %s::text as subtitle,
              (%s) as matched_fields,
              to_jsonb(t) as payload,
              (
                jsonb_array_length((%s))::numeric
                + case when %s like $1 || ''%%'' then 2 else 0 end
                + case when %s then 2 else 0 end
              ) as score,
              %s as created_at
       from public.%I t
       where %s
         and (%s like ''%%'' || $1 || ''%%'' or %s)
       order by score desc, %s desc nulls last, t.id
       limit $3 offset $4',
      v_module,
      v_title_expr,
      v_subtitle_expr,
      v_match_expr,
      v_match_expr,
      v_text_expr,
      v_phone_condition,
      v_created_expr,
      v_module,
      v_org_condition,
      v_text_expr,
      v_phone_condition,
      v_created_expr
    );

    return query execute v_sql using v_query, v_phone_variants, v_limit, v_offset;
  end loop;
end;
$$;

revoke all on function public.global_search_records(text, text[], integer, integer) from public;
grant execute on function public.global_search_records(text, text[], integer, integer) to authenticated, service_role;

do $$
declare
  tbl record;
  v_text_columns text;
  v_phone_columns text;
  v_text_expr text;
  v_phone_expr text;
  v_index_name text;
begin
  for tbl in
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
  loop
    select string_agg(format('coalesce(%I::text, '''')', column_name), ', ' order by ordinal_position)
      into v_text_columns
    from information_schema.columns
    where table_schema = 'public'
      and table_name = tbl.table_name
      and data_type in ('text', 'character varying', 'character', 'uuid')
      and column_name ~* '(name|title|code|number|phone|mobile|tel|email|subject|description|notes|status|city|address|category|type|source|identifier|department|goal|body|external|indicator|sender|recipient|destination|national)';

    if v_text_columns is not null then
      v_text_expr := replace(v_text_columns, ', ', ' || '' '' || ');
      v_index_name := 'idx_gsearch_text_' || substr(md5(tbl.table_name), 1, 12);
      execute format(
        'create index if not exists %I on public.%I using gin ((lower(public.global_search_normalize_text(%s))) gin_trgm_ops)',
        v_index_name,
        tbl.table_name,
        v_text_expr
      );
    end if;

    select string_agg(format('coalesce(%I::text, '''')', column_name), ', ' order by ordinal_position)
      into v_phone_columns
    from information_schema.columns
    where table_schema = 'public'
      and table_name = tbl.table_name
      and data_type in ('text', 'character varying', 'character')
      and column_name ~* '(phone|mobile|tel|sender|recipient|source_number|destination_number|respondent_phone)';

    if v_phone_columns is not null then
      v_phone_expr := replace(v_phone_columns, ', ', ' || '' '' || ');
      v_index_name := 'idx_gsearch_phone_' || substr(md5(tbl.table_name), 1, 12);
      execute format(
        'create index if not exists %I on public.%I using gin ((public.global_search_phone_digits(%s)) gin_trgm_ops)',
        v_index_name,
        tbl.table_name,
        v_phone_expr
      );
    end if;
  end loop;
end $$;

commit;
