-- KalamApp - Phase 217: Organization knowledge visibility
-- Type: Security / Product
-- Notes:
-- - Empty allowed_user_ids and allowed_role_ids means visible to the whole org.
-- - Tenant access stays fail-closed through org_id = public.current_org_id().

begin;

alter table public.org_documents
  add column if not exists allowed_user_ids uuid[] not null default '{}'::uuid[],
  add column if not exists allowed_role_ids uuid[] not null default '{}'::uuid[];

alter table public.document_chunks
  add column if not exists allowed_user_ids uuid[] not null default '{}'::uuid[],
  add column if not exists allowed_role_ids uuid[] not null default '{}'::uuid[];

create index if not exists idx_org_documents_allowed_users_gin
  on public.org_documents using gin (allowed_user_ids);

create index if not exists idx_org_documents_allowed_roles_gin
  on public.org_documents using gin (allowed_role_ids);

create index if not exists idx_document_chunks_allowed_users_gin
  on public.document_chunks using gin (allowed_user_ids);

create index if not exists idx_document_chunks_allowed_roles_gin
  on public.document_chunks using gin (allowed_role_ids);

drop policy if exists p_org_documents_org_all on public.org_documents;
drop policy if exists p_org_documents_select_visible on public.org_documents;
create policy p_org_documents_select_visible
on public.org_documents
for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    (
      coalesce(array_length(allowed_user_ids, 1), 0) = 0
      and coalesce(array_length(allowed_role_ids, 1), 0) = 0
    )
    or created_by = auth.uid()
    or auth.uid() = any(allowed_user_ids)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.org_id = public.current_org_id()
        and p.role_id = any(allowed_role_ids)
    )
  )
);

drop policy if exists p_org_documents_insert_org on public.org_documents;
create policy p_org_documents_insert_org
on public.org_documents
for insert
to authenticated
with check (org_id = public.current_org_id());

drop policy if exists p_org_documents_update_visible on public.org_documents;
create policy p_org_documents_update_visible
on public.org_documents
for update
to authenticated
using (
  org_id = public.current_org_id()
  and (
    created_by = auth.uid()
    or auth.uid() = any(allowed_user_ids)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.org_id = public.current_org_id()
        and p.role_id = any(allowed_role_ids)
    )
    or (
      coalesce(array_length(allowed_user_ids, 1), 0) = 0
      and coalesce(array_length(allowed_role_ids, 1), 0) = 0
    )
  )
)
with check (org_id = public.current_org_id());

drop policy if exists p_org_documents_delete_visible on public.org_documents;
create policy p_org_documents_delete_visible
on public.org_documents
for delete
to authenticated
using (
  org_id = public.current_org_id()
  and (
    created_by = auth.uid()
    or auth.uid() = any(allowed_user_ids)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.org_id = public.current_org_id()
        and p.role_id = any(allowed_role_ids)
    )
    or (
      coalesce(array_length(allowed_user_ids, 1), 0) = 0
      and coalesce(array_length(allowed_role_ids, 1), 0) = 0
    )
  )
);

drop policy if exists p_document_chunks_org_all on public.document_chunks;
drop policy if exists p_document_chunks_select_visible on public.document_chunks;
create policy p_document_chunks_select_visible
on public.document_chunks
for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    (
      coalesce(array_length(allowed_user_ids, 1), 0) = 0
      and coalesce(array_length(allowed_role_ids, 1), 0) = 0
    )
    or auth.uid() = any(allowed_user_ids)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.org_id = public.current_org_id()
        and p.role_id = any(allowed_role_ids)
    )
  )
);

drop policy if exists p_document_chunks_insert_org on public.document_chunks;
create policy p_document_chunks_insert_org
on public.document_chunks
for insert
to authenticated
with check (org_id = public.current_org_id());

drop policy if exists p_document_chunks_update_org on public.document_chunks;
create policy p_document_chunks_update_org
on public.document_chunks
for update
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists p_document_chunks_delete_org on public.document_chunks;
create policy p_document_chunks_delete_org
on public.document_chunks
for delete
to authenticated
using (org_id = public.current_org_id());

notify pgrst, 'reload schema';

commit;
