-- =====================================================
-- TazeSystem - Phase 346: Central identity picker + role icons
-- Additive, tenant-safe and backward-compatible
-- =====================================================

begin;

create extension if not exists pg_trgm;

alter table public.org_roles
  add column if not exists icon_key text not null default 'team';

create index if not exists idx_profiles_identity_search_trgm
  on public.profiles using gin (
    (translate(lower(coalesce(full_name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(mobile_1, '') || ' ' || coalesce(job_title, '')), 'يىك', 'ییک')) gin_trgm_ops
  );

create index if not exists idx_org_roles_identity_search_trgm
  on public.org_roles using gin ((translate(lower(coalesce(title, '')), 'يىك', 'ییک')) gin_trgm_ops);

create index if not exists idx_chat_groups_identity_search_trgm
  on public.chat_groups using gin ((translate(lower(coalesce(name, '')), 'يىك', 'ییک')) gin_trgm_ops);

create or replace function public.search_org_identity_options(
  p_query text default null,
  p_scopes text[] default array['user', 'role']::text[],
  p_limit_per_scope integer default 50,
  p_offset integer default 0,
  p_exact_tokens text[] default null
)
returns table (
  kind text,
  id uuid,
  token text,
  label text,
  subtitle text,
  avatar_url text,
  icon_key text,
  role_id uuid,
  hierarchy_rank bigint,
  is_active boolean,
  search_text text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with recursive
  context as (
    select public.current_org_id() as org_id,
           greatest(1, least(coalesce(p_limit_per_scope, 50), 100)) as page_size,
           greatest(0, coalesce(p_offset, 0)) as page_offset,
           nullif(translate(lower(btrim(coalesce(p_query, ''))), 'يىك', 'ییک'), '') as search_term
  ),
  scoped_roles as (
    select r.*
    from public.org_roles r
    cross join context c
    where c.org_id is not null
      and r.org_id = c.org_id
  ),
  role_tree as (
    select
      r.id,
      r.parent_id,
      array[r.id]::uuid[] as visited,
      (lpad((coalesce(r.sort_order, 0) + 1000000000)::text, 10, '0') || ':' || lower(coalesce(r.title, '')) || ':' || r.id::text) as sort_path
    from scoped_roles r
    where r.parent_id is null
       or not exists (select 1 from scoped_roles parent where parent.id = r.parent_id)

    union all

    select
      child.id,
      child.parent_id,
      parent.visited || child.id,
      parent.sort_path || '/' || lpad((coalesce(child.sort_order, 0) + 1000000000)::text, 10, '0') || ':' || lower(coalesce(child.title, '')) || ':' || child.id::text
    from scoped_roles child
    join role_tree parent on parent.id = child.parent_id
    where not child.id = any(parent.visited)
  ),
  role_order as (
    select id, row_number() over (order by sort_path, id)::bigint as hierarchy_rank
    from role_tree
  ),
  raw_options as (
    select
      'user'::text as kind,
      p.id,
      'user:' || p.id::text as token,
      coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), nullif(btrim(p.mobile_1), ''), 'کاربر بدون نام') as label,
      coalesce(nullif(btrim(p.job_title), ''), nullif(btrim(r.title), '')) as subtitle,
      p.avatar_url,
      null::text as icon_key,
      p.role_id,
      coalesce(ro.hierarchy_rank, 9223372036854775806::bigint) as hierarchy_rank,
      coalesce(p.is_active, true) as is_active,
      translate(lower(coalesce(p.full_name, '') || ' ' || coalesce(p.email, '') || ' ' || coalesce(p.mobile_1, '') || ' ' || coalesce(p.job_title, '') || ' ' || coalesce(r.title, '')), 'يىك', 'ییک') as search_text
    from public.profiles p
    cross join context c
    left join scoped_roles r on r.id = p.role_id
    left join role_order ro on ro.id = p.role_id
    where c.org_id is not null
      and p.org_id = c.org_id
      and 'user' = any(coalesce(p_scopes, array['user', 'role']::text[]))

    union all

    select
      'role'::text,
      r.id,
      'role:' || r.id::text,
      coalesce(nullif(btrim(r.title), ''), 'نقش بدون عنوان'),
      'جایگاه سازمانی'::text,
      null::text,
      coalesce(nullif(btrim(r.icon_key), ''), 'team'),
      null::uuid,
      coalesce(ro.hierarchy_rank, 9223372036854775806::bigint),
      true,
      translate(lower(coalesce(r.title, '')), 'يىك', 'ییک')
    from scoped_roles r
    left join role_order ro on ro.id = r.id
    where 'role' = any(coalesce(p_scopes, array['user', 'role']::text[]))

    union all

    select
      'chat_group'::text,
      g.id,
      'chat_group:' || g.id::text,
      coalesce(nullif(btrim(g.name), ''), 'گروه داخلی'),
      'گروه داخلی'::text,
      null::text,
      null::text,
      null::uuid,
      9223372036854775806::bigint,
      true,
      translate(lower(coalesce(g.name, '')), 'يىك', 'ییک')
    from public.chat_groups g
    cross join context c
    where c.org_id is not null
      and g.org_id = c.org_id
      and 'chat_group' = any(coalesce(p_scopes, array['user', 'role']::text[]))
  ),
  filtered as (
    select raw.*
    from raw_options raw
    cross join context c
    where
      case
        when coalesce(cardinality(p_exact_tokens), 0) > 0 then raw.token = any(p_exact_tokens)
        else raw.is_active = true
          and (c.search_term is null or raw.search_text like '%' || c.search_term || '%')
      end
  ),
  ranked as (
    select
      filtered.*,
      count(*) over (partition by filtered.kind) as total_count,
      row_number() over (
        partition by filtered.kind
        order by filtered.hierarchy_rank, translate(lower(filtered.label), 'يىك', 'ییک'), filtered.id
      ) as row_index
    from filtered
  )
  select
    ranked.kind,
    ranked.id,
    ranked.token,
    ranked.label,
    ranked.subtitle,
    ranked.avatar_url,
    ranked.icon_key,
    ranked.role_id,
    ranked.hierarchy_rank,
    ranked.is_active,
    ranked.search_text,
    ranked.total_count
  from ranked
  cross join context c
  where coalesce(cardinality(p_exact_tokens), 0) > 0
     or ranked.row_index between c.page_offset + 1 and c.page_offset + c.page_size
  order by
    case ranked.kind when 'user' then 0 when 'role' then 1 else 2 end,
    ranked.hierarchy_rank,
    translate(lower(ranked.label), 'يىك', 'ییک'),
    ranked.id;
$$;

revoke all on function public.search_org_identity_options(text, text[], integer, integer, text[]) from public;
revoke all on function public.search_org_identity_options(text, text[], integer, integer, text[]) from anon;
grant execute on function public.search_org_identity_options(text, text[], integer, integer, text[]) to authenticated;

notify pgrst, 'reload schema';

commit;
