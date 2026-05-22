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
    { key: 'is_employee', labels: { fa: 'این تامین‌کننده کارمند هم هست', en: 'Also Employee' }, type: FieldType.CHECKBOX, blockId: 'basic_info', order: 3.2, isTableColumn: false },
    {
      key: 'related_employee_id',
      labels: { fa: 'کارمند مرتبط', en: 'Related Employee' },
      type: FieldType.RELATION,
      blockId: 'basic_info',
      order: 3.3,
      relationConfig: { targetModule: 'profiles', targetField: 'full_name' },
      logic: { visibleIf: { field: 'is_employee', operator: LogicOperator.IS_TRUE } },
    },

    { key: 'mobile_2', labels: { fa: 'موبایل دوم', en: 'Mobile 2' }, type: FieldType.PHONE, blockId: 'contact_info' },
    { key: 'phone', labels: { fa: 'تلفن ثابت', en: 'Phone' }, type: FieldType.PHONE, blockId: 'contact_info' },
    { key: 'province', labels: { fa: 'استان', en: 'Province' }, type: FieldType.SELECT, blockId: 'contact_info', dynamicOptionsCategory: 'provinces' },
    { key: 'city', labels: { fa: 'شهر', en: 'City' }, type: FieldType.SELECT, blockId: 'contact_info', dynamicOptionsCategory: 'cities' },
    { key: 'address', labels: { fa: 'آدرس انبار/دفتر', en: 'Address' }, type: FieldType.LONG_TEXT, blockId: 'contact_info' },
    { key: 'location', labels: { fa: 'لوکیشن', en: 'Location' }, type: FieldType.LOCATION, blockId: 'contact_info' },

    { key: 'bank_account_number', labels: { fa: 'شماره کارت/حساب', en: 'Bank Account' }, type: FieldType.TEXT, blockId: 'financial_info' },
    { key: 'first_supply_date', labels: { fa: 'تاریخ شروع همکاری', en: 'Start Date' }, type: FieldType.DATE, blockId: 'financial_info' },
    { key: 'supply_count', labels: { fa: 'تعداد فاکتور خرید', en: 'Supply Count' }, type: FieldType.NUMBER, blockId: 'financial_info', readonly: true },
    { key: 'total_paid', labels: { fa: 'جمع پرداختی‌ها', en: 'Total Paid' }, type: FieldType.PRICE, blockId: 'financial_info', readonly: true },
  
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
      id: 'financial_info', titles: { fa: 'اطلاعات مالی و بانکی', en: 'Financial Info' }, type: BlockType.FIELD_GROUP,
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
