import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType, LogicOperator, FieldNature, RowCalculationType } from '../types';
import { HARD_CODED_UNIT_OPTIONS } from '../utils/unitConversions';

// ====== 1. تعریف تمام فیلدها ======
const fieldsArray: any[] = [
  // --- هدر ---
  { key: 'image_url', labels: { fa: 'تصویر', en: 'Image' }, type: FieldType.IMAGE, location: FieldLocation.HEADER, order: 0, nature: FieldNature.PREDEFINED, isTableColumn: true },
  { key: 'name', labels: { fa: 'نام محصول', en: 'Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, validation: { required: true }, nature: FieldNature.PREDEFINED, isTableColumn: true },
  { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
  { key: 'manual_code', labels: { fa: 'کد دستی', en: 'Manual Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 3, nature: FieldNature.STANDARD, isTableColumn: true },
  { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 4, options: [{label:'فعال', value:'active', color:'green'}, {label:'پیش‌نویس', value:'draft', color:'orange'}], isTableColumn: true },
  { key: 'tags', labels: { fa: 'برچسب‌ها', en: 'Tags' }, type: FieldType.TAGS, location: FieldLocation.HEADER, order: 5, nature: FieldNature.STANDARD, isTableColumn: true },
  //{ key: 'assignee_id', labels: { fa: 'مسئول', en: 'Assignee' }, type: FieldType.USER, location: FieldLocation.HEADER, order: 6, nature: FieldNature.STANDARD, isTableColumn: true },
  
  // --- اطلاعات پایه ---
  { key: 'product_type', labels: { fa: 'نوع محصول', en: 'Product Type' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 6, defaultValue: 'raw', options: [{ label: 'مواد اولیه', value: 'raw', color: 'red' }, { label: 'بسته نیمه آماده', value: 'semi', color: 'blue' }, { label: 'محصول نهایی', value: 'final', color: 'green' }], validation: { required: true }, nature: FieldNature.PREDEFINED, isTableColumn: true },
  
  { 
    key: 'category', 
    labels: { fa: 'دسته بندی مواد اولیه', en: 'Material Category' }, 
    type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, 
    blockId: 'baseInfo', 
    order: 2, 
    options: [
      { label: 'چرم', value: 'leather' }, 
      { label: 'آستر', value: 'lining' }, 
      { label: 'خرجکار', value: 'accessory' }, 
      { label: 'یراق', value: 'fitting' }
    ], 
    nature: FieldNature.PREDEFINED, 
    validation: { required: false },
    logic: { visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'raw' } } 
  },
  {
    key: 'main_unit', labels: { fa: 'واحد اصلی', en: 'Main Unit' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 1/5,
    options: HARD_CODED_UNIT_OPTIONS,
    nature: FieldNature.PREDEFINED,
    isKey: false
  },
  {
    key: 'sub_unit', labels: { fa: 'واحد فرعی', en: 'Sub Unit' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 1/4,
    options: HARD_CODED_UNIT_OPTIONS,
    nature: FieldNature.PREDEFINED,
    isKey: false
  },

  { 
    key: 'product_category', 
    labels: { fa: 'دسته بندی محصول', en: 'Product Category' }, 
    type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, 
    blockId: 'baseInfo', 
    order: 2.5, 
    dynamicOptionsCategory: 'product_categories',
    nature: FieldNature.STANDARD, 
    validation: { required: false },
    logic: { visibleIf: { field: 'product_type', operator: LogicOperator.NOT_EQUALS, value: 'raw' } } 
  },
  {
    key: 'brand_name',
    labels: { fa: 'نام برند', en: 'Brand Name' },
    type: FieldType.SELECT,
    location: FieldLocation.BLOCK,
    blockId: 'baseInfo',
    order: 2.75,
    dynamicOptionsCategory: 'brand_name',
    nature: FieldNature.STANDARD,
    validation: { required: false },
  },

  // --- فیلد رابطه BOM برای محصول نهایی و نیمه آماده ---
  {
    key: 'related_bom',
    labels: { fa: 'انتخاب شناسنامه تولید مرجع', en: 'Reference BOM' },
    type: FieldType.RELATION,
    location: FieldLocation.BLOCK,
    blockId: 'baseInfo',
    order: 3, 
    relationConfig: { targetModule: 'production_boms', targetField: 'name' },
    nature: FieldNature.STANDARD,
    logic: { visibleIf: { field: 'product_type', operator: LogicOperator.NOT_EQUALS, value: 'raw' } }
  },
  {
    key: 'production_order_id',
    labels: { fa: 'سفارش تولید این محصول', en: 'Production Order' },
    type: FieldType.RELATION,
    location: FieldLocation.BLOCK,
    blockId: 'baseInfo',
    order: 3.25,
    relationConfig: { targetModule: 'production_orders', targetField: 'name' },
    nature: FieldNature.STANDARD,
    logic: { visibleIf: { field: 'product_type', operator: LogicOperator.NOT_EQUALS, value: 'raw' } }
  },
  {
    key: 'related_supplier',
    labels: { fa: 'تامین‌کننده مرتبط', en: 'Related Supplier' },
    type: FieldType.RELATION,
    location: FieldLocation.BLOCK,
    blockId: 'baseInfo',
    order: 3.5,
    relationConfig: { targetModule: 'suppliers', targetField: 'business_name' },
    nature: FieldNature.STANDARD
  },

  // --- سایر فیلدها ---
  { key: 'stock', labels: { fa: 'موجودی', en: 'Stock' }, type: FieldType.STOCK, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 5, nature: FieldNature.PREDEFINED, readonly: true, description: 'محاسبه خودکار از موجودی قفسه‌ها' },
  { key: 'sub_stock', labels: { fa: 'موجودی (واحد فرعی)', en: 'Sub Stock' }, type: FieldType.STOCK, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 5.1, nature: FieldNature.PREDEFINED, readonly: true },
  { key: 'waste_rate', labels: { fa: 'نرخ پرت', en: 'waste_rate' }, type: FieldType.NUMBER, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 7, nature: FieldNature.PREDEFINED },
  { key: 'buy_price', labels: { fa: 'قیمت خرید', en: 'Buy Price' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 8, nature: FieldNature.PREDEFINED, isTableColumn: true },
  { key: 'sell_price', labels: { fa: 'قیمت فروش', en: 'Sell Price' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 9, nature: FieldNature.PREDEFINED, isTableColumn: true },
  { key: 'production_cost', labels: { fa: 'بهای تمام شده تولید', en: 'Production Cost' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 10, nature: FieldNature.SYSTEM, readonly: true, description: 'محاسبه خودکار از شناسنامه تولید' },
  { key: 'auto_name_enabled', labels: { fa: 'نامگذاری خودکار', en: 'Auto Name' }, type: FieldType.CHECKBOX, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 999, nature: FieldNature.PREDEFINED, readonly: false },
  {
    key: 'grid_materials',
    labels: { fa: 'مواد اولیه', en: 'Materials' },
    type: FieldType.JSON,
    location: FieldLocation.BLOCK,
    order: 1000,
    nature: FieldNature.STANDARD
  },

  // فیلدهای اختصاصی چرم
  {
    key: 'leather_type', labels: { fa: 'نوع چرم', en: 'Leather Type' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 1, dynamicOptionsCategory: 'leather_type', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } },
    nature: FieldNature.PREDEFINED,
    isKey: false
  },
  { key: 'leather_colors', labels: { fa: 'رنگ چرم', en: 'Leather Colors' }, type: FieldType.MULTI_SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 2.5, dynamicOptionsCategory: 'general_color', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } } },
  { key: 'leather_finish_1', labels: { fa: 'صفحه چرم', en: 'Finish 1' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 4, dynamicOptionsCategory: 'leather_finish', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } } },
  { key: 'leather_effect', labels: { fa: 'افکت چرم', en: 'leather_effect' }, type: FieldType.MULTI_SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 5, dynamicOptionsCategory: 'leather_effect', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } } },
  { key: 'leather_sort', labels: { fa: 'سورت چرم', en: 'Sort' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 6, dynamicOptionsCategory: 'leather_sort', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } } },
  
  // فیلدهای اختصاصی آستر
  { key: 'lining_material', labels: { fa: 'جنس آستر', en: 'Material' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'liningSpec', order: 1, dynamicOptionsCategory: 'lining_material', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' } } },
  { key: 'lining_color', labels: { fa: 'رنگ آستر', en: 'Color' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'liningSpec', order: 2, dynamicOptionsCategory: 'general_color', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' } } },
  { key: 'lining_width', labels: { fa: 'عرض آستر', en: 'width' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'liningSpec', order: 3, dynamicOptionsCategory: 'lining_width', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' } } },

  // فیلدهای اختصاصی خرجکار
  { key: 'acc_material', labels: { fa: 'جنس خرجکار', en: 'Material' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'kharjkarSpec', order: 1, dynamicOptionsCategory: 'acc_material', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'accessory' } } },
  
  // فیلدهای اختصاصی یراق
  { key: 'fitting_type', labels: { fa: 'جنس/نوع یراق', en: 'Type' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'yaraghSpec', order: 1, dynamicOptionsCategory: 'fitting_type', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'fitting' } } },
  { key: 'fitting_colors', labels: { fa: 'رنگ یراق', en: 'general_color' }, type: FieldType.MULTI_SELECT, location: FieldLocation.BLOCK, blockId: 'yaraghSpec', order: 2.5, dynamicOptionsCategory: 'general_color', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'fitting' } } },

  {
    key: 'fitting_size', labels: { fa: 'سایز یراق', en: 'Size' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'yaraghSpec', order: 2, dynamicOptionsCategory: 'fitting_size', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'fitting' } },
    nature: FieldNature.PREDEFINED,
    isKey: false
  },
];

// ====== 2. Helper Functions ======
/** گرفتن فیلدهای یک blockId معین */
const getFieldsForBlock = (blockId: string) => {
  return fieldsArray
    .filter(f => f.blockId === blockId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
};

const MATERIAL_CATEGORY_OPTIONS = [
  { label: 'چرم', value: 'leather' },
  { label: 'آستر', value: 'lining' },
  { label: 'خرجکار', value: 'accessory' },
  { label: 'یراق', value: 'fitting' }
];

/** ساختن ستون‌های جدول BOM به صورت دینامیک */
export const createBomTableColumns = (
  specBlockId: string,
  usageTitle: string = 'مقدار مصرف',
  unitDefault?: string,
  options?: { categoryValue?: string; includeDimensions?: boolean }
) => {
  const specFields = getFieldsForBlock(specBlockId);
  const includeDimensions = options?.includeDimensions === true;
  const categoryValue = options?.categoryValue;
  const filterKeyMap: Record<string, string> = {
    leather_colors: 'leather_colors',
    lining_color: 'lining_color',
    fitting_colors: 'fitting_colors',
    leather_color_1: 'leather_colors'
  };
  
  return [
    { 
      key: 'parent_category',
      title: 'مواد اولیه',
      type: FieldType.SELECT,
      options: MATERIAL_CATEGORY_OPTIONS,
      defaultValue: categoryValue,
      readonly: true,
      filterable: true,
      filterKey: 'category'
    },
    // اضافه کردن فیلدهای مشخصات
    ...specFields.map(f => ({
      key: f.key,
      title: f.labels.fa,
      type: f.type,
      dynamicOptionsCategory: (f as any).dynamicOptionsCategory,
      readonly: false,
      filterable: true,
      filterKey: filterKeyMap[f.key] || f.key
    })),
    { key: 'waste_rate', title: 'نرخ پرت', type: FieldType.NUMBER, filterable: true },
    ...(includeDimensions
      ? [
          { key: 'length', title: 'طول', type: FieldType.NUMBER },
          { key: 'width', title: 'عرض', type: FieldType.NUMBER }
        ]
      : []),
    { key: 'usage', title: usageTitle, type: FieldType.NUMBER },
    {
      key: 'main_unit',
      title: 'واحد',
      type: FieldType.SELECT,
      dynamicOptionsCategory: 'main_unit',
      ...(unitDefault ? { defaultValue: unitDefault } : {})
    },
    { key: 'buy_price', title: 'قیمت خرید', type: FieldType.PRICE },
    { key: 'total_price', title: 'جمع', type: FieldType.PRICE, readonly: true }
  ];
};

export const createShelfInventoryTableColumns = () => {
  return [
    {
      key: 'shelf_id',
      title: 'نام قفسه',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'shelves', targetField: 'name' }
    },
    {
      key: 'warehouse_id',
      title: 'نام انبار',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'warehouses', targetField: 'name' },
      readonly: true
    },
    {
      key: 'main_unit',
      title: 'واحد اصلی',
      type: FieldType.SELECT,
      options: HARD_CODED_UNIT_OPTIONS,
      readonly: true
    },
    {
      key: 'sub_unit',
      title: 'واحد فرعی',
      type: FieldType.SELECT,
      options: HARD_CODED_UNIT_OPTIONS,
      readonly: true
    },
    { key: 'stock', title: 'موجودی در قفسه (اصلی)', type: FieldType.NUMBER, showTotal: true, readonly: true },
    { key: 'sub_stock', title: 'موجودی در قفسه (فرعی)', type: FieldType.NUMBER, showTotal: true, readonly: true }
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
        { label: 'ضایعات', value: 'waste' },
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
      readonly: true
    },
    { key: 'main_quantity', title: 'مقدار واحد اصلی', type: FieldType.NUMBER, showTotal: true },
    {
      key: 'sub_unit',
      title: 'واحد فرعی',
      type: FieldType.SELECT,
      options: HARD_CODED_UNIT_OPTIONS,
      readonly: true
    },
    { key: 'sub_quantity', title: 'مقدار واحد فرعی', type: FieldType.NUMBER, showTotal: true },
    {
      key: 'from_shelf_id',
      title: 'قفسه برداشت',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'shelves', targetField: 'name' }
    },
    {
      key: 'to_shelf_id',
      title: 'قفسه ورود',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'shelves', targetField: 'name' }
    },
    {
      key: 'invoice_id',
      title: 'فاکتور مرتبط',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'invoices', targetField: 'name' },
      readonly: true
    },
    {
      key: 'purchase_invoice_id',
      title: 'فاکتور خرید مرتبط',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'purchase_invoices', targetField: 'name' },
      readonly: true
    },
    {
      key: 'production_order_id',
      title: 'سفارش تولید مرتبط',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'production_orders', targetField: 'name' },
      readonly: true
    },
    { key: 'created_by_name', title: 'ایجادکننده', type: FieldType.TEXT, readonly: true },
    { key: 'created_at', title: 'زمان ایجاد', type: FieldType.DATETIME, readonly: true }
  ];
};

