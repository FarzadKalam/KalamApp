-- Phase 552: stop anonymous replacement/deletion in the legacy public bucket.
-- Public reads and the existing public web-form upload flow stay available
-- until stored URLs can be migrated to a private, signed delivery path.
begin;

drop policy if exists "Public Access" on storage.objects;
drop policy if exists p_images_authenticated_all on storage.objects;
drop policy if exists p_images_authenticated_insert on storage.objects;
drop policy if exists p_images_owner_update on storage.objects;
drop policy if exists p_images_owner_delete on storage.objects;
drop policy if exists p_images_public_form_insert on storage.objects;

create policy p_images_authenticated_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and owner_id = auth.uid()::text
  );

create policy p_images_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'images' and owner_id = auth.uid()::text)
  with check (bucket_id = 'images' and owner_id = auth.uid()::text);

create policy p_images_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'images' and owner_id = auth.uid()::text);

-- Public web forms upload before a user has signed in. Keep only their
-- dedicated path writable by anon; Storage still enforces bucket size limits.
create policy p_images_public_form_insert on storage.objects
  for insert to anon
  with check (
    bucket_id = 'images'
    and name like 'record_files/web_forms/%'
  );

commit;
