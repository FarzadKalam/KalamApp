import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType, FieldNature } from '../types';

const BLOCKS = {
  baseInfo: {
    id: 'baseInfo',
    titles: { fa: 'اطلاعات انبار', en: 'Warehouse Info' },
    icon: 'GoldOutlined',
    order: 1,
    type: BlockType.FIELD_GROUP
  },
  shelvesTable: {
    id: 'warehouse_shelves',
    titles: { fa: 'قفسه‌های انبار', en: 'Warehouse Shelves' },
    icon: 'AppstoreOutlined',
    order: 2,
    type: BlockType.TABLE,
    readonly: true,
    tableColumns: [
      { key: 'image_url', title: 'تصویر', type: FieldType.IMAGE },
      { key: 'name', title: 'نام قفسه', type: FieldType.TEXT },
      { key: 'shelf_number', title: 'شماره قفسه', type: FieldType.TEXT },
      { key: 'location_detail', title: 'جزئیات مکان', type: FieldType.TEXT },
      { key: 'responsible_id', title: 'مسئول', type: FieldType.RELATION, relationConfig: { targetModule: 'profiles', targetField: 'full_name' } }
    ],
    externalDataConfig: {
      relationFieldKey: 'warehouse_id',
      targetModule: 'shelves',
      targetColumn: '*'
    }
  }
};

export const warehousesConfig: ModuleDefinition = {
  id: 'warehouses',
  titles: { fa: 'انبارها', en: 'Warehouses' },
  nature: ModuleNature.WAREHOUSE,
  table: 'warehouses',
  supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
  defaultViewMode: ViewMode.GRID,
  fields: [
    {
      key: 'name',
      labels: { fa: 'نام انبار', en: 'Warehouse Name' },
      type: FieldType.TEXT,
      location: FieldLocation.HEADER,
      order: 1,
      validation: { required: true },
      nature: FieldNature.PREDEFINED,
      isKey: true,
      isTableColumn: true
    },
    { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Sys Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true },
    { key: 'category', labels: { fa: 'نوع انبار', en: 'type' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 4, options: [{ label: 'انبار داخلی', value: 'inside', color: 'green' }, { label: 'انبار تولید', value: 'production', color: 'blue' }, { label: 'انبار تامین کننده', value: 'supplier', color: 'orange' }], defaultValue: 'inside' },
    {
      key: 'location',
      labels: { fa: 'موقعیت', en: 'Location' },
      type: FieldType.TEXT,
      location: FieldLocation.BLOCK,
      blockId: 'baseInfo',
      order: 2,
      nature: FieldNature.STANDARD
    },
    {
      key: 'manager_id',
      labels: { fa: 'مدیر انبار', en: 'Manager' },
      type: FieldType.RELATION,
      location: FieldLocation.BLOCK,
      blockId: 'baseInfo',
      order: 3,
      relationConfig: { targetModule: 'profiles', targetField: 'full_name' },
      nature: FieldNature.STANDARD
    }
  ],
  blocks: [BLOCKS.baseInfo, BLOCKS.shelvesTable],
  relatedTabs: []
};
