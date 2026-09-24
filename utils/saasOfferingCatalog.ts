export type SaasOfferingOption = {
  id: string;
  label: string;
  description?: string;
};

export const SAAS_MODULE_GROUPS: Array<{ label: string; modules: SaasOfferingOption[] }> = [
  { label: 'فروش و بازاریابی', modules: [
    { id: 'customers', label: 'مشتریان' }, { id: 'marketing_leads', label: 'سرنخ‌ها و بازاریابی' },
    { id: 'invoices', label: 'فاکتور فروش' }, { id: 'price_lists', label: 'لیست قیمت‌ها' }, { id: 'billboards', label: 'تبلیغات محیطی' },
  ] },
  { label: 'خرید و تامین', modules: [
    { id: 'suppliers', label: 'تامین‌کنندگان' }, { id: 'purchase_invoices', label: 'فاکتور خرید' },
    { id: 'expense_documents', label: 'هزینه‌ها' }, { id: 'assets', label: 'اموال' },
  ] },
  { label: 'انبار و تولید', modules: [
    { id: 'products', label: 'کالاها و خدمات' }, { id: 'warehouses', label: 'انبارها' }, { id: 'shelves', label: 'قفسه‌ها' },
    { id: 'stock_transfers', label: 'تردد و حواله' }, { id: 'product_bundles', label: 'پکیج‌ها' }, { id: 'production_boms', label: 'BOM تولید' }, { id: 'production_orders', label: 'سفارشات تولید' },
  ] },
  { label: 'پروژه و فرآیند', modules: [
    { id: 'projects', label: 'پروژه‌ها' }, { id: 'tasks', label: 'فعالیت‌ها' }, { id: 'content_calendars', label: 'تقویم‌های محتوایی' },
    { id: 'process_templates', label: 'الگوهای فرآیند' }, { id: 'process_runs', label: 'اجرای فرآیند' },
  ] },
  { label: 'منابع انسانی', modules: [
    { id: 'employees', label: 'کارکنان' }, { id: 'attendance_logs', label: 'تردد و حضور' }, { id: 'work_schedules', label: 'برنامه کاری' },
    { id: 'leave_requests', label: 'مرخصی‌ها' }, { id: 'overtime_requests', label: 'اضافه‌کاری' }, { id: 'mission_requests', label: 'ماموریت‌ها' },
    { id: 'employee_advances', label: 'مساعده' }, { id: 'payroll_slips', label: 'فیش حقوقی' }, { id: 'employee_contracts', label: 'قراردادها' }, { id: 'recruitment_applicants', label: 'استخدام' },
  ] },
  { label: 'مالی و حسابداری', modules: [
    { id: 'chart_of_accounts', label: 'جدول حساب‌ها' }, { id: 'journal_entries', label: 'اسناد حسابداری' }, { id: 'cash_boxes', label: 'صندوق نقدی' },
    { id: 'bank_accounts', label: 'حساب‌های بانکی' }, { id: 'petty_funds', label: 'تنخواه' }, { id: 'cheques', label: 'چک‌ها' },
    { id: 'barters', label: 'تهاترها' }, { id: 'cash_bank_operations', label: 'نقد و بانک' }, { id: 'accounting_event_rules', label: 'قوانین حسابداری خودکار' }, { id: 'cost_centers', label: 'مراکز هزینه' }, { id: 'fiscal_years', label: 'سال مالی' },
  ] },
  { label: 'ارتباطات و گزارش‌ها', modules: [
    { id: 'secretariat_documents', label: 'نامه‌ها و مکاتبات' }, { id: 'advertising_campaigns', label: 'کمپین‌های تبلیغاتی' },
    { id: 'web_forms', label: 'وب‌فرم‌ها' }, { id: 'surveys', label: 'نظرسنجی‌ها' }, { id: 'calculation_formulas', label: 'فرمول‌های محاسباتی' }, { id: 'delivery_forms', label: 'فرم‌های تحویل' },
  ] },
];

