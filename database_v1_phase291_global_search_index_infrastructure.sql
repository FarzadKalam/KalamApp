-- KalamApp - Phase 291: Global search index infrastructure with safe live fallback

begin;

create extension if not exists pg_trgm;

create table if not exists public.global_search_index (
  org_id uuid not null,
  module_id text not null,
  record_id text not null,
  title text not null default '[بدون عنوان]',
  subtitle text not null default '',
  search_text text not null default '',
  phone_digits text not null default '',
  matched_keys text[] not null default '{}'::text[],
  payload jsonb not null default '{}'::jsonb,
  assignee_user_id text null,
  assignee_role_id text null,
  assignee_type text null,
  created_at timestamptz null,
  updated_at timestamptz not null default now()
);

alter table public.global_search_index
  add column if not exists org_id uuid,
  add column if not exists module_id text,
  add column if not exists record_id text,
  add column if not exists title text,
  add column if not exists subtitle text,
  add column if not exists search_text text,
  add column if not exists phone_digits text,
  add column if not exists matched_keys text[] default '{}'::text[],
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists assignee_user_id text,
  add column if not exists assignee_role_id text,
  add column if not exists assignee_type text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.global_search_index'::regclass
      and conname = 'global_search_index_pkey'
  ) then
    alter table public.global_search_index
      add constraint global_search_index_pkey primary key (org_id, module_id, record_id);
  end if;
end
$$;

alter table public.global_search_index enable row level security;

drop policy if exists p_global_search_index_org_select on public.global_search_index;
create policy p_global_search_index_org_select
on public.global_search_index
for select
to authenticated
using (org_id = public.current_org_id());

revoke all on public.global_search_index from public;
grant select on public.global_search_index to authenticated, service_role;

create index if not exists idx_global_search_index_org_module_created
  on public.global_search_index (org_id, module_id, created_at desc nulls last);
create index if not exists idx_global_search_index_org_module_updated
  on public.global_search_index (org_id, module_id, updated_at desc nulls last);
create index if not exists idx_global_search_index_search_text
  on public.global_search_index using gin ((lower(public.global_search_normalize_text(search_text))) gin_trgm_ops);
create index if not exists idx_global_search_index_phone_digits
  on public.global_search_index using gin (phone_digits gin_trgm_ops);

create or replace function public.global_search_build_index_document(
  p_module text,
  p_payload jsonb
)
returns table (
  title text,
  subtitle text,
  search_text text,
  phone_digits text,
  matched_keys text[],
  assignee_user_id text,
  assignee_role_id text,
  assignee_type text
)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_available_keys text[] := array[]::text[];
  v_config_keys text[] := array[]::text[];
  v_generic_keys text[] := array[]::text[];
  v_candidate_keys text[] := array[]::text[];
  v_keys text[] := array[]::text[];
  v_phone_keys text[] := array[]::text[];
  v_value text;
  v_assignee_id text;
  v_assignee_role_id text;
  v_assignee_type text;
