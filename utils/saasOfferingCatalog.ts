import { getAiAgentLabel } from '../supabase/functions/_shared/ai-agents';
import { AI_AGENT_CATALOG, getAiAgentPlanFeatureKey } from './aiAgentCatalog';
export type SaasOfferingOption = {
  id: string;
  label: string;
  description?: string;
};

export const AI_AGENT_PLAN_FEATURES: SaasOfferingOption[] = AI_AGENT_CATALOG.map((agent) => ({
  id: getAiAgentPlanFeatureKey(agent.key),
  label: agent.titleFa,
  description: agent.subtitleFa,
}));

export const SAAS_MODULE_GROUPS: Array<{ label: string; modules: SaasOfferingOption[] }> = [
  { label: 'فروش و بازاریابی', modules: [
    { id: 'customers', label: 'مشتریان' }, { id: 'marketing_leads', label: 'سرنخ‌ها و بازاریابی' },
    { id: 'invoices', label: 'فاکتور فروش' }, { id: 'sales_return_invoices', label: 'برگشت از فروش' }, { id: 'personas', label: 'پرسونای مشتری' }, { id: 'billboard_status_changes', label: 'تغییر وضعیت تابلوها' }, { id: 'price_lists', label: 'لیست قیمت‌ها' }, { id: 'billboards', label: 'تبلیغات محیطی' },
  ] },
  { label: 'خرید و تامین', modules: [
    { id: 'purchase_return_invoices', label: 'برگشت از خرید' }, { id: 'suppliers', label: 'تامین‌کنندگان' }, { id: 'purchase_invoices', label: 'فاکتور خرید' },
    { id: 'expense_documents', label: 'هزینه‌ها' }, { id: 'assets', label: 'اموال' },
  ] },
  { label: 'انبار و تولید', modules: [
    { id: 'products', label: 'کالاها و خدمات' }, { id: 'warehouses', label: 'انبارها' }, { id: 'shelves', label: 'قفسه‌ها' },
    { id: 'stock_transfers', label: 'تردد و حواله' }, { id: 'product_bundles', label: 'پکیج‌ها' }, { id: 'production_boms', label: 'BOM تولید' }, { id: 'production_orders', label: 'سفارشات تولید' }, { id: 'production_group_orders', label: 'سفارش تولید گروهی' },
  ] },
  { label: 'پروژه و فرآیند', modules: [
    { id: 'projects', label: 'پروژه‌ها' }, { id: 'tasks', label: 'فعالیت‌ها' }, { id: 'content_calendars', label: 'تقویم‌های محتوایی' },
    { id: 'process_templates', label: 'الگوهای فرآیند' }, { id: 'process_runs', label: 'اجرای فرآیند' },
    { id: 'goals', label: 'اهداف' }, { id: 'reservations', label: 'رزروها' }, { id: 'reservation_resources', label: 'منابع رزرو' },
  ] },
  { label: 'منابع انسانی', modules: [
    { id: 'mbti_assessments', label: 'ارزیابی شخصیت' }, { id: 'employees', label: 'کارکنان' }, { id: 'job_descriptions', label: 'شرح شغل‌ها' }, { id: 'employee_bonus_requests', label: 'پاداش' }, { id: 'employee_penalty_requests', label: 'جریمه' }, { id: 'attendance_logs', label: 'تردد و حضور' }, { id: 'work_schedules', label: 'برنامه کاری' },
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
    { id: 'automation_execution_reports', label: 'گزارش اتوماسیون' }, { id: 'sms_delivery_reports', label: 'گزارش پیامک' }, { id: 'voip_call_reports', label: 'گزارش تماس' }, { id: 'counterparty_bot_groups', label: 'گروه‌های بات' },
    { id: 'instructions', label: 'آموزش‌ها و دستورالعمل‌ها' }, { id: 'email_delivery_reports', label: 'گزارش ایمیل' }, { id: 'instagram_conversations', label: 'گفتگوهای اینستاگرام' }, { id: 'instagram_interaction_events', label: 'تعامل‌های اینستاگرام' }, { id: 'advertising_campaign_tools', label: 'کانال‌های کمپین' }, { id: 'advertising_campaign_responses', label: 'پاسخ‌های کمپین' },
    { id: 'chat_groups', label: 'بستر چت داخلی' }, { id: 'organization_chart', label: 'چارت سازمانی' },
  ] },
];

