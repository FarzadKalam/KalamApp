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
import { HARD_CODED_UNIT_OPTIONS } from '../utils/unitConversions';

export const createShelfInventoryTableColumns = () => {
  return [
    {
      key: 'shelf_id',
      title: 'محل نگهداری',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'shelves', targetField: 'name' },
    },
    {
      key: 'warehouse_id',
      title: 'نام انبار',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'warehouses', targetField: 'name' },
      readonly: true,
    },
    {
      key: 'main_unit',
      title: 'واحد اصلی',
      type: FieldType.SELECT,
      options: HARD_CODED_UNIT_OPTIONS,
      readonly: true,
    },
    {
      key: 'sub_unit',
      title: 'واحد فرعی',
      type: FieldType.SELECT,
      options: HARD_CODED_UNIT_OPTIONS,
      readonly: true,
    },
    { key: 'stock', title: 'موجودی واحد اصلی', type: FieldType.NUMBER, showTotal: true, readonly: true },
    { key: 'sub_stock', title: 'موجودی واحد فرعی', type: FieldType.NUMBER, showTotal: true, readonly: true },
  ];
};

export const createProductStockMovementsTableColumns = () => {
  return [
    {
      key: 'voucher_type',
      title: 'نوع حواله',
      type: FieldType.SELECT,
      options: [
        { label: 'ورود', value: 'incoming' },
        { label: 'خروج', value: 'outgoing' },
        { label: 'جابجایی', value: 'transfer' },
      ],
    },
    {
      key: 'source',
      title: 'منبع',
      type: FieldType.SELECT,
      options: [
        { label: 'موجودی اول دوره', value: 'opening_balance' },
        { label: 'انبارگردانی', value: 'inventory_count' },
        { label: 'فاکتور فروش', value: 'sales_invoice' },
        { label: 'فاکتور خرید', value: 'purchase_invoice' },
        { label: 'تولید', value: 'production' },
      ],
    },
    {
      key: 'main_unit',
      title: 'واحد اصلی',
      type: FieldType.SELECT,
      options: HARD_CODED_UNIT_OPTIONS,
      readonly: true,
    },
    { key: 'main_quantity', title: 'مقدار واحد اصلی', type: FieldType.NUMBER, showTotal: true },
    {
      key: 'sub_unit',
      title: 'واحد فرعی',
      type: FieldType.SELECT,
      options: HARD_CODED_UNIT_OPTIONS,
      readonly: true,
    },
    { key: 'sub_quantity', title: 'مقدار واحد فرعی', type: FieldType.NUMBER, showTotal: true },
    {
      key: 'from_shelf_id',
      title: 'محل خروج',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'shelves', targetField: 'name' },
    },
    {
      key: 'to_shelf_id',
      title: 'محل ورود',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'shelves', targetField: 'name' },
    },
    {
      key: 'invoice_id',
      title: 'فاکتور مرتبط',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'invoices', targetField: 'name' },
      readonly: true,
    },
    {
      key: 'purchase_invoice_id',
      title: 'فاکتور خرید مرتبط',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'purchase_invoices', targetField: 'name' },
      readonly: true,
    },
    {
      key: 'production_order_id',
      title: 'سفارش تولید مرتبط',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'production_orders', targetField: 'name' },
      readonly: true,
    },
    { key: 'created_by_name', title: 'ایجادکننده', type: FieldType.TEXT, readonly: true },
    { key: 'created_at', title: 'زمان ایجاد', type: FieldType.DATETIME, readonly: true },
  ];
};

export const createShelfItemsTableColumns = () => {
  return [
    {
      key: 'product_id',
      title: 'محصول',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'products', targetField: 'name' },
    },
    {
      key: 'main_unit',
      title: 'واحد',
      type: FieldType.SELECT,
      dynamicOptionsCategory: 'main_unit',
      readonly: true,
    },
    { key: 'stock', title: 'موجودی در قفسه', type: FieldType.NUMBER, showTotal: true },
  ];
};

