-- KalamApp V1 - Phase 90
-- Repair storage bucket/policies for images and record file uploads.
-- This is safe to replay on self-hosted Supabase installs.

begin;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $sql$
      insert into storage.buckets (id, name, public)
      values ('images', 'images', true)
      on conflict (id) do update
        set public = true
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists p_images_public_select on storage.objects';
    execute $policy$
      create policy p_images_public_select on storage.objects
        for select to public
        using (bucket_id = 'images')
    $policy$;

    execute 'drop policy if exists p_images_authenticated_all on storage.objects';
    execute $policy$
      create policy p_images_authenticated_all on storage.objects
        for all to authenticated
        using (bucket_id = 'images')
        with check (bucket_id = 'images')
    $policy$;
  end if;
end $$;

commit;
