-- =====================================================
-- KalamApp - Phase 305 Defer Changelog Profile FK
-- Date: 2026-06-30
-- Type: Corrective / idempotent migration
-- Goal:
--   Demo onboarding creates the profile after the first audited tenant rows.
--   Defer changelogs.user_id FK so the transaction can finish and validate
--   against the profile created later in the same transaction.
-- =====================================================

begin;

do $$
begin
  if to_regclass('public.changelogs') is not null
     and to_regclass('public.profiles') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'changelogs'
         and column_name = 'user_id'
     )
  then
    alter table public.changelogs
      drop constraint if exists changelogs_user_id_fkey;

    alter table public.changelogs
      add constraint changelogs_user_id_fkey
      foreign key (user_id)
      references public.profiles(id)
      on delete set null
      deferrable initially deferred;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
