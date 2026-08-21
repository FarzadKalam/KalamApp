-- Phase 462: explicit per-report viewers (users and roles), fail-closed per organization.

begin;

create index if not exists idx_report_definitions_viewer_users
  on public.report_definitions using gin ((config -> 'viewer_user_ids'));

create index if not exists idx_report_definitions_viewer_roles
  on public.report_definitions using gin ((config -> 'viewer_role_ids'));

drop policy if exists p_report_definitions_select_scoped on public.report_definitions;
create policy p_report_definitions_select_scoped
on public.report_definitions
for select
using (
  org_id = public.current_org_id()
  and (
    public.current_user_has_role_permission_entry('__reports', 'view', 'all_reports', true)
    or (
      lower(coalesce(config #>> '{schedule,enabled}', 'false')) = 'true'
      and coalesce(config #> '{schedule,recipient_user_ids}', '[]'::jsonb) @> jsonb_build_array(auth.uid()::text)
    )
    or coalesce(config -> 'viewer_user_ids', '[]'::jsonb) @> jsonb_build_array(auth.uid()::text)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.org_id = public.current_org_id()
        and p.role_id is not null
        and coalesce(config -> 'viewer_role_ids', '[]'::jsonb) @> jsonb_build_array(p.role_id::text)
    )
  )
);

commit;
