begin;

create extension if not exists pg_trgm;

create or replace function public.global_search_normalize_text(value text)
returns text
language sql
immutable
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
as $$
  select regexp_replace(public.global_search_normalize_text(value), '\D', '', 'g');
$$;

create or replace function public.global_search_phone_variants(value text)
returns text[]
language plpgsql
immutable
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
  elsif digits like '09%' then
    variants := variants || ('98' || substr(digits, 2));
    variants := variants || substr(digits, 2);
  elsif digits like '9%' and length(digits) >= 10 then
    variants := variants || ('0' || digits);
    variants := variants || ('98' || digits);
  end if;

  return array(select distinct item from unnest(variants) item where item <> '');
end;
$$;

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
as $$
declare
  v_query text := lower(public.global_search_normalize_text(p_query));
  v_phone_variants text[] := public.global_search_phone_variants(p_query);
  v_limit integer := greatest(1, least(coalesce(p_limit_per_module, 5), 30));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_module text;
  v_columns text[];
  v_config_keys text[];
  v_generic_keys text[];
  v_keys text[];
  v_title_keys text[];
  v_subtitle_keys text[];
  v_concat_expr text;
  v_match_expr text;
  v_title_expr text;
  v_subtitle_expr text;
  v_phone_condition text;
  v_created_expr text;
  v_sql text;
begin
  if v_query = '' then
    return;
  end if;

  foreach v_module in array coalesce(p_modules, array[]::text[])
  loop
    if v_module !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' then
      continue;
    end if;

    select array_agg(column_name::text)
      into v_columns
    from information_schema.columns
    where table_schema = 'public'
      and table_name = v_module;

    if v_columns is null or not ('id' = any(v_columns)) then
      continue;
    end if;

    v_config_keys := case v_module
      when 'customers' then array[
        'full_name','first_name','last_name','business_name','legal_name','mobile_1','mobile_2','phone','assistant_phone',
        'system_code','legacy_contact_code','accounting_code','email','national_code','national_id','city','address','notes'
      ]
      when 'suppliers' then array[
        'business_name','first_name','last_name','mobile_1','mobile_2','phone','system_code','email','city','address'
      ]
      when 'employees' then array[
        'full_name','first_name','last_name','legacy_system_code','system_code','national_code','mobile_1','phone','job_title'
      ]
      when 'products' then array[
        'name','system_code','manual_code','accounting_code','product_identifier','category','product_type','description'
      ]
      when 'invoices' then array[
        'name','system_code','legacy_invoice_number','status','legacy_status','sale_source'
      ]
      when 'purchase_invoices' then array[
        'name','system_code','legacy_invoice_number','status','legacy_status'
      ]
      when 'tasks' then array[
        'name','title','system_code','status','description','id'
      ]
      when 'projects' then array[
        'name','title','system_code','status','description','customer_name'
      ]
      else array[]::text[]
    end;

    select array_agg(column_name::text)
      into v_generic_keys
    from information_schema.columns
    where table_schema = 'public'
      and table_name = v_module
      and data_type in ('text', 'character varying', 'uuid')
      and (
        column_name ~* '(name|title|code|number|phone|mobile|email|subject|description|notes|status|city|address)'
        or column_name = 'id'
      );

    select array_agg(distinct key)
      into v_keys
    from unnest(coalesce(v_config_keys, array[]::text[]) || coalesce(v_generic_keys, array[]::text[])) key
    where key = any(v_columns);

    if v_keys is null or cardinality(v_keys) = 0 then
      continue;
    end if;

    v_title_keys := array(select key from unnest(array['full_name','business_name','legal_name','name','title','first_name','last_name','system_code','id']) key where key = any(v_columns));
    v_subtitle_keys := array(select key from unnest(array['system_code','manual_code','legacy_contact_code','legacy_system_code','legacy_invoice_number','accounting_code','mobile_1','phone']) key where key = any(v_columns));

    select string_agg(format('public.global_search_normalize_text(coalesce(t.%I::text, ''''))', key), ' || '' '' || ')
      into v_concat_expr
    from unnest(v_keys) key;

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
          '(%L, (lower(public.global_search_normalize_text(coalesce(t.%I::text, ''''))) like ''%%'' || $1 || ''%%''%s))',
          key,
          key,
          case
            when key ~* '(phone|mobile)' then
              format(' or exists (select 1 from unnest($2::text[]) q where q <> '''' and public.global_search_phone_digits(coalesce(t.%I::text, '''')) like ''%%'' || q || ''%%'')', key)
            else ''
          end
        ),
        ', '
      ) ||
      ') matches(key, matched) where matched'
      into v_match_expr
    from unnest(v_keys) key;

    select string_agg(
      format('exists (select 1 from unnest($2::text[]) q where q <> '''' and public.global_search_phone_digits(coalesce(t.%I::text, '''')) like ''%%'' || q || ''%%'')', key),
      ' or '
    )
      into v_phone_condition
    from unnest(v_keys) key
    where key ~* '(phone|mobile)';

    if v_phone_condition is null then
      v_phone_condition := 'false';
    end if;

    v_created_expr := case when 'created_at' = any(v_columns) then 't.created_at' else 'null::timestamptz' end;

    v_sql := format(
      'select %L::text as module_id,
              t.id::text as record_id,
              %s::text as title,
              %s::text as subtitle,
              (%s) as matched_fields,
              to_jsonb(t) as payload,
              jsonb_array_length((%s))::numeric as score,
              %s as created_at
       from public.%I t
       where (lower(%s) like ''%%'' || $1 || ''%%'' or %s)
       order by score desc, %s desc nulls last, t.id
       limit $3 offset $4',
      v_module,
      v_title_expr,
      v_subtitle_expr,
      v_match_expr,
      v_match_expr,
      v_created_expr,
      v_module,
      v_concat_expr,
      v_phone_condition,
      v_created_expr
    );

    return query execute v_sql using v_query, v_phone_variants, v_limit, v_offset;
  end loop;
