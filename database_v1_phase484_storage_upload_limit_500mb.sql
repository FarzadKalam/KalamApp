-- KalamApp V1 - Phase 484
-- Raise the application file bucket limit to 500 MiB.
-- The Storage API global FILE_SIZE_LIMIT must be at least the same value.

begin;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets
    set file_size_limit = 524288000
    where id = 'images'
      and file_size_limit is distinct from 524288000;
  end if;
end $$;

commit;
