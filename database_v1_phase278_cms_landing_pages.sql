-- ============================================================
-- Phase 278: CMS — Landing Pages (سکشن‌محور / Elementor سبک)
-- ============================================================
-- صفحه‌های مارکتینگ عمومی (مثل home) به‌صورت آرایه‌ای از سکشن‌ها
-- در ستون jsonb نگهداری می‌شوند تا ادمین تازه‌سیستم بتواند
-- سکشن‌ها را اضافه/جابجا/خاموش/ویرایش کند.
-- Global content (بدون org_id) — مدیریت توسط SaaS admin.
-- خواندن عمومی فقط برای صفحه منتشرشده؛ نوشتن فقط saas_admin.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cms_landing_pages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  title           text,
  sections        jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_published    boolean NOT NULL DEFAULT false,
  published_at    timestamptz,
  -- SEO (اختیاری — اگر null باشد از پیش‌فرض buildHomeSeo استفاده می‌شود)
  seo_title       text,
  seo_description text,
  og_image_url    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cms_landing_pages ENABLE ROW LEVEL SECURITY;

-- خواندن عمومی فقط برای صفحه‌های منتشرشده (fail-closed برای پیش‌نویس)
DROP POLICY IF EXISTS "cms_landing_pages_public_read" ON public.cms_landing_pages;
CREATE POLICY "cms_landing_pages_public_read"
  ON public.cms_landing_pages FOR SELECT
  USING (is_published = true);

-- دسترسی کامل فقط برای SaaS admin (شامل پیش‌نویس)
DROP POLICY IF EXISTS "cms_landing_pages_saas_admin_all" ON public.cms_landing_pages;
CREATE POLICY "cms_landing_pages_saas_admin_all"
  ON public.cms_landing_pages FOR ALL
  USING (public.current_user_has_saas_admin_permission())
  WITH CHECK (public.current_user_has_saas_admin_permission('edit'));

CREATE INDEX IF NOT EXISTS idx_cms_landing_pages_slug ON public.cms_landing_pages (slug);
CREATE INDEX IF NOT EXISTS idx_cms_landing_pages_published ON public.cms_landing_pages (is_published) WHERE is_published = true;

-- ──────────────────────────────────────────────────
-- updated_at trigger (بازاستفاده از cms_set_updated_at موجود)
-- ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS cms_landing_pages_updated_at ON public.cms_landing_pages;
CREATE TRIGGER cms_landing_pages_updated_at
  BEFORE UPDATE ON public.cms_landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.cms_set_updated_at();

-- ──────────────────────────────────────────────────
-- Public RPC: گرفتن صفحه منتشرشده بر اساس slug
-- اگر صفحه‌ای منتشر نشده باشد NULL برمی‌گرداند و فرانت به
-- پیکربندی پیش‌فرض (defaultLandingConfig) fallback می‌کند.
-- ──────────────────────────────────────────────────
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

-- ──────────────────────────────────────────────────
-- Grants
-- ──────────────────────────────────────────────────
GRANT SELECT ON public.cms_landing_pages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cms_landing_pages TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cms_landing_page TO anon, authenticated;

-- ──────────────────────────────────────────────────
-- Seed: ردیف خالی home (پیش‌نویس) تا ادمین بتواند ویرایش کند.
-- sections خالی → فرانت از defaultLandingConfig استفاده می‌کند.
-- ──────────────────────────────────────────────────
INSERT INTO public.cms_landing_pages (slug, title, sections, is_published)
VALUES ('home', 'صفحه اصلی', '[]'::jsonb, false)
ON CONFLICT (slug) DO NOTHING;
