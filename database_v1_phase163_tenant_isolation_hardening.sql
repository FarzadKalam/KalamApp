-- =====================================================
-- KalamApp - Phase 163 Tenant Isolation Hardening
-- Date: 2026-05-20
-- Type: Security hardening / backward-compatible migration
-- Goal: close fail-open tenant policies, harden stories/admin views,
--       and remove direct authenticated access to internal tables
-- =====================================================

begin;

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.org_id, r.org_id)
  from public.profiles p
  left join public.org_roles r
    on r.id = p.role_id
  where p.id = auth.uid()
  limit 1
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.set_audit_user_fields()',
    'public.normalize_iran_mobile_e164(text)',
    'public.validate_profile_mobile_uniqueness()',
    'public.set_updated_at()',
    'public.normalize_note_scope()',
    'public.global_search_normalize_text(text)',
    'public.global_search_phone_digits(text)',
    'public.global_search_phone_variants(text)',
    'public.global_search_records(text, text[], integer, integer)',
    'public.kalam_realtime_org_topic(uuid)',
    'public.kalam_realtime_user_topic(uuid, uuid)',
    'public.kalam_realtime_role_topic(uuid, uuid)',
    'public.kalam_realtime_module_list_topic(uuid, text)'
  ]
  loop
    if to_regprocedure(fn) is not null then
      execute format('alter function %s set search_path = public', fn);
    end if;
  end loop;
end
$$;

create or replace function public.deactivate_expired_org_stories()
returns void
language sql
security definer
set search_path = public
as $$
  update public.org_stories
  set is_active = false, updated_at = now()
  where is_active = true
    and expires_at is not null
    and expires_at <= now();
$$;

create or replace function public.record_story_view(
  p_story_id uuid,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role_id uuid;
  v_story_org_id uuid;
begin
  if v_user_id is null or p_story_id is null then
    return;
  end if;

  select p.role_id
    into v_role_id
  from public.profiles p
  where p.id = v_user_id
  limit 1;

  select s.org_id
    into v_story_org_id
  from public.org_stories s
  where s.id = p_story_id
    and s.org_id = public.current_org_id()
    and s.is_active = true
    and s.published_at <= now()
    and (s.expires_at is null or s.expires_at > now())
    and (
      s.creator_id = v_user_id
      or s.is_org_wide = true
      or v_user_id = any(s.viewer_user_ids)
      or (v_role_id is not null and v_role_id = any(s.viewer_role_ids))
    )
  limit 1;

  if v_story_org_id is null then
    return;
  end if;

  insert into public.org_story_views (org_id, story_id, user_id)
  values (v_story_org_id, p_story_id, v_user_id)
  on conflict (story_id, user_id) do nothing;

  if found then
    update public.org_stories
    set view_count = view_count + 1, updated_at = now()
    where id = p_story_id
      and org_id = v_story_org_id;
  end if;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'dynamic_options',
    'saved_views',
    'tags',
    'record_tags',
    'changelogs',
    'user_login_events',
    'sidebar_unread',
    'workflows',
    'workflow_logs',
    'warehouses',
    'shelves',
    'suppliers',
    'customers',
    'work_schedules',
    'employees',
    'attendance_logs',
    'products',
    'product_images',
    'product_inventory',
    'production_group_orders',
    'production_boms',
    'production_orders',
    'production_lines',
    'product_lines',
    'stock_transfers',
    'invoices',
    'purchase_invoices',
    'tasks',
    'calculation_formulas',
    'price_lists',
    'product_bundles',
    'bundle_items',
    'process_templates',
    'process_runs',
    'projects',
    'project_members',
    'marketing_leads',
    'module_relations',
    'ai_record_contexts',
    'leave_requests',
    'overtime_requests',
    'mission_requests'
  ]
  loop
    if to_regclass(format('public.%I', t)) is not null
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = t
          and column_name = 'org_id'
      ) then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'p_' || t || '_org_all', t);
      execute format(
        'create policy %I on public.%I for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id())',
        'p_' || t || '_org_all',
        t
      );
    end if;
  end loop;
end
$$;

