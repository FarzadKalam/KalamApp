-- متن تماس‌های VoIP پس از تبدیل صوت به متن، با جداسازی کامل سازمانی نگهداری می‌شود.
begin;

alter table if exists public.voip_call_logs
  add column if not exists transcript text,
  add column if not exists transcript_status text not null default 'not_requested',
  add column if not exists transcript_error text,
  add column if not exists transcript_at timestamptz,
  add column if not exists transcript_model text;

create index if not exists idx_voip_call_logs_org_transcript_status
  on public.voip_call_logs (org_id, transcript_status, started_at desc, id desc);

commit;
