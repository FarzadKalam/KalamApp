-- Phase 297: Process V2 RPC route and tombstone backfill
-- Backfill deleted stage identities so stale draft payloads cannot recreate them,
-- and expose a V2 RPC name to avoid old process runtime routing.

begin;

alter table public.process_v2_deleted_stage_marks
  add column if not exists process_run_id uuid,
  add column if not exists process_group_id text,
  add column if not exists template_stage_id uuid,
  add column if not exists draft_stage_key text,
  add column if not exists process_node_key text,
  add column if not exists process_lane_key text;

update public.process_v2_deleted_stage_marks m
set process_run_id = coalesce(m.process_run_id, s.process_run_id),
    process_group_id = coalesce(nullif(btrim(coalesce(m.process_group_id, '')), ''), nullif(btrim(coalesce(r.process_group_id, '')), '')),
    template_stage_id = coalesce(m.template_stage_id, s.template_stage_id),
    draft_stage_key = coalesce(
      nullif(btrim(coalesce(m.draft_stage_key, '')), ''),
      nullif(btrim(coalesce(s.metadata ->> 'draft_stage_key', '')), ''),
      nullif(btrim(coalesce(s.metadata ->> 'draft_stage_id', '')), '')
    ),
    process_node_key = coalesce(
      nullif(btrim(coalesce(m.process_node_key, '')), ''),
      nullif(btrim(coalesce(s.process_node_key, '')), ''),
      nullif(btrim(coalesce(s.metadata ->> 'process_node_key', '')), '')
    ),
    process_lane_key = coalesce(
      nullif(btrim(coalesce(m.process_lane_key, '')), ''),
      nullif(btrim(coalesce(s.process_lane_key, '')), ''),
      nullif(btrim(coalesce(s.metadata ->> 'process_lane_key', '')), '')
    )
from public.process_run_stages s
join public.process_runs r on r.id = s.process_run_id
where m.process_run_stage_id = s.id
  and m.org_id = r.org_id
  and (
    m.process_run_id is null
    or nullif(btrim(coalesce(m.process_group_id, '')), '') is null
    or m.template_stage_id is null
    or nullif(btrim(coalesce(m.draft_stage_key, '')), '') is null
    or nullif(btrim(coalesce(m.process_node_key, '')), '') is null
    or nullif(btrim(coalesce(m.process_lane_key, '')), '') is null
  );

create index if not exists idx_process_v2_deleted_stage_marks_identity
  on public.process_v2_deleted_stage_marks(
    org_id,
    process_run_id,
    process_group_id,
    template_stage_id,
    draft_stage_key,
    process_node_key
  );

create or replace function public.ensure_process_run_for_draft_group_v2(
  p_org_id uuid,
  p_module_id text,
  p_record_id uuid,
  p_process_group_id text,
  p_process_name text,
  p_template_id uuid default null,
  p_stages jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.ensure_process_run_for_draft_group(
    p_org_id,
    p_module_id,
    p_record_id,
    p_process_group_id,
    p_process_name,
    p_template_id,
    p_stages
  );
end;
$$;

revoke all on function public.ensure_process_run_for_draft_group_v2(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid,
  jsonb
) from public, anon;

grant execute on function public.ensure_process_run_for_draft_group_v2(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid,
  jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
