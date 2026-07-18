-- Phase 347: cancel the event backlog created before the runner queue fix.
-- The cutoff is deliberately fixed so rerunning this migration never cancels
-- workflow events created after this recovery window.

begin;

update public.workflow_event_queue
set
  status = 'failed',
  completed_at = coalesce(completed_at, now()),
  last_error = 'لغو دستی رویداد معوق پس از اختلال اجراکننده گردش‌کار؛ این رویداد نباید دوباره اجرا شود.'
where status = 'pending'
  and created_at <= timestamptz '2026-07-18T21:17:10.754Z';

commit;
