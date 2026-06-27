-- KalamApp - Phase 257: Global search RPC coverage and ranking refresh

begin;

create extension if not exists pg_trgm;

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
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_role_id uuid;
  v_permissions jsonb := '{}'::jsonb;
  v_module_permissions jsonb;
  v_record_scope text;
  v_allowed_role_ids text[] := array[]::text[];
  v_allowed_user_ids text[] := array[]::text[];
  v_module text;
  v_columns text[];
  v_config_keys text[] := array[]::text[];
  v_generic_keys text[];
  v_candidate_keys text[];
  v_keys text[];
  v_title_keys text[];
  v_subtitle_keys text[];
  v_payload_keys text[];
  v_concat_expr text;
  v_match_expr text;
  v_title_expr text;
  v_subtitle_expr text;
  v_payload_fields text;
  v_payload_expr text;
  v_phone_condition text;
  v_created_expr text;
  v_scope_condition text;
  v_assignee_type_expr text;
  v_user_assignee_expr text;
  v_role_assignee_expr text;
  v_rank_expr text;
  v_sql text;
begin
  if v_user_id is null or v_org_id is null or length(v_query) < 2 then
    return;
  end if;

  select p.role_id, coalesce(r.permissions, '{}'::jsonb)
    into v_role_id, v_permissions
  from public.profiles p
  left join public.org_roles r
    on r.id = p.role_id
   and r.org_id = p.org_id
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  if not found then
    return;
  end if;

  select coalesce(array_agg(r.id::text), array[]::text[])
    into v_allowed_role_ids
  from public.org_roles r
  where r.org_id = v_org_id
    and (r.id = v_role_id or r.parent_id = v_role_id);

  select coalesce(array_agg(p.id::text), array[]::text[])
    into v_allowed_user_ids
  from public.profiles p
  where p.org_id = v_org_id
    and (p.id = v_user_id or p.role_id::text = any(v_allowed_role_ids));

  foreach v_module in array coalesce(p_modules, array[]::text[])
  loop
    if v_module !~ '^[a-zA-Z_][a-zA-Z0-9_]*$'
      or to_regclass(format('public.%I', v_module)) is null then
      continue;
    end if;

    v_module_permissions := coalesce(v_permissions -> v_module, '{}'::jsonb);
    v_record_scope := coalesce(
      nullif(v_module_permissions ->> 'record_scope', ''),
      case when coalesce((v_module_permissions ->> 'view')::boolean, true) then 'all' else 'own' end
    );

    if coalesce((v_module_permissions ->> 'view')::boolean, true) = false
      and v_record_scope = 'all' then
      continue;
    end if;

    select array_agg(a.attname::text order by a.attnum)
      into v_columns
    from pg_catalog.pg_attribute a
    where a.attrelid = to_regclass(format('public.%I', v_module))
      and a.attnum > 0
      and not a.attisdropped;

    if v_columns is null or not ('id' = any(v_columns)) then
      continue;
    end if;

    v_config_keys := case v_module
      when 'customers' then array[
        'full_name', 'first_name', 'last_name', 'business_name', 'legal_name', 'mobile_1',
        'mobile_2', 'phone', 'assistant_phone', 'system_code', 'legacy_contact_code',
        'accounting_code', 'email', 'national_code', 'national_id', 'city', 'address', 'notes'
      ]
      when 'suppliers' then array[
        'business_name', 'first_name', 'last_name', 'mobile_1', 'mobile_2', 'phone',
        'system_code', 'email', 'city', 'address'
      ]
      when 'employees' then array[
        'full_name', 'first_name', 'last_name', 'legacy_system_code', 'system_code',
        'national_code', 'mobile_1', 'phone', 'job_title'
      ]
      when 'products' then array[
        'name', 'system_code', 'manual_code', 'accounting_code', 'product_identifier',
        'category', 'product_type', 'description'
      ]
      when 'invoices' then array[
        'name', 'system_code', 'legacy_invoice_number', 'status', 'legacy_status', 'sale_source'
      ]
      when 'purchase_invoices' then array[
        'name', 'system_code', 'legacy_invoice_number', 'status', 'legacy_status'
      ]
      when 'tasks' then array['name', 'title', 'system_code', 'status', 'description']
      when 'projects' then array['name', 'title', 'system_code', 'status', 'description', 'customer_name']
      else array[]::text[]
    end;

    select array_agg(a.attname::text order by a.attnum)
      into v_generic_keys
    from pg_catalog.pg_attribute a
    where a.attrelid = to_regclass(format('public.%I', v_module))
      and a.attnum > 0
      and not a.attisdropped
      and a.atttypid in ('text'::regtype, 'character varying'::regtype)
      and a.attname ~* '(name|title|code|number|phone|mobile|email|subject|description|notes|status|city|address|category|type|identifier|external|indicator|department|goal|body|position|group|catalog|manual|legacy|accounting|national)';

    v_candidate_keys := case
      when cardinality(v_config_keys) > 0 then v_config_keys
      else coalesce(v_generic_keys, array[]::text[])
    end;

    select array_agg(key order by ord)
      into v_keys
    from unnest(v_candidate_keys) with ordinality item(key, ord)
    where key = any(v_columns)
      and key <> 'id'
      and coalesce((v_module_permissions -> 'fields' ->> key)::boolean, true);

    if v_keys is null or cardinality(v_keys) = 0 then
      continue;
    end if;

    select array_agg(key order by ord)
      into v_title_keys
    from unnest(array['full_name', 'business_name', 'legal_name', 'name', 'title', 'first_name', 'last_name', 'system_code']) with ordinality item(key, ord)
    where key = any(v_columns)
      and coalesce((v_module_permissions -> 'fields' ->> key)::boolean, true);

    select array_agg(key order by ord)
      into v_subtitle_keys
    from unnest(array['system_code', 'manual_code', 'legacy_contact_code', 'legacy_system_code', 'legacy_invoice_number', 'accounting_code', 'catalog_code', 'external_number', 'indicator_number', 'mobile_1', 'phone']) with ordinality item(key, ord)
    where key = any(v_columns)
      and coalesce((v_module_permissions -> 'fields' ->> key)::boolean, true);

    select array_agg(key order by first_ord)
      into v_payload_keys
    from (
      select key, min(ord) as first_ord
      from unnest(coalesce(v_title_keys, array[]::text[]) || coalesce(v_subtitle_keys, array[]::text[])) with ordinality item(key, ord)
      group by key
    ) payload_fields;

    select string_agg(format('coalesce(t.%I::text, '''')', key), ' || '' '' || ' order by ord)
      into v_concat_expr
    from unnest(v_keys) with ordinality item(key, ord);

    select 'coalesce(' || string_agg(format('nullif(t.%I::text, '''')', key), ', ' order by ord) || ', ''[بدون عنوان]'')'
      into v_title_expr
    from unnest(coalesce(v_title_keys, array[]::text[])) with ordinality item(key, ord);

    if v_title_expr is null then
      v_title_expr := '''[بدون عنوان]''';
    end if;

    select 'coalesce(' || string_agg(format('nullif(t.%I::text, '''')', key), ', ' order by ord) || ', '''')'
      into v_subtitle_expr
    from unnest(coalesce(v_subtitle_keys, array[]::text[])) with ordinality item(key, ord);

    if v_subtitle_expr is null then
      v_subtitle_expr := '''''';
    end if;

    select string_agg(format(', %L, t.%I', key, key), '' order by ord)
      into v_payload_fields
    from unnest(coalesce(v_payload_keys, array[]::text[])) with ordinality item(key, ord);

    v_created_expr := case when 'created_at' = any(v_columns) then 't.created_at' else 'null::timestamptz' end;
    v_payload_expr := 'jsonb_strip_nulls(jsonb_build_object(''id'', t.id::text, ''created_at'', ' ||
      v_created_expr || coalesce(v_payload_fields, '') || '))';

    select '(select coalesce(jsonb_agg(key), ''[]''::jsonb) from (values ' ||
      string_agg(
        format(
          '(%L, (lower(public.global_search_normalize_text(coalesce(t.%I::text, ''''))) like ''%%'' || $1 || ''%%''%s))',
          key,
          key,
          case
            when key ~* '(phone|mobile|tel|sender|recipient|source_number|destination_number|respondent_phone)' then
              format(' or exists (select 1 from unnest($2::text[]) q where q <> '''' and public.global_search_phone_digits(coalesce(t.%I::text, '''')) like ''%%'' || q || ''%%'')', key)
            else ''
          end
        ),
        ', ' order by ord
      ) ||
      ') matches(key, matched) where matched)'
      into v_match_expr
    from unnest(v_keys) with ordinality item(key, ord);

    select string_agg(
      format('exists (select 1 from unnest($2::text[]) q where q <> '''' and public.global_search_phone_digits(coalesce(t.%I::text, '''')) like ''%%'' || q || ''%%'')', key),
      ' or ' order by ord
    )
      into v_phone_condition
    from unnest(v_keys) with ordinality item(key, ord)
    where key ~* '(phone|mobile|tel|sender|recipient|source_number|destination_number|respondent_phone)';

    if v_phone_condition is null then
      v_phone_condition := 'false';
    end if;

    v_scope_condition := 'true';
    if v_record_scope <> 'all' then
      if not ('assignee_id' = any(v_columns)) and not ('assignee_role_id' = any(v_columns)) then
        continue;
      end if;

      v_user_assignee_expr := case
        when 'assignee_id' = any(v_columns) then 't.assignee_id::text'
        else 'null::text'
      end;
      v_role_assignee_expr := case
        when 'assignee_role_id' = any(v_columns) and 'assignee_id' = any(v_columns) and 'assignee_type' = any(v_columns) then
          'coalesce(t.assignee_role_id::text, case when lower(coalesce(t.assignee_type::text, '''')) = ''role'' then t.assignee_id::text end)'
        when 'assignee_role_id' = any(v_columns) then 't.assignee_role_id::text'
        when 'assignee_id' = any(v_columns) and 'assignee_type' = any(v_columns) then
          'case when lower(coalesce(t.assignee_type::text, '''')) = ''role'' then t.assignee_id::text end'
        else 'null::text'
      end;
      v_assignee_type_expr := case
        when 'assignee_type' = any(v_columns) and 'assignee_role_id' = any(v_columns) then
          'lower(coalesce(nullif(t.assignee_type::text, ''''), case when t.assignee_role_id is not null then ''role'' else ''user'' end))'
        when 'assignee_type' = any(v_columns) then 'lower(coalesce(nullif(t.assignee_type::text, ''''), ''user''))'
        when 'assignee_role_id' = any(v_columns) then 'case when t.assignee_role_id is not null then ''role'' else ''user'' end'
        else '''user'''
      end;

      v_scope_condition := case v_record_scope
        when 'own' then format('(%s <> ''role'' and %s = $5::text)', v_assignee_type_expr, v_user_assignee_expr)
        when 'team' then format('((%s <> ''role'' and %s = $5::text) or (%s = ''role'' and %s = $6::text))', v_assignee_type_expr, v_user_assignee_expr, v_assignee_type_expr, v_role_assignee_expr)
        when 'subtree' then format('((%s <> ''role'' and %s = any($7::text[])) or (%s = ''role'' and %s = any($8::text[])))', v_assignee_type_expr, v_user_assignee_expr, v_assignee_type_expr, v_role_assignee_expr)
        else 'false'
      end;
    end if;

    v_rank_expr := format(
      'jsonb_array_length(match_data.matched_fields)::numeric
       + case
           when lower(public.global_search_normalize_text(%1$s)) = $1 then 80
           when lower(public.global_search_normalize_text(%1$s)) like $1 || ''%%'' then 28
           when lower(public.global_search_normalize_text(%1$s)) like ''%%'' || $1 || ''%%'' then 10
           else 0
         end
       + case when %2$s then 24 else 0 end',
      v_title_expr,
      v_phone_condition
    );

    v_sql := format(
      'select %L::text as module_id,
              t.id::text as record_id,
              %s::text as title,
              %s::text as subtitle,
              match_data.matched_fields,
              %s as payload,
              %s as score,
              %s as created_at
       from public.%I t
       cross join lateral (select (%s) as matched_fields) match_data
       where (%s)
         and (lower(public.global_search_normalize_text(%s)) like ''%%'' || $1 || ''%%'' or %s)
       order by score desc, %s desc nulls last, t.id
       limit $3 offset $4',
      v_module,
      v_title_expr,
      v_subtitle_expr,
      v_payload_expr,
      v_rank_expr,
      v_created_expr,
      v_module,
      v_match_expr,
      v_scope_condition,
      v_concat_expr,
      v_phone_condition,
      v_created_expr
    );

    return query execute v_sql
      using v_query, v_phone_variants, v_limit, v_offset, v_user_id, v_role_id, v_allowed_user_ids, v_allowed_role_ids;
  end loop;
end;
$$;

revoke all on function public.global_search_records(text, text[], integer, integer) from public;
grant execute on function public.global_search_records(text, text[], integer, integer) to authenticated, service_role;

do $$
declare
  tbl record;
  v_text_expression text;
  v_index_sql text;
  v_index_name text;
begin
  for tbl in
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
  loop
    select string_agg(format('coalesce(%I::text, '''')', column_name), ' || '' '' || ' order by ordinal_position)
      into v_text_expression
    from information_schema.columns
    where table_schema = 'public'
      and table_name = tbl.table_name
      and data_type in ('text', 'character varying', 'character')
      and column_name ~* '(name|title|code|number|phone|mobile|email|subject|description|notes|status|city|address|category|type|identifier|external|indicator|department|goal|body|position|group|catalog|manual|legacy|accounting|national)';

    if v_text_expression is not null then
      v_index_name := 'idx_gsearch_text_' || substr(md5(tbl.table_name), 1, 12);
      v_index_sql := format(
        'create index if not exists %I on public.%I using gin ((lower(public.global_search_normalize_text(%s))) gin_trgm_ops)',
        v_index_name,
        tbl.table_name,
        v_text_expression
      );
      execute v_index_sql;
    end if;
  end loop;
end
$$;

commit;