alter table if exists public.organizations enable row level security;
drop policy if exists p_organizations_auth_all on public.organizations;
drop policy if exists p_organizations_select_self on public.organizations;
create policy p_organizations_auth_all
on public.organizations
for all
to authenticated
using (public.current_user_has_saas_admin_permission('edit'))
with check (public.current_user_has_saas_admin_permission('edit'));
create policy p_organizations_select_self
on public.organizations
for select
to authenticated
using (id = public.current_org_id());

alter table if exists public.profiles enable row level security;
drop policy if exists p_profiles_org_all on public.profiles;
drop policy if exists p_profiles_select_admin on public.profiles;
create policy p_profiles_org_all
on public.profiles
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());
create policy p_profiles_select_admin
on public.profiles
for select
to authenticated
using (public.current_user_has_saas_admin_permission());

alter table if exists public.org_roles enable row level security;
drop policy if exists p_org_roles_org_all on public.org_roles;
drop policy if exists p_org_roles_select_scoped on public.org_roles;
create policy p_org_roles_org_all
on public.org_roles
for all
to authenticated
using (
  public.current_user_has_saas_admin_permission('edit')
  or org_id = public.current_org_id()
)
with check (
  public.current_user_has_saas_admin_permission('edit')
  or org_id = public.current_org_id()
);
create policy p_org_roles_select_scoped
on public.org_roles
for select
to authenticated
using (
  public.current_user_has_saas_admin_permission()
  or org_id = public.current_org_id()
);

alter table if exists public.company_settings enable row level security;
drop policy if exists p_company_settings_org_all on public.company_settings;
drop policy if exists p_company_settings_select_scoped on public.company_settings;
create policy p_company_settings_org_all
on public.company_settings
for all
to authenticated
using (
  public.current_user_has_saas_admin_permission('edit')
  or org_id = public.current_org_id()
)
with check (
  public.current_user_has_saas_admin_permission('edit')
  or org_id = public.current_org_id()
);
create policy p_company_settings_select_scoped
on public.company_settings
for select
to authenticated
using (
  public.current_user_has_saas_admin_permission()
  or org_id = public.current_org_id()
);

alter table if exists public.integration_settings enable row level security;
drop policy if exists p_integration_settings_org_all on public.integration_settings;
drop policy if exists p_integration_settings_select_scoped on public.integration_settings;
create policy p_integration_settings_org_all
on public.integration_settings
for all
to authenticated
using (
  public.current_user_has_saas_admin_permission('edit')
  or org_id = public.current_org_id()
)
with check (
  public.current_user_has_saas_admin_permission('edit')
  or org_id = public.current_org_id()
);
create policy p_integration_settings_select_scoped
on public.integration_settings
for select
to authenticated
using (
  public.current_user_has_saas_admin_permission()
  or org_id = public.current_org_id()
);

alter table if exists public.ready_texts enable row level security;
grant select, insert, update, delete on public.ready_texts to authenticated, service_role;
drop policy if exists p_ready_texts_org_all on public.ready_texts;
create policy p_ready_texts_org_all
on public.ready_texts
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop trigger if exists trg_audit_ready_texts on public.ready_texts;
create trigger trg_audit_ready_texts
before insert or update on public.ready_texts
for each row execute function public.set_audit_user_fields();

drop trigger if exists trg_ready_texts_updated_at on public.ready_texts;
create trigger trg_ready_texts_updated_at
before update on public.ready_texts
for each row execute function public.set_updated_at();

alter table if exists public.process_run_links
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id();

update public.process_run_links l
set org_id = r.org_id
from public.process_runs r
where r.id = l.process_run_id
  and l.org_id is distinct from r.org_id;

create index if not exists idx_process_run_links_org_process
  on public.process_run_links(org_id, process_run_id, is_primary);
create index if not exists idx_process_run_links_org_module_record
  on public.process_run_links(org_id, module_id, record_id);

alter table if exists public.process_run_links enable row level security;
grant select, insert, update, delete on public.process_run_links to authenticated, service_role;
drop policy if exists p_process_run_links_org_all on public.process_run_links;
create policy p_process_run_links_org_all
on public.process_run_links
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

