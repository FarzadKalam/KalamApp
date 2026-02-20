import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType, FieldNature } from '../types';

const GRID_MATERIALS_BLOCK = {
  id: 'grid_materials',
  titles: { fa: 'مواد اولیه', en: 'Materials' },
  type: BlockType.GRID_TABLE,
  order: 1,
  gridConfig: {
    categories: [
      { value: 'leather', label: 'چرم', specBlockId: 'leatherSpec' },
      { value: 'lining', label: 'آستر', specBlockId: 'liningSpec' },
      { value: 'accessory', label: 'خرجکار', specBlockId: 'kharjkarSpec' },
      { value: 'fitting', label: 'یراق', specBlockId: 'yaraghSpec' },
    ],
  },
};

export const productionBomModule: ModuleDefinition = {
  id: 'production_boms',
  titles: { fa: 'شناسنامه‌های تولید (BOM)', en: 'Production BOMs' },
  nature: ModuleNature.PRODUCTION,
  supportedViewModes: [ViewMode.LIST],
  defaultViewMode: ViewMode.LIST,
  fields: [
    { key: 'name', labels: { fa: 'عنوان مدل', en: 'Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, isKey: true, validation: { required: true }, isTableColumn: true },
    { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Sys Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true, isTableColumn: true },
    { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 4, options: [{ label: 'فعال', value: 'active', color: 'green' }, { label: 'بایگانی', value: 'archived', color: 'gray' }], defaultValue: 'active' },
    { 
      key: 'product_category', 
      labels: { fa: 'دسته بندی محصول', en: 'Product Category' }, 
      type: FieldType.SELECT, 
      location: FieldLocation.HEADER, 
      order: 2.5, 
      dynamicOptionsCategory: 'product_categories',
      nature: FieldNature.STANDARD, 
      validation: { required: false },
      isTableColumn: true,
    },  
    { 
      key: 'production_stages', 
      labels: { fa: 'مراحل تولید', en: 'Stages' }, 
      type: FieldType.PROGRESS_STAGES,
      location: FieldLocation.BLOCK, 
      order: 9,  
      isTableColumn: true,
      nature: FieldNature.STANDARD 
    },
    {
      key: 'production_stages_draft',
      labels: { fa: 'پیش‌نویس مراحل تولید', en: 'Draft Stages' },
      type: FieldType.JSON,
      location: FieldLocation.BLOCK,
      order: 19,
      nature: FieldNature.STANDARD,
    },
    {
      key: 'grid_materials',
      labels: { fa: 'مواد اولیه', en: 'Materials' },
      type: FieldType.JSON,
      location: FieldLocation.BLOCK,
      order: 20,
      nature: FieldNature.STANDARD,
    },
  ],
  blocks: [
    GRID_MATERIALS_BLOCK
  ],
  relatedTabs: [],
  table: 'production_boms',
  actionButtons: [
    { id: 'create_production_order', label: 'ایجاد سفارش تولید', placement: 'header', variant: 'primary' }
  ]
};

export const productionOrderModule: ModuleDefinition = {
  id: 'production_orders',
  titles: { fa: 'سفارشات تولید', en: 'Production Orders' },
  nature: ModuleNature.PRODUCTION,
  supportedViewModes: [ViewMode.LIST],
  defaultViewMode: ViewMode.LIST,
  fields: [
    { key: 'name', labels: { fa: 'عنوان سفارش', en: 'Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 0, isKey: true, validation: { required: true }, isTableColumn: true },
    { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
    { key: 'bom_id', labels: { fa: 'انتخاب شناسنامه (BOM)', en: 'Select BOM' }, type: FieldType.RELATION, location: FieldLocation.HEADER, order: 2, relationConfig: { targetModule: 'production_boms', targetField: 'name' } },
    {
      key: 'production_group_order_id',
      labels: { fa: 'سفارش گروهی مرتبط', en: 'Related Group Order' },
      type: FieldType.RELATION,
      location: FieldLocation.HEADER,
      order: 2.4,
      relationConfig: { targetModule: 'production_group_orders', targetField: 'name' },
      nature: FieldNature.STANDARD,
      validation: { required: false },
      isTableColumn: true,
    },
    { 
      key: 'product_category', 
      labels: { fa: 'دسته بندی محصول', en: 'Product Category' }, 
      type: FieldType.STATUS, 
      location: FieldLocation.HEADER, 
      order: 2.5, 
      dynamicOptionsCategory: 'product_categories',
      nature: FieldNature.STANDARD, 
      validation: { required: false },
    },
    {
      key: 'color',
      labels: { fa: 'رنگ', en: 'Color' },
      type: FieldType.SELECT,
      location: FieldLocation.HEADER,
      order: 2.6,
      dynamicOptionsCategory: 'general_color',
      nature: FieldNature.STANDARD,
      validation: { required: false },
    },
    {
      key: 'auto_name_enabled',
      labels: { fa: 'نامگذاری خودکار', en: 'Auto Name' },
      type: FieldType.CHECKBOX,
      location: FieldLocation.HEADER,
      order: 2.7,
      defaultValue: true,
      nature: FieldNature.STANDARD,
    },
    { key: 'quantity', labels: { fa: 'تعداد تولید', en: 'Production Qty' }, type: FieldType.STOCK, location: FieldLocation.HEADER, order: 3, validation: { required: true }, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'production_cost', labels: { fa: 'جمع کل (برآورد هزینه)', en: 'Estimated Cost' }, type: FieldType.PRICE, location: FieldLocation.HEADER, order: 3.5, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 4, options: [{ label: 'در انتظار', value: 'pending', color: 'orange' }, { label: 'در حال تولید', value: 'in_progress', color: 'blue' }, { label: 'تکمیل شده', value: 'completed', color: 'green' }], defaultValue: 'pending', isTableColumn: true },
    { key: 'production_started_at', labels: { fa: '\u0632\u0645\u0627\u0646 \u0634\u0631\u0648\u0639 \u062a\u0648\u0644\u06cc\u062f', en: 'Production Start Time' }, type: FieldType.DATETIME, location: FieldLocation.HEADER, order: 4.1, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
    { key: 'production_stopped_at', labels: { fa: '\u0632\u0645\u0627\u0646 \u062a\u0648\u0642\u0641 \u062a\u0648\u0644\u06cc\u062f', en: 'Production Stop Time' }, type: FieldType.DATETIME, location: FieldLocation.HEADER, order: 4.2, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
    { key: 'production_completed_at', labels: { fa: '\u0632\u0645\u0627\u0646 \u062a\u06a9\u0645\u06cc\u0644 \u062a\u0648\u0644\u06cc\u062f', en: 'Production Complete Time' }, type: FieldType.DATETIME, location: FieldLocation.HEADER, order: 4.3, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
    { 
      key: 'production_stages', 
      labels: { fa: 'مراحل تولید', en: 'Stages' }, 
      type: FieldType.PROGRESS_STAGES,
      location: FieldLocation.BLOCK, 
      order: 10,  
      isTableColumn: true,
      nature: FieldNature.STANDARD 
    },
    
    {
      key: 'production_stages_draft',
      labels: { fa: 'پیش‌نویس مراحل تولید', en: 'Draft Stages' },
      type: FieldType.JSON,
      location: FieldLocation.BLOCK,
      order: 19,
      nature: FieldNature.STANDARD,
    },
    {
      key: 'grid_materials',
      labels: { fa: 'مواد اولیه', en: 'Materials' },
      type: FieldType.JSON,
      location: FieldLocation.BLOCK,
      order: 20,
      nature: FieldNature.STANDARD,
    },
  ],
  blocks: [
    GRID_MATERIALS_BLOCK
  ],
  
  relatedTabs: [],
  table: 'production_orders'
};

