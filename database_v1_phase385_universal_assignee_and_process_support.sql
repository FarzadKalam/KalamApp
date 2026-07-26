-- =====================================================
-- KalamApp - Phase 385: Universal assignee and process support
-- Date: 2026-07-26
-- Purpose:
--   Standardize assignment and execution-process fields for the remaining
--   tenant, SaaS-admin, and CMS modules. CMS public reads are tightened so
--   process runtime data is never exposed through the public API.
-- =====================================================

begin;

-- ─────────────────────────────────────────────────────
-- ۱. ستون‌ها و ایندکس‌های ماژول‌های باقی‌مانده
-- ─────────────────────────────────────────────────────
do $$
declare
  v_table text;
  v_tables text[] := array[
    'profiles',
    'mbti_assessments',
    'employee_bonus_requests',
    'employee_penalty_requests',
    'saas_onboarding_requests',
    'saas_org_settings',
    'saas_user_announcements',
    'cms_blog_posts',
    'cms_tutorial_posts',
    'cms_tutorial_series',
    'cms_categories',
    'cms_tags',
    'cms_pages'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'Required table public.% does not exist', v_table;
    end if;

    execute format(
      'alter table public.%I
        add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
        add column if not exists assignee_type text check (assignee_type in (''user'', ''role'')),
        add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
        add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
        add column if not exists execution_process_draft jsonb not null default ''{}''::jsonb',
      v_table
    );

    execute format(
      'create index if not exists %I on public.%I (assignee_id, assignee_role_id)',
      'idx_' || v_table || '_assignee',
      v_table
    );
    execute format(
      'create index if not exists %I on public.%I (process_template_id) where process_template_id is not null',
      'idx_' || v_table || '_process_template',
      v_table
    );
  end loop;
end
$$;

-- ─────────────────────────────────────────────────────
-- ۲. منبع سازمان‌های SaaS: هر دو نوع رکورد باید فیلدهای مشترک داشته باشند
-- ─────────────────────────────────────────────────────
create or replace view public.saas_admin_org_candidates_view
with (security_invoker = true) as
with owner_profiles as (
  select distinct on (p.org_id)
    p.org_id,
    p.full_name,
    p.email
  from public.profiles p
  left join public.org_roles ro on ro.id = p.role_id
  where (ro.permissions->'__saas_admin') is null
  order by p.org_id, p.created_at asc
)
select *
from (
  select
    o.id                                        as id,
    'org'::text                                 as source_kind,
    o.id                                        as source_id,
    o.id                                        as org_id,
    s.request_id                                as request_id,
    o.name                                      as org_name,
    coalesce(nullif(trim(s.owner_name), ''), nullif(trim(op.full_name), ''), nullif(trim(r.full_name), '')) as owner_name,
    coalesce(nullif(trim(s.owner_email), ''), nullif(trim(op.email), ''), nullif(trim(r.email), '')) as owner_email,
    coalesce(nullif(trim(s.primary_contact_mobile), ''), nullif(trim(r.mobile), '')) as primary_contact_mobile,
    s.slug,
    s.status,
    s.plan_code,
    s.is_demo,
    s.is_readonly,
    s.trial_ends_at,
    s.resolved_host,
    s.dns_status,
    s.dns_last_error,
    s.arvan_record_id,
    s.dns_attempt_count,
    s.provisioning_source,
    s.created_at                                as provisioned_at,
    'provisioned'::text                         as provision_state,
    r.industry,
    r.employee_count_band,
    r.discovery_source,
    '[]'::jsonb                                 as tags,
    s.process_template_id,
    coalesce(s.execution_process_draft, '{}'::jsonb) as execution_process_draft,
    coalesce(s.created_at, o.created_at)        as created_at,
    coalesce(s.updated_at, o.updated_at)        as updated_at,
    null::uuid                                  as created_by,
    null::uuid                                  as updated_by,
    s.assignee_type,
    s.assignee_id,
    s.assignee_role_id
  from public.saas_org_settings s
  join public.organizations o on o.id = s.org_id
  left join public.saas_onboarding_requests r on r.id = s.request_id
  left join owner_profiles op on op.org_id = o.id

  union all

  select
    r.id                                        as id,
    'request'::text                             as source_kind,
    r.id                                        as source_id,
    null::uuid                                  as org_id,
    r.id                                        as request_id,
    coalesce(nullif(trim(r.organization_name), ''), nullif(trim(r.business_name), ''), nullif(trim(r.full_name), ''), 'درخواست دمو') as org_name,
    nullif(trim(r.full_name), '')               as owner_name,
    nullif(trim(r.email), '')                   as owner_email,
    nullif(trim(r.mobile), '')                  as primary_contact_mobile,
    nullif(public.normalize_saas_slug(r.requested_slug), '') as slug,
    r.status,
    null::text                                  as plan_code,
    coalesce(r.is_demo_request, true)           as is_demo,
    false                                       as is_readonly,
    null::timestamptz                           as trial_ends_at,
    null::text                                  as resolved_host,
    'pending'::text                             as dns_status,
    r.failure_message                           as dns_last_error,
    null::text                                  as arvan_record_id,
    0::integer                                  as dns_attempt_count,
    'demo_request'::text                        as provisioning_source,
    r.created_at                                as provisioned_at,
    'request_pending'::text                     as provision_state,
    r.industry,
    r.employee_count_band,
    r.discovery_source,
    coalesce(r.tags, '[]'::jsonb)               as tags,
    r.process_template_id,
    coalesce(r.execution_process_draft, '{}'::jsonb) as execution_process_draft,
    r.created_at,
    r.updated_at,
    null::uuid                                  as created_by,
    null::uuid                                  as updated_by,
    r.assignee_type,
    r.assignee_id,
    r.assignee_role_id
  from public.saas_onboarding_requests r
  where r.org_id is null
    and not exists (
      select 1
      from public.saas_org_settings s
      where s.request_id = r.id
    )
) scoped
where public.current_user_has_saas_admin_permission();

grant select on public.saas_admin_org_candidates_view to authenticated;

-- ─────────────────────────────────────────────────────
-- ۳. view کاربران SaaS از ستون‌های واقعی پروفایل استفاده می‌کند
-- ─────────────────────────────────────────────────────
drop view if exists public.saas_admin_users_view;
drop function if exists public.saas_admin_user_audit_rows();

create function public.saas_admin_user_audit_rows()
returns table (
  id uuid,
  profile_exists boolean,
  auth_exists boolean,
  full_name text,
  email text,
  mobile text,
  org_id uuid,
  org_name text,
  org_slug text,
  role_id uuid,
  role_title text,
  software_role text,
  is_active boolean,
  is_demo boolean,
  phone_confirmed boolean,
  audit_status text,
  issues text,
  tags jsonb,
  assignee_type text,
  assignee_id uuid,
  assignee_role_id uuid,
  process_template_id uuid,
  execution_process_draft jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with audited as (
    select
      coalesce(u.id, p.id) as id,
      p.id is not null as profile_exists,
      u.id is not null as auth_exists,
      nullif(trim(coalesce(p.full_name, u.raw_user_meta_data->>'full_name', '')), '') as full_name,
      nullif(trim(coalesce(p.email, u.email, '')), '') as email,
      nullif(trim(coalesce(p.mobile_1, p.mobile, u.phone, '')), '') as mobile,
      p.org_id,
      o.name as org_name,
      o.slug as org_slug,
      p.role_id,
      r.title as role_title,
      p.role as software_role,
      coalesce(p.is_active, false) as is_active,
      coalesce(s.is_demo, false) as is_demo,
      u.phone_confirmed_at is not null as phone_confirmed,
      array_remove(array[
        case when u.id is not null and p.id is null then 'حساب ورود بدون پروفایل' end,
        case when p.id is not null and u.id is null then 'پروفایل بدون حساب ورود' end,
        case when p.id is not null and nullif(trim(coalesce(p.full_name, '')), '') is null then 'نام ثبت نشده' end,
        case when p.id is not null and p.org_id is null then 'سازمان ندارد' end,
        case when p.id is not null and p.role_id is null then 'نقش سازمانی ندارد' end,
        case when p.role_id is not null and r.org_id is distinct from p.org_id then 'نقش متعلق به سازمان دیگری است' end,
        case when p.id is not null and coalesce(p.is_active, false) = false then 'کاربر غیرفعال' end,
        case when nullif(trim(coalesce(p.email, '')), '') is not null
               and nullif(trim(coalesce(u.email, '')), '') is not null
               and lower(trim(p.email)) <> lower(trim(u.email)) then 'ایمیل پروفایل با حساب ورود متفاوت است' end,
        case when nullif(trim(coalesce(p.mobile_1, p.mobile, '')), '') is not null
               and nullif(trim(coalesce(u.phone, '')), '') is not null
               and public.normalize_demo_mobile(coalesce(p.mobile_1, p.mobile))
                   <> public.normalize_demo_mobile(u.phone) then 'موبایل پروفایل با حساب ورود متفاوت است' end,
        case when u.phone is not null and u.phone_confirmed_at is null then 'ورود پیامکی تایید نشده' end
      ], null) as issue_list,
      coalesce(p.tags, '[]'::jsonb) as tags,
      p.assignee_type,
      p.assignee_id,
      p.assignee_role_id,
      p.process_template_id,
      coalesce(p.execution_process_draft, '{}'::jsonb) as execution_process_draft,
      coalesce(p.created_at, u.created_at) as created_at,
      p.updated_at as updated_at
    from auth.users u
    full join public.profiles p on p.id = u.id
    left join public.organizations o on o.id = p.org_id
    left join public.org_roles r on r.id = p.role_id
    left join public.saas_org_settings s on s.org_id = p.org_id
    where public.current_user_has_saas_admin_permission()
  )
  select
    id,
    profile_exists,
    auth_exists,
    full_name,
    email,
    mobile,
    org_id,
    org_name,
    org_slug,
    role_id,
    role_title,
    software_role,
    is_active,
    is_demo,
    phone_confirmed,
    case
      when not auth_exists or not profile_exists
        or issues like '%متفاوت است%'
        or issues like '%سازمان دیگری%'
      then 'critical'
      when issues like '%سازمان ندارد%'
        or issues like '%نقش سازمانی ندارد%'
        or issues like '%نام ثبت نشده%'
        or issues like '%غیرفعال%'
      then 'repair_required'
      when issues like '%ورود پیامکی تایید نشده%'
      then 'warning'
      else 'healthy'
    end as audit_status,
    coalesce(array_to_string(issue_list, ' | '), 'صحیح') as issues,
    tags,
    assignee_type,
    assignee_id,
    assignee_role_id,
    process_template_id,
    execution_process_draft,
    created_at,
    updated_at
  from (
    select a.*, array_to_string(a.issue_list, ' | ') as issues
    from audited a
  ) listed
$$;

revoke all on function public.saas_admin_user_audit_rows() from public;
grant execute on function public.saas_admin_user_audit_rows() to authenticated;

create view public.saas_admin_users_view
with (security_invoker = true) as
select *
from public.saas_admin_user_audit_rows();

grant select on public.saas_admin_users_view to authenticated;

-- ─────────────────────────────────────────────────────
-- ۴. ذخیرهٔ امن مسئول و فرآیند در منابع ترکیبی SaaS
-- ─────────────────────────────────────────────────────
create or replace function public.admin_saas_update_candidate_runtime(
  p_source_kind text,
  p_source_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_source_kind text := case when lower(trim(coalesce(p_source_kind, 'org'))) = 'request' then 'request' else 'org' end;
begin
  if p_source_id is null then
    return jsonb_build_object('success', false, 'message', 'رکورد برای به‌روزرسانی پیدا نشد.');
  end if;

  if not public.current_user_has_saas_admin_permission() then
    return jsonb_build_object('success', false, 'message', 'دسترسی کافی ندارید.');
  end if;

  if v_source_kind = 'request' then
    update public.saas_onboarding_requests
    set
      assignee_type = case when v_patch ? 'assignee_type' then nullif(trim(v_patch->>'assignee_type'), '') else assignee_type end,
      assignee_id = case when v_patch ? 'assignee_id' then nullif(trim(v_patch->>'assignee_id'), '')::uuid else assignee_id end,
      assignee_role_id = case when v_patch ? 'assignee_role_id' then nullif(trim(v_patch->>'assignee_role_id'), '')::uuid else assignee_role_id end,
      process_template_id = case when v_patch ? 'process_template_id' then nullif(trim(v_patch->>'process_template_id'), '')::uuid else process_template_id end,
      execution_process_draft = case when v_patch ? 'execution_process_draft' then coalesce(v_patch->'execution_process_draft', '{}'::jsonb) else execution_process_draft end,
      updated_at = now()
    where id = p_source_id;
  else
    update public.saas_org_settings
    set
      assignee_type = case when v_patch ? 'assignee_type' then nullif(trim(v_patch->>'assignee_type'), '') else assignee_type end,
      assignee_id = case when v_patch ? 'assignee_id' then nullif(trim(v_patch->>'assignee_id'), '')::uuid else assignee_id end,
      assignee_role_id = case when v_patch ? 'assignee_role_id' then nullif(trim(v_patch->>'assignee_role_id'), '')::uuid else assignee_role_id end,
      process_template_id = case when v_patch ? 'process_template_id' then nullif(trim(v_patch->>'process_template_id'), '')::uuid else process_template_id end,
      execution_process_draft = case when v_patch ? 'execution_process_draft' then coalesce(v_patch->'execution_process_draft', '{}'::jsonb) else execution_process_draft end,
      updated_at = now()
    where org_id = p_source_id;
  end if;

  if not found then
    return jsonb_build_object('success', false, 'message', 'رکورد موردنظر پیدا نشد.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.admin_saas_update_candidate_runtime(text, uuid, jsonb) from public;
grant execute on function public.admin_saas_update_candidate_runtime(text, uuid, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────
-- ۵. CMS عمومی: داده اجرایی فقط برای SaaS Admin قابل خواندن می‌ماند
-- ─────────────────────────────────────────────────────
drop policy if exists "cms_blog_posts_public_read" on public.cms_blog_posts;
drop policy if exists "cms_tutorial_posts_public_read" on public.cms_tutorial_posts;
drop policy if exists "cms_tutorial_series_public_read" on public.cms_tutorial_series;
drop policy if exists "cms_categories_public_read" on public.cms_categories;
drop policy if exists "cms_tags_public_read" on public.cms_tags;
drop policy if exists "cms_pages_public_read" on public.cms_pages;

revoke select on public.cms_blog_posts, public.cms_tutorial_posts, public.cms_tutorial_series, public.cms_categories, public.cms_tags, public.cms_pages from anon;

create or replace function public.get_cms_blog_posts(
  p_status text default 'published',
  p_featured boolean default null,
  p_limit int default 20,
  p_offset int default 0,
  p_category text default null,
  p_tag text default null
)
returns table (
  id uuid, title text, slug text, excerpt text, cover_image_url text,
  author_name text, author_avatar text, status text, is_featured boolean,
  published_at timestamptz, reading_time_minutes int, seo_title text,
  seo_description text, og_image_url text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.title, p.slug, p.excerpt, p.cover_image_url,
    pr.full_name, pr.avatar_url, p.status, p.is_featured, p.published_at,
    p.reading_time_minutes, p.seo_title, p.seo_description, p.og_image_url, p.created_at
  from public.cms_blog_posts p
  left join public.profiles pr on pr.id = p.author_id
  where p.status = 'published'
    and (p_featured is null or p.is_featured = p_featured)
    and (p_category is null or exists (
      select 1 from public.cms_blog_post_categories bpc
      join public.cms_categories c on c.id = bpc.category_id
      where bpc.post_id = p.id and c.slug = p_category
    ))
    and (p_tag is null or exists (
      select 1 from public.cms_blog_post_tags bpt
      join public.cms_tags t on t.id = bpt.tag_id
      where bpt.post_id = p.id and t.slug = p_tag
    ))
  order by p.published_at desc nulls last
  limit greatest(least(coalesce(p_limit, 20), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.get_cms_tutorial_posts(
  p_status text default 'published',
  p_featured boolean default null,
  p_limit int default 20,
  p_offset int default 0,
  p_category text default null,
  p_tag text default null,
  p_series_id uuid default null,
  p_difficulty text default null
)
returns table (
  id uuid, title text, slug text, excerpt text, cover_image_url text,
  author_name text, author_avatar text, status text, is_featured boolean,
  published_at timestamptz, reading_time_minutes int, difficulty_level text,
  duration_minutes int, series_id uuid, series_order int, seo_title text,
  seo_description text, og_image_url text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.title, p.slug, p.excerpt, p.cover_image_url,
    pr.full_name, pr.avatar_url, p.status, p.is_featured, p.published_at,
    p.reading_time_minutes, p.difficulty_level, p.duration_minutes,
    p.series_id, p.series_order, p.seo_title, p.seo_description, p.og_image_url, p.created_at
  from public.cms_tutorial_posts p
  left join public.profiles pr on pr.id = p.author_id
  where p.status = 'published'
    and (p_featured is null or p.is_featured = p_featured)
    and (p_series_id is null or p.series_id = p_series_id)
    and (p_difficulty is null or p.difficulty_level = p_difficulty)
    and (p_category is null or exists (
      select 1 from public.cms_tutorial_post_categories tpc
      join public.cms_categories c on c.id = tpc.category_id
      where tpc.post_id = p.id and c.slug = p_category
    ))
    and (p_tag is null or exists (
      select 1 from public.cms_tutorial_post_tags tpt
      join public.cms_tags t on t.id = tpt.tag_id
      where tpt.post_id = p.id and t.slug = p_tag
    ))
  order by case when p_series_id is not null then p.series_order else 0 end,
    p.published_at desc nulls last
  limit greatest(least(coalesce(p_limit, 20), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

alter function public.get_cms_blog_post_by_slug(text) security definer;
alter function public.get_cms_blog_post_by_slug(text) set search_path to public;
alter function public.get_cms_tutorial_post_by_slug(text) security definer;
alter function public.get_cms_tutorial_post_by_slug(text) set search_path to public;
alter function public.get_cms_page_by_slug(text) security definer;
alter function public.get_cms_page_by_slug(text) set search_path to public;

create or replace function public.get_cms_public_categories(p_content_type text)
returns table (id uuid, name text, slug text, sort_order integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.slug, c.sort_order
  from public.cms_categories c
  where c.type in (coalesce(nullif(trim(p_content_type), ''), 'both'), 'both')
  order by c.sort_order, c.name
$$;

create or replace function public.get_cms_public_tutorial_series()
returns table (
  id uuid,
  title text,
  slug text,
  description text,
  cover_image_url text,
  is_featured boolean,
  sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.title, s.slug, s.description, s.cover_image_url, s.is_featured, s.sort_order
  from public.cms_tutorial_series s
  order by s.sort_order, s.title
  limit 6
$$;

grant execute on function public.get_cms_blog_posts(text, boolean, int, int, text, text) to anon, authenticated;
grant execute on function public.get_cms_tutorial_posts(text, boolean, int, int, text, text, uuid, text) to anon, authenticated;
grant execute on function public.get_cms_blog_post_by_slug(text) to anon, authenticated;
grant execute on function public.get_cms_tutorial_post_by_slug(text) to anon, authenticated;
grant execute on function public.get_cms_page_by_slug(text) to anon, authenticated;
grant execute on function public.get_cms_public_categories(text) to anon, authenticated;
grant execute on function public.get_cms_public_tutorial_series() to anon, authenticated;

notify pgrst, 'reload schema';

commit;
