-- جستجوی سراسری سریع برای همه ماژول‌های tenant با اعمال دسترسی نقش.
-- این migration عمداً فقط از ایندکس tenant-safe استفاده می‌کند و داده خام رکورد را به مرورگر برنمی‌گرداند.

begin;

alter table public.global_search_index enable row level security;

drop policy if exists p_global_search_index_org_select on public.global_search_index;
revoke all on public.global_search_index from public;
revoke select on public.global_search_index from authenticated;
grant select on public.global_search_index to service_role;

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
  v_requested_modules text[] := coalesce(p_modules, array[]::text[]);
  v_live_modules text[] := array[]::text[];
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

  -- Dynamic SQL keeps output-column names out of the PL/pgSQL namespace and
  -- prevents the historic module_id ambiguity (SQLSTATE 42702).
  return query execute $search$
    with requested_modules as (
      select distinct requested.module_id
      from unnest($1::text[]) as requested(module_id)
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
    matched_rows as (
      select
        indexed.module_id,
        indexed.record_id,
        indexed.title,
        indexed.subtitle,
        (
          select coalesce(jsonb_agg(match_key), '[]'::jsonb)
          from unnest(indexed.matched_keys) as matched(match_key)
          where coalesce((permitted.module_permissions -> 'fields' ->> match_key)::boolean, true)
            and (
              lower(public.global_search_normalize_text(coalesce(indexed.payload ->> match_key, ''))) like '%' || $8 || '%'
              or exists (
                select 1
                from unnest($9::text[]) as phone_variant(value)
                where phone_variant.value <> ''
                  and public.global_search_phone_digits(coalesce(indexed.payload ->> match_key, '')) like '%' || phone_variant.value || '%'
              )
            )
        ) as matched_fields,
        (
          case
            when lower(public.global_search_normalize_text(indexed.title)) = $8 then 80
            when lower(public.global_search_normalize_text(indexed.title)) like $8 || '%' then 28
            when lower(public.global_search_normalize_text(indexed.title)) like '%' || $8 || '%' then 10
            else 0
          end
          + case
              when lower(public.global_search_normalize_text(indexed.subtitle)) = $8 then 24
              when lower(public.global_search_normalize_text(indexed.subtitle)) like $8 || '%' then 10
              when lower(public.global_search_normalize_text(indexed.subtitle)) like '%' || $8 || '%' then 4
              else 0
            end
          + case when exists (
              select 1
              from unnest($9::text[]) as phone_variant(value)
              where phone_variant.value <> ''
                and indexed.phone_digits like '%' || phone_variant.value || '%'
            ) then 24 else 0 end
        )::numeric as score,
        indexed.created_at,
        row_number() over (
          partition by indexed.module_id
          order by
            (
              case
                when lower(public.global_search_normalize_text(indexed.title)) = $8 then 80
                when lower(public.global_search_normalize_text(indexed.title)) like $8 || '%' then 28
                when lower(public.global_search_normalize_text(indexed.title)) like '%' || $8 || '%' then 10
                else 0
              end
              + case
                  when lower(public.global_search_normalize_text(indexed.subtitle)) = $8 then 24
                  when lower(public.global_search_normalize_text(indexed.subtitle)) like $8 || '%' then 10
                  when lower(public.global_search_normalize_text(indexed.subtitle)) like '%' || $8 || '%' then 4
                  else 0
                end
              + case when exists (
                  select 1
                  from unnest($9::text[]) as phone_variant(value)
                  where phone_variant.value <> ''
                    and indexed.phone_digits like '%' || phone_variant.value || '%'
                ) then 24 else 0 end
              + coalesce(array_length(indexed.matched_keys, 1), 0)
            ) desc,
            indexed.created_at desc nulls last,
            indexed.record_id
        ) as module_rank
      from public.global_search_index indexed
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
    )
    select
      matched.module_id,
      matched.record_id,
      matched.title,
      matched.subtitle,
      matched.matched_fields,
      jsonb_build_object('id', matched.record_id, 'created_at', matched.created_at) as payload,
      matched.score + jsonb_array_length(matched.matched_fields)::numeric as score,
      matched.created_at
    from matched_rows matched
    where jsonb_array_length(matched.matched_fields) > 0
      and matched.module_rank > $10::integer
      and matched.module_rank <= ($10::integer + $11::integer)
  $search$
  using v_requested_modules, v_permissions, v_org_id, v_user_id, v_role_id,
    v_allowed_user_ids, v_allowed_role_ids, v_query, v_phone_variants, v_offset, v_limit;

  select coalesce(array_agg(requested.module_id), array[]::text[])
    into v_live_modules
  from unnest(v_requested_modules) as requested(module_id)
  where requested.module_id ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'
    and not (
      coalesce((v_permissions -> requested.module_id ->> 'view')::boolean, true) = false
      and coalesce(
        nullif((v_permissions -> requested.module_id ->> 'record_scope'), ''),
        case when coalesce((v_permissions -> requested.module_id ->> 'view')::boolean, true) then 'all' else 'own' end
      ) = 'all'
    )
    and not exists (
      select 1
      from public.global_search_index indexed
      where indexed.org_id = v_org_id
        and indexed.module_id = requested.module_id
      limit 1
    );

  if coalesce(array_length(v_live_modules, 1), 0) > 0 then
    return query
    select live.module_id, live.record_id, live.title, live.subtitle,
      live.matched_fields, jsonb_build_object('id', live.record_id, 'created_at', live.created_at),
      live.score, live.created_at
    from public.global_search_records_live(p_query, v_live_modules, p_limit_per_module, p_offset) as live;
  end if;
end;
$$;

revoke all on function public.global_search_records(text, text[], integer, integer) from public;
grant execute on function public.global_search_records(text, text[], integer, integer) to authenticated, service_role;

do $$
declare
  tenant_table record;
begin
  for tenant_table in
    select tables.table_name
    from information_schema.tables tables
    where tables.table_schema = 'public'
      and tables.table_type = 'BASE TABLE'
      and tables.table_name <> 'global_search_index'
      and exists (
        select 1 from information_schema.columns columns
        where columns.table_schema = 'public' and columns.table_name = tables.table_name and columns.column_name = 'org_id'
      )
      and exists (
        select 1 from information_schema.columns columns
        where columns.table_schema = 'public' and columns.table_name = tables.table_name and columns.column_name = 'id'
      )
      and exists (
        select 1 from information_schema.columns columns
        where columns.table_schema = 'public' and columns.table_name = tables.table_name
          and columns.column_name ~* '(name|title|code|number|phone|mobile|email|subject|description|notes|status|city|address|category|type|identifier|external|indicator|department|goal|body|position|group|catalog|manual|legacy|accounting|national)'
      )
  loop
    execute format('drop trigger if exists trg_global_search_index_sync on public.%I', tenant_table.table_name);
    execute format(
      'create trigger trg_global_search_index_sync after insert or update or delete on public.%I for each row execute function public.global_search_sync_index_row()',
      tenant_table.table_name
    );
  end loop;
end
$$;

commit;