begin
  select coalesce(array_agg(key), array[]::text[])
    into v_available_keys
  from jsonb_object_keys(v_payload) key;

  v_config_keys := case p_module
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

  select coalesce(array_agg(key order by key), array[]::text[])
    into v_generic_keys
  from jsonb_each_text(v_payload) fields(key, value)
  where key ~* '(name|title|code|number|phone|mobile|email|subject|description|notes|status|city|address|category|type|identifier|external|indicator|department|goal|body|position|group|catalog|manual|legacy|accounting|national)'
    and nullif(trim(value), '') is not null;

  v_candidate_keys := case
    when cardinality(v_config_keys) > 0 then v_config_keys
    else v_generic_keys
  end;

  select coalesce(array_agg(key order by ord), array[]::text[])
    into v_keys
  from unnest(v_candidate_keys) with ordinality item(key, ord)
  where key = any(v_available_keys)
    and key <> 'id'
    and nullif(trim(v_payload ->> key), '') is not null;

  select coalesce(array_agg(key order by ord), array[]::text[])
    into v_phone_keys
  from unnest(v_keys) with ordinality item(key, ord)
  where key ~* '(phone|mobile|tel|sender|recipient|source_number|destination_number|respondent_phone)';

  title := '[بدون عنوان]';
  foreach v_value in array array['full_name', 'business_name', 'legal_name', 'name', 'title', 'first_name', 'last_name', 'system_code']
  loop
    if v_value = any(v_available_keys) and nullif(trim(v_payload ->> v_value), '') is not null then
      title := trim(v_payload ->> v_value);
      exit;
    end if;
  end loop;

  subtitle := '';
  foreach v_value in array array['system_code', 'manual_code', 'legacy_contact_code', 'legacy_system_code', 'legacy_invoice_number', 'accounting_code', 'catalog_code', 'external_number', 'indicator_number', 'mobile_1', 'phone']
  loop
    if v_value = any(v_available_keys) and nullif(trim(v_payload ->> v_value), '') is not null then
      subtitle := trim(v_payload ->> v_value);
      exit;
    end if;
  end loop;

  select coalesce(string_agg(trim(v_payload ->> key), ' ' order by ord), '')
    into search_text
  from unnest(v_keys) with ordinality item(key, ord);

  select coalesce(string_agg(public.global_search_phone_digits(coalesce(v_payload ->> key, '')), ' ' order by ord), '')
    into phone_digits
  from unnest(v_phone_keys) with ordinality item(key, ord)
  where nullif(trim(v_payload ->> key), '') is not null;

  matched_keys := coalesce(v_keys, array[]::text[]);

  v_assignee_id := nullif(trim(coalesce(v_payload ->> 'assignee_id', '')), '');
  v_assignee_role_id := nullif(trim(coalesce(v_payload ->> 'assignee_role_id', '')), '');
  v_assignee_type := lower(nullif(trim(coalesce(v_payload ->> 'assignee_type', '')), ''));
  if v_assignee_type is null then
    v_assignee_type := case when v_assignee_role_id is not null then 'role' else 'user' end;
  end if;

  assignee_type := v_assignee_type;
  assignee_role_id := coalesce(v_assignee_role_id, case when v_assignee_type = 'role' then v_assignee_id else null end);
  assignee_user_id := case when v_assignee_type = 'role' then null else v_assignee_id end;

  return next;
end;
$$;

revoke all on function public.global_search_build_index_document(text, jsonb) from public;
grant execute on function public.global_search_build_index_document(text, jsonb) to authenticated, service_role;

create or replace function public.global_search_sync_index_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module text := TG_TABLE_NAME;
  v_payload jsonb;
  v_doc record;
  v_org_id uuid;
  v_record_id text;
  v_created_at timestamptz;
begin
  if TG_TABLE_SCHEMA <> 'public' or TG_TABLE_NAME = 'global_search_index' then
    return coalesce(NEW, OLD);
  end if;

  if TG_OP = 'DELETE' then
    v_payload := jsonb_strip_nulls(to_jsonb(OLD));
    v_org_id := nullif(v_payload ->> 'org_id', '')::uuid;
    v_record_id := coalesce(v_payload ->> 'id', '');
    if v_org_id is not null and v_record_id <> '' then
      delete from public.global_search_index
      where org_id = v_org_id
        and module_id = v_module
        and record_id = v_record_id;
    end if;
    return OLD;
  end if;

  v_payload := jsonb_strip_nulls(to_jsonb(NEW));
  v_org_id := nullif(v_payload ->> 'org_id', '')::uuid;
  v_record_id := coalesce(v_payload ->> 'id', '');
  if v_org_id is null or v_record_id = '' then
    return NEW;
  end if;

  select *
    into v_doc
  from public.global_search_build_index_document(v_module, v_payload);

  if coalesce(array_length(v_doc.matched_keys, 1), 0) = 0 then
    delete from public.global_search_index
    where org_id = v_org_id
      and module_id = v_module
      and record_id = v_record_id;
    return NEW;
  end if;

  v_created_at := nullif(v_payload ->> 'created_at', '')::timestamptz;

  insert into public.global_search_index (
    org_id,
    module_id,
    record_id,
    title,
    subtitle,
    search_text,
    phone_digits,
    matched_keys,
    payload,
    assignee_user_id,
    assignee_role_id,
    assignee_type,
    created_at,
    updated_at
  )
  values (
    v_org_id,
    v_module,
    v_record_id,
    coalesce(v_doc.title, '[بدون عنوان]'),
    coalesce(v_doc.subtitle, ''),
    coalesce(v_doc.search_text, ''),
    coalesce(v_doc.phone_digits, ''),
    coalesce(v_doc.matched_keys, array[]::text[]),
    v_payload,
    v_doc.assignee_user_id,
    v_doc.assignee_role_id,
    v_doc.assignee_type,
    v_created_at,
    now()
  )
  on conflict (org_id, module_id, record_id) do update
  set title = excluded.title,
      subtitle = excluded.subtitle,
      search_text = excluded.search_text,
      phone_digits = excluded.phone_digits,
      matched_keys = excluded.matched_keys,
      payload = excluded.payload,
      assignee_user_id = excluded.assignee_user_id,
      assignee_role_id = excluded.assignee_role_id,
      assignee_type = excluded.assignee_type,
      created_at = excluded.created_at,
      updated_at = now();

  return NEW;