end;
$$;

grant execute on function public.global_search_normalize_text(text) to authenticated, service_role;
grant execute on function public.global_search_phone_digits(text) to authenticated, service_role;
grant execute on function public.global_search_phone_variants(text) to authenticated, service_role;
grant execute on function public.global_search_records(text, text[], integer, integer) to authenticated, service_role;

do $$
declare
  idx record;
  v_index_sql text;
begin
  for idx in
    select *
    from (values
      ('customers', 'idx_customers_global_search_text', array['full_name','first_name','last_name','business_name','legal_name','system_code','legacy_contact_code','accounting_code','email','national_code','national_id','city','address','notes']::text[]),
      ('customers', 'idx_customers_global_search_phone', array['mobile_1','mobile_2','phone','assistant_phone']::text[]),
      ('suppliers', 'idx_suppliers_global_search_text', array['business_name','first_name','last_name','system_code','email','city','address']::text[]),
      ('suppliers', 'idx_suppliers_global_search_phone', array['mobile_1','mobile_2','phone']::text[]),
      ('employees', 'idx_employees_global_search_text', array['full_name','first_name','last_name','legacy_system_code','system_code','national_code','job_title']::text[]),
      ('employees', 'idx_employees_global_search_phone', array['mobile_1','phone']::text[]),
      ('products', 'idx_products_global_search_text', array['name','system_code','manual_code','accounting_code','product_identifier','category','product_type','description']::text[]),
      ('invoices', 'idx_invoices_global_search_text', array['name','system_code','legacy_invoice_number','status','legacy_status','sale_source']::text[]),
      ('purchase_invoices', 'idx_purchase_invoices_global_search_text', array['name','system_code','legacy_invoice_number','status','legacy_status']::text[]),
      ('tasks', 'idx_tasks_global_search_text', array['name','title','system_code','status','description']::text[]),
      ('projects', 'idx_projects_global_search_text', array['name','title','system_code','status','description','customer_name']::text[])
    ) as items(table_name, index_name, columns)
  loop
    if to_regclass(format('public.%I', idx.table_name)) is not null then
      select format(
        'create index if not exists %I on public.%I using gin ((public.global_search_normalize_text(%s)) gin_trgm_ops)',
        idx.index_name,
        idx.table_name,
        string_agg(format('coalesce(%I::text, '''')', column_name), ' || '' '' || ')
      )
        into v_index_sql
        from information_schema.columns
        where table_schema = 'public'
          and table_name = idx.table_name
          and column_name = any(idx.columns);

      if v_index_sql is not null then
        execute v_index_sql;
      end if;
    end if;
  end loop;
end $$;

commit;
