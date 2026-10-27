-- =====================================================
-- KalamApp - Phase 558: approved plan capability corrections
-- Additive / idempotent. Public names and plan placement are finalized here.
-- =====================================================

begin;

update public.saas_plans
set title = case lower(coalesce(code, ''))
      when 'cloud_starter' then 'پایه'
      when 'cloud_growth' then 'رشد'
      when 'cloud_enterprise' then 'سازمانی'
      else title
    end,
    short_description = case lower(coalesce(code, ''))
      when 'cloud_starter' then 'برای شروع نظم فروش، پروژه و ارتباطات داخلی'
      when 'cloud_growth' then 'برای تیم‌های در حال رشد و عملیات چندبخشی'
      when 'cloud_enterprise' then 'برای سازمانی که سیستم را مرکز عملیات می‌خواهد'
      else short_description
    end,
    enabled_modules = case lower(coalesce(code, ''))
      when 'cloud_starter' then jsonb_build_object(
        'customers', true, 'marketing_leads', true, 'invoices', true,
        'purchase_invoices', true, 'products', true, 'warehouses', true,
        'projects', true, 'tasks', true, 'expense_documents', true,
        'web_forms', true, 'assets', true
      )
      when 'cloud_growth' then jsonb_build_object(
        'customers', true, 'marketing_leads', true, 'invoices', true,
        'purchase_invoices', true, 'products', true, 'warehouses', true,
        'shelves', true, 'stock_transfers', true, 'product_bundles', true,
        'projects', true, 'tasks', true, 'process_templates', true,
        'process_runs', true, 'expense_documents', true, 'employees', true,
        'attendance_logs', true, 'leave_requests', true, 'web_forms', true,
        'surveys', true, 'automation_execution_reports', true,
        'sms_delivery_reports', true, 'voip_call_reports', true,
        'counterparty_bot_groups', true, 'price_lists', true,
        'advertising_campaigns', true, 'cash_bank_operations', true,
        'assets', true, 'mbti_assessments', true
      )
      when 'cloud_enterprise' then jsonb_build_object(
        'customers', true, 'marketing_leads', true, 'invoices', true,
        'purchase_invoices', true, 'products', true, 'warehouses', true,
        'shelves', true, 'stock_transfers', true, 'product_bundles', true,
        'projects', true, 'tasks', true, 'process_templates', true,
        'process_runs', true, 'expense_documents', true, 'employees', true,
        'attendance_logs', true, 'work_schedules', true, 'leave_requests', true,
        'overtime_requests', true, 'mission_requests', true, 'payroll_slips', true,
        'employee_contracts', true, 'employee_advances', true,
        'recruitment_applicants', true, 'secretariat_documents', true,
        'delivery_forms', true, 'chart_of_accounts', true, 'journal_entries', true,
        'cash_boxes', true, 'bank_accounts', true, 'petty_funds', true,
        'cheques', true, 'barters', true, 'cash_bank_operations', true,
        'accounting_event_rules', true, 'cost_centers', true, 'fiscal_years', true,
        'web_forms', true, 'surveys', true, 'calculation_formulas', true,
        'automation_execution_reports', true, 'sms_delivery_reports', true,
        'voip_call_reports', true, 'counterparty_bot_groups', true,
        'price_lists', true, 'advertising_campaigns', true, 'assets', true, 'mbti_assessments', true,
        'content_calendars', true
      )
      else enabled_modules
    end,
    enabled_features = case lower(coalesce(code, ''))
      when 'cloud_starter' then jsonb_build_object(
        'ai', true, 'ai_chat', true, 'multi_lane_processes', true,
        'internal_realtime_notifications', true, 'internal_chat', true,
        'organization_chart', true
      )
      when 'cloud_growth' then jsonb_build_object(
        'ai', true, 'ai_chat', true, 'ai_knowledge', true,
        'ai_document_analysis', true, 'ai_web_search', true,
        'ai_voice_input', true, 'ai_voice_output', true,
        'ai_image_generation', true, 'ai_video_generation', true,
        'ai_deep_reasoning', true, 'ai_credit_topup', true, 'multi_lane_processes', true,
        'internal_realtime_notifications', true, 'internal_chat', true,
        'advanced_commission', true, 'performance_payroll_kpi', true,
        'goals', true, 'map_view', true, 'advanced_reports', true,
        'mbti_ai_analysis', true
      )
      when 'cloud_enterprise' then jsonb_build_object(
        'ai', true, 'ai_chat', true, 'ai_knowledge', true,
        'ai_document_analysis', true, 'ai_web_search', true,
        'ai_voice_input', true, 'ai_voice_output', true,
        'ai_image_generation', true, 'ai_video_generation', true,
        'ai_deep_reasoning', true, 'ai_credit_topup', true, 'multi_lane_processes', true,
        'internal_realtime_notifications', true, 'internal_chat', true,
        'advanced_commission', true, 'performance_payroll_kpi', true,
        'goals', true, 'organization_chart', true, 'map_view', true,
        'advanced_reports', true, 'mbti_ai_analysis', true,
        'taxpayer_system', true
      )
      else enabled_features
    end,
    display_features = case lower(coalesce(code, ''))
      when 'cloud_starter' then jsonb_build_array(
        'مشتریان', 'سرنخ‌ها و بازاریابی', 'فاکتور فروش', 'فاکتور خرید',
        'کالاها و خدمات', 'انبارها', 'پروژه‌ها', 'فعالیت‌ها', 'هزینه‌ها',
        'وب‌فرم‌ها', 'اموال', 'گفتگو با هوش مصنوعی', 'فرآیندهای چندردیفه',
        'بستر چت داخلی', 'چارت سازمانی', 'اعلان لحظه‌ای داخل سامانه',
        '۵GB فضای ذخیره‌سازی', 'حداقل ۳ کاربر'
      )
      when 'cloud_growth' then jsonb_build_array(
        'همه امکانات پایه', 'مشتریان', 'سرنخ‌ها و بازاریابی', 'فاکتور فروش',
        'فاکتور خرید', 'کالاها و خدمات', 'انبارها', 'قفسه‌ها',
        'تردد و حواله', 'پکیج‌ها', 'پروژه‌ها', 'فعالیت‌ها',
        'الگوهای فرآیند', 'اجرای فرآیند', 'هزینه‌ها', 'کارکنان',
        'تردد و حضور', 'مرخصی‌ها', 'وب‌فرم‌ها', 'نظرسنجی‌ها',
        'کمپین‌های تبلیغاتی', 'نقد و بانک', 'گزارش اجرای خودکار',
        'گزارش ارسال پیامک', 'گزارش تماس VoIP', 'گروه‌های بات مخاطبان',
        'لیست قیمت‌ها', 'اموال', 'آزمون MBTI', 'گفتگو با هوش مصنوعی',
        'دانش سازمانی هوش مصنوعی', 'تحلیل اسناد با هوش مصنوعی',
        'جستجوی وب هوش مصنوعی', 'ورودی و خروجی صوتی هوش مصنوعی',
        'تولید تصویر و ویدئوی هوش مصنوعی', 'کیف پول مصرف AI', 'محاسبه پورسانت پیشرفته',
        'حقوق مبتنی بر عملکرد (KPI)', 'اهداف', 'نمای نقشه',
        'گزارش‌ساز پیشرفته', '۲۰GB فضای ذخیره‌سازی', 'حداقل ۳ کاربر'
      )
      when 'cloud_enterprise' then jsonb_build_array(
        'همه امکانات رشد', 'مشتریان', 'سرنخ‌ها و بازاریابی', 'فاکتور فروش',
        'فاکتور خرید', 'کالاها و خدمات', 'انبارها', 'قفسه‌ها',
        'تردد و حواله', 'پکیج‌ها', 'پروژه‌ها', 'فعالیت‌ها',
        'الگوهای فرآیند', 'اجرای فرآیند', 'هزینه‌ها', 'کارکنان',
        'تردد و حضور', 'برنامه کاری', 'مرخصی‌ها', 'اضافه‌کاری', 'ماموریت‌ها',
        'فیش حقوقی', 'قراردادها', 'مساعده', 'استخدام', 'دبیرخانه و مکاتبات',
        'فرم‌های تحویل', 'جدول حساب‌ها', 'اسناد حسابداری', 'صندوق نقدی',
        'حساب‌های بانکی', 'تنخواه', 'چک‌ها', 'تهاترها', 'نقد و بانک',
        'قوانین حسابداری خودکار', 'مراکز هزینه', 'سال مالی', 'وب‌فرم‌ها',
        'نظرسنجی‌ها', 'فرمول‌های محاسباتی', 'گزارش اجرای خودکار',
        'گزارش ارسال پیامک', 'گزارش تماس VoIP', 'گروه‌های بات مخاطبان',
        'لیست قیمت‌ها', 'اموال', 'آزمون MBTI', 'تقویم محتوایی',
        'گفتگو با هوش مصنوعی', 'دانش سازمانی هوش مصنوعی',
        'تحلیل اسناد با هوش مصنوعی', 'جستجوی وب هوش مصنوعی',
        'ورودی و خروجی صوتی هوش مصنوعی', 'تولید تصویر و ویدئوی هوش مصنوعی', 'کیف پول مصرف AI',
        'محاسبه پورسانت پیشرفته', 'حقوق مبتنی بر عملکرد (KPI)', 'اهداف',
        'نمای نقشه', 'گزارش‌ساز پیشرفته', 'سامانه مودیان',
        '۵۰GB فضای ذخیره‌سازی', 'حداقل ۳ کاربر'
      )
      else display_features
    end,
    updated_at = now()
where lower(coalesce(code, '')) in ('cloud_starter', 'cloud_growth', 'cloud_enterprise');

notify pgrst, 'reload schema';
commit;
