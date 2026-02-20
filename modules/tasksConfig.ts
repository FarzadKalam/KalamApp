import {
  ModuleDefinition,
  ModuleNature,
  ViewMode,
  FieldType,
  FieldLocation,
  BlockType,
  FieldNature,
  LogicOperator,
} from '../types';
import { createProductStockMovementsTableColumns, createShelfItemsTableColumns } from './productsConfig';

const createTaskShelfStockMovementsTableColumns = () => ([
  {
    key: 'product_id',
    title: 'نام و کد محصول',
    type: FieldType.RELATION,
    relationConfig: { targetModule: 'products', targetField: 'name' },
  },
  ...createProductStockMovementsTableColumns(),
]);

export const tasksModule: ModuleDefinition = {
  id: 'tasks',
  titles: { fa: 'وظایف', en: 'Tasks' },
  nature: ModuleNature.TASK,
  table: 'tasks',
  supportedViewModes: [ViewMode.KANBAN, ViewMode.LIST, ViewMode.GRID],
  defaultViewMode: ViewMode.KANBAN,
  fields: [
    { key: 'name', labels: { fa: 'عنوان وظیفه', en: 'Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, validation: { required: true }, nature: FieldNature.PREDEFINED, isKey: true, isTableColumn: true },
    { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
    { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 4, options: [{ label: 'انجام نشده', value: 'todo', color: 'red' }, { label: 'در حال انجام', value: 'in_progress', color: 'blue' }, { label: 'بازبینی', value: 'review', color: 'orange' }, { label: 'تکمیل شده', value: 'done', color: 'green' }, { label: 'لغو شده', value: 'canceled', color: 'gray' }], defaultValue: 'todo', nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'priority', labels: { fa: 'اولویت', en: 'Priority' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 5, options: [{ label: 'بسیار بالا', value: 'urgent', color: 'red' }, { label: 'بالا', value: 'high', color: 'orange' }, { label: 'متوسط', value: 'medium', color: 'blue' }, { label: 'پایین', value: 'low', color: 'gray' }], defaultValue: 'medium', nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'related_to_module', labels: { fa: 'مرتبط با بخش', en: 'Task Type' }, type: FieldType.SELECT, location: FieldLocation.HEADER, order: 6, options: [{ label: 'تولید', value: 'production_orders' }, { label: 'مشتریان', value: 'customers' }, { label: 'محصولات', value: 'products' }, { label: 'تامین‌کنندگان', value: 'suppliers' }, { label: 'فاکتورها', value: 'invoices' }], validation: { required: false }, nature: FieldNature.PREDEFINED, isTableColumn: true },
    { key: 'tags', labels: { fa: 'برچسب‌ها', en: 'Tags' }, type: FieldType.TAGS, location: FieldLocation.HEADER, order: 7, nature: FieldNature.STANDARD, isTableColumn: true },

    { key: 'description', labels: { fa: 'توضیحات', en: 'Description' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'general', order: 1, nature: FieldNature.STANDARD },

    { key: 'start_date', labels: { fa: 'تاریخ شروع', en: 'Start Date' }, type: FieldType.DATE, location: FieldLocation.BLOCK, blockId: 'scheduling', order: 1, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'due_date', labels: { fa: 'مهلت انجام', en: 'Due Date' }, type: FieldType.DATETIME, location: FieldLocation.BLOCK, blockId: 'scheduling', order: 2, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'estimated_hours', labels: { fa: 'ساعات تخمینی', en: 'Estimated Hours' }, type: FieldType.NUMBER, location: FieldLocation.BLOCK, blockId: 'scheduling', order: 3, nature: FieldNature.STANDARD },
    { key: 'spent_hours', labels: { fa: 'ساعات صرف شده', en: 'Spent Hours' }, type: FieldType.NUMBER, location: FieldLocation.BLOCK, blockId: 'scheduling', order: 4, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'start_time', labels: { fa: 'زمان آغاز', en: 'Start Time' }, type: FieldType.TIME, location: FieldLocation.BLOCK, blockId: 'scheduling', order: 5, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'wage', labels: { fa: 'دستمزد', en: 'Wage' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'general', order: 7, nature: FieldNature.STANDARD },
    {
      key: 'produced_qty',
      labels: { fa: 'مقدار تولید شده', en: 'Produced Quantity' },
      type: FieldType.NUMBER,
      location: FieldLocation.BLOCK,
      blockId: 'general',
      order: 8,
      nature: FieldNature.STANDARD,
      isTableColumn: true,
      logic: {
        visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'production_orders' },
      },
    },
    {
      key: 'production_shelf_id',
      labels: { fa: 'قفسه مرحله تولید', en: 'Production Shelf' },
      type: FieldType.RELATION,
      location: FieldLocation.BLOCK,
      blockId: 'scheduling',
      order: 6,
      relationConfig: { targetModule: 'shelves', targetField: 'name' },
      nature: FieldNature.STANDARD,
      logic: {
        visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'production_orders' },
      },
      isTableColumn: true,
    },

    { key: 'related_product', labels: { fa: 'محصول مرتبط', en: 'Related Product' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'general', order: 2, relationConfig: { targetModule: 'products', targetField: 'name' }, nature: FieldNature.STANDARD, logic: { visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'products' } } },
    { key: 'related_customer', labels: { fa: 'مشتری مرتبط', en: 'Related Customer' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'general', order: 3, relationConfig: { targetModule: 'customers', targetField: 'name' }, nature: FieldNature.STANDARD, logic: { visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'customers' } } },
    { key: 'related_supplier', labels: { fa: 'تامین‌کننده مرتبط', en: 'Related Supplier' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'general', order: 4, relationConfig: { targetModule: 'suppliers', targetField: 'business_name' }, nature: FieldNature.STANDARD, logic: { visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'suppliers' } } },
    { key: 'related_production_order', labels: { fa: 'سفارش تولید مرتبط', en: 'Related Production Order' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'general', order: 5, relationConfig: { targetModule: 'production_orders', targetField: 'name' }, nature: FieldNature.STANDARD, logic: { visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'production_orders' } } },
    { key: 'related_invoice', labels: { fa: 'فاکتور مرتبط', en: 'Related Invoice' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'general', order: 6, relationConfig: { targetModule: 'invoices', targetField: 'name' }, nature: FieldNature.STANDARD, logic: { visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'invoices' } } },
    { key: 'sort_order', labels: { fa: 'ترتیب نمایش', en: 'Sort Order' }, type: FieldType.NUMBER, location: FieldLocation.BLOCK, blockId: 'general', order: 10, nature: FieldNature.STANDARD, logic: { visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'production_orders' } } },
  ],
  blocks: [
    { id: 'general', titles: { fa: 'اطلاعات عمومی', en: 'General Info' }, type: BlockType.FIELD_GROUP, order: 1 },
    { id: 'scheduling', titles: { fa: 'زمان‌بندی', en: 'Scheduling' }, type: BlockType.FIELD_GROUP, order: 2 },
    {
      id: 'task_shelf_inventory',
      titles: { fa: 'موجودی قفسه مرحله', en: 'Task Shelf Inventory' },
      type: BlockType.FIELD_GROUP,
      order: 3,
      visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'production_orders' },
      tableColumns: createShelfItemsTableColumns(),
    },
    {
      id: 'task_shelf_stock_movements',
      titles: { fa: 'ورود و خروج کالا', en: 'Task Shelf Movements' },
      type: BlockType.TABLE,
      order: 4,
      visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'production_orders' },
      tableColumns: createTaskShelfStockMovementsTableColumns(),
    },
  ],
  relatedTabs: [],
};
