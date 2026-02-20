import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType } from '../types';

export const customerModule: ModuleDefinition = {
  id: 'customers',
  titles: { fa: 'مدیریت مشتریان', en: 'Customers' },
  nature: ModuleNature.CRM,
  supportedViewModes: [ViewMode.LIST, ViewMode.KANBAN],
  defaultViewMode: ViewMode.LIST,
  fields: [
    { key: 'image_url', labels: { fa: 'تصویر', en: 'Image' }, type: FieldType.IMAGE, location: FieldLocation.HEADER, order: 1 },
    { key: 'first_name', labels: { fa: 'نام', en: 'First Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, validation: { required: true }, isTableColumn: true },
    { key: 'last_name', labels: { fa: 'نام خانوادگی', en: 'Last Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 3, validation: { required: true }, isTableColumn: true, isKey: true },
    { key: 'system_code', labels: { fa: 'کد اشتراک', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 4, isTableColumn: true },
    {
      key: 'rank', labels: { fa: 'سطح مشتری', en: 'Rank' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 5,
      options: [
        { label: 'عادی', value: 'normal', color: 'blue' },
        { label: 'نقره‌ای', value: 'silver', color: 'gray' },
        { label: 'طلایی', value: 'gold', color: 'gold' },
        { label: 'VIP', value: 'vip', color: 'purple' }
      ], defaultValue: 'normal', isTableColumn: true
    },
    { key: 'mobile_1', labels: { fa: 'موبایل اصلی', en: 'Mobile' }, type: FieldType.PHONE, location: FieldLocation.HEADER, order: 6, isTableColumn: true },

    { key: 'prefix', labels: { fa: 'پیشوند', en: 'Prefix' }, type: FieldType.SELECT, blockId: 'basic_info', options: [{ label: 'آقای', value: 'آقای' }, { label: 'خانم', value: 'خانم' }, { label: 'دکتر', value: 'دکتر' }, { label: 'مهندس', value: 'مهندس' }] },
    { key: 'business_name', labels: { fa: 'نام کسب و کار', en: 'Business' }, type: FieldType.TEXT, blockId: 'basic_info' },
    { key: 'birth_date', labels: { fa: 'تاریخ تولد', en: 'Birthday' }, type: FieldType.DATE, blockId: 'basic_info' },
    {
      key: 'lead_source', labels: { fa: 'نحوه آشنایی', en: 'Source' }, type: FieldType.SELECT, blockId: 'basic_info',
      options: [
        { label: 'فروشگاه حضوری', value: 'store' },
        { label: 'وب‌سایت', value: 'website' },
        { label: 'اینستاگرام', value: 'instagram' },
        { label: 'بازاریابی تلفنی', value: 'marketing' },
        { label: 'معرفی مشتریان', value: 'referral' },
        { label: 'اسکن بارکد', value: 'scan'}
      ]
    },

    { key: 'mobile_2', labels: { fa: 'موبایل دوم', en: 'Mobile 2' }, type: FieldType.PHONE, blockId: 'contact_info' },
    { key: 'phone', labels: { fa: 'تلفن ثابت', en: 'Phone' }, type: FieldType.PHONE, blockId: 'contact_info' },
    { key: 'province', labels: { fa: 'استان', en: 'Province' }, type: FieldType.SELECT, blockId: 'contact_info', dynamicOptionsCategory: 'provinces' },
    { key: 'city', labels: { fa: 'شهر', en: 'City' }, type: FieldType.SELECT, blockId: 'contact_info', dynamicOptionsCategory: 'cities' },
    { key: 'address', labels: { fa: 'آدرس پستی', en: 'Address' }, type: FieldType.LONG_TEXT, blockId: 'contact_info' },
    { key: 'notes', labels: { fa: 'توضیحات', en: 'Notes' }, type: FieldType.LONG_TEXT, blockId: 'contact_info', isTableColumn: true },
    { key: 'location', labels: { fa: 'لوکیشن', en: 'Location' }, type: FieldType.TEXT, blockId: 'contact_info' },
    { key: 'instagram_id', labels: { fa: 'آیدی اینستاگرام', en: 'Instagram' }, type: FieldType.TEXT, blockId: 'contact_info' },
    { key: 'telegram_id', labels: { fa: 'آیدی تلگرام', en: 'Telegram' }, type: FieldType.TEXT, blockId: 'contact_info' },

    { key: 'first_purchase_date', labels: { fa: 'تاریخ اولین خرید', en: 'First Purchase' }, type: FieldType.DATE, blockId: 'financial_stats', readonly: true },
    { key: 'last_purchase_date', labels: { fa: 'تاریخ آخرین خرید', en: 'Last Purchase' }, type: FieldType.DATE, blockId: 'financial_stats', readonly: true },
    { key: 'purchase_count', labels: { fa: 'تعداد دفعات خرید', en: 'Count' }, type: FieldType.NUMBER, blockId: 'financial_stats', readonly: true },
    { key: 'total_spend', labels: { fa: 'جمع کل خرید (تومان)', en: 'Total Spend' }, type: FieldType.PRICE, blockId: 'financial_stats', readonly: true },
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
      id: 'customer_payments',
      title: 'پرداختی‌های مشتری',
      icon: 'CreditCardOutlined',
      relationType: 'customer_payments'
    },
    {
      id: 'customer_products',
      title: 'محصولات خریداری شده',
      icon: 'ShoppingOutlined',
      relationType: 'customer_products',
      targetModule: 'products'
    }
  ],
  table: ''
};