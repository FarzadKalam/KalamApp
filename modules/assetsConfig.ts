import { BlockType, FieldLocation, FieldNature, FieldType, ModuleDefinition, ModuleNature, ViewMode } from '../types';

export const assetsConfig: ModuleDefinition = {
  id: 'assets',
  titles: { fa: 'اموال', faSingular: 'مال', en: 'Assets' },
  nature: ModuleNature.STANDARD,
  table: 'assets',
  supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
  defaultViewMode: ViewMode.LIST,
  relationDisplay: {
    labelTemplate: '{{system_code}} - {{name}}',
    searchFields: ['name', 'system_code', 'asset_tag_code', 'storage_location'],
  },
  fields: [
    { key: 'image_url', labels: { fa: 'تصویر', en: 'Image' }, type: FieldType.IMAGE, location: FieldLocation.HEADER, order: 0, nature: FieldNature.PREDEFINED, isTableColumn: true },
    { key: 'name', labels: { fa: 'عنوان مال', en: 'Asset Title' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, validation: { required: true }, nature: FieldNature.PREDEFINED, isKey: true, isTableColumn: true },
    { key: 'system_code', labels: { fa: 'شماره مال', en: 'Asset No.' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
    { key: 'asset_tag_code', labels: { fa: 'کد برچسب اموال', en: 'Asset Tag Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 3, nature: FieldNature.STANDARD, isTableColumn: true },
    {
      key: 'status',
      labels: { fa: 'وضعیت', en: 'Status' },
      type: FieldType.STATUS,
      location: FieldLocation.HEADER,
      order: 4,
      defaultValue: 'available',
      nature: FieldNature.STANDARD,
      isTableColumn: true,
      options: [
        { label: 'موجود', value: 'available', color: 'green' },
        { label: 'تحویل‌شده', value: 'assigned', color: 'blue' },
        { label: 'در تعمیر', value: 'maintenance', color: 'orange' },
        { label: 'خارج از استفاده', value: 'retired', color: 'default' },
      ],
    },
    { key: 'storage_location', labels: { fa: 'محل نگهداری', en: 'Storage Location' }, type: FieldType.SELECT, dynamicOptionsCategory: 'asset_storage_location', location: FieldLocation.HEADER, order: 5, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'source_expense_document_id', labels: { fa: 'هزینه مرتبط', en: 'Source Expense' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'source', order: 1, readonly: true, nature: FieldNature.STANDARD, relationConfig: { targetModule: 'expense_documents', targetField: 'name' }, hideInCreateForm: true },
    { key: 'notes', labels: { fa: 'توضیحات', en: 'Notes' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'notes', order: 1, nature: FieldNature.STANDARD },
    { key: 'process_template_id', labels: { fa: 'الگوی فرآیند اجرا', en: 'Execution Template' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'process', order: 1, nature: FieldNature.STANDARD, relationConfig: { targetModule: 'process_templates', targetField: 'name' } },
    { key: 'execution_process_draft', labels: { fa: 'فرآیند اجرا', en: 'Execution Process' }, type: FieldType.JSON, location: FieldLocation.BLOCK, blockId: 'process', order: 2, nature: FieldNature.STANDARD },
  ],
  blocks: [
    { id: 'source', titles: { fa: 'منبع ثبت', en: 'Source' }, type: BlockType.FIELD_GROUP, order: 1, icon: 'LinkOutlined' },
    { id: 'notes', titles: { fa: 'یادداشت‌ها', en: 'Notes' }, type: BlockType.FIELD_GROUP, order: 2, icon: 'FileTextOutlined' },
    { id: 'process', titles: { fa: 'فرآیند اجرا', en: 'Execution Process' }, type: BlockType.FIELD_GROUP, order: 3, icon: 'DeploymentUnitOutlined' },
  ],
  relatedTabs: [],
};