const fieldsArray: any[] = [
  { key: 'image_url', labels: { fa: 'تصویر', en: 'Image' }, type: FieldType.IMAGE, location: FieldLocation.HEADER, order: 0, nature: FieldNature.PREDEFINED, isTableColumn: true },
  { key: 'name', labels: { fa: 'آدرس کوتاه', en: 'Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, validation: { required: true }, nature: FieldNature.PREDEFINED, isTableColumn: true },
  { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: false },
  { key: 'manual_code', labels: { fa: 'کد دستی', en: 'Manual Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 3, nature: FieldNature.STANDARD, isTableColumn: false },
  { key: 'catalog_code', labels: { fa: 'کد کاتالوگ', en: 'Catalog Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 3.5, nature: FieldNature.STANDARD, isTableColumn: false },
  { key: 'catalog_link', labels: { fa: 'لینک عمومی کاتالوگ', en: 'Public Catalog Link' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 3.7, nature: FieldNature.STANDARD, isTableColumn: false, printable: true },
  { key: 'location', labels: { fa: 'لوکیشن', en: 'Location' }, type: FieldType.LOCATION, location: FieldLocation.HEADER, order: 4, nature: FieldNature.STANDARD },
  { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 4, options: [{ label: 'آزاد', value: 'free', color: 'green' }, { label: 'رزرو شفاهی', value: 'oral_reserve', color: 'orange' }, { label: 'رزرو قطعی', value: 'final_reserve', color: 'pink' }, { label: 'در صف نصب', value: 'in_line', color: 'blue' }, { label: 'در حال اکران', value: 'opening', color: 'red' }, { label: 'نزدیک به اتمام', value: 'near_finish', color: 'orange' }, { label: 'پایان مهلت اکران', value: 'opening_deadline_ended', color: 'volcano' }, { label: 'در صف جمع‌آوری', value: 'pickup_queue', color: 'gold' }, { label: 'غیرفعال', value: 'inactive', color: 'default' }], isTableColumn: true },
  { key: 'start_date', labels: { fa: 'تاریخ شروع', en: 'Start Date' }, type: FieldType.DATE, location: FieldLocation.HEADER, order: 7, nature: FieldNature.STANDARD, isTableColumn: true },
  { key: 'end_date', labels: { fa: 'تاریخ پایان', en: 'End Date' }, type: FieldType.DATE, location: FieldLocation.HEADER, order: 8, nature: FieldNature.STANDARD, isTableColumn: true },
  { key: 'tags', labels: { fa: 'برچسب‌ها', en: 'Tags' }, type: FieldType.TAGS, location: FieldLocation.HEADER, order: 6, nature: FieldNature.STANDARD, isTableColumn: true },

  //بلاک اطلاعات پایه
  { key: 'category', labels: { fa: 'نوع تابلو', en: 'Billboard Category' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 1, dynamicOptionsCategory: 'billboard_categories', nature: FieldNature.STANDARD, validation: { required: false } },
  { key: 'grade', labels: { fa: 'گرید تابلو', en: 'Billboard Grade' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 2, dynamicOptionsCategory: 'billboard_grade', nature: FieldNature.STANDARD, validation: { required: false } },
  { key: 'features', labels: { fa: 'ویژگی‌ها', en: 'Billboard Features' }, type: FieldType.MULTI_SELECT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 2.5, dynamicOptionsCategory: 'billboard_features', nature: FieldNature.STANDARD, validation: { required: false } },
  
  { key: 'width', labels: { fa: 'طول', en: 'Width' }, type: FieldType.NUMBER, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 2.7, nature: FieldNature.STANDARD, validation: { required: false } },
  { key: 'height', labels: { fa: 'ارتفاع', en: 'Height' }, type: FieldType.NUMBER, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 2.8, nature: FieldNature.STANDARD, validation: { required: false } },

  { key: 'daily_rent', labels: { fa: 'اجاره روزانه', en: 'Daily Rent' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 3, nature: FieldNature.STANDARD, isTableColumn: false },
  { key: 'monthly_rent', labels: { fa: 'اجاره ماهانه', en: 'Monthly Rent' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 4, nature: FieldNature.STANDARD, isTableColumn: true },
  { key: 'print_cost', labels: { fa: 'هزینه چاپ و نصب', en: 'Print Cost' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 5, nature: FieldNature.STANDARD, isTableColumn: true },
  { key: 'commission_percentage', labels: { fa: 'پورسانت', en: 'Commission (%)' }, type: FieldType.PERCENTAGE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 5.5, nature: FieldNature.STANDARD, defaultValue: 0, isTableColumn: false },
  { key: 'address', labels: { fa: 'آدرس کامل', en: 'Address' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 49, nature: FieldNature.STANDARD, isTableColumn: false },
  { key: 'related_supplier', labels: { fa: 'تامین‌کننده مرتبط', en: 'Related Supplier' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 6, relationConfig: { targetModule: 'suppliers', targetField: 'business_name' }, nature: FieldNature.STANDARD, logic: { visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'goods' } } },
  { key: 'description', labels: { fa: 'توضیحات', en: 'Description' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, order: 50, nature: FieldNature.STANDARD, isTableColumn: false },
  { key: 'city_name', labels: { fa: 'نام شهر', en: 'City Name' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 7, dynamicOptionsCategory: 'city_name', nature: FieldNature.STANDARD, validation: { required: true } },
  { key: 'location_image', labels: { fa: 'تصویر موقعیت در نقشه', en: 'Location Map Image' }, type: FieldType.IMAGE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 8, nature: FieldNature.STANDARD, isTableColumn: false, printable: true },

//بلاک جزئیات اکران
  { key: 'related_customer', labels: { fa: 'مشتری مرتبط', en: 'Related Customer' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'openingInfo', order: 10, relationConfig: { targetModule: 'customers', targetField: 'business_name' }, nature: FieldNature.STANDARD, },
  { key: 'related_invoice', labels: { fa: 'فاکتور مرتبط', en: 'Related invoice' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'openingInfo', order: 12, relationConfig: { targetModule: 'invoices', targetField: 'name' }, nature: FieldNature.STANDARD, },

  { key: 'auto_name_enabled', labels: { fa: 'نامگذاری خودکار', en: 'Auto Name' }, type: FieldType.CHECKBOX, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 8, nature: FieldNature.PREDEFINED, defaultValue: false },
];

const BLOCKS = {
  baseInfo: { id: 'baseInfo', titles: { fa: 'اطلاعات پایه', en: 'Basic Info' }, icon: 'InfoCircleOutlined', order: 1, type: BlockType.FIELD_GROUP },
  openingInfo: { id: 'openingInfo', titles: { fa: 'جزئیات اکران', en: 'Opening Info' }, icon: 'InfoCircleOutlined', order: 2, type: BlockType.FIELD_GROUP },
};

export const billboardConfig: ModuleDefinition = {
  id: 'billboards',
  titles: { fa: 'تبلیغات محیطی', faSingular: 'تابلو', en: 'Billboards' },
  nature: ModuleNature.PRODUCT,
  table: 'billboards',
  dashboard: {
    quickCreateLabel: 'تابلوی جدید',
    recentListFields: ['name', 'status', 'start_date', 'end_date'],
    summaryCard: {
      preset: 'billboards_opening',
      title: 'تعداد تابلوهای در حال اکران',
    },
  },
  relationDisplay: {
    labelTemplate: '{{name}} - {{system_code}}',
    searchFields: ['name', 'system_code', 'manual_code', 'catalog_code', 'address', 'category', 'id'],
  },
  supportedViewModes: [ViewMode.LIST, ViewMode.GRID, ViewMode.KANBAN, ViewMode.MAP],
  defaultViewMode: ViewMode.LIST,
  fields: fieldsArray,
  blocks: [BLOCKS.baseInfo, BLOCKS.openingInfo ],
  relatedTabs: [
    {
      id: 'billboards_customers',
      title: 'مشتریان',
      icon: 'UsergroupAddOutlined',
      relationType: 'product_customers',
      targetModule: 'customers',
      jsonbMatchKey: 'product_id',
    },
    {
      id: 'billboards_invoices',
      title: 'فاکتورها',
      icon: 'FileTextOutlined',
      relationType: 'jsonb_contains',
      targetModule: 'billboards',
      jsonbColumn: 'billboardItems',
      jsonbMatchKey: 'billboard_id',
    },
    {
      id: 'projects',
      title: 'پروژه ها',
      icon: 'FileTextOutlined',
      relationType: 'jsonb_contains',
      targetModule: 'projects',
      jsonbColumn: 'invoiceItems',
      jsonbMatchKey: 'product_id',
    },

  ],
  //actionButtons: [{ id: 'auto_name', label: 'نامگذاری خودکار', placement: 'form', variant: 'primary' }],
};
