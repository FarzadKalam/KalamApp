-- گزارش‌های انتخاب‌شده برای اسلایدر داشبورد، در هر سازمان بدون اسکن همهٔ گزارش‌ها خوانده شوند.
-- این تنظیم در JSONB گزارش نگهداری می‌شود تا برای همهٔ tenantها قابل‌حمل باقی بماند.
CREATE INDEX IF NOT EXISTS idx_report_definitions_dashboard_members
  ON public.report_definitions (org_id, updated_at DESC)
  WHERE is_active = true
    AND COALESCE(config ->> 'show_in_members_dashboard', 'false') = 'true';
