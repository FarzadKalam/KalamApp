-- =====================================================
-- KalamApp - Phase 214: Communication bot list indexes
-- Date: 2026-05-28
-- Type: Performance / idempotent
-- =====================================================

begin;

create index if not exists idx_counterparty_bot_groups_org_updated_id
  on public.counterparty_bot_groups(org_id, updated_at desc, id desc);

create index if not exists idx_counterparty_bot_groups_org_activity_id
  on public.counterparty_bot_groups(
    org_id,
    (
      greatest(
        coalesce(last_inbound_at, 'epoch'::timestamptz),
        coalesce(last_outbound_at, 'epoch'::timestamptz),
        coalesce(updated_at, 'epoch'::timestamptz)
      )
    ) desc,
    id desc
  );

notify pgrst, 'reload schema';

commit;
