-- Phase 191: Lightweight RPC for tag-filter record id maps
-- Goal: allow module list tag filters to resolve on the server instead of
--       scanning record_tags page-by-page on the client.

DROP FUNCTION IF EXISTS public.get_record_tag_id_map(text, text[]);

CREATE FUNCTION public.get_record_tag_id_map(
  p_module_id text,
  p_tag_ids text[] DEFAULT NULL
)
RETURNS TABLE (
  record_id text,
  tag_ids text[]
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    rt.record_id,
    array_agg(DISTINCT rt.tag_id::text ORDER BY rt.tag_id::text) AS tag_ids
  FROM public.record_tags rt
  WHERE NULLIF(trim(p_module_id), '') IS NOT NULL
    AND rt.module_id = trim(p_module_id)
    AND (
      COALESCE(cardinality(p_tag_ids), 0) = 0
      OR rt.tag_id::text = ANY(p_tag_ids)
    )
  GROUP BY rt.record_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_record_tag_id_map(text, text[]) TO authenticated;
