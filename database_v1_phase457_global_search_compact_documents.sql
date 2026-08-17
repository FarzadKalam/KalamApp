-- ایندکس جست‌وجوی سراسری باید فقط داده‌های قابل جست‌وجوی کاربر را نگه دارد.
-- داده‌های عملیاتی مانند لاگ‌های گردش کار و اعلان‌ها در این read model جایی ندارند.
-- این migration بدون حذف دادهٔ اصلی، read model قبلی را به نسخهٔ کم‌حجم منتقل می‌کند.

create table if not exists public.global_search_module_registry (
  module_id text primary key,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint global_search_module_registry_module_id_format
    check (module_id ~ '^[a-zA-Z_][a-zA-Z0-9_]*$')
);

alter table public.global_search_module_registry enable row level security;
revoke all on table public.global_search_module_registry from public, anon, authenticated;

create table if not exists public.global_search_documents (
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
  updated_at timestamptz not null default now(),
  primary key (org_id, module_id, record_id)
);

alter table public.global_search_documents enable row level security;
revoke all on table public.global_search_documents from public, anon, authenticated;
grant select on table public.global_search_documents to service_role;

create index if not exists idx_global_search_documents_org_module_created
  on public.global_search_documents (org_id, module_id, created_at desc nulls last);
create index if not exists idx_global_search_documents_org_module_updated
  on public.global_search_documents (org_id, module_id, updated_at desc nulls last);
create index if not exists idx_global_search_documents_search_text
  on public.global_search_documents using gin ((lower(public.global_search_normalize_text(search_text))) gin_trgm_ops);
create index if not exists idx_global_search_documents_phone_digits
  on public.global_search_documents using gin (phone_digits gin_trgm_ops);

-- رجیستری، منبع دادهٔ قابل نگهداری برای فعال/غیرفعال‌کردن ماژول‌های قابل جست‌وجو است.
-- افزودن ماژول محصولی جدید فقط با افزودن یک سطر به همین رجیستری انجام می‌شود.
insert into public.global_search_module_registry (module_id)
select module_id
from unnest(array[
  'products', 'billboards', 'product_bundles', 'warehouses', 'shelves', 'stock_transfers',
  'secretariat_documents', 'delivery_forms', 'production_boms', 'production_orders',
  'production_group_orders', 'customers', 'suppliers', 'invoices', 'purchase_invoices',
  'sales_return_invoices', 'purchase_return_invoices', 'projects', 'marketing_leads',
  'personas', 'instructions', 'process_templates', 'process_runs', 'tasks',
  'calculation_formulas', 'fiscal_years', 'chart_of_accounts', 'journal_entries',
  'accounting_event_rules', 'cost_centers', 'cash_boxes', 'bank_accounts', 'petty_funds',
  'cheques', 'barters', 'cash_bank_operations', 'profiles', 'employees',
  'job_descriptions', 'mbti_assessments', 'attendance_logs', 'work_schedules',
  'leave_requests', 'overtime_requests', 'mission_requests', 'price_lists', 'web_forms',
  'counterparty_bot_groups', 'instagram_conversations', 'instagram_interaction_events',
  'expense_documents', 'assets', 'employee_advances', 'employee_bonus_requests',
  'employee_penalty_requests', 'payroll_slips', 'employee_contracts',
  'recruitment_applicants', 'surveys', 'cms_blog_posts', 'cms_tutorial_posts',
  'cms_tutorial_series', 'cms_categories', 'cms_tags', 'cms_pages'
]::text[]) as configured(module_id)
on conflict (module_id) do nothing;

create table if not exists public.global_search_document_backfill_state (
  migration_key text primary key,
  completed_at timestamptz not null default now()
);

alter table public.global_search_document_backfill_state enable row level security;
revoke all on table public.global_search_document_backfill_state from public, anon, authenticated;

