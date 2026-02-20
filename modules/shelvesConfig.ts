import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType, FieldNature, RowCalculationType } from '../types';
import { createProductStockMovementsTableColumns, createShelfItemsTableColumns } from './productsConfig';

const createShelfStockMovementsTableColumns = () => {
  return [
    {
      key: 'product_id',
      title: 'نام و کد محصول',
      type: FieldType.RELATION,
      relationConfig: { targetModule: 'products', targetField: 'name' },
    },
    ...createProductStockMovementsTableColumns(),
  ];
};

const BLOCKS = {
  shelfInventory: {
    id: 'shelf_inventory',
    titles: { fa: 'موجودی قفسه', en: 'Shelf Inventory' },
    icon: 'AppstoreOutlined',
    order: 1,
    type: BlockType.FIELD_GROUP,
    rowCalculationType: RowCalculationType.SIMPLE_MULTIPLY,
    tableColumns: createShelfItemsTableColumns(),
  },
  shelfStockMovements: {
    id: 'shelf_stock_movements',
    titles: { fa: 'ورود و خروج کالا', en: 'Shelf Inventory Movements' },
    icon: 'SwapOutlined',
    order: 2.5,
    type: BlockType.TABLE,
    rowCalculationType: RowCalculationType.SIMPLE_MULTIPLY,
    tableColumns: createShelfStockMovementsTableColumns(),
  },
};

export const shelvesConfig: ModuleDefinition = {
  id: 'shelves',
  titles: { fa: 'قفسه‌ها', en: 'Shelves' },
  nature: ModuleNature.WAREHOUSE,
  table: 'shelves',
  supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
  defaultViewMode: ViewMode.LIST,
  fields: [
    {
      key: 'image_url',
      labels: { fa: 'تصویر قفسه', en: 'Shelf Image' },
      type: FieldType.IMAGE,
      location: FieldLocation.HEADER,
      order: 0,
      nature: FieldNature.STANDARD,
      isTableColumn: true,
    },
    {
      key: 'name',
      labels: { fa: 'نام قفسه', en: 'Shelf Name' },
      type: FieldType.TEXT,
      location: FieldLocation.HEADER,
      order: 1,
      nature: FieldNature.STANDARD,
      isTableColumn: true,
    },
    {
      key: 'shelf_number',
      labels: { fa: 'شماره قفسه', en: 'Shelf Number' },
      type: FieldType.TEXT,
      location: FieldLocation.HEADER,
      order: 2,
      readonly: true,
      nature: FieldNature.PREDEFINED,
      isKey: true,
      isTableColumn: true,
    },
    {
      key: 'warehouse_id',
      labels: { fa: 'نام انبار', en: 'Warehouse' },
      type: FieldType.RELATION,
      location: FieldLocation.HEADER,
      order: 3,
      relationConfig: { targetModule: 'warehouses', targetField: 'name' },
      validation: { required: true },
      nature: FieldNature.PREDEFINED,
      isTableColumn: true,
    },
    {
      key: 'location_detail',
      labels: { fa: 'جزئیات مکان', en: 'Location Detail' },
      type: FieldType.TEXT,
      location: FieldLocation.HEADER,
      order: 4,
      nature: FieldNature.STANDARD,
    },
    {
      key: 'responsible_id',
      labels: { fa: 'مسئول', en: 'Responsible' },
      type: FieldType.RELATION,
      location: FieldLocation.HEADER,
      order: 5,
      relationConfig: { targetModule: 'profiles', targetField: 'full_name' },
      nature: FieldNature.STANDARD,
    },
  ],
  blocks: [BLOCKS.shelfInventory, BLOCKS.shelfStockMovements],
  relatedTabs: [],
};
