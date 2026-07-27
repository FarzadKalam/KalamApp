-- ============================================================
-- Phase 345: تعمیر سازگاری تنظیمات فوتر صفحهٔ اصلی
-- ============================================================
-- وضعیت کشف‌شده در محیط‌های قدیمی:
-- جدول cms_landing_pages وجود دارد، اما ستون footer و RPC عمومی
-- آن اجرا نشده‌اند. این migration فقط همان شکاف را به‌صورت additive
-- و idempotent ترمیم می‌کند.
-- ============================================================

ALTER TABLE public.cms_landing_pages
  ADD COLUMN IF NOT EXISTS footer jsonb;

-- فوتر دادهٔ عمومیِ مشخص‌شده برای سایت است. این RPC فقط همان ستون را
-- برمی‌گرداند تا صفحهٔ خانه در حالت پیش‌نویس، محتوای سکشن‌های خود را
-- در اختیار عموم قرار ندهد.
CREATE OR REPLACE FUNCTION public.get_site_footer()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(lp.footer, '{}'::jsonb)
  FROM public.cms_landing_pages lp
  WHERE lp.slug = 'home'
  LIMIT 1;
$$;

-- SECURITY DEFINER نباید به‌طور پیش‌فرض برای همهٔ roleها قابل فراخوانی باشد.
REVOKE ALL ON FUNCTION public.get_site_footer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_site_footer() TO anon, authenticated;
