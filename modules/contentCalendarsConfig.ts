import {
  BlockType,
  FieldLocation,
  FieldNature,
  FieldType,
  ModuleDefinition,
  ModuleNature,
  ViewMode,
} from '../types';

export const CONTENT_CALENDAR_MODULE_ID = 'content_calendars';
export const CONTENT_CALENDAR_PLAN_FEATURE = 'content_calendar';

export const contentCalendarsConfig: ModuleDefinition = {
  id: CONTENT_CALENDAR_MODULE_ID,
  titles: { fa: 'تقویم‌های محتوایی', faSingular: 'تقویم محتوایی', en: 'Content Calendars' },
  nature: ModuleNature.MARKETING,
  table: 'content_calendars',
  supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
  defaultViewMode: ViewMode.LIST,
  dashboard: { quickCreateLabel: 'تقویم محتوایی جدید', recentListFields: ['name', 'customer_id', 'start_date', 'end_date'] },
  relationDisplay: { labelTemplate: '{{system_code}} - {{name}}', searchFields: ['system_code', 'name', 'description'] },
  fields: [
    { key: 'name', labels: { fa: 'عنوان تقویم', en: 'Calendar name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, validation: { required: true }, isKey: true, isTableColumn: true, nature: FieldNature.PREDEFINED },
    { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'System code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true, isTableColumn: true, nature: FieldNature.SYSTEM },
    { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 3, defaultValue: 'active', isTableColumn: true, nature: FieldNature.STANDARD, options: [
      { label: 'پیش‌نویس', value: 'draft', color: 'default' }, { label: 'فعال', value: 'active', color: 'blue' }, { label: 'تکمیل‌شده', value: 'completed', color: 'green' }, { label: 'بایگانی', value: 'archived', color: 'gray' },
    ] },
    { key: 'image_url', labels: { fa: 'تصویر تقویم', en: 'Calendar image' }, type: FieldType.IMAGE, location: FieldLocation.HEADER, order: 4, nature: FieldNature.STANDARD },
    { key: 'customer_id', labels: { fa: 'مشتری', en: 'Customer' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'context', order: 1, isTableColumn: true, nature: FieldNature.STANDARD, relationConfig: { targetModule: 'customers', targetField: 'full_name' } },
    { key: 'source_invoice_id', labels: { fa: 'فاکتور فروش مرتبط', en: 'Sales invoice' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'context', order: 2, nature: FieldNature.STANDARD, relationConfig: { targetModule: 'invoices', targetField: 'name' } },
    { key: 'start_date', labels: { fa: 'تاریخ شروع', en: 'Start date' }, type: FieldType.DATE, location: FieldLocation.BLOCK, blockId: 'schedule', order: 1, isTableColumn: true, nature: FieldNature.STANDARD },
    { key: 'end_date', labels: { fa: 'تاریخ پایان', en: 'End date' }, type: FieldType.DATE, location: FieldLocation.BLOCK, blockId: 'schedule', order: 2, isTableColumn: true, nature: FieldNature.STANDARD },
    { key: 'description', labels: { fa: 'توضیحات', en: 'Description' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'context', order: 3, nature: FieldNature.STANDARD },
    { key: 'created_by', labels: { fa: 'ایجادکننده', en: 'Created by' }, type: FieldType.USER, location: FieldLocation.SYSTEM_FOOTER, order: 89, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'created_at', labels: { fa: 'زمان ایجاد', en: 'Created at' }, type: FieldType.DATETIME, location: FieldLocation.SYSTEM_FOOTER, order: 90, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'updated_at', labels: { fa: 'زمان ویرایش', en: 'Updated at' }, type: FieldType.DATETIME, location: FieldLocation.SYSTEM_FOOTER, order: 91, readonly: true, nature: FieldNature.SYSTEM },
  ],
  blocks: [
    { id: 'context', titles: { fa: 'اطلاعات پایه', en: 'Context' }, type: BlockType.FIELD_GROUP, order: 1 },
    { id: 'schedule', titles: { fa: 'بازه برنامه‌ریزی', en: 'Schedule' }, type: BlockType.FIELD_GROUP, order: 2 },
  ],
  relatedTabs: [
    { id: 'content_calendar_projects', title: 'پروژه‌ها', icon: 'ProjectOutlined', relationType: 'fk', targetModule: 'projects', foreignKey: 'content_calendar_id' },
    { id: 'content_calendar_activities', title: 'فعالیت‌های مستقیم', icon: 'CheckSquareOutlined', relationType: 'fk', targetModule: 'tasks', foreignKey: 'content_calendar_id' },
  ],
};
