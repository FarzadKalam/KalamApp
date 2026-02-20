import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType } from '../types';

export const supplierModule: ModuleDefinition = {
  id: 'suppliers',
  titles: { fa: 'مدیریت تامین‌کنندگان', en: 'Suppliers' },
  nature: ModuleNature.STANDARD,
  supportedViewModes: [ViewMode.LIST, ViewMode.GRID, ViewMode.KANBAN],
  defaultViewMode: ViewMode.LIST,
  fields: [
    { key: 'image_url', labels: { fa: 'لوگو/تصویر', en: 'Logo' }, type: FieldType.IMAGE, location: FieldLocation.HEADER, order: 1 },
    { key: 'business_name', labels: { fa: 'نام تجاری/فروشگاه', en: 'Business Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, validation: { required: true }, isKey: true, isTableColumn: true },
    { key: 'last_name', labels: { fa: 'نام خانوادگی رابط', en: 'Contact Last Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 3, isTableColumn: true },
    { key: 'supply_type', labels: { fa: 'زمینه فعالیت', en: 'Type' }, type: FieldType.SELECT, location: FieldLocation.HEADER, order: 4, dynamicOptionsCategory: 'supply_type', isTableColumn: true },
    {
      key: 'rank', labels: { fa: 'درجه اعتبار', en: 'Rank' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 5,
      options: [
        { label: 'ویژه', value: 'A', color: 'green' },
        { label: 'خوب', value: 'B', color: 'blue' },
        { label: 'متوسط', value: 'C', color: 'orange' },
        { label: 'ضعیف', value: 'D', color: 'red' }
      ], defaultValue: 'B', isTableColumn: true
    },
    { key: 'mobile_1', labels: { fa: 'موبایل تماس', en: 'Mobile' }, type: FieldType.PHONE, location: FieldLocation.HEADER, order: 6, isTableColumn: true },

    { key: 'prefix', labels: { fa: 'پیشوند', en: 'Prefix' }, type: FieldType.SELECT, blockId: 'basic_info', options: [{ label: 'آقای', value: 'آقای' }, { label: 'خانم', value: 'خانم' }] },
    { key: 'first_name', labels: { fa: 'نام رابط', en: 'Contact First Name' }, type: FieldType.TEXT, blockId: 'basic_info' },
    { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Code' }, type: FieldType.TEXT, blockId: 'basic_info', readonly: true },
    { key: 'website', labels: { fa: 'وب‌سایت', en: 'Website' }, type: FieldType.TEXT, blockId: 'basic_info' },

    { key: 'mobile_2', labels: { fa: 'موبایل دوم', en: 'Mobile 2' }, type: FieldType.PHONE, blockId: 'contact_info' },
    { key: 'phone', labels: { fa: 'تلفن ثابت', en: 'Phone' }, type: FieldType.PHONE, blockId: 'contact_info' },
    { key: 'province', labels: { fa: 'استان', en: 'Province' }, type: FieldType.SELECT, blockId: 'contact_info', dynamicOptionsCategory: 'provinces' },
    { key: 'city', labels: { fa: 'شهر', en: 'City' }, type: FieldType.SELECT, blockId: 'contact_info', dynamicOptionsCategory: 'cities' },
    { key: 'address', labels: { fa: 'آدرس انبار/دفتر', en: 'Address' }, type: FieldType.LONG_TEXT, blockId: 'contact_info' },
    { key: 'location', labels: { fa: 'لوکیشن', en: 'Location' }, type: FieldType.TEXT, blockId: 'contact_info' },

    { key: 'bank_account_number', labels: { fa: 'شماره کارت/حساب', en: 'Bank Account' }, type: FieldType.TEXT, blockId: 'financial_info' },
    { key: 'first_supply_date', labels: { fa: 'تاریخ شروع همکاری', en: 'Start Date' }, type: FieldType.DATE, blockId: 'financial_info' },
    { key: 'supply_count', labels: { fa: 'تعداد فاکتور خرید', en: 'Supply Count' }, type: FieldType.NUMBER, blockId: 'financial_info', readonly: true },
    { key: 'total_paid', labels: { fa: 'جمع پرداختی‌ها (ریال)', en: 'Total Paid' }, type: FieldType.PRICE, blockId: 'financial_info', readonly: true },
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
      id: 'supplier_products',
      title: 'محصولات تامین شده',
      icon: 'AppstoreOutlined',
      relationType: 'fk',
      targetModule: 'products',
      foreignKey: 'related_supplier'
    }
  ],
  table: ''
};