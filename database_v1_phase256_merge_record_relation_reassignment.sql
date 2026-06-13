-- =====================================================
-- KalamApp - Phase 256 Merge Record Relation Reassignment
-- Date: 2026-06-11
-- Type: Backward-compatible migration (new RPC only)
-- Goal: when records are merged via "ادغام رکوردها", redirect every
--       reference (typed RELATION/MULTI_RELATION fields + generic
--       module_id/record_id polymorphic links) from the duplicate
--       record ids to the surviving record id, before the duplicates
--       are moved to the recycle bin / deleted.
-- =====================================================

begin;

create or replace function public.merge_module_record_references(
  p_module_id text,
  p_survivor_id uuid,
  p_duplicate_ids uuid[],
  p_relation_fields jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_module_id text := nullif(btrim(coalesce(p_module_id, '')), '');
  v_duplicate_ids uuid[] := coalesce(p_duplicate_ids, array[]::uuid[]);
  v_field jsonb;
  v_table text;
  v_column text;
  v_is_array boolean;
  v_data_type text;
  v_has_org_id boolean;
  v_updated integer;
  v_total integer := 0;
begin
  if v_org_id is null then
    raise exception 'سازمان جاری شناسایی نشد.';
  end if;

  if p_survivor_id is null or v_module_id is null then
    return jsonb_build_object('updated', 0);
  end if;

  -- defensive cleanup: drop nulls and the survivor id itself from the duplicate list
  select coalesce(array_agg(distinct d), array[]::uuid[])
  into v_duplicate_ids
  from unnest(v_duplicate_ids) as d
  where d is not null and d <> p_survivor_id;

  if coalesce(array_length(v_duplicate_ids, 1), 0) = 0 then
    return jsonb_build_object('updated', 0);
  end if;

  -- ---------------------------------------------------------------
  -- Part 1: typed RELATION / MULTI_RELATION fields discovered from
  -- the module registry on the client. Each entry is validated
  -- against information_schema before any dynamic SQL runs.
  -- ---------------------------------------------------------------
  for v_field in select * from jsonb_array_elements(coalesce(p_relation_fields, '[]'::jsonb))
  loop
    v_table := nullif(btrim(coalesce(v_field->>'table', '')), '');
    v_column := nullif(btrim(coalesce(v_field->>'column', '')), '');
    v_is_array := coalesce((v_field->>'isArray')::boolean, false);

    if v_table is null or v_column is null then
      continue;
    end if;

    select c.data_type into v_data_type
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = v_table and c.column_name = v_column;

    select exists(
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_table and column_name = 'org_id'
    ) into v_has_org_id;

    if v_data_type is null or not v_has_org_id then
      continue;
    end if;

    if v_is_array then
      if v_data_type <> 'ARRAY' then
        continue;
      end if;

      execute format(
        $f$update public.%I t set %I = (
          select array_agg(distinct elem)
          from (
            select case when e = any($1) then $2 else e end as elem
            from unnest(t.%I) as e
          ) x
        )
        where t.org_id = $3 and t.%I && $1$f$,
        v_table, v_column, v_column, v_column
      ) using v_duplicate_ids, p_survivor_id, v_org_id;
    else
      if v_data_type <> 'uuid' then
        continue;
      end if;

      execute format(
        'update public.%I set %I = $2 where org_id = $3 and %I = any($1)',
        v_table, v_column, v_column
      ) using v_duplicate_ids, p_survivor_id, v_org_id;
    end if;

    get diagnostics v_updated = row_count;
    v_total := v_total + coalesce(v_updated, 0);
  end loop;

  -- ---------------------------------------------------------------
  -- Part 2: generic polymorphic module_id/record_id references that
  -- exist for every module regardless of its field configuration.
  -- ---------------------------------------------------------------

  -- module_relations (generic linked records, both directions)
  delete from public.module_relations d
  where d.org_id = v_org_id
    and d.from_module = v_module_id
    and d.from_record_id = any(v_duplicate_ids)
    and exists (
      select 1 from public.module_relations s
      where s.org_id = d.org_id
        and s.from_module = v_module_id
        and s.from_record_id = p_survivor_id
        and s.to_module = d.to_module
        and s.to_record_id is not distinct from d.to_record_id
        and s.relation_type = d.relation_type
    );

  update public.module_relations
  set from_record_id = p_survivor_id
  where org_id = v_org_id
    and from_module = v_module_id
    and from_record_id = any(v_duplicate_ids);
  get diagnostics v_updated = row_count;
  v_total := v_total + coalesce(v_updated, 0);

  delete from public.module_relations d
  where d.org_id = v_org_id
    and d.to_module = v_module_id
    and d.to_record_id = any(v_duplicate_ids)
    and exists (
      select 1 from public.module_relations s
      where s.org_id = d.org_id
        and s.to_module = v_module_id
        and s.to_record_id = p_survivor_id
        and s.from_module = d.from_module
        and s.from_record_id is not distinct from d.from_record_id
        and s.relation_type = d.relation_type
    );

  update public.module_relations
  set to_record_id = p_survivor_id
  where org_id = v_org_id
    and to_module = v_module_id
    and to_record_id = any(v_duplicate_ids);
  get diagnostics v_updated = row_count;
  v_total := v_total + coalesce(v_updated, 0);

  -- record_tags (tag assignments) - drop conflicting duplicates first
  delete from public.record_tags d
  where d.org_id = v_org_id
    and d.module_id = v_module_id
    and d.record_id = any(v_duplicate_ids::text[])
    and exists (
      select 1 from public.record_tags s
      where s.org_id = d.org_id
        and s.module_id = v_module_id
        and s.record_id = p_survivor_id::text
        and s.tag_id = d.tag_id
    );

  update public.record_tags
  set record_id = p_survivor_id::text
  where org_id = v_org_id
    and module_id = v_module_id
    and record_id = any(v_duplicate_ids::text[]);
  get diagnostics v_updated = row_count;
  v_total := v_total + coalesce(v_updated, 0);

  -- notes (mentions/timeline) attached to the merged record
  update public.notes
  set record_id = p_survivor_id::text
  where org_id = v_org_id
    and module_id = v_module_id
    and record_id = any(v_duplicate_ids::text[]);
  get diagnostics v_updated = row_count;
  v_total := v_total + coalesce(v_updated, 0);

  -- record_files: files attached directly to the merged record
  update public.record_files
  set record_id = p_survivor_id::text
  where org_id = v_org_id
    and module_id = v_module_id
    and record_id = any(v_duplicate_ids::text[]);
  get diagnostics v_updated = row_count;
  v_total := v_total + coalesce(v_updated, 0);

  -- record_files: files inherited via a "source" record reference
  update public.record_files
  set source_record_id = p_survivor_id::text
  where org_id = v_org_id
    and source_module_id = v_module_id
    and source_record_id = any(v_duplicate_ids::text[]);
  get diagnostics v_updated = row_count;
  v_total := v_total + coalesce(v_updated, 0);

  -- changelogs: keep activity history attached to the surviving record
  update public.changelogs
  set record_id = p_survivor_id::text
  where org_id = v_org_id
    and module_id = v_module_id
    and record_id = any(v_duplicate_ids::text[]);
  get diagnostics v_updated = row_count;
  v_total := v_total + coalesce(v_updated, 0);

  -- notification_inbox_items: keep deep-links pointing at the surviving record
  update public.notification_inbox_items
  set record_id = p_survivor_id::text
  where org_id = v_org_id
    and module_id = v_module_id
    and record_id = any(v_duplicate_ids::text[]);
  get diagnostics v_updated = row_count;
  v_total := v_total + coalesce(v_updated, 0);

  -- journal_entries: accounting vouchers generated from the merged record
  update public.journal_entries
  set source_record_id = p_survivor_id
  where org_id = v_org_id
    and source_module = v_module_id
    and source_record_id = any(v_duplicate_ids);
  get diagnostics v_updated = row_count;
  v_total := v_total + coalesce(v_updated, 0);

  -- journal_entry_links: idempotency keys for accounting auto-posting
  delete from public.journal_entry_links d
  where d.org_id = v_org_id
    and d.source_table = v_module_id
    and d.source_record_id = any(v_duplicate_ids)
    and exists (
      select 1 from public.journal_entry_links s
      where s.org_id = d.org_id
        and s.event_key = d.event_key
        and s.source_table = v_module_id
        and s.source_record_id = p_survivor_id
    );

  update public.journal_entry_links
  set source_record_id = p_survivor_id
  where org_id = v_org_id
    and source_table = v_module_id
    and source_record_id = any(v_duplicate_ids);
  get diagnostics v_updated = row_count;
  v_total := v_total + coalesce(v_updated, 0);

  return jsonb_build_object('updated', v_total, 'duplicate_ids', v_duplicate_ids);
end;
$$;

grant execute on function public.merge_module_record_references(text, uuid, uuid[], jsonb) to authenticated;

commit;
