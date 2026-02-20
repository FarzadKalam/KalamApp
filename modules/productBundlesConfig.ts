import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType, LogicOperator, FieldNature } from '../types';

/**
 * Product Bundles Module Configuration
 * 
 * برای بسته‌های محصول نیمه‌آماده (semi_finished_bundle)
 * 
 * هر بسته شامل:
 * - شماره بسته (bundle_number)
 * - قفسه انبار (shelf_id)
 * - اقلام داخل بسته (bundle_items)
 */

const BLOCKS = {
  baseInfo: {
    id: 'baseInfo',
    titles: { fa: 'اطلاعات پایه', en: 'Basic Info' },
    icon: 'InfoCircleOutlined',
    order: 1,
    type: BlockType.FIELD_GROUP
  },
  
  bundleContents: {
    id: 'bundleContents',
    titles: { fa: 'اقلام بسته', en: 'Bundle Contents' },
    icon: 'BgColorsOutlined',
    order: 2,
    type: BlockType.TABLE,
    visibleIf: { field: 'status', operator: LogicOperator.NOT_EQUALS, value: null }
  }
};

export const productBundlesConfig: ModuleDefinition = {
  id: 'product_bundles',
  titles: { fa: 'بسته‌های محصول', en: 'Product Bundles' },
  nature: ModuleNature.PRODUCT,
  table: 'product_bundles',
  supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
  defaultViewMode: ViewMode.LIST,
  
  fields: [
    // --- هدر ---
    {
      key: 'bundle_number',
      labels: { fa: 'شماره بسته', en: 'Bundle Number' },
      type: FieldType.TEXT,
      location: FieldLocation.HEADER,
      order: 1,
      validation: { required: true },
      nature: FieldNature.PREDEFINED,
      isKey: true
    },

    {
      key: 'status',
      labels: { fa: 'وضعیت', en: 'Status' },
      type: FieldType.STATUS,
      location: FieldLocation.HEADER,
      order: 2,
      options: [
        { label: 'فعال', value: 'active', color: 'green' },
        { label: 'پیش‌نویس', value: 'draft', color: 'orange' },
        { label: 'بایگانی', value: 'archived', color: 'gray' }
      ],
      defaultValue: 'draft',
      nature: FieldNature.PREDEFINED
    },

    // --- اطلاعات پایه ---
    {
      key: 'shelf_id',
      labels: { fa: 'قفسه انبار', en: 'Storage Shelf' },
      type: FieldType.RELATION,
      location: FieldLocation.BLOCK,
      blockId: 'baseInfo',
      order: 1,
      relationConfig: {
        targetModule: 'warehouses', // TODO: در صورت نیاز تصحیح شود
        targetField: 'name'
      },
      nature: FieldNature.PREDEFINED
    },

    {
      key: 'created_at',
      labels: { fa: 'تاریخ ایجاد', en: 'Created At' },
      type: FieldType.DATETIME,
      location: FieldLocation.BLOCK,
      blockId: 'baseInfo',
      order: 2,
      readonly: true,
      nature: FieldNature.SYSTEM
    },

    {
      key: 'notes',
      labels: { fa: 'یادداشت‌ها', en: 'Notes' },
      type: FieldType.LONG_TEXT,
      location: FieldLocation.BLOCK,
      blockId: 'baseInfo',
      order: 3,
      nature: FieldNature.STANDARD
    }
  ],

  blocks: [
    BLOCKS.baseInfo,
    
    // بلوک جدول اقلام بسته
    {
      ...BLOCKS.bundleContents,
      tableColumns: [
        {
          key: 'product_id',
          title: 'محصول (مواد اولیه)',
          type: FieldType.RELATION,
          relationConfig: {
            targetModule: 'products',
            targetField: 'name'
          }
        },
        {
          key: 'quantity',
          title: 'مقدار',
          type: FieldType.NUMBER
        },
        {
          key: 'unit',
          title: 'واحد',
          type: FieldType.TEXT
        }
      ]
    }
  ],

  relatedTabs: [
    {
      id: 'products',
      title: 'محصولات استفاده‌کننده',
      icon: 'ShoppingCart',
      targetModule: 'products',
      foreignKey: 'bundle_id',
      relationType: 'fk'
    }
  ]
};