export const SAAS_FEATURE_OPTIONS: SaasOfferingOption[] = [
  { id: 'ai_chat', label: 'گفتگو با هوش مصنوعی' }, { id: 'ai_knowledge', label: 'دانش سازمانی هوش مصنوعی' },
  { id: 'ai_document_analysis', label: 'تحلیل اسناد با هوش مصنوعی' }, { id: 'ai_web_search', label: 'جستجوی وب هوش مصنوعی' },
  { id: 'ai_voice_input', label: 'ورودی صوتی هوش مصنوعی' }, { id: 'ai_voice_output', label: 'خروجی صوتی هوش مصنوعی' },
  { id: 'ai_image_generation', label: 'تولید تصویر هوش مصنوعی' }, { id: 'ai_video_generation', label: 'تولید ویدیو هوش مصنوعی' },
  { id: 'ai_deep_reasoning', label: 'تفکر عمیق هوش مصنوعی' }, { id: 'taxpayer_system', label: 'سامانه مودیان' },
  { id: 'internal_realtime_notifications', label: 'اعلان لحظه‌ای داخل سامانه' },
  { id: 'api_access', label: 'دسترسی API' }, { id: 'advanced_reports', label: 'گزارش‌ساز پیشرفته' }, { id: 'map_view', label: 'نمای نقشه' },
  { id: 'multi_lane_processes', label: 'فرآیندهای چندردیفه' }, { id: 'content_calendar', label: 'تقویم محتوایی' },
  { id: 'white_label', label: 'حذف برند تازه سیستم' }, { id: 'custom_domain', label: 'دامنه اختصاصی' },
  { id: 'own_payment_gateway', label: 'درگاه پرداخت اختصاصی' }, { id: 'online_invoice_payment', label: 'پرداخت آنلاین فاکتور' },
  { id: 'online_catalog', label: 'کاتالوگ آنلاین' }, { id: 'retail_sales_invoice', label: 'فاکتور فروشگاهی سریع' },
  { id: 'reservations', label: 'رزرواسیون' }, { id: 'qr_scan', label: 'اسکن QR' }, { id: 'instagram_inbox', label: 'صندوق اینستاگرام' },
  { id: 'campaign_sms', label: 'کمپین پیامکی' }, { id: 'campaign_email', label: 'کمپین ایمیلی' }, { id: 'campaign_instagram_post', label: 'کمپین اینستاگرام' },
  { id: 'saas_account_billing', label: 'مدیریت حساب و اشتراک' }, { id: 'ai_credit_topup', label: 'کیف پول مصرف AI' },
  { id: 'sms_credit_topup', label: 'کیف پول مصرف پیامک' }, { id: 'extra_users_purchase', label: 'خرید کاربر اضافه' },
  { id: 'business_model_canvas', label: 'بوم کسب‌وکار' }, { id: 'bale_bot', label: 'بات بله' }, { id: 'rubika_bot', label: 'بات روبیکا' },
];

export const SAAS_QUOTA_OPTIONS: SaasOfferingOption[] = [
  { id: 'users', label: 'کاربر اضافه' },
  { id: 'storage_gb', label: 'فضای ذخیره‌سازی اضافه (گیگابایت)' },
  { id: 'scheduled_runs', label: 'زمان‌بندی خودکار اضافه' },
  { id: 'active_workflows', label: 'گردش‌کار فعال اضافه' },
  { id: 'instagram_accounts', label: 'حساب اینستاگرام اضافه' },
  { id: 'webhooks', label: 'وب‌هوک اضافه' },
  { id: 'bot_connections', label: 'اتصال بات اضافه' },
  { id: 'sms_credit', label: 'اعتبار پیامک' },
];

export const SAAS_MODULE_LABELS = Object.fromEntries(
  SAAS_MODULE_GROUPS.flatMap((group) => group.modules.map((item) => [item.id, item.label])),
);

export const SAAS_FEATURE_LABELS = Object.fromEntries(
  SAAS_FEATURE_OPTIONS.map((item) => [item.id, item.label]),
);