export const SAAS_FEATURE_OPTIONS: SaasOfferingOption[] = [
  { id: 'ai_chat', label: getAiAgentLabel('text_chat') }, { id: 'ai_knowledge', label: getAiAgentLabel('organization_knowledge') },
  { id: 'ai_knowledge_limited', label: 'دانش سازمانی هوش مصنوعی (محدود)' },
  { id: 'ai_document_analysis', label: getAiAgentLabel('document_analysis') }, { id: 'ai_web_search', label: getAiAgentLabel('web_search') },
  { id: 'ai_voice_input', label: getAiAgentLabel('voice_input') }, { id: 'ai_voice_output', label: getAiAgentLabel('voice_output') },
  { id: 'ai_image_generation', label: getAiAgentLabel('image_generation') }, { id: 'ai_video_generation', label: getAiAgentLabel('video_generation') },
  { id: 'ai_deep_reasoning', label: getAiAgentLabel('deep_reasoning') },
  { id: 'ai_legal_assistant', label: 'دستیار حقوقی هوش مصنوعی' },
  { id: 'ai_voip_auto_reply', label: 'پاسخگویی خودکار VoIP با هوش مصنوعی' },
  { id: 'ai_staff_bot', label: 'بات هوشمند همکار (تلگرام/بله/روبیکا)' },
  { id: 'ai_background_agents', label: 'ایجنت‌های خودکار پس‌زمینه (زمان‌بندی خودکار)' },
  ...AI_AGENT_PLAN_FEATURES,
  { id: 'taxpayer_system', label: 'سامانه مودیان' },
  { id: 'internal_realtime_notifications', label: 'اعلان لحظه‌ای داخل سامانه' },
  { id: 'organization_email', label: 'ایمیل سازمانی؛ ارسال، دریافت و گزارش‌ها' },
  { id: 'managed_organization_email', label: 'صندوق میزبانی‌شده با نام سازمان روی دامنه تازه سیستم (هزینه‌دار)' },
  { id: 'webhooks', label: 'وب‌هوک و ارسال خودکار رویدادها' }, { id: 'mbti_ai_analysis', label: 'تحلیل هوشمند ارزیابی شخصیت' }, { id: 'support_tickets', label: 'درخواست پشتیبانی' },
  { id: 'api_access', label: 'دسترسی API' }, { id: 'wordpress_connection', label: 'اتصال به وردپرس و ووکامرس' }, { id: 'advanced_reports', label: 'گزارش‌ساز پیشرفته' }, { id: 'map_view', label: 'نمای نقشه' },
  { id: 'multi_lane_processes', label: 'فرآیندهای چندردیفه' }, { id: 'content_calendar', label: 'تقویم محتوایی' },
  { id: 'billboard_status_management', label: 'مدیریت تغییر وضعیت تابلوها' },
  { id: 'white_label', label: 'حذف برند تازه سیستم' }, { id: 'custom_domain', label: 'دامنه اختصاصی' },
  { id: 'own_payment_gateway', label: 'درگاه پرداخت اختصاصی' }, { id: 'online_invoice_payment', label: 'پرداخت آنلاین فاکتور' },
  { id: 'online_catalog', label: 'کاتالوگ آنلاین' }, { id: 'retail_sales_invoice', label: 'فاکتور فروشگاهی سریع' },
  { id: 'reservations', label: 'رزرواسیون' }, { id: 'qr_scan', label: 'اسکن QR' }, { id: 'instagram_inbox', label: 'صندوق اینستاگرام' },
  { id: 'campaign_sms', label: 'کمپین پیامکی' }, { id: 'campaign_email', label: 'کمپین ایمیلی' },
  { id: 'campaign_bot_group', label: 'کمپین گروه بات' }, { id: 'campaign_bot_private', label: 'کمپین پی‌وی بات' },
  { id: 'campaign_instagram_post', label: 'کمپین اینستاگرام' },
  { id: 'campaign_voice_call', label: 'کمپین تماس صوتی' },
  { id: 'saas_account_billing', label: 'مدیریت حساب و اشتراک' }, { id: 'ai_credit_topup', label: 'کیف پول مصرف AI' },
  { id: 'sms_credit_topup', label: 'کیف پول مصرف پیامک' }, { id: 'extra_users_purchase', label: 'خرید کاربر اضافه' },
  { id: 'telegram_bot', label: 'بات تلگرام' }, { id: 'business_model_canvas', label: 'بوم کسب‌وکار' }, { id: 'bale_bot', label: 'بات بله' }, { id: 'rubika_bot', label: 'بات روبیکا' },
  { id: 'internal_chat', label: 'بستر چت داخلی' }, { id: 'organization_chart', label: 'چارت سازمانی' },
  { id: 'advanced_commission', label: 'محاسبه پورسانت پیشرفته' }, { id: 'performance_payroll_kpi', label: 'حقوق مبتنی بر عملکرد (KPI)' },
  { id: 'goals', label: 'اهداف' },
];