export const createShelfItemsTableColumns = () => {
  return [
    {
      key: 'product_id',
      title: 'محصول',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'products', targetField: 'name' }
    },
    {
      key: 'main_unit',
      title: 'واحد',
      type: FieldType.SELECT,
      dynamicOptionsCategory: 'main_unit',
      readonly: true
    },
    { key: 'stock', title: 'موجودی در قفسه', type: FieldType.NUMBER, showTotal: true }
  ];
};

// ====== 3. تعریف بلوک‌های پایه ======
const BLOCKS = {
  baseInfo: { id: 'baseInfo', titles: { fa: 'اطلاعات پایه', en: 'Basic Info' }, icon: 'InfoCircleOutlined', order: 1, type: BlockType.FIELD_GROUP },
  inventoryInfo: { id: 'product_inventory', titles: { fa: 'موجودی', en: 'Inventory' }, icon: 'DropboxOutlined', order: 9, type: BlockType.FIELD_GROUP },
  
  leatherSpec: { 
    id: 'leatherSpec', titles: { fa: 'ویژگی های چرم', en: 'Leather Specs' }, icon: 'SkinOutlined', order: 5, type: BlockType.FIELD_GROUP,
    visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' }
  },
  
  liningSpec: { 
    id: 'liningSpec', titles: { fa: 'ویژگی های آستر', en: 'Lining Specs' }, icon: 'BgColorsOutlined', order: 6, type: BlockType.FIELD_GROUP,
    visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' }
  },
  
  kharjkarSpec: { 
    id: 'kharjkarSpec', titles: { fa: 'ویژگی های خرجکار', en: 'Accessory Specs' }, icon: 'ScissorOutlined', order: 7, type: BlockType.FIELD_GROUP,
    visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'accessory' }
  },
  
  yaraghSpec: { 
    id: 'yaraghSpec', titles: { fa: 'ویژگی های یراق', en: 'Fittings Specs' }, icon: 'ToolOutlined', order: 8, type: BlockType.FIELD_GROUP,
    visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'fitting' }
  },
  grid_materials: {
    id: 'grid_materials',
    titles: { fa: 'مواد اولیه', en: 'Materials' },
    type: BlockType.GRID_TABLE,
    order: 10,
    gridConfig: {
      categories: [
        { value: 'leather', label: 'چرم', specBlockId: 'leatherSpec' },
        { value: 'lining', label: 'آستر', specBlockId: 'liningSpec' },
        { value: 'accessory', label: 'خرجکار', specBlockId: 'kharjkarSpec' },
        { value: 'fitting', label: 'یراق', specBlockId: 'yaraghSpec' },
      ],
    },
  },

  // بلوک‌های جدول (BOM-like) - با ستون‌های دینامیک
  items_leather: { 
    id: 'items_leather', 
    titles: { fa: 'مواد اولیه چرم', en: 'Leather Materials' }, 
    icon: 'SkinOutlined', 
    order: 10, 
    type: BlockType.TABLE,
    rowCalculationType: RowCalculationType.SIMPLE_MULTIPLY,
    tableColumns: createBomTableColumns(
      'leatherSpec',
      'مقدار مصرف',
      undefined,
      { categoryValue: 'leather', includeDimensions: true }
    )
  },

  items_lining: { 
    id: 'items_lining', 
    titles: { fa: 'مواد اولیه آستر', en: 'Lining Materials' }, 
    icon: 'BgColorsOutlined', 
    order: 11, 
    type: BlockType.TABLE,
    rowCalculationType: RowCalculationType.SIMPLE_MULTIPLY,
    tableColumns: createBomTableColumns(
      'liningSpec',
      'مقدار مصرف',
      undefined,
      { categoryValue: 'lining', includeDimensions: true }
    )
  },

  items_fitting: { 
    id: 'items_fitting', 
    titles: { fa: 'مواد اولیه یراق', en: 'Fitting Materials' }, 
    icon: 'ToolOutlined', 
    order: 12, 
    type: BlockType.TABLE,
    rowCalculationType: RowCalculationType.SIMPLE_MULTIPLY,
    tableColumns: createBomTableColumns(
      'yaraghSpec',
      'تعداد',
      undefined,
      { categoryValue: 'fitting' }
    )
  },

  items_accessory: { 
    id: 'items_accessory', 
    titles: { fa: 'مواد اولیه خرجکار', en: 'Accessory Materials' }, 
    icon: 'ScissorOutlined', 
    order: 13, 
    type: BlockType.TABLE,
    rowCalculationType: RowCalculationType.SIMPLE_MULTIPLY,
    tableColumns: createBomTableColumns(
      'kharjkarSpec',
      'تعداد',
      undefined,
      { categoryValue: 'accessory', includeDimensions: true }
    )
  },
  product_inventory: {
    id: 'product_inventory',
    titles: { fa: 'موجودی', en: 'Inventory' },
    icon: 'DropboxOutlined',
    order: 9,
    type: BlockType.FIELD_GROUP,
    rowCalculationType: RowCalculationType.SIMPLE_MULTIPLY,
    tableColumns: createShelfInventoryTableColumns()
  },
  product_stock_movements: {
    id: 'product_stock_movements',
    titles: { fa: 'ورود و خروج کالا', en: 'Inventory Movements' },
    icon: 'SwapOutlined',
    order: 9.5,
    type: BlockType.TABLE,
    rowCalculationType: RowCalculationType.SIMPLE_MULTIPLY,
    tableColumns: createProductStockMovementsTableColumns()
  },
};

