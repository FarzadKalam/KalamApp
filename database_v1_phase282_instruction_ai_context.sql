-- TazeSystem V1 Phase 282
-- Instruction AI context indexing for tenant-scoped assistant retrieval.

begin;

alter table public.instructions
  add column if not exists use_for_ai boolean not null default false,
  add column if not exists ai_index_status text not null default 'not_built',
  add column if not exists ai_index_updated_at timestamptz,
  add column if not exists ai_index_error text,
  add column if not exists ai_content_hash text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'instructions_ai_index_status_check') then
    alter table public.instructions
      add constraint instructions_ai_index_status_check
      check (ai_index_status in ('not_built', 'stale', 'ready', 'failed', 'skipped'));
  end if;
end $$;

create index if not exists idx_instructions_org_ai_status
  on public.instructions(org_id, use_for_ai, ai_index_status, updated_at desc);

alter table public.document_chunks
  add column if not exists source_kind text not null default 'org_document',
  add column if not exists source_module_id text,
  add column if not exists source_record_id uuid,
  add column if not exists source_target_module_ids text[] not null default '{}'::text[];

create index if not exists idx_document_chunks_source_record
  on public.document_chunks(org_id, source_kind, source_module_id, source_record_id)
  where source_record_id is not null;

create index if not exists idx_document_chunks_source_target_modules_gin
  on public.document_chunks using gin (source_target_module_ids);

create unique index if not exists idx_document_chunks_instruction_source_index
  on public.document_chunks(org_id, source_kind, source_module_id, source_record_id, chunk_index)
  where source_kind = 'instruction' and source_record_id is not null;

create or replace function public.mark_instruction_ai_index_stale()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (
    old.name is distinct from new.name
    or old.status is distinct from new.status
    or old.department is distinct from new.department
    or old.module_ids is distinct from new.module_ids
    or old.visible_to_user_ids is distinct from new.visible_to_user_ids
    or old.visible_to_role_ids is distinct from new.visible_to_role_ids
    or old.goal is distinct from new.goal
    or old.body is distinct from new.body
    or old.tags is distinct from new.tags
    or old.use_for_ai is distinct from new.use_for_ai
  ) then
    new.ai_index_status := case
      when coalesce(new.use_for_ai, false) = false then 'skipped'
      else 'stale'
    end;
    new.ai_index_error := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mark_instruction_ai_index_stale on public.instructions;
create trigger trg_mark_instruction_ai_index_stale
before update on public.instructions
for each row
execute function public.mark_instruction_ai_index_stale();

notify pgrst, 'reload schema';

commit;