-- فقط فیلدهای لازم برای تطبیق جست‌وجو در read model ذخیره می‌شوند؛ نه کل رکورد اصلی.
create or replace function public.global_search_upsert_document(
  p_module_id text,
  p_record jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module_id text := lower(trim(coalesce(p_module_id, '')));
  v_record jsonb := jsonb_strip_nulls(coalesce(p_record, '{}'::jsonb));
  v_org_id uuid := public.kalam_try_uuid(v_record ->> 'org_id');
  v_record_id text := nullif(trim(coalesce(v_record ->> 'id', '')), '');
  v_document record;
  v_search_payload jsonb := '{}'::jsonb;
  v_created_at timestamptz;
begin
  if v_module_id = '' or v_org_id is null or v_record_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.global_search_module_registry registry
    where registry.module_id = v_module_id
      and registry.is_enabled
  ) then
    delete from public.global_search_documents
    where org_id = v_org_id
      and module_id = v_module_id
      and record_id = v_record_id;
    return;
  end if;

  select *
    into v_document
  from public.global_search_build_index_document(v_module_id, v_record);

  if coalesce(array_length(v_document.matched_keys, 1), 0) = 0 then
    delete from public.global_search_documents
    where org_id = v_org_id
      and module_id = v_module_id
      and record_id = v_record_id;
    return;
  end if;

  select coalesce(jsonb_object_agg(field_key, v_record -> field_key), '{}'::jsonb)
    into v_search_payload
  from unnest(v_document.matched_keys) as matched(field_key)
  where v_record ? field_key;

  begin
    v_created_at := nullif(trim(coalesce(v_record ->> 'created_at', '')), '')::timestamptz;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      v_created_at := null;
  end;

  insert into public.global_search_documents (
    org_id, module_id, record_id, title, subtitle, search_text, phone_digits,
    matched_keys, payload, assignee_user_id, assignee_role_id, assignee_type,
    created_at, updated_at
  )
  values (
    v_org_id,
    v_module_id,
    v_record_id,
    coalesce(v_document.title, '[بدون عنوان]'),
    coalesce(v_document.subtitle, ''),
    coalesce(v_document.search_text, ''),
    coalesce(v_document.phone_digits, ''),
    coalesce(v_document.matched_keys, array[]::text[]),
    v_search_payload,
    v_document.assignee_user_id,
    v_document.assignee_role_id,
    v_document.assignee_type,
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
      updated_at = excluded.updated_at;
end;
$$;

create or replace function public.global_search_delete_document(
  p_module_id text,
  p_record jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.kalam_try_uuid(coalesce(p_record, '{}'::jsonb) ->> 'org_id');
  v_record_id text := nullif(trim(coalesce(coalesce(p_record, '{}'::jsonb) ->> 'id', '')), '');
begin
  if v_org_id is null or v_record_id is null then
    return;
  end if;

  delete from public.global_search_documents
  where org_id = v_org_id
    and module_id = lower(trim(coalesce(p_module_id, '')))
    and record_id = v_record_id;
end;
$$;

create or replace function public.global_search_sync_index_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_TABLE_SCHEMA <> 'public'
    or TG_TABLE_NAME in ('global_search_index', 'global_search_documents') then
    return coalesce(NEW, OLD);
  end if;

  if TG_OP = 'DELETE' then
    perform public.global_search_delete_document(TG_TABLE_NAME, to_jsonb(OLD));
    return OLD;
  end if;

  perform public.global_search_upsert_document(TG_TABLE_NAME, to_jsonb(NEW));
  return NEW;
end;
$$;

-- Trigger تنها روی جدول‌های محصولی attach می‌شود؛ جدول‌های لاگ و صف هیچ‌وقت وارد جست‌وجو نمی‌شوند.
do $$
declare
  tenant_table record;
begin
  for tenant_table in
    select tables.table_name, registry.is_enabled
    from information_schema.tables tables
    left join public.global_search_module_registry registry
      on registry.module_id = tables.table_name
    where tables.table_schema = 'public'
      and tables.table_type = 'BASE TABLE'
      and tables.table_name not in ('global_search_index', 'global_search_documents')
      and exists (
        select 1 from information_schema.columns columns
        where columns.table_schema = 'public' and columns.table_name = tables.table_name and columns.column_name = 'org_id'
      )
      and exists (
        select 1 from information_schema.columns columns
        where columns.table_schema = 'public' and columns.table_name = tables.table_name and columns.column_name = 'id'
      )
  loop
    execute format('drop trigger if exists trg_global_search_index_sync on public.%I', tenant_table.table_name);
    execute format('drop trigger if exists trg_global_search_document_sync on public.%I', tenant_table.table_name);

    if tenant_table.is_enabled then
      execute format(
        'create trigger trg_global_search_document_sync after insert or update or delete on public.%I for each row execute function public.global_search_sync_index_row()',
        tenant_table.table_name
      );
    end if;
  end loop;
end
$$;

-- هم‌زمان با backfill، تغییرهای تازه مستقیماً به جدول جدید می‌روند. مقدارهای قدیمی هرگز
-- دادهٔ جدیدتر را overwrite نمی‌کنند.
do $$
begin
  if not exists (
    select 1
    from public.global_search_document_backfill_state
    where migration_key = 'phase457_compact_documents_from_legacy_index'
  ) then
    insert into public.global_search_documents (
      org_id, module_id, record_id, title, subtitle, search_text, phone_digits,
      matched_keys, payload, assignee_user_id, assignee_role_id, assignee_type,
      created_at, updated_at
    )
    select
      legacy.org_id,
      legacy.module_id,
      legacy.record_id,
      legacy.title,
      legacy.subtitle,
      legacy.search_text,
      legacy.phone_digits,
      legacy.matched_keys,
      coalesce((
        select jsonb_object_agg(field_key, legacy.payload -> field_key)
        from unnest(legacy.matched_keys) as matched(field_key)
        where legacy.payload ? field_key
      ), '{}'::jsonb),
      legacy.assignee_user_id,
      legacy.assignee_role_id,
      legacy.assignee_type,
      legacy.created_at,
      legacy.updated_at
    from public.global_search_index legacy
    join public.global_search_module_registry registry
      on registry.module_id = legacy.module_id
     and registry.is_enabled
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
        updated_at = excluded.updated_at
    where excluded.updated_at >= public.global_search_documents.updated_at;

    insert into public.global_search_document_backfill_state (migration_key)
    values ('phase457_compact_documents_from_legacy_index');
  end if;
end
$$;

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
begin
  if v_org_id is null then
    return 0;
  end if;

  for v_module in
    select registry.module_id
    from public.global_search_module_registry registry
    where registry.is_enabled
      and (p_modules is null or registry.module_id = any(p_modules))
      and to_regclass(format('public.%I', registry.module_id)) is not null
      and exists (
        select 1 from information_schema.columns columns
        where columns.table_schema = 'public' and columns.table_name = registry.module_id and columns.column_name = 'org_id'
      )
  loop
    delete from public.global_search_documents
    where org_id = v_org_id
      and module_id = v_module;

    execute format(
      'select public.global_search_upsert_document(%L, to_jsonb(source_row)) from public.%I source_row where source_row.org_id = $1',
      v_module,
      v_module
    ) using v_org_id;
    get diagnostics v_row_count = row_count;
    v_inserted := v_inserted + coalesce(v_row_count, 0);
  end loop;

  return v_inserted;
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
stable
security definer
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
begin
  if v_user_id is null or v_org_id is null or length(v_query) < 2 then
    return;
  end if;

  select profile.role_id, coalesce(role.permissions, '{}'::jsonb)
    into v_role_id, v_permissions
  from public.profiles profile
  left join public.org_roles role
    on role.id = profile.role_id
   and role.org_id = profile.org_id
  where profile.id = v_user_id
    and profile.org_id = v_org_id
  limit 1;

  if not found then
    return;
  end if;

  select coalesce(array_agg(role.id::text), array[]::text[])
    into v_allowed_role_ids
  from public.org_roles role
  where role.org_id = v_org_id
    and (role.id = v_role_id or role.parent_id = v_role_id);

  select coalesce(array_agg(profile.id::text), array[]::text[])
    into v_allowed_user_ids
  from public.profiles profile
  where profile.org_id = v_org_id
    and (profile.id = v_user_id or profile.role_id::text = any(v_allowed_role_ids));

  return query execute $search$
    with requested_modules as (
      select distinct requested.module_id
      from unnest($1::text[]) as requested(module_id)
      join public.global_search_module_registry registry
        on registry.module_id = requested.module_id
       and registry.is_enabled
      where requested.module_id ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'
    ),
    permitted_modules as (
      select
        requested.module_id,
        coalesce($2::jsonb -> requested.module_id, '{}'::jsonb) as module_permissions,
        coalesce(
          nullif(($2::jsonb -> requested.module_id ->> 'record_scope'), ''),
          case when coalesce(($2::jsonb -> requested.module_id ->> 'view')::boolean, true) then 'all' else 'own' end
        ) as record_scope
      from requested_modules requested
      where not (
        coalesce(($2::jsonb -> requested.module_id ->> 'view')::boolean, true) = false
        and coalesce(
          nullif(($2::jsonb -> requested.module_id ->> 'record_scope'), ''),
          case when coalesce(($2::jsonb -> requested.module_id ->> 'view')::boolean, true) then 'all' else 'own' end
        ) = 'all'
      )
    ),
    candidate_rows as materialized (
      select
        indexed.module_id,
        indexed.record_id,
        indexed.title,
        indexed.subtitle,
        indexed.payload,
        indexed.matched_keys,
        indexed.phone_digits,
        indexed.created_at,
        permitted.module_permissions
      from public.global_search_documents indexed
      join permitted_modules permitted on permitted.module_id = indexed.module_id
      where indexed.org_id = $3::uuid
        and (
          lower(public.global_search_normalize_text(indexed.search_text)) like '%' || $8 || '%'
          or exists (
            select 1
            from unnest($9::text[]) as phone_variant(value)
            where phone_variant.value <> ''
              and indexed.phone_digits like '%' || phone_variant.value || '%'
          )
        )
        and (
          permitted.record_scope = 'all'
          or (
            permitted.record_scope = 'own'
            and coalesce(indexed.assignee_type, 'user') <> 'role'
            and indexed.assignee_user_id = $4::text
          )
          or (
            permitted.record_scope = 'team'
            and (
              (coalesce(indexed.assignee_type, 'user') <> 'role' and indexed.assignee_user_id = $4::text)
              or (coalesce(indexed.assignee_type, 'user') = 'role' and indexed.assignee_role_id = $5::text)
            )
          )
          or (
            permitted.record_scope = 'subtree'
            and (
              (coalesce(indexed.assignee_type, 'user') <> 'role' and indexed.assignee_user_id = any($6::text[]))
              or (coalesce(indexed.assignee_type, 'user') = 'role' and indexed.assignee_role_id = any($7::text[]))
            )
          )
        )
    ),
    matched_rows as materialized (
      select
        candidate.module_id,
        candidate.record_id,
        candidate.title,
        candidate.subtitle,
        candidate.created_at,
        fields.matched_fields,
        (
          case
            when lower(public.global_search_normalize_text(candidate.title)) = $8 then 80
            when lower(public.global_search_normalize_text(candidate.title)) like $8 || '%' then 28
            when lower(public.global_search_normalize_text(candidate.title)) like '%' || $8 || '%' then 10
            else 0
          end
          + case
              when lower(public.global_search_normalize_text(candidate.subtitle)) = $8 then 24
              when lower(public.global_search_normalize_text(candidate.subtitle)) like $8 || '%' then 10
              when lower(public.global_search_normalize_text(candidate.subtitle)) like '%' || $8 || '%' then 4
              else 0
            end
          + case when exists (
              select 1
              from unnest($9::text[]) as phone_variant(value)
              where phone_variant.value <> ''
                and candidate.phone_digits like '%' || phone_variant.value || '%'
            ) then 24 else 0 end
          + coalesce(array_length(candidate.matched_keys, 1), 0)
        )::numeric as score
      from candidate_rows candidate
      cross join lateral (
        select coalesce(jsonb_agg(match_key), '[]'::jsonb) as matched_fields
        from unnest(candidate.matched_keys) as matched(match_key)
        where coalesce((candidate.module_permissions -> 'fields' ->> match_key)::boolean, true)
          and (
            lower(public.global_search_normalize_text(coalesce(candidate.payload ->> match_key, ''))) like '%' || $8 || '%'
            or exists (
              select 1
              from unnest($9::text[]) as phone_variant(value)
              where phone_variant.value <> ''
                and public.global_search_phone_digits(coalesce(candidate.payload ->> match_key, '')) like '%' || phone_variant.value || '%'
            )
          )
      ) fields
      where jsonb_array_length(fields.matched_fields) > 0
    ),
    ranked_rows as (
      select
        matched.*,
        row_number() over (
          partition by matched.module_id
          order by matched.score desc, matched.created_at desc nulls last, matched.record_id
        ) as module_rank
      from matched_rows matched
    )
    select
      ranked.module_id,
      ranked.record_id,
      ranked.title,
      ranked.subtitle,
      ranked.matched_fields,
      jsonb_build_object('id', ranked.record_id, 'created_at', ranked.created_at) as payload,
      ranked.score,
      ranked.created_at
    from ranked_rows ranked
    where ranked.module_rank > $10::integer
      and ranked.module_rank <= ($10::integer + $11::integer)
  $search$
  using coalesce(p_modules, array[]::text[]), v_permissions, v_org_id, v_user_id, v_role_id,
    v_allowed_user_ids, v_allowed_role_ids, v_query, v_phone_variants, v_offset, v_limit;
end;
$$;

revoke all on function public.global_search_upsert_document(text, jsonb) from public, anon, authenticated;
revoke all on function public.global_search_delete_document(text, jsonb) from public, anon, authenticated;
revoke all on function public.global_search_sync_index_row() from public, anon, authenticated;
revoke all on function public.refresh_global_search_index(text[]) from public, anon;
revoke all on function public.global_search_records(text, text[], integer, integer) from public, anon;
grant execute on function public.refresh_global_search_index(text[]) to authenticated, service_role;
grant execute on function public.global_search_records(text, text[], integer, integer) to authenticated, service_role;

analyze public.global_search_documents;
notify pgrst, 'reload schema';