end;
$$;

revoke all on function public.global_search_sync_index_row() from public;
grant execute on function public.global_search_sync_index_row() to service_role;

create or replace function public.refresh_global_search_index(
  p_modules text[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_module text;
  v_inserted integer := 0;
  v_row_count integer := 0;
  v_sql text;
begin
  if v_org_id is null then
    return 0;
  end if;

  for v_module in
    select t.table_name
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and t.table_name <> 'global_search_index'
      and (p_modules is null or t.table_name = any(p_modules))
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = t.table_name
          and column_name = 'org_id'
      )
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = t.table_name
          and column_name = 'id'
      )
  loop
    delete from public.global_search_index
    where org_id = v_org_id
      and module_id = v_module;

    v_sql := format(
      $q$
      insert into public.global_search_index (
        org_id,
        module_id,
        record_id,
        title,
        subtitle,
        search_text,
        phone_digits,
        matched_keys,
        payload,
        assignee_user_id,
        assignee_role_id,
        assignee_type,
        created_at,
        updated_at
      )
      select
        t.org_id,
        %L::text,
        t.id::text,
        doc.title,
        doc.subtitle,
        doc.search_text,
        doc.phone_digits,
        doc.matched_keys,
        row_data.row_json,
        doc.assignee_user_id,
        doc.assignee_role_id,
        doc.assignee_type,
        case when row_data.row_json ? 'created_at' and nullif(row_data.row_json ->> 'created_at', '') is not null then (row_data.row_json ->> 'created_at')::timestamptz else null::timestamptz end,
        now()
      from public.%I t
      cross join lateral (select jsonb_strip_nulls(to_jsonb(t)) as row_json) row_data
      cross join lateral public.global_search_build_index_document(%L, row_data.row_json) doc
      where t.org_id = %L::uuid
        and t.id is not null
        and coalesce(array_length(doc.matched_keys, 1), 0) > 0
      on conflict (org_id, module_id, record_id) do update
      set title = excluded.title,
          subtitle = excluded.subtitle,
          search_text = excluded.search_text,
          phone_digits = excluded.phone_digits,
          matched_keys = excluded.matched_keys,
          payload = excluded.payload,
          assignee_user_id = excluded.assignee_user_id,
          assignee_role_id = excluded.assignee_role_id,
          assignee_type = excluded.assignee_type,
          created_at = excluded.created_at,
          updated_at = now()
      $q$,
      v_module,
      v_module,
      v_module,
      v_org_id::text
    );

    execute v_sql;
    get diagnostics v_row_count = row_count;
    v_inserted := v_inserted + coalesce(v_row_count, 0);
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.refresh_global_search_index(text[]) from public;
grant execute on function public.refresh_global_search_index(text[]) to authenticated, service_role;

