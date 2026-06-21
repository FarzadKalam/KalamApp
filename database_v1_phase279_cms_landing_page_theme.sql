-- ============================================================
-- Phase 279: CMS Landing Pages — ستون theme (پالت رنگی صفحه)
-- ============================================================
-- اجازه می‌دهد ادمین برای صفحه فرود پالت رنگی/تم انتخاب کند.
-- ساختار: { "paletteKey": "kalam_sky", "custom": { "primary": "#...", "secondary": "#...", "accentPink": "#..." } }
-- ============================================================

ALTER TABLE public.cms_landing_pages
  ADD COLUMN IF NOT EXISTS theme jsonb;

-- بازتعریف RPC عمومی تا theme را هم برگرداند
CREATE OR REPLACE FUNCTION public.get_cms_landing_page(p_slug text)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', lp.id,
    'slug', lp.slug,
    'title', lp.title,
    'sections', lp.sections,
    'theme', lp.theme,
    'seo_title', lp.seo_title,
    'seo_description', lp.seo_description,
    'og_image_url', lp.og_image_url,
    'published_at', lp.published_at,
    'updated_at', lp.updated_at
  )
  FROM public.cms_landing_pages lp
  WHERE lp.slug = p_slug AND lp.is_published = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_cms_landing_page TO anon, authenticated;
