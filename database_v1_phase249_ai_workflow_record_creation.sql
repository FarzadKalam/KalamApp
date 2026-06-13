-- Phase 249: AI workflow execution payload compatibility

alter table public.ai_action_logs
  add column if not exists result_payload jsonb not null default '{}'::jsonb;

create index if not exists idx_ai_action_logs_org_action_created_at
  on public.ai_action_logs(org_id, action_type, created_at desc);

comment on column public.ai_action_logs.result_payload is
  'Structured result metadata for automatic AI actions such as workflow prompts and AI-created records.';
