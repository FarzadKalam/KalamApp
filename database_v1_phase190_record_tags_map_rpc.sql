-- Phase 190: Lightweight RPC for record tag maps
-- Goal: move high-traffic tag loading away from oversized GET URLs and into a
--       compact RPC payload so module lists stay stable under load.

DROP FUNCTION IF EXISTS public.get_record_tags_map(text, uuid[]);
DROP FUNCTION IF EXISTS public.get_record_tags_map(text, text[]);

CREATE FUNCTION public.get_record_tags_map(
  p_module_id text,
  p_record_ids text[]
)
RETURNS TABLE (
  record_id text,
  tags jsonb
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    rt.record_id,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'color', t.color
        )
        ORDER BY t.title, t.id
      ) FILTER (WHERE t.id IS NOT NULL),
      '[]'::jsonb
    ) AS tags
  FROM public.record_tags rt
  JOIN public.tags t
    ON t.id = rt.tag_id
  WHERE NULLIF(trim(p_module_id), '') IS NOT NULL
    AND rt.module_id = trim(p_module_id)
    AND p_record_ids IS NOT NULL
    AND cardinality(p_record_ids) > 0
    AND rt.record_id = ANY(p_record_ids)
  GROUP BY rt.record_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_record_tags_map(text, text[]) TO authenticated;
