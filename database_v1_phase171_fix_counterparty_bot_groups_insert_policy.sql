-- =====================================================
-- KalamApp - Phase 171: Fix counterparty_bot_groups INSERT policy
-- Date: 2026-05-24
-- Type: Security fix / idempotent
-- Goal: Phase 157 insert policy requires created_by = auth.uid() but frontend
--       does not include created_by in the POST payload → 403 Forbidden.
--       Fix: auto-fill created_by/updated_by via before-insert trigger,
--       then relax INSERT policy to only check org_id (fail-closed).
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- Trigger: auto-fill created_by / updated_by on insert
-- ─────────────────────────────────────────────
create or replace function public.set_created_by_if_missing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  if new.updated_by is null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_counterparty_bot_groups_created_by on public.counterparty_bot_groups;
create trigger trg_counterparty_bot_groups_created_by
  before insert on public.counterparty_bot_groups
  for each row execute function public.set_created_by_if_missing();

-- ─────────────────────────────────────────────
-- Fix INSERT policy: only check org_id (fail-closed)
-- created_by is filled by trigger before RLS runs
-- ─────────────────────────────────────────────
drop policy if exists p_counterparty_bot_groups_insert_targeted on public.counterparty_bot_groups;
create policy p_counterparty_bot_groups_insert_targeted
on public.counterparty_bot_groups
for insert
to authenticated
with check (
  org_id = public.current_org_id()
);

notify pgrst, 'reload schema';

commit;