alter table if exists public.org_story_views
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id();
alter table if exists public.org_story_reactions
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id();

update public.org_story_views v
set org_id = s.org_id
from public.org_stories s
where s.id = v.story_id
  and v.org_id is distinct from s.org_id;

update public.org_story_reactions r
set org_id = s.org_id
from public.org_stories s
where s.id = r.story_id
  and r.org_id is distinct from s.org_id;

create index if not exists idx_org_story_views_org_story
  on public.org_story_views(org_id, story_id, viewed_at desc);
create index if not exists idx_org_story_reactions_org_story
  on public.org_story_reactions(org_id, story_id, created_at desc);

grant select, insert, update, delete on public.org_stories to authenticated, service_role;
grant select, insert, update, delete on public.org_story_views to authenticated, service_role;
grant select, insert, update, delete on public.org_story_reactions to authenticated, service_role;

alter table if exists public.org_stories enable row level security;
alter table if exists public.org_story_views enable row level security;
alter table if exists public.org_story_reactions enable row level security;

drop policy if exists p_org_stories_auth_all on public.org_stories;
drop policy if exists p_org_story_views_auth_all on public.org_story_views;
drop policy if exists p_org_story_reactions_auth_all on public.org_story_reactions;
drop policy if exists p_org_stories_select_visible on public.org_stories;
drop policy if exists p_org_stories_insert_own on public.org_stories;
drop policy if exists p_org_stories_update_own on public.org_stories;
drop policy if exists p_org_stories_delete_own on public.org_stories;
drop policy if exists p_org_story_views_select_visible on public.org_story_views;
drop policy if exists p_org_story_views_insert_own on public.org_story_views;
drop policy if exists p_org_story_reactions_select_visible on public.org_story_reactions;
drop policy if exists p_org_story_reactions_insert_own on public.org_story_reactions;
drop policy if exists p_org_story_reactions_update_own on public.org_story_reactions;
drop policy if exists p_org_story_reactions_delete_own on public.org_story_reactions;

create policy p_org_stories_select_visible
on public.org_stories
for select
to authenticated
using (
  org_id = public.current_org_id()
  and is_active = true
  and published_at <= now()
  and (expires_at is null or expires_at > now())
  and (
    creator_id = auth.uid()
    or is_org_wide = true
    or auth.uid() = any(viewer_user_ids)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role_id = any(org_stories.viewer_role_ids)
    )
  )
);

create policy p_org_stories_insert_own
on public.org_stories
for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and creator_id = auth.uid()
);

create policy p_org_stories_update_own
on public.org_stories
for update
to authenticated
using (
  org_id = public.current_org_id()
  and creator_id = auth.uid()
)
with check (
  org_id = public.current_org_id()
  and creator_id = auth.uid()
);

create policy p_org_stories_delete_own
on public.org_stories
for delete
to authenticated
using (
  org_id = public.current_org_id()
  and creator_id = auth.uid()
);

create policy p_org_story_views_select_visible
on public.org_story_views
for select
to authenticated
using (
  org_id = public.current_org_id()
  and exists (
    select 1
    from public.org_stories s
    left join public.profiles p
      on p.id = auth.uid()
    where s.id = org_story_views.story_id
      and s.org_id = org_story_views.org_id
      and s.is_active = true
      and s.published_at <= now()
      and (s.expires_at is null or s.expires_at > now())
      and (
        s.creator_id = auth.uid()
        or s.is_org_wide = true
        or auth.uid() = any(s.viewer_user_ids)
        or (p.role_id is not null and p.role_id = any(s.viewer_role_ids))
      )
  )
);

create policy p_org_story_views_insert_own
on public.org_story_views
for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and user_id = auth.uid()
  and exists (
    select 1
    from public.org_stories s
    left join public.profiles p
      on p.id = auth.uid()
    where s.id = org_story_views.story_id
      and s.org_id = org_story_views.org_id
      and s.is_active = true
      and s.published_at <= now()
      and (s.expires_at is null or s.expires_at > now())
      and (
        s.creator_id = auth.uid()
        or s.is_org_wide = true
        or auth.uid() = any(s.viewer_user_ids)
        or (p.role_id is not null and p.role_id = any(s.viewer_role_ids))
      )
  )
);

