import {
  BlockType,
  FieldLocation,
  FieldNature,
  FieldType,
  ModuleDefinition,
  ModuleNature,
  ViewMode,
} from '../types';

const BLOCKS = {
  baseInfo: {
    id: 'baseInfo',
    titles: { fa: 'اطلاعات پایه', en: 'Basic Info' },
    icon: 'InfoCircleOutlined',
    order: 1,
    type: BlockType.FIELD_GROUP,
  },
  items: {
    id: 'items',
    titles: { fa: 'اقلام لیست قیمت', en: 'Price List Items' },
    icon: 'TableOutlined',
    order: 2,
    type: BlockType.TABLE,
    tableColumns: [
      {
        key: 'product_id',
        title: 'کالا / خدمت',
        type: FieldType.RELATION,
        width: 300,
        relationConfig: {
          targetModule: 'products',
          targetField: 'name',
          sourceModules: [
            { targetModule: 'products', targetField: 'name' },
            { targetModule: 'billboards', targetField: 'name', tagLabel: 'محیطی', tagColor: 'purple' },
          ],
        },
      },
      {
        key: 'price',
        title: 'قیمت',
        type: FieldType.PRICE,
        width: 170,
      },
      {
        key: 'currency_label',
        title: 'واحد پول',
        type: FieldType.TEXT,
        width: 110,
        readonly: true,
      },
      {
        key: 'unit_name',
        title: 'واحد',
        type: FieldType.TEXT,
        width: 130,
        readonly: true,
      },
    ],
  },
};

export const priceListsConfig: ModuleDefinition = {
  id: 'price_lists',
  titles: { fa: 'لیست قیمت‌ها', faSingular: 'لیست قیمت', en: 'Price Lists' },
  nature: ModuleNature.PRODUCT,
  table: 'price_lists',
  supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
  defaultViewMode: ViewMode.LIST,
  fields: [
    {
      key: 'name',
      labels: { fa: 'نام لیست قیمت', en: 'Name' },
      type: FieldType.TEXT,
      location: FieldLocation.HEADER,
      order: 1,
      validation: { required: true },
      isKey: true,
      isTableColumn: true,
      nature: FieldNature.PREDEFINED,
    },
    {
      key: 'status',
      labels: { fa: 'وضعیت', en: 'Status' },
      type: FieldType.STATUS,
      location: FieldLocation.HEADER,
      order: 2,
      defaultValue: 'active',
      isTableColumn: true,
      options: [
        { label: 'فعال', value: 'active', color: 'green' },
        { label: 'غیرفعال', value: 'draft', color: 'orange' },
      ],
      nature: FieldNature.PREDEFINED,
    },
    {
      key: 'description',
      labels: { fa: 'توضیحات', en: 'Description' },
      type: FieldType.SUPER_LONG_TEXT,
      location: FieldLocation.BLOCK,
      blockId: 'baseInfo',
      order: 3,
      nature: FieldNature.STANDARD,
    },
    {
      key: 'created_at',
      labels: { fa: 'تاریخ ایجاد', en: 'Created At' },
      type: FieldType.DATETIME,
      location: FieldLocation.BLOCK,
      blockId: 'baseInfo',
      order: 10,
      readonly: true,
      nature: FieldNature.SYSTEM,
    },
  ].filter((field) => field.key !== 'created_at'),
  blocks: [BLOCKS.baseInfo, BLOCKS.items],
};