export const BOM_TABLE_BLOCKS = {
  items_leather: BLOCKS.items_leather,
  items_lining: BLOCKS.items_lining,
  items_fitting: BLOCKS.items_fitting,
  items_accessory: BLOCKS.items_accessory,
};

// ====== 4. تعریف ماژول ======
export const productsConfig: ModuleDefinition = {
    id: 'products',
    titles: { fa: 'محصولات', en: 'Products' },
    nature: ModuleNature.PRODUCT,
    table: 'products',
    supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
    defaultViewMode: ViewMode.LIST,
    fields: fieldsArray,
    blocks: [
      BLOCKS.baseInfo, 
      { 
        ...BLOCKS.leatherSpec, 
        visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } 
      }, 
      { 
        ...BLOCKS.liningSpec, 
        visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' } 
      }, 
      { 
        ...BLOCKS.kharjkarSpec, 
        visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'accessory' } 
      }, 
      { 
        ...BLOCKS.yaraghSpec, 
        visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'fitting' } 
      },
      
      BLOCKS.product_inventory,
      BLOCKS.product_stock_movements,
      { 
        ...BLOCKS.grid_materials,
        visibleIf: { field: 'product_type', operator: LogicOperator.NOT_EQUALS, value: 'raw' }
      }
    ], 
    relatedTabs: [
      {
        id: 'product_customers',
        title: 'مشتریان',
        icon: 'UsergroupAddOutlined',
        relationType: 'product_customers',
        targetModule: 'customers',
        jsonbMatchKey: 'product_id'
      },
      {
        id: 'product_invoices',
        title: 'فاکتورها',
        icon: 'FileTextOutlined',
        relationType: 'jsonb_contains',
        targetModule: 'invoices',
        jsonbColumn: 'invoiceItems',
        jsonbMatchKey: 'product_id'
      },
      {
        id: 'product_production_orders',
        title: 'سفارشات تولید',
        icon: 'ExperimentOutlined',
        relationType: 'join_table',
        targetModule: 'production_orders',
        joinTable: 'product_lines',
        joinSourceKey: 'product_id',
        joinTargetKey: 'production_order_id'
      }
    ],
    actionButtons: [
      { id: 'auto_name', label: 'نامگذاری خودکار', placement: 'form', variant: 'primary' }
    ]
};