create policy p_org_story_reactions_select_visible
on public.org_story_reactions
for select
to authenticated
using (
  org_id = public.current_org_id()
  and exists (
    select 1
    from public.org_stories s
    left join public.profiles p
      on p.id = auth.uid()
    where s.id = org_story_reactions.story_id
      and s.org_id = org_story_reactions.org_id
      and s.is_active = true
      and s.published_at <= now()
      and (s.expires_at is null or s.expires_at > now())
      and (
        s.creator_id = auth.uid()
        or s.is_org_wide = true
        or auth.uid() = any(s.viewer_user_ids)
        or (p.role_id is not null and p.role_id = any(s.viewer_role_ids))
      )
  )
);

create policy p_org_story_reactions_insert_own
on public.org_story_reactions
for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and user_id = auth.uid()
  and exists (
    select 1
    from public.org_stories s
    left join public.profiles p
      on p.id = auth.uid()
    where s.id = org_story_reactions.story_id
      and s.org_id = org_story_reactions.org_id
      and s.is_active = true
      and s.published_at <= now()
      and (s.expires_at is null or s.expires_at > now())
      and (
        s.creator_id = auth.uid()
        or s.is_org_wide = true
        or auth.uid() = any(s.viewer_user_ids)
        or (p.role_id is not null and p.role_id = any(s.viewer_role_ids))
      )
  )
);

create policy p_org_story_reactions_update_own
on public.org_story_reactions
for update
to authenticated
using (
  org_id = public.current_org_id()
  and user_id = auth.uid()
)
with check (
  org_id = public.current_org_id()
  and user_id = auth.uid()
);

create policy p_org_story_reactions_delete_own
on public.org_story_reactions
for delete
to authenticated
using (
  org_id = public.current_org_id()
  and user_id = auth.uid()
);

update public.product_images pi
set org_id = p.org_id
from public.products p
where p.id = pi.product_id
  and pi.org_id is distinct from p.org_id;

drop policy if exists "Public Delete Product Images" on public.product_images;
drop policy if exists "Public Insert Product Images" on public.product_images;

alter table if exists public.system_code_counters enable row level security;
revoke all on public.system_code_counters from public;
revoke all on public.system_code_counters from authenticated;
revoke all on public.system_code_counters from anon;
drop policy if exists p_system_code_counters_locked on public.system_code_counters;

alter table if exists public.app_schema_migrations enable row level security;
revoke all on public.app_schema_migrations from public;
revoke all on public.app_schema_migrations from authenticated;
revoke all on public.app_schema_migrations from anon;
drop policy if exists p_app_schema_migrations_locked on public.app_schema_migrations;

create or replace view public.saas_admin_orgs_view
with (security_invoker = true) as
select *
from (
  select
    o.id                          as org_id,
    o.name                        as org_name,
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
    s.primary_contact_mobile,
    s.provisioning_source,
    s.created_at                  as provisioned_at,
    r.full_name                   as owner_name,
    r.email                       as owner_email
  from public.saas_org_settings s
  join public.organizations o on o.id = s.org_id
  left join (
    select distinct on (org_id)
      p.org_id,
      p.full_name,
      p.email
    from public.profiles p
    join public.org_roles ro on ro.id = p.role_id
    where (ro.permissions->'__saas_admin') is null
    order by p.org_id, p.created_at asc
  ) r on r.org_id = o.id
) scoped
where public.current_user_has_saas_admin_permission();

grant select on public.saas_admin_orgs_view to authenticated;

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
    coalesce(s.created_at, o.created_at)        as created_at,
    coalesce(s.updated_at, o.updated_at)        as updated_at,
    null::uuid                                  as created_by,
    null::uuid                                  as updated_by
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
    r.created_at,
    r.updated_at,
    null::uuid                                  as created_by,
    null::uuid                                  as updated_by
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

notify pgrst, 'reload schema';

commit;
