-- Phase 398: Keep process-template assignment compatible with the shared assignee model.
-- Template stages continue to store direct user/role assignments and field-based
-- assignee references in their metadata; these columns repair the template record
-- projection used by the generic module page.

begin;

alter table public.process_templates
  add column if not exists assignee_type text,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'process_templates_assignee_type_check'
      and conrelid = 'public.process_templates'::regclass
  ) then
    alter table public.process_templates
      add constraint process_templates_assignee_type_check
      check (assignee_type is null or assignee_type in ('user', 'role')) not valid;
  end if;
end;
$$;

create index if not exists idx_process_templates_org_assignee
  on public.process_templates (org_id, assignee_type, assignee_id, assignee_role_id);

notify pgrst, 'reload schema';

commit;
