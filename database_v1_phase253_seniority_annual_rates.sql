-- Phase 253: جدول نرخ‌های سالانه پایه سنوات + ستون seniority_mode روی کارمندان
-- این جدول داده‌های مرجع ملی (بدون org_id) است که هر سال با مصوبه شورای عالی کار آپدیت می‌شود.

-- جدول نرخ‌های سالانه پایه سنوات
CREATE TABLE IF NOT EXISTS public.seniority_annual_rates (
  id                       uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  persian_year             integer                 NOT NULL UNIQUE,
  daily_rate_rials         numeric(14, 0)          NOT NULL DEFAULT 0,
  monthly_rate_30day_rials numeric(14, 0)          NOT NULL DEFAULT 0,
  monthly_rate_31day_rials numeric(14, 0)          NOT NULL DEFAULT 0,
  notes                    text,
  created_at               timestamptz             NOT NULL DEFAULT now(),
  updated_at               timestamptz             NOT NULL DEFAULT now()
);

ALTER TABLE public.seniority_annual_rates ENABLE ROW LEVEL SECURITY;

-- همه کاربران احراز هویت‌شده می‌توانند بخوانند (داده مرجع ملی)
DROP POLICY IF EXISTS "authenticated read seniority rates" ON public.seniority_annual_rates;
CREATE POLICY "authenticated read seniority rates"
  ON public.seniority_annual_rates
  FOR SELECT
  TO authenticated
  USING (true);

-- ایندکس روی سال شمسی (برای lookup سریع)
CREATE INDEX IF NOT EXISTS idx_seniority_annual_rates_year
  ON public.seniority_annual_rates (persian_year);

-- Seed داده‌های تأییدشده (منبع: مصوبات شورای عالی کار)
-- 1403: روزانه 70,000 ریال  ← ماهانه 30 روز: 2,100,000 ریال
-- 1404: روزانه 94,000 ریال  ← ماهانه 30 روز: 2,820,000 ریال
-- 1405: تا اعلام رسمی، همان نرخ 1404 اعمال می‌شود
INSERT INTO public.seniority_annual_rates
  (persian_year, daily_rate_rials, monthly_rate_30day_rials, monthly_rate_31day_rials, notes)
VALUES
  (1400,  27000,   810000,   837000, 'تخمینی - نیاز به تأیید رسمی'),
  (1401,  36500,  1095000,  1131500, 'تخمینی - نیاز به تأیید رسمی'),
  (1402,  55000,  1650000,  1705000, 'تأیید شده'),
  (1403,  70000,  2100000,  2170000, 'تأیید شده - مصوبه شورای عالی کار'),
  (1404,  94000,  2820000,  2914000, 'تأیید شده - مصوبه شورای عالی کار'),
  (1405,  94000,  2820000,  2914000, 'برابر با 1404 تا اعلام رسمی - به‌روزرسانی شود')
ON CONFLICT (persian_year) DO NOTHING;

-- ستون روش محاسبه سنوات روی جدول کارمندان
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS seniority_mode text NOT NULL DEFAULT 'manual';

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS chk_employees_seniority_mode;
ALTER TABLE public.employees
  ADD CONSTRAINT chk_employees_seniority_mode
    CHECK (seniority_mode IN ('manual', 'labor_law'));
