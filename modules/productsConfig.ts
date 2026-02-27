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
      title: 'نام قفسه',
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
    { key: 'stock', title: 'موجودی در قفسه (اصلی)', type: FieldType.NUMBER, showTotal: true, readonly: true },
    { key: 'sub_stock', title: 'موجودی در قفسه (فرعی)', type: FieldType.NUMBER, showTotal: true, readonly: true },
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
      title: 'قفسه برداشت',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'shelves', targetField: 'name' },
    },
    {
      key: 'to_shelf_id',
      title: 'قفسه ورود',
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
  { key: 'name', labels: { fa: 'نام', en: 'Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, validation: { required: true }, nature: FieldNature.PREDEFINED, isTableColumn: true },
  { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
  { key: 'manual_code', labels: { fa: 'کد دستی', en: 'Manual Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 3, nature: FieldNature.STANDARD, isTableColumn: true },
  { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 4, options: [{ label: 'فعال', value: 'active', color: 'green' }, { label: 'پیش‌نویس', value: 'draft', color: 'orange' }], isTableColumn: true },
  { key: 'product_type', labels: { fa: 'نوع', en: 'Type' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 5, defaultValue: 'goods', options: [{ label: 'کالا', value: 'goods', color: 'blue' }, { label: 'خدمات', value: 'service', color: 'purple' }], validation: { required: true }, nature: FieldNature.SYSTEM, isTableColumn: true },
  { key: 'tags', labels: { fa: 'برچسب‌ها', en: 'Tags' }, type: FieldType.TAGS, location: FieldLocation.HEADER, order: 6, nature: FieldNature.STANDARD, isTableColumn: true },

  { key: 'category', labels: { fa: 'دسته بندی کالا', en: 'Goods Category' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 1, dynamicOptionsCategory: 'product_goods_categories', nature: FieldNature.STANDARD, validation: { required: false }, logic: { visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'goods' } } },
  { key: 'product_category', labels: { fa: 'دسته بندی خدمات', en: 'Service Category' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 2, dynamicOptionsCategory: 'product_service_categories', nature: FieldNature.STANDARD, validation: { required: false }, logic: { visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'service' } } },
  { key: 'brand_name', labels: { fa: 'نام برند', en: 'Brand Name' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 3, dynamicOptionsCategory: 'brand_name', nature: FieldNature.STANDARD, validation: { required: false } },
  { key: 'related_supplier', labels: { fa: 'تامین‌کننده مرتبط', en: 'Related Supplier' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 4, relationConfig: { targetModule: 'suppliers', targetField: 'business_name' }, nature: FieldNature.STANDARD, logic: { visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'goods' } } },
  { key: 'cost_center_id', labels: { fa: 'مرکز هزینه مرتبط', en: 'Cost Center' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 5, relationConfig: { targetModule: 'cost_centers', targetField: 'name' }, nature: FieldNature.STANDARD },
  { key: 'buy_price', labels: { fa: 'قیمت خرید', en: 'Buy Price' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 6, nature: FieldNature.STANDARD, isTableColumn: true },
  { key: 'sell_price', labels: { fa: 'قیمت فروش', en: 'Sell Price' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 7, nature: FieldNature.STANDARD, isTableColumn: true },
  { key: 'auto_name_enabled', labels: { fa: 'نامگذاری خودکار', en: 'Auto Name' }, type: FieldType.CHECKBOX, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 8, nature: FieldNature.PREDEFINED, defaultValue: true },

  { key: 'main_unit', labels: { fa: 'واحد اصلی', en: 'Main Unit' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'product_inventory', order: 20, options: HARD_CODED_UNIT_OPTIONS, nature: FieldNature.PREDEFINED, logic: { visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'goods' } } },
  { key: 'sub_unit', labels: { fa: 'واحد فرعی', en: 'Sub Unit' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'product_inventory', order: 21, options: HARD_CODED_UNIT_OPTIONS, nature: FieldNature.PREDEFINED, logic: { visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'goods' } } },
  { key: 'stock', labels: { fa: 'موجودی', en: 'Stock' }, type: FieldType.STOCK, location: FieldLocation.BLOCK, blockId: 'product_inventory', order: 22, nature: FieldNature.PREDEFINED, readonly: true, isTableColumn: true, logic: { visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'goods' } } },
  { key: 'sub_stock', labels: { fa: 'موجودی (واحد فرعی)', en: 'Sub Stock' }, type: FieldType.STOCK, location: FieldLocation.BLOCK, blockId: 'product_inventory', order: 23, nature: FieldNature.PREDEFINED, readonly: true, logic: { visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'goods' } } },
];

const BLOCKS = {
  baseInfo: { id: 'baseInfo', titles: { fa: 'اطلاعات پایه', en: 'Basic Info' }, icon: 'InfoCircleOutlined', order: 1, type: BlockType.FIELD_GROUP },
  product_inventory: {
    id: 'product_inventory',
    titles: { fa: 'موجودی', en: 'Inventory' },
    icon: 'DropboxOutlined',
    order: 2,
    type: BlockType.FIELD_GROUP,
    visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'goods' },
  },
  product_stock_movements: {
    id: 'product_stock_movements',
    titles: { fa: 'ورود و خروج کالا', en: 'Inventory Movements' },
    icon: 'SwapOutlined',
    order: 3,
    type: BlockType.TABLE,
    tableColumns: createProductStockMovementsTableColumns(),
    visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'goods' },
  },
};

export const productsConfig: ModuleDefinition = {
  id: 'products',
  titles: { fa: 'کالاها و خدمات', en: 'Products' },
  nature: ModuleNature.PRODUCT,
  table: 'products',
  supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
  defaultViewMode: ViewMode.LIST,
  fields: fieldsArray,
  blocks: [BLOCKS.baseInfo, BLOCKS.product_inventory, BLOCKS.product_stock_movements],
  relatedTabs: [
    {
      id: 'product_customers',
      title: 'مشتریان',
      icon: 'UsergroupAddOutlined',
      relationType: 'product_customers',
      targetModule: 'customers',
      jsonbMatchKey: 'product_id',
    },
    {
      id: 'product_invoices',
      title: 'فاکتورها',
      icon: 'FileTextOutlined',
      relationType: 'jsonb_contains',
      targetModule: 'invoices',
      jsonbColumn: 'invoiceItems',
      jsonbMatchKey: 'product_id',
    },
    {
      id: 'product_production_orders',
      title: 'سفارشات تولید',
      icon: 'ExperimentOutlined',
      relationType: 'join_table',
      targetModule: 'production_orders',
      joinTable: 'product_lines',
      joinSourceKey: 'product_id',
      joinTargetKey: 'production_order_id',
    },
  ],
  actionButtons: [{ id: 'auto_name', label: 'نامگذاری خودکار', placement: 'form', variant: 'primary' }],
};
