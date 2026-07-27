import {
  ModuleDefinition,
  ModuleNature,
  ViewMode,
  FieldType,
  FieldLocation,
  BlockType,
  LogicOperator,
  FieldNature,
} from '../types';

export const supplierModule: ModuleDefinition = {
  id: 'suppliers',
  titles: { fa: 'مدیریت تامین‌کنندگان', en: 'Suppliers' },
  nature: ModuleNature.STANDARD,
  relationDisplay: {
    labelTemplate: '{{business_name}} - {{last_name}}',
    searchFields: ['business_name', 'first_name', 'last_name', 'mobile_1', 'phone', 'system_code', 'id'],
  },
  supportedViewModes: [ViewMode.LIST, ViewMode.GRID, ViewMode.KANBAN],
  defaultViewMode: ViewMode.LIST,
  fields: [
    { key: 'image_url', labels: { fa: 'لوگو/تصویر', en: 'Logo' }, type: FieldType.IMAGE, location: FieldLocation.HEADER, order: 1 },
    { key: 'business_name', labels: { fa: 'نام تجاری/فروشگاه', en: 'Business Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, validation: { required: true }, isKey: true, isTableColumn: true },
    { key: 'last_name', labels: { fa: 'نام خانوادگی رابط', en: 'Contact Last Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 3, isTableColumn: true },
    { key: 'supply_type', labels: { fa: 'زمینه فعالیت', en: 'Type' }, type: FieldType.SELECT, location: FieldLocation.HEADER, order: 4, dynamicOptionsCategory: 'supply_type', isTableColumn: true },
    {
      key: 'status',
      labels: { fa: 'وضعیت', en: 'Status' },
      type: FieldType.STATUS,
      location: FieldLocation.HEADER,
      order: 4.2,
      options: [
        { label: 'فعال', value: 'active', color: 'green' },
        { label: 'غیرفعال', value: 'draft', color: 'orange' },
      ],
      defaultValue: 'active',
      nature: FieldNature.PREDEFINED,
      isTableColumn: true,
    },
    {
      key: 'rank',
      labels: { fa: 'شرایط پرداخت', en: 'Payment Terms' },
      type: FieldType.MULTI_SELECT,
      location: FieldLocation.HEADER,
      order: 5,
      dynamicOptionsCategory: 'supplier_payment_terms',
      isTableColumn: true,
    },
    { key: 'mobile_1', labels: { fa: 'موبایل تماس', en: 'Mobile' }, type: FieldType.PHONE, location: FieldLocation.HEADER, order: 6, isTableColumn: true },
    {
      key: 'persona_id',
      labels: { fa: 'پرسونا', en: 'Persona' },
      type: FieldType.RELATION,
      location: FieldLocation.HEADER,
      order: 6.1,
      relationConfig: {
        targetModule: 'personas',
        targetField: 'display_name',
        filter: { persona_type: 'supplier' },
      },
      isTableColumn: true,
    },

    { key: 'prefix', labels: { fa: 'پیشوند', en: 'Prefix' }, type: FieldType.SELECT, blockId: 'basic_info', options: [{ label: 'آقای', value: 'آقای' }, { label: 'خانم', value: 'خانم' }] },
    { key: 'first_name', labels: { fa: 'نام رابط', en: 'Contact First Name' }, type: FieldType.TEXT, blockId: 'basic_info' },
    { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Code' }, type: FieldType.TEXT, blockId: 'basic_info', readonly: true },
    { key: 'website', labels: { fa: 'وب‌سایت', en: 'Website' }, type: FieldType.TEXT, blockId: 'basic_info' },
    { key: 'is_customer', labels: { fa: 'این تامین‌کننده مشتری هم هست', en: 'Also Customer' }, type: FieldType.CHECKBOX, blockId: 'basic_info', order: 3.1, isTableColumn: true },
    {
      key: 'linked_customer_id',
      labels: { fa: 'مشتری مرتبط', en: 'Related Customer' },
      type: FieldType.RELATION,
      blockId: 'basic_info',
      order: 3.15,
      relationConfig: { targetModule: 'customers', targetField: 'full_name' },
      logic: { visibleIf: { field: 'is_customer', operator: LogicOperator.IS_TRUE } },
    },
    { key: 'is_employee', labels: { fa: 'این تامین‌کننده کارمند هم هست', en: 'Also Employee' }, type: FieldType.CHECKBOX, blockId: 'basic_info', order: 3.2, isTableColumn: false },
    {
      key: 'related_employee_id',
      labels: { fa: 'کاربر مرتبط', en: 'Related User' },
      type: FieldType.RELATION,
      blockId: 'basic_info',
      order: 3.3,
      relationConfig: { targetModule: 'profiles', targetField: 'full_name' },
      logic: { visibleIf: { field: 'is_employee', operator: LogicOperator.IS_TRUE } },
    },
    {
      key: 'linked_employee_id',
      labels: { fa: 'کارمند مرتبط', en: 'Related Employee' },
      type: FieldType.RELATION,
      blockId: 'basic_info',
      order: 3.35,
      relationConfig: { targetModule: 'employees', targetField: 'full_name' },
      logic: { visibleIf: { field: 'is_employee', operator: LogicOperator.IS_TRUE } },
    },

    { key: 'mobile_2', labels: { fa: 'موبایل دوم', en: 'Mobile 2' }, type: FieldType.PHONE, blockId: 'contact_info' },
    { key: 'phone', labels: { fa: 'تلفن ثابت', en: 'Phone' }, type: FieldType.PHONE, blockId: 'contact_info' },
    { key: 'province', labels: { fa: 'استان', en: 'Province' }, type: FieldType.SELECT, blockId: 'contact_info', dynamicOptionsCategory: 'provinces' },
    { key: 'city', labels: { fa: 'شهر', en: 'City' }, type: FieldType.SELECT, blockId: 'contact_info', dynamicOptionsCategory: 'cities' },
    { key: 'address', labels: { fa: 'آدرس انبار/دفتر', en: 'Address' }, type: FieldType.LONG_TEXT, blockId: 'contact_info' },
    { key: 'location', labels: { fa: 'لوکیشن', en: 'Location' }, type: FieldType.LOCATION, blockId: 'contact_info' },
    { key: 'telegram_chat_id', labels: { fa: 'شناسه چت تلگرام', en: 'Telegram Chat Id' }, type: FieldType.TEXT, blockId: 'bot_info', order: 1, botSettingsOnly: true },
    { key: 'bale_chat_id', labels: { fa: 'شناسه چت بله', en: 'Bale Chat Id' }, type: FieldType.TEXT, blockId: 'bot_info', order: 2, botSettingsOnly: true },
    { key: 'rubika_chat_id', labels: { fa: 'شناسه چت روبیکا', en: 'Rubika Chat Id' }, type: FieldType.TEXT, blockId: 'bot_info', order: 3, botSettingsOnly: true },
    {
      key: 'bot_default_channel',
      labels: { fa: 'پلتفرم اصلی بات', en: 'Bot Default Channel' },
      type: FieldType.SELECT,
      blockId: 'bot_info',
      order: 4,
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
    { key: 'telegram_group_join_link', labels: { fa: 'لینک گروه تلگرام', en: 'Telegram Group Join Link' }, type: FieldType.LINK, blockId: 'bot_info', order: 5, botSettingsOnly: true, virtualBotField: true },
    { key: 'bale_group_join_link', labels: { fa: 'لینک گروه بله', en: 'Bale Group Join Link' }, type: FieldType.LINK, blockId: 'bot_info', order: 6, botSettingsOnly: true, virtualBotField: true },
    { key: 'rubika_group_join_link', labels: { fa: 'لینک گروه روبیکا', en: 'Rubika Group Join Link' }, type: FieldType.LINK, blockId: 'bot_info', order: 7, botSettingsOnly: true, virtualBotField: true },
    {
      key: 'telegram_group_status',
      labels: { fa: 'وضعیت گروه تلگرام', en: 'Telegram Group Status' },
      type: FieldType.STATUS,
      blockId: 'bot_info',
      order: 8,
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
      blockId: 'bot_info',
      order: 9,
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
      blockId: 'bot_info',
      order: 10,
      botSettingsOnly: true,
      virtualBotField: true,
      options: [
        { label: 'در انتظار پیام', value: 'pending_join', color: 'orange' },
        { label: 'فعال', value: 'active', color: 'green' },
        { label: 'غیرفعال', value: 'disabled', color: 'gray' },
        { label: 'خطا', value: 'error', color: 'red' }
      ],
    },
    { key: 'telegram_group_title', labels: { fa: 'عنوان گروه تلگرام', en: 'Telegram Group Title' }, type: FieldType.TEXT, blockId: 'bot_info', order: 11, botSettingsOnly: true, virtualBotField: true },
    { key: 'bale_group_title', labels: { fa: 'عنوان گروه بله', en: 'Bale Group Title' }, type: FieldType.TEXT, blockId: 'bot_info', order: 12, botSettingsOnly: true, virtualBotField: true },
    { key: 'rubika_group_title', labels: { fa: 'عنوان گروه روبیکا', en: 'Rubika Group Title' }, type: FieldType.TEXT, blockId: 'bot_info', order: 13, botSettingsOnly: true, virtualBotField: true },

    { key: 'bank_account_number', labels: { fa: 'شماره کارت/حساب', en: 'Bank Account' }, type: FieldType.TEXT, blockId: 'financial_info' },
    { key: 'first_supply_date', labels: { fa: 'تاریخ شروع همکاری', en: 'Start Date' }, type: FieldType.DATE, blockId: 'financial_info' },
    { key: 'supply_count', labels: { fa: 'تعداد فاکتور خرید', en: 'Supply Count' }, type: FieldType.NUMBER, blockId: 'financial_info', readonly: true },
    { key: 'total_paid', labels: { fa: 'جمع پرداختی‌ها', en: 'Total Paid' }, type: FieldType.PRICE, blockId: 'financial_info', readonly: true },
    { key: 'online_account_card_link', labels: { fa: 'لینک کارت حساب آنلاین', en: 'Online Account Card Link' }, type: FieldType.LINK, blockId: 'financial_info', readonly: true, nature: FieldNature.STANDARD, hideInCreateForm: true },

    { key: 'previous_system_first_purchase_date', labels: { fa: 'تاریخ شروع سوابق سیستم قبلی', en: 'Previous System Start Date' }, type: FieldType.DATE, blockId: 'previous_system_info' },
    { key: 'previous_system_invoice_total', labels: { fa: 'جمع فاکتورهای خرید سیستم قبلی', en: 'Previous System Purchase Invoice Total' }, type: FieldType.PRICE, blockId: 'previous_system_info' },
    { key: 'previous_system_paid_total', labels: { fa: 'جمع پرداختی‌های سیستم قبلی', en: 'Previous System Payment Total' }, type: FieldType.PRICE, blockId: 'previous_system_info' },
    { key: 'previous_system_balance_total', labels: { fa: 'مانده اول دوره سیستم قبلی', en: 'Previous System Opening Balance' }, type: FieldType.PRICE, blockId: 'previous_system_info' },
  
    { key: 'assignee_id', labels: { fa: 'مسئول پیگیری', en: 'Assignee' }, type: FieldType.RELATION, location: FieldLocation.HEADER, order: 6.15, relationConfig: { targetModule: 'profiles', targetField: 'full_name' }, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'tags', labels: { fa: 'برچسب‌ها', en: 'Tags' }, type: FieldType.TAGS, location: FieldLocation.HEADER, order: 6.2, nature: FieldNature.STANDARD, isTableColumn: true },
],
  blocks: [
    {
      id: 'basic_info', titles: { fa: 'مشخصات تامین‌کننده', en: 'Basic Info' }, type: BlockType.FIELD_GROUP,
      order: 0
    },
    {
      id: 'contact_info', titles: { fa: 'اطلاعات تماس', en: 'Contact Info' }, type: BlockType.FIELD_GROUP,
      order: 0
    },
    {
      id: 'bot_info', titles: { fa: 'تنظیمات بات', en: 'Bot Settings' }, type: BlockType.FIELD_GROUP,
      order: 0
    },
    {
      id: 'financial_info', titles: { fa: 'اطلاعات مالی و بانکی', en: 'Financial Info' }, type: BlockType.FIELD_GROUP,
      order: 0
    },
    {
      id: 'previous_system_info', titles: { fa: 'اطلاعات سیستم قبلی', en: 'Previous System Info' }, type: BlockType.FIELD_GROUP,
      order: 0
    },
  ],
  relatedTabs: [
    {
      id: 'supplier_purchase_invoices',
      title: 'فاکتورهای خرید',
      icon: 'FileTextOutlined',
      relationType: 'fk',
      targetModule: 'purchase_invoices',
      foreignKey: 'supplier_id'
    },
    {
      id: 'supplier_financial_overview',
      title: 'وضعیت مالی',
      icon: 'CreditCardOutlined',
      relationType: 'operational_financial_overview',
      targetModule: 'suppliers',
      disableCreate: true,
    },
    {
      id: 'supplier_products',
      title: 'محصولات خریداری شده',
      icon: 'ShoppingOutlined',
      relationType: 'supplier_products',
      targetModule: 'products'
    },
    {
      id: 'supplier_bot_groups',
      title: 'گروه‌های بات',
      icon: 'AppstoreOutlined',
      relationType: 'fk',
      targetModule: 'counterparty_bot_groups',
      foreignKey: 'supplier_id'
    },
    {
      id: 'supplier_sms_reports',
      title: 'پیامک‌ها',
      icon: 'MessageOutlined',
      relationType: 'phone_directory',
      targetModule: 'sms_delivery_reports',
      disableCreate: true
    },
    {
      id: 'supplier_voip_calls',
      title: 'تماس‌ها',
      icon: 'PhoneOutlined',
      relationType: 'phone_directory',
      targetModule: 'voip_call_reports',
      disableCreate: true
    },
  ],
  table: 'suppliers'
};
