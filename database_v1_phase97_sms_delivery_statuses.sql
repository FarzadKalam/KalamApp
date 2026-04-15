-- KalamApp - Phase 97 SMS delivery status refinements
-- Separates provider acceptance from actual delivery and keeps inbound webhook parse failures visible.

begin;

alter table if exists public.outbound_messages
  drop constraint if exists chk_outbound_messages_status;

alter table if exists public.outbound_messages
  add constraint chk_outbound_messages_status
  check (
    status in (
      'pending',
      'provider_accepted',
      'sent',
      'delivered',
      'not_delivered',
      'operator_failed',
      'filtered',
      'blacklisted',
      'unknown_delivery',
      'failed',
      'skipped',
      'received',
      'processed',
      'ignored'
    )
  ) not valid;

commit;