create or replace function public.global_search_records_live(
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

revoke all on function public.global_search_records_live(text, text[], integer, integer) from public;
grant execute on function public.global_search_records_live(text, text[], integer, integer) to authenticated, service_role;

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
  v_allowed_role_ids text[] := array[]::text[];
  v_allowed_user_ids text[] := array[]::text[];
  v_requested_modules text[] := coalesce(p_modules, array[]::text[]);
  v_live_modules text[] := array[]::text[];
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

  return query
  with requested_modules as (
    select distinct module_id
    from unnest(v_requested_modules) module_id
    where module_id ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'
  ),
  permitted_modules as (
    select
      r.module_id,
      coalesce(v_permissions -> r.module_id, '{}'::jsonb) as module_permissions,
      coalesce(
        nullif((v_permissions -> r.module_id ->> 'record_scope'), ''),
        case when coalesce((v_permissions -> r.module_id ->> 'view')::boolean, true) then 'all' else 'own' end
      ) as record_scope
    from requested_modules r
    where not (
      coalesce((v_permissions -> r.module_id ->> 'view')::boolean, true) = false
      and coalesce(
        nullif((v_permissions -> r.module_id ->> 'record_scope'), ''),
        case when coalesce((v_permissions -> r.module_id ->> 'view')::boolean, true) then 'all' else 'own' end
      ) = 'all'
    )
  ),
  indexed_modules as (
    select distinct i.module_id
    from public.global_search_index i
    join permitted_modules p on p.module_id = i.module_id
    where i.org_id = v_org_id
  ),
  indexed_rows as (
    select
      i.module_id,
      i.record_id,
      i.title,
      i.subtitle,
      (
        select coalesce(jsonb_agg(key), '[]'::jsonb)
        from unnest(i.matched_keys) key
        where coalesce((p.module_permissions -> 'fields' ->> key)::boolean, true)
          and (
            lower(public.global_search_normalize_text(coalesce(i.payload ->> key, ''))) like '%' || v_query || '%'
           or exists (
              select 1
              from unnest(v_phone_variants) q
              where q <> ''
                and public.global_search_phone_digits(coalesce(i.payload ->> key, '')) like '%' || q || '%'
            )
          )
      ) as matched_fields,
      i.payload,
      (
        case
          when lower(public.global_search_normalize_text(i.title)) = v_query then 80
          when lower(public.global_search_normalize_text(i.title)) like v_query || '%' then 28
          when lower(public.global_search_normalize_text(i.title)) like '%' || v_query || '%' then 10
          else 0
        end
        + case
            when lower(public.global_search_normalize_text(i.subtitle)) = v_query then 24
            when lower(public.global_search_normalize_text(i.subtitle)) like v_query || '%' then 10
            when lower(public.global_search_normalize_text(i.subtitle)) like '%' || v_query || '%' then 4
            else 0
          end
        + case
            when exists (
              select 1
              from unnest(v_phone_variants) q
              where q <> ''
                and i.phone_digits like '%' || q || '%'
            ) then 24 else 0
          end
      )::numeric as score,
      i.created_at,
      row_number() over (
        partition by i.module_id
        order by
          (
            case
              when lower(public.global_search_normalize_text(i.title)) = v_query then 80
              when lower(public.global_search_normalize_text(i.title)) like v_query || '%' then 28
              when lower(public.global_search_normalize_text(i.title)) like '%' || v_query || '%' then 10
              else 0
            end
            + case
                when lower(public.global_search_normalize_text(i.subtitle)) = v_query then 24
                when lower(public.global_search_normalize_text(i.subtitle)) like v_query || '%' then 10
                when lower(public.global_search_normalize_text(i.subtitle)) like '%' || v_query || '%' then 4
                else 0
              end
            + case
                when exists (
                  select 1
                  from unnest(v_phone_variants) q
                  where q <> ''
                    and i.phone_digits like '%' || q || '%'
                ) then 24 else 0
              end
            + coalesce(array_length(i.matched_keys, 1), 0)
          ) desc,
          i.created_at desc nulls last,
          i.record_id
      ) as module_rank
    from public.global_search_index i
    join permitted_modules p on p.module_id = i.module_id
    where i.org_id = v_org_id
      and (
        lower(public.global_search_normalize_text(i.search_text)) like '%' || v_query || '%'
        or exists (
          select 1
          from unnest(v_phone_variants) q
          where q <> ''
            and i.phone_digits like '%' || q || '%'
        )
      )
      and (
        p.record_scope = 'all'
        or (
          p.record_scope = 'own'
          and coalesce(i.assignee_type, 'user') <> 'role'
          and i.assignee_user_id = v_user_id::text
        )
        or (
          p.record_scope = 'team'
          and (
            (coalesce(i.assignee_type, 'user') <> 'role' and i.assignee_user_id = v_user_id::text)
            or (coalesce(i.assignee_type, 'user') = 'role' and i.assignee_role_id = v_role_id::text)
          )
        )
        or (
          p.record_scope = 'subtree'
          and (
            (coalesce(i.assignee_type, 'user') <> 'role' and i.assignee_user_id = any(v_allowed_user_ids))
            or (coalesce(i.assignee_type, 'user') = 'role' and i.assignee_role_id = any(v_allowed_role_ids))
          )
        )
      )
  )
  select
    module_id,
    record_id,
    title,
    subtitle,
    matched_fields,
    payload,
    score + jsonb_array_length(matched_fields)::numeric as score,
    created_at
  from indexed_rows
  where jsonb_array_length(matched_fields) > 0
    and module_rank > v_offset
    and module_rank <= (v_offset + v_limit);

  select coalesce(array_agg(module_id), array[]::text[])
    into v_live_modules
  from (
    select p.module_id
    from (
      select
        r.module_id,
        coalesce(v_permissions -> r.module_id, '{}'::jsonb) as module_permissions,
        coalesce(
          nullif((v_permissions -> r.module_id ->> 'record_scope'), ''),
          case when coalesce((v_permissions -> r.module_id ->> 'view')::boolean, true) then 'all' else 'own' end
        ) as record_scope
      from unnest(v_requested_modules) r(module_id)
      where r.module_id ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'
    ) p
    where not (
      coalesce((p.module_permissions ->> 'view')::boolean, true) = false
      and p.record_scope = 'all'
    )
      and not exists (
        select 1
        from public.global_search_index i
        where i.org_id = v_org_id
          and i.module_id = p.module_id
        limit 1
      )
  ) missing_modules;

  if coalesce(array_length(v_live_modules, 1), 0) > 0 then
    return query
    select *
    from public.global_search_records_live(p_query, v_live_modules, p_limit_per_module, p_offset);
  end if;
end;
$$;

revoke all on function public.global_search_records(text, text[], integer, integer) from public;
grant execute on function public.global_search_records(text, text[], integer, integer) to authenticated, service_role;

do $$
declare
  tbl record;
  v_sql text;
begin
  for tbl in
    select t.table_name
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and t.table_name <> 'global_search_index'
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = t.table_name
          and column_name = 'org_id'
      )
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = t.table_name
          and column_name = 'id'
      )
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = t.table_name
          and column_name ~* '(name|title|code|number|phone|mobile|email|subject|description|notes|status|city|address|category|type|identifier|external|indicator|department|goal|body|position|group|catalog|manual|legacy|accounting|national)'
      )
  loop
    execute format('drop trigger if exists trg_global_search_index_sync on public.%I', tbl.table_name);
    execute format(
      'create trigger trg_global_search_index_sync after insert or update or delete on public.%I for each row execute function public.global_search_sync_index_row()',
      tbl.table_name
    );

    v_sql := format(
      $q$
      insert into public.global_search_index (
        org_id,
        module_id,
        record_id,
        title,
        subtitle,
        search_text,
        phone_digits,
        matched_keys,
        payload,
        assignee_user_id,
        assignee_role_id,
        assignee_type,
        created_at,
        updated_at
      )
      select
        t.org_id,
        %L::text,
        t.id::text,
        doc.title,
        doc.subtitle,
        doc.search_text,
        doc.phone_digits,
        doc.matched_keys,
        row_data.row_json,
        doc.assignee_user_id,
        doc.assignee_role_id,
        doc.assignee_type,
        case when row_data.row_json ? 'created_at' and nullif(row_data.row_json ->> 'created_at', '') is not null then (row_data.row_json ->> 'created_at')::timestamptz else null::timestamptz end,
        now()
      from public.%I t
      cross join lateral (select jsonb_strip_nulls(to_jsonb(t)) as row_json) row_data
      cross join lateral public.global_search_build_index_document(%L, row_data.row_json) doc
      where t.org_id is not null
        and t.id is not null
        and coalesce(array_length(doc.matched_keys, 1), 0) > 0
      on conflict (org_id, module_id, record_id) do update
      set title = excluded.title,
          subtitle = excluded.subtitle,
          search_text = excluded.search_text,
          phone_digits = excluded.phone_digits,
          matched_keys = excluded.matched_keys,
          payload = excluded.payload,
          assignee_user_id = excluded.assignee_user_id,
          assignee_role_id = excluded.assignee_role_id,
          assignee_type = excluded.assignee_type,
          created_at = excluded.created_at,
          updated_at = now()
      $q$,
      tbl.table_name,
      tbl.table_name,
      tbl.table_name
    );
    execute v_sql;
  end loop;
end
$$;

commit;
