-- Phase 398: Repair the normalized V2 process-stage identity and ordering indexes.
-- V2 identifies each stage by process_node_key; title and order are presentation
-- values and must not prevent a copied or branched stage from being persisted.

begin;

alter table public.process_template_stages
  add column if not exists process_node_key text,
  add column if not exists process_lane_key text;

update public.process_template_stages
set process_lane_key = coalesce(
      nullif(btrim(process_lane_key), ''),
      nullif(btrim(metadata ->> 'process_lane_key'), ''),
      'lane_1'
    )
where process_lane_key is null
   or btrim(process_lane_key) = '';

update public.process_template_stages
set process_node_key = coalesce(
      nullif(btrim(process_node_key), ''),
      nullif(btrim(metadata ->> 'process_node_key'), ''),
      'stage_' || replace(id::text, '-', '')
    )
where process_node_key is null
   or btrim(process_node_key) = '';

with duplicate_nodes as (
  select
    id,
    'stage_' || replace(id::text, '-', '') as replacement_node_key
  from (
    select
      id,
      row_number() over (
        partition by template_id, process_node_key
        order by created_at asc, id asc
      ) as row_number
    from public.process_template_stages
  ) ranked
  where ranked.row_number > 1
)
update public.process_template_stages stage
set process_node_key = duplicate_nodes.replacement_node_key,
    metadata = jsonb_set(
      coalesce(stage.metadata, '{}'::jsonb),
      '{process_node_key}',
      to_jsonb(duplicate_nodes.replacement_node_key),
      true
    )
from duplicate_nodes
where stage.id = duplicate_nodes.id;

drop index if exists public.idx_process_template_stages_unique;
drop index if exists public.idx_process_template_stages_lane_unique;

create index if not exists idx_process_template_stages_lane_sort
  on public.process_template_stages (template_id, process_lane_key, sort_order);

create unique index if not exists idx_process_template_stages_node_unique
  on public.process_template_stages (template_id, process_node_key)
  where process_node_key is not null and process_node_key <> '';

notify pgrst, 'reload schema';

commit;
