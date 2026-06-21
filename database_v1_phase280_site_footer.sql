-- ============================================================
-- Phase 280: تنظیمات فوتر سایت (قابل ویرایش از پنل ادمین)
-- ============================================================
-- فوتر در همهٔ صفحات عمومی نمایش داده می‌شود؛ مستقل از وضعیت انتشار
-- صفحهٔ فرود است. در ردیف slug='home' جدول cms_landing_pages نگهداری می‌شود.
-- ساختار footer:
-- { tagline, phone, email, address, copyright,
--   product:[{label,href}], resources:[{label,href}], legalNote }
-- ============================================================

ALTER TABLE public.cms_landing_pages
  ADD COLUMN IF NOT EXISTS footer jsonb;

-- RPC عمومی: فوتر را بدون توجه به وضعیت انتشار برمی‌گرداند.
-- SECURITY DEFINER تا از RLS عبور کند (داده غیرحساس و عمومی است).
CREATE OR REPLACE FUNCTION public.get_site_footer()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT footer
  FROM public.cms_landing_pages
  WHERE slug = 'home'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_site_footer TO anon, authenticated;
