import {
  BlockType,
  FieldLocation,
  FieldNature,
  FieldType,
  LogicOperator,
  ModuleDefinition,
  ModuleNature,
  ViewMode,
} from '../types';

export const customerModule: ModuleDefinition = {
  id: 'customers',
  titles: { fa: 'مدیریت مشتریان', faSingular: 'مشتری', en: 'Customers' },
  nature: ModuleNature.CRM,
  dashboard: {
    quickCreateLabel: 'مشتری جدید',
    recentListFields: ['full_name', 'business_name', 'mobile_1', 'rank'],
    summaryCard: {
      preset: 'customers_new_mine',
      title: 'مشتریان ثبت شده جدید',
    },
  },
  relationDisplay: {
    labelTemplate: '{{full_name}} - {{business_name}}',
    searchFields: ['full_name', 'first_name', 'last_name', 'business_name', 'legal_name', 'mobile_1', 'phone', 'system_code', 'legacy_contact_code', 'accounting_code', 'id'],
  },
  supportedViewModes: [ViewMode.LIST, ViewMode.KANBAN],
  defaultViewMode: ViewMode.LIST,
  fields: [
    { key: 'image_url', labels: { fa: 'تصویر', en: 'Image' }, type: FieldType.IMAGE, location: FieldLocation.HEADER, order: 0.8 },

    { key: 'full_name', labels: { fa: 'نام کامل مشتری', en: 'Full Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, isTableColumn: true, isKey: true },
    {
      key: 'person_type',
      labels: { fa: 'نوع شخص', en: 'Person Type' },
      type: FieldType.SELECT,
      location: FieldLocation.HEADER,
      order: 1.1,
      options: [
        { label: 'حقیقی', value: 'real', color: 'green' },
        { label: 'حقوقی', value: 'legal', color: 'blue' }
      ],
      defaultValue: 'real',
      isTableColumn: true,
    },
    { key: 'prefix', labels: { fa: 'پیشوند', en: 'Prefix' }, type: FieldType.SELECT, location: FieldLocation.HEADER, order: 1.2, options: [{ label: 'آقای', value: 'آقای' }, { label: 'خانم', value: 'خانم' }, { label: 'آقای دکتر', value: 'آقای دکتر' }, { label: 'خانم دکتر', value: 'خانم دکتر' }, { label: 'آقای مهندس', value: 'آقای مهندس' }, { label: 'خانم مهندس', value: 'خانم مهندس' }], logic: { visibleIf: { field: 'person_type', operator: LogicOperator.EQUALS, value: 'real' } } },
    { key: 'first_name', labels: { fa: 'نام', en: 'First Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1.3, isTableColumn: true, logic: { visibleIf: { field: 'person_type', operator: LogicOperator.EQUALS, value: 'real' } } },
    { key: 'last_name', labels: { fa: 'نام خانوادگی', en: 'Last Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1.4, isTableColumn: true, logic: { visibleIf: { field: 'person_type', operator: LogicOperator.EQUALS, value: 'real' } } },
    { key: 'legal_name', labels: { fa: 'نام حقوقی', en: 'Legal Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1.45, logic: { visibleIf: { field: 'person_type', operator: LogicOperator.EQUALS, value: 'legal' } } },
    { key: 'business_name', labels: { fa: 'نام کسب و کار', en: 'Business' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1.5, isTableColumn: true },
    {
      key: 'persona_id',
      labels: { fa: 'پرسونا', en: 'Persona' },
      type: FieldType.RELATION,
      location: FieldLocation.HEADER,
      order: 1.51,
      relationConfig: {
        targetModule: 'personas',
        targetField: 'display_name',
        filter: { persona_type: 'customer' },
      },
      isTableColumn: true,
    },

    { key: 'system_code', labels: { fa: 'کد اشتراک', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true, nature: FieldNature.SYSTEM, hideInCreateForm: true, isTableColumn: true },
    { key: 'legacy_contact_code', labels: { fa: 'کد سیستم قبلی', en: 'Legacy Contact Code' }, type: FieldType.TEXT, blockId: 'basic_info', order: 4.46, isTableColumn: false },
    {
      key: 'rank', labels: { fa: 'سطح مشتری', en: 'Rank' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 1.1,
      options: [
        { label: 'عادی', value: 'normal', color: 'blue' },
        { label: 'نقره‌ای', value: 'silver', color: 'gray' },
        { label: 'طلایی', value: 'gold', color: 'gold' },
        { label: 'VIP', value: 'vip', color: 'purple' }
      ], defaultValue: 'normal', isTableColumn: true
    },
    { key: 'mobile_1', labels: { fa: 'موبایل اصلی', en: 'Mobile' }, type: FieldType.PHONE, location: FieldLocation.HEADER, order: 1.55, isTableColumn: true },
    {
      key: 'auto_name_enabled',
      labels: { fa: 'نامگذاری خودکار', en: 'Auto Name' },
      type: FieldType.CHECKBOX,
      blockId: 'basic_info',
      order: 3.2,
      defaultValue: false,
      isTableColumn: false,
    },

    {
      key: 'is_supplier',
      labels: { fa: 'این مشتری تامین‌کننده هم هست', en: 'Also Supplier' },
      type: FieldType.CHECKBOX,
      blockId: 'basic_info',
      order: 3.25,
      isTableColumn: false,
    },
    {
      key: 'linked_supplier_id',
      labels: { fa: 'تامین‌کننده مرتبط', en: 'Related Supplier' },
      type: FieldType.RELATION,
      blockId: 'basic_info',
      order: 3.26,
      relationConfig: { targetModule: 'suppliers', targetField: 'business_name' },
      logic: { visibleIf: { field: 'is_supplier', operator: LogicOperator.IS_TRUE } },
    },
    {
      key: 'is_employee',
      labels: { fa: 'این مشتری کارمند هم هست', en: 'Also Employee' },
      type: FieldType.CHECKBOX,
      blockId: 'basic_info',
      order: 3.3,
      isTableColumn: false,
    },
    {
      key: 'related_employee_id',
      labels: { fa: 'کاربر مرتبط', en: 'Related User' },
      type: FieldType.RELATION,
      blockId: 'basic_info',
      order: 3.35,
      relationConfig: { targetModule: 'profiles', targetField: 'full_name' },
      logic: { visibleIf: { field: 'is_employee', operator: LogicOperator.IS_TRUE } },
    },
    {
      key: 'linked_employee_id',
      labels: { fa: 'کارمند مرتبط', en: 'Related Employee' },
      type: FieldType.RELATION,
      blockId: 'basic_info',
      order: 3.36,
      relationConfig: { targetModule: 'employees', targetField: 'full_name' },
      logic: { visibleIf: { field: 'is_employee', operator: LogicOperator.IS_TRUE } },
    },
    { key: 'birth_date', labels: { fa: 'تاریخ تولد', en: 'Birthday' }, type: FieldType.DATE, blockId: 'basic_info', order: 3.5, defaultValue: null, logic: { visibleIf: { field: 'person_type', operator: LogicOperator.EQUALS, value: 'real' } } },
    {
      key: 'national_code',
      labels: { fa: 'کد ملی', en: 'National Code' },
      type: FieldType.TEXT,
      blockId: 'basic_info',
      order: 4.1,
      logic: { visibleIf: { field: 'person_type', operator: LogicOperator.EQUALS, value: 'real' } }
    },
    {
      key: 'national_id',
      labels: { fa: 'شناسه ملی', en: 'National ID' },
      type: FieldType.TEXT,
      blockId: 'basic_info',
      order: 4.2,
      logic: { visibleIf: { field: 'person_type', operator: LogicOperator.EQUALS, value: 'legal' } }
    },
    {
      key: 'registration_number',
      labels: { fa: 'شماره ثبت', en: 'Registration Number' },
      type: FieldType.TEXT,
      blockId: 'basic_info',
      order: 4.3,
      logic: { visibleIf: { field: 'person_type', operator: LogicOperator.EQUALS, value: 'legal' } }
    },
    {
      key: 'economic_code',
      labels: { fa: 'کد اقتصادی', en: 'Economic Code' },
      type: FieldType.TEXT,
      blockId: 'basic_info',
      order: 4.4
    },
    {
      key: 'accounting_code',
      labels: { fa: 'کد حسابداری', en: 'Accounting Code' },
      type: FieldType.TEXT,
      blockId: 'basic_info',
      order: 4.45,
      isTableColumn: true,
    },
    {
      key: 'lead_source',
      labels: { fa: 'منبع سرنخ', en: 'Lead Source' },
      type: FieldType.SELECT,
      blockId: 'basic_info',
      order: 4.5,
      dynamicOptionsCategory: 'lead_source',
    },
    {
      key: 'industry',
      labels: { fa: 'صنعت', en: 'Industry' },
      type: FieldType.SELECT,
      blockId: 'basic_info',
      order: 2.05,
      dynamicOptionsCategory: 'customer_industry',
      isTableColumn: true,
    },
    {
      key: 'referrer_module',
      labels: { fa: 'نوع معرف', en: 'Referrer Type' },
      type: FieldType.SELECT,
      blockId: 'basic_info',
      order: 4.65,
      options: [
        { label: 'مشتری', value: 'customers' },
        { label: 'کارمند', value: 'employees' },
        { label: 'تامین‌کننده', value: 'suppliers' }
      ],
    },
    {
      key: 'referrer_customer_id',
      labels: { fa: 'معرف', en: 'Referrer Customer' },
      type: FieldType.RELATION,
      blockId: 'basic_info',
      order: 4.66,
      relationConfig: { targetModule: 'customers', targetField: 'full_name' },
      logic: { visibleIf: { field: 'referrer_module', operator: LogicOperator.EQUALS, value: 'customers' } },
    },
    {
      key: 'referrer_employee_id',
      labels: { fa: 'معرف', en: 'Referrer Employee' },
      type: FieldType.RELATION,
      blockId: 'basic_info',
      order: 4.67,
      relationConfig: { targetModule: 'employees', targetField: 'full_name' },
      logic: { visibleIf: { field: 'referrer_module', operator: LogicOperator.EQUALS, value: 'employees' } },
    },
    {
      key: 'referrer_supplier_id',
      labels: { fa: 'معرف', en: 'Referrer Supplier' },
      type: FieldType.RELATION,
      blockId: 'basic_info',
      order: 4.68,
      relationConfig: { targetModule: 'suppliers', targetField: 'business_name' },
      logic: { visibleIf: { field: 'referrer_module', operator: LogicOperator.EQUALS, value: 'suppliers' } },
    },
    { key: 'organization_position', labels: { fa: 'سمت در سازمان', en: 'Position In Organization' }, type: FieldType.TEXT, blockId: 'basic_info', order: 4.69 },
    { key: 'customer_interests', labels: { fa: 'علاقمندی‌های مشتری', en: 'Customer Interests' }, type: FieldType.MULTI_SELECT, blockId: 'basic_info', order: 4.7, dynamicOptionsCategory: 'customer_interests', isTableColumn: true },
    { key: 'notes', labels: { fa: 'توضیحات', en: 'notes' }, type: FieldType.LONG_TEXT, order: 20, blockId: 'basic_info' },

    { key: 'email', labels: { fa: 'ایمیل', en: 'Email' }, type: FieldType.TEXT, blockId: 'contact_info' },
    { key: 'mobile_2', labels: { fa: 'موبایل دوم', en: 'Mobile 2' }, type: FieldType.PHONE, blockId: 'contact_info' },
    { key: 'phone', labels: { fa: 'تلفن ثابت', en: 'Phone' }, type: FieldType.PHONE, blockId: 'contact_info' },
    { key: 'assistant_phone', labels: { fa: 'تلفن دستیار', en: 'Assistant Phone' }, type: FieldType.PHONE, blockId: 'contact_info' },
    { key: 'province', labels: { fa: 'استان', en: 'Province' }, type: FieldType.SELECT, blockId: 'contact_info', dynamicOptionsCategory: 'provinces' },
    { key: 'city', labels: { fa: 'شهر', en: 'City' }, type: FieldType.SELECT, blockId: 'contact_info', dynamicOptionsCategory: 'cities' },
    { key: 'postal_code', labels: { fa: 'کد پستی', en: 'Postal Code' }, type: FieldType.TEXT, blockId: 'contact_info' },
    { key: 'address', labels: { fa: 'آدرس پستی', en: 'Address' }, type: FieldType.LONG_TEXT, blockId: 'contact_info' },
    { key: 'location', labels: { fa: 'لوکیشن', en: 'Location' }, type: FieldType.LOCATION, blockId: 'contact_info' },
    { key: 'instagram_id', labels: { fa: 'آیدی اینستاگرام', en: 'Instagram' }, type: FieldType.TEXT, blockId: 'contact_info' },
    { key: 'telegram_id', labels: { fa: 'آیدی تلگرام', en: 'Telegram' }, type: FieldType.TEXT, blockId: 'contact_info' },

    { key: 'portal_enabled', labels: { fa: 'دسترسی پورتال', en: 'Portal Enabled' }, type: FieldType.CHECKBOX, blockId: 'portal_info', order: 1, isTableColumn: false },
    {
      key: 'portal_status',
      labels: { fa: 'وضعیت پورتال', en: 'Portal Status' },
      type: FieldType.STATUS,
      blockId: 'portal_info',
      order: 2,
      options: [
        { label: 'غیرفعال', value: 'disabled', color: 'gray' },
        { label: 'دعوت شده', value: 'invited', color: 'blue' },
        { label: 'فعال', value: 'active', color: 'green' },
        { label: 'معلق', value: 'suspended', color: 'red' }
      ],
      defaultValue: 'disabled',
      logic: { visibleIf: { field: 'portal_enabled', operator: LogicOperator.IS_TRUE } }
    },
    {
      key: 'preferred_notification_channel',
      labels: { fa: 'بات اطلاع‌رسانی', en: 'Notification Bot' },
      type: FieldType.SELECT,
      blockId: 'portal_info',
      order: 3,
      botSettingsOnly: true,
      options: [
        { label: 'روبیکا', value: 'rubika' },
        { label: 'تلگرام', value: 'telegram' },
        { label: 'بله', value: 'bale' },
        { label: 'بدون بات', value: 'none' }
      ],
      defaultValue: 'none',
      logic: { visibleIf: { field: 'portal_enabled', operator: LogicOperator.IS_TRUE } }
    },
    { key: 'telegram_chat_id', labels: { fa: 'شناسه چت تلگرام', en: 'Telegram Chat Id' }, type: FieldType.TEXT, blockId: 'portal_info', order: 4, botSettingsOnly: true },
    { key: 'bale_chat_id', labels: { fa: 'شناسه چت بله', en: 'Bale Chat Id' }, type: FieldType.TEXT, blockId: 'portal_info', order: 5, botSettingsOnly: true },
    { key: 'rubika_chat_id', labels: { fa: 'شناسه چت روبیکا', en: 'Rubika Chat Id' }, type: FieldType.TEXT, blockId: 'portal_info', order: 6, botSettingsOnly: true },
    {
      key: 'bot_default_channel',
      labels: { fa: 'پلتفرم اصلی بات', en: 'Bot Default Channel' },
      type: FieldType.SELECT,
      blockId: 'portal_info',
      order: 6.1,
      botSettingsOnly: true,
      virtualBotField: true,
      options: [
        { label: 'روبیکا', value: 'rubika' },
        { label: 'تلگرام', value: 'telegram' },
        { label: 'بله', value: 'bale' },
        { label: 'بدون بات', value: 'none' }
      ],
      defaultValue: 'none',
    },
    { key: 'telegram_group_join_link', labels: { fa: 'لینک گروه تلگرام', en: 'Telegram Group Join Link' }, type: FieldType.LINK, blockId: 'portal_info', order: 6.2, botSettingsOnly: true, virtualBotField: true },
    { key: 'bale_group_join_link', labels: { fa: 'لینک گروه بله', en: 'Bale Group Join Link' }, type: FieldType.LINK, blockId: 'portal_info', order: 6.3, botSettingsOnly: true, virtualBotField: true },
    { key: 'rubika_group_join_link', labels: { fa: 'لینک گروه روبیکا', en: 'Rubika Group Join Link' }, type: FieldType.LINK, blockId: 'portal_info', order: 6.4, botSettingsOnly: true, virtualBotField: true },
    {
      key: 'telegram_group_status',
      labels: { fa: 'وضعیت گروه تلگرام', en: 'Telegram Group Status' },
      type: FieldType.STATUS,
      blockId: 'portal_info',
      order: 6.5,
      botSettingsOnly: true,
      virtualBotField: true,
      options: [
        { label: 'در انتظار پیام', value: 'pending_join', color: 'orange' },
        { label: 'فعال', value: 'active', color: 'green' },
        { label: 'غیرفعال', value: 'disabled', color: 'gray' },
        { label: 'خطا', value: 'error', color: 'red' }
      ],
    },
    {
      key: 'bale_group_status',
      labels: { fa: 'وضعیت گروه بله', en: 'Bale Group Status' },
      type: FieldType.STATUS,
      blockId: 'portal_info',
      order: 6.6,
      botSettingsOnly: true,
      virtualBotField: true,
      options: [
        { label: 'در انتظار پیام', value: 'pending_join', color: 'orange' },
        { label: 'فعال', value: 'active', color: 'green' },
        { label: 'غیرفعال', value: 'disabled', color: 'gray' },
        { label: 'خطا', value: 'error', color: 'red' }
      ],
    },
    {
      key: 'rubika_group_status',
      labels: { fa: 'وضعیت گروه روبیکا', en: 'Rubika Group Status' },
      type: FieldType.STATUS,
      blockId: 'portal_info',
      order: 6.7,
      botSettingsOnly: true,
      virtualBotField: true,
      options: [
        { label: 'در انتظار پیام', value: 'pending_join', color: 'orange' },
        { label: 'فعال', value: 'active', color: 'green' },
        { label: 'غیرفعال', value: 'disabled', color: 'gray' },
        { label: 'خطا', value: 'error', color: 'red' }
      ],
    },
    { key: 'telegram_group_title', labels: { fa: 'عنوان گروه تلگرام', en: 'Telegram Group Title' }, type: FieldType.TEXT, blockId: 'portal_info', order: 6.8, botSettingsOnly: true, virtualBotField: true },
    { key: 'bale_group_title', labels: { fa: 'عنوان گروه بله', en: 'Bale Group Title' }, type: FieldType.TEXT, blockId: 'portal_info', order: 6.9, botSettingsOnly: true, virtualBotField: true },
    { key: 'rubika_group_title', labels: { fa: 'عنوان گروه روبیکا', en: 'Rubika Group Title' }, type: FieldType.TEXT, blockId: 'portal_info', order: 6.95, botSettingsOnly: true, virtualBotField: true },
    { key: 'portal_last_login_at', labels: { fa: 'آخرین ورود پورتال', en: 'Portal Last Login' }, type: FieldType.DATETIME, blockId: 'portal_info', order: 7, readonly: true, logic: { visibleIf: { field: 'portal_enabled', operator: LogicOperator.IS_TRUE } } },
    { key: 'portal_permissions_override', labels: { fa: 'تنظیمات اختصاصی پورتال', en: 'Portal Permission Override' }, type: FieldType.JSON, blockId: 'portal_info', order: 8, logic: { visibleIf: { field: 'portal_enabled', operator: LogicOperator.IS_TRUE } } },

    {
      key: 'process_template_id',
      labels: { fa: 'الگوی فرآیند اجرا', en: 'Execution Template' },
      type: FieldType.RELATION,
      location: FieldLocation.BLOCK,
      blockId: 'process',
      order: 1,
      relationConfig: { targetModule: 'process_templates', targetField: 'name' },
      nature: FieldNature.STANDARD,
    },
    {
      key: 'execution_process_draft',
      labels: { fa: 'فرآیند اجرا', en: 'Execution Process' },
      type: FieldType.JSON,
      location: FieldLocation.BLOCK,
      blockId: 'process',
      order: 2,
      nature: FieldNature.STANDARD,
    },

    { key: 'previous_system_first_purchase_date', labels: { fa: 'تاریخ اولین خرید سیستم قبلی', en: 'Previous System First Purchase' }, type: FieldType.DATE, blockId: 'previous_system_info' },
    { key: 'previous_system_last_purchase_date', labels: { fa: 'تاریخ آخرین خرید سیستم قبلی', en: 'Previous System Last Purchase' }, type: FieldType.DATE, blockId: 'previous_system_info' },
    { key: 'previous_system_purchase_count', labels: { fa: 'تعداد دفعات خرید سیستم قبلی', en: 'Previous System Purchase Count' }, type: FieldType.NUMBER, blockId: 'previous_system_info' },
    { key: 'previous_system_invoice_total', labels: { fa: 'جمع فاکتورهای سیستم قبلی', en: 'Previous System Invoice Total' }, type: FieldType.PRICE, blockId: 'previous_system_info' },
    { key: 'previous_system_paid_total', labels: { fa: 'جمع پرداخت‌های سیستم قبلی', en: 'Previous System Paid Total' }, type: FieldType.PRICE, blockId: 'previous_system_info' },
    { key: 'previous_system_balance_total', labels: { fa: 'مانده اول دوره سیستم قبلی', en: 'Previous System Opening Balance' }, type: FieldType.PRICE, blockId: 'previous_system_info', allowNegative: true },

    { key: 'first_purchase_date', labels: { fa: 'تاریخ اولین خرید', en: 'First Purchase' }, type: FieldType.DATE, blockId: 'financial_stats', readonly: true },
    { key: 'last_purchase_date', labels: { fa: 'تاریخ آخرین خرید', en: 'Last Purchase' }, type: FieldType.DATE, blockId: 'financial_stats', readonly: true },
    { key: 'purchase_count', labels: { fa: 'تعداد دفعات خرید', en: 'Count' }, type: FieldType.NUMBER, blockId: 'financial_stats', readonly: true },
    { key: 'total_spend', labels: { fa: 'جمع فاکتورهای مشتری', en: 'Customer Invoice Total' }, type: FieldType.PRICE, blockId: 'financial_stats', readonly: true },
    { key: 'total_paid_amount', labels: { fa: 'جمع پرداخت‌های مشتری', en: 'Customer Payment Total' }, type: FieldType.PRICE, blockId: 'financial_stats', readonly: true },
    { key: 'total_balance', labels: { fa: 'جمع مانده مشتری', en: 'Customer Balance Total' }, type: FieldType.PRICE, blockId: 'financial_stats', readonly: true },
    { key: 'online_account_card_link', labels: { fa: 'لینک کارت حساب آنلاین', en: 'Online Account Card Link' }, type: FieldType.LINK, blockId: 'financial_stats', readonly: true, nature: FieldNature.STANDARD, hideInCreateForm: true },
    { key: 'loyalty_credit_balance', labels: { fa: 'اعتبار باشگاه مشتریان', en: 'Customer Club Credit' }, type: FieldType.PRICE, blockId: 'financial_stats', readonly: true, isTableColumn: true },
    { key: 'acquaintance_days', labels: { fa: 'تعداد روزهای آشنایی', en: 'Acquaintance Days' }, type: FieldType.NUMBER, blockId: 'financial_stats', readonly: true },
    { key: 'cooperation_days', labels: { fa: 'تعداد روزهای همکاری', en: 'Cooperation Days' }, type: FieldType.NUMBER, blockId: 'financial_stats', readonly: true },
  
    { key: 'tags', labels: { fa: 'برچسب‌ها', en: 'Tags' }, type: FieldType.TAGS, location: FieldLocation.HEADER, order: 2.3, nature: FieldNature.STANDARD, isTableColumn: true },
],
  blocks: [
    {
      id: 'basic_info', titles: { fa: 'اطلاعات پایه', en: 'Basic Info' }, type: BlockType.FIELD_GROUP,
      order: 0
    },
    {
      id: 'contact_info', titles: { fa: 'اطلاعات تماس', en: 'Contact Info' }, type: BlockType.FIELD_GROUP,
      order: 0
    },
    {
      id: 'financial_stats', titles: { fa: 'آمار مالی و سوابق', en: 'Financial Stats' }, type: BlockType.FIELD_GROUP,
      order: 0
    },
    {
      id: 'previous_system_info', titles: { fa: 'اطلاعات سیستم قبلی', en: 'Previous System Info' }, type: BlockType.FIELD_GROUP,
      order: 0
    },
    {
      id: 'portal_info', titles: { fa: 'پورتال و اطلاع‌رسانی', en: 'Portal & Notifications' }, type: BlockType.FIELD_GROUP,
      order: 0
    },
  ],
  relatedTabs: [
    {
      id: 'customer_invoices',
      title: 'فاکتورهای مشتری',
      icon: 'FileTextOutlined',
      relationType: 'fk',
      targetModule: 'invoices',
      foreignKey: 'customer_id'
    },
    {
      id: 'customer_financial_overview',
      title: 'وضعیت مالی',
      icon: 'CreditCardOutlined',
      relationType: 'operational_financial_overview',
      targetModule: 'customers',
      disableCreate: true,
    },
    {
      id: 'customer_products',
      title: 'محصولات خریداری شده',
      icon: 'ShoppingOutlined',
      relationType: 'customer_products',
      targetModule: 'products'
    },
    {
      id: 'customer_bot_groups',
      title: 'گروه‌های بات',
      icon: 'AppstoreOutlined',
      relationType: 'fk',
      targetModule: 'counterparty_bot_groups',
      foreignKey: 'customer_id'
    },
    {
      id: 'customer_sms_reports',
      title: 'پیامک‌ها',
      icon: 'MessageOutlined',
      relationType: 'phone_directory',
      targetModule: 'sms_delivery_reports',
      disableCreate: true
    },
    {
      id: 'customer_voip_calls',
      title: 'تماس‌ها',
      icon: 'PhoneOutlined',
      relationType: 'phone_directory',
      targetModule: 'voip_call_reports',
      disableCreate: true
    },
    {
      id: 'customer_surveys',
      title: 'نظرسنجی‌ها',
      icon: 'CommentOutlined',
      relationType: 'fk',
      targetModule: 'surveys',
      foreignKey: 'related_record_id',
      filters: [{ field: 'related_module_id', value: 'customers' }],
    }
  ],
  actionButtons: [
    { id: 'auto_name', label: 'نامگذاری خودکار', placement: 'form', variant: 'primary' },
  ],
  table: 'customers'
};