const featureGroupIds: Array<{ label: string; ids: string[] }> = [
  { label: 'هوش مصنوعی', ids: ['ai_chat','ai_knowledge','ai_knowledge_limited','ai_document_analysis','ai_web_search','ai_voice_input','ai_voice_output','ai_image_generation','ai_video_generation','ai_deep_reasoning','ai_legal_assistant','ai_voip_auto_reply','ai_staff_bot','ai_background_agents','ai_credit_topup','mbti_ai_analysis'] },
  { label: 'ایجنت‌های هوشمند', ids: AI_AGENT_PLAN_FEATURES.map((item) => item.id) },
  { label: 'ارتباطات و کمپین', ids: ['internal_realtime_notifications','instagram_inbox','campaign_sms','campaign_email','campaign_bot_group','campaign_bot_private','campaign_instagram_post','campaign_voice_call','telegram_bot','bale_bot','rubika_bot'] },
  { label: 'مدیریت و گزارش', ids: ['webhooks','support_tickets','api_access','advanced_reports','map_view','multi_lane_processes','content_calendar','billboard_status_management','white_label','custom_domain','reservations','qr_scan','business_model_canvas','online_catalog'] },
  { label: 'فروش و پرداخت', ids: ['wordpress_connection','taxpayer_system','own_payment_gateway','online_invoice_payment','retail_sales_invoice','saas_account_billing','sms_credit_topup','extra_users_purchase'] },
];
const groupedFeatureIds = new Set(featureGroupIds.flatMap((group) => group.ids));
export const SAAS_FEATURE_GROUPS = [
  ...featureGroupIds.map((group) => ({ label: group.label, features: SAAS_FEATURE_OPTIONS.filter((feature) => group.ids.includes(feature.id)) })),
  { label: 'سایر امکانات', features: SAAS_FEATURE_OPTIONS.filter((feature) => !groupedFeatureIds.has(feature.id)) },
].filter((group) => group.features.length > 0);

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

// Legacy plans inherit a submodule from its parent only until explicitly configured.
export const SAAS_MODULE_PLAN_INHERITANCE: Record<string, string> = {
  sales_return_invoices: 'invoices', purchase_return_invoices: 'purchase_invoices',
  personas: 'marketing_leads', billboard_status_changes: 'billboards',
  production_group_orders: 'production_orders',
  advertising_campaign_tools: 'advertising_campaigns', advertising_campaign_responses: 'advertising_campaigns',
  mbti_assessments: 'employees',
};
export const SAAS_MODULE_FEATURE_INHERITANCE: Record<string, string> = {
  reservations: 'reservations', reservation_resources: 'reservations',
  email_delivery_reports: 'organization_email', instagram_conversations: 'instagram_inbox',
  instagram_interaction_events: 'instagram_inbox',
};
