import {
  BlockType,
  FieldLocation,
  FieldNature,
  FieldType,
  ModuleDefinition,
  ModuleNature,
  ViewMode,
} from '../types';
import {
  ADVERTISING_CAMPAIGNS_MODULE_ID,
  CAMPAIGN_STATUS_OPTIONS,
  CAMPAIGN_TOOL_DEFINITIONS,
} from '../utils/advertisingCampaigns';

export const advertisingCampaignsConfig: ModuleDefinition = {
  id: ADVERTISING_CAMPAIGNS_MODULE_ID,
  titles: { fa: 'کمپین‌های تبلیغاتی', faSingular: 'کمپین تبلیغاتی', en: 'Advertising Campaigns' },
  nature: ModuleNature.MARKETING,
  table: 'advertising_campaigns',
  supportedViewModes: [ViewMode.LIST, ViewMode.KANBAN, ViewMode.GRID],
  defaultViewMode: ViewMode.LIST,
  dashboard: {
    quickCreateLabel: 'کمپین تبلیغاتی جدید',
    recentListFields: ['name', 'status', 'start_at', 'end_at'],
  },
  relationDisplay: {
    labelTemplate: '{{system_code}} - {{name}}',
    searchFields: ['system_code', 'name', 'description', 'target_audience'],
  },
  fields: [
    {
      key: 'image_url', labels: { fa: 'تصویر کمپین', en: 'Campaign image' }, type: FieldType.IMAGE,
      location: FieldLocation.HEADER, order: 0, nature: FieldNature.PREDEFINED, isTableColumn: true,
    },
    {
      key: 'name', labels: { fa: 'نام کمپین', en: 'Campaign name' }, type: FieldType.TEXT,
      location: FieldLocation.HEADER, order: 1, nature: FieldNature.PREDEFINED,
      validation: { required: true }, isKey: true, isTableColumn: true,
    },
    {
      key: 'system_code', labels: { fa: 'کد سیستمی', en: 'System code' }, type: FieldType.TEXT,
      location: FieldLocation.HEADER, order: 2, nature: FieldNature.SYSTEM, readonly: true, isTableColumn: true,
    },
    {
      key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS,
      location: FieldLocation.HEADER, order: 3, nature: FieldNature.STANDARD,
      options: CAMPAIGN_STATUS_OPTIONS.map((item) => ({ ...item })), defaultValue: 'draft',
      validation: { required: true }, isTableColumn: true,
    },
    {
      key: 'tags', labels: { fa: 'برچسب‌ها', en: 'Tags' }, type: FieldType.TAGS,
      location: FieldLocation.HEADER, order: 4, nature: FieldNature.STANDARD, isTableColumn: true,
    },
    {
      key: 'tool_types', labels: { fa: 'ابزارهای تبلیغاتی', en: 'Advertising tools' }, type: FieldType.MULTI_SELECT,
      location: FieldLocation.HEADER, order: 5, nature: FieldNature.STANDARD, isTableColumn: true,
      options: CAMPAIGN_TOOL_DEFINITIONS.map((item) => ({ label: item.label, value: item.value })),
      dynamicOptionsCategory: 'advertising_campaign_tool_type', validation: { required: true },
    },
    {
      key: 'assignee_id', labels: { fa: 'مسئول', en: 'Assignee' }, type: FieldType.USER,
      location: FieldLocation.HEADER, order: 6, nature: FieldNature.STANDARD, isTableColumn: true,
    },
    {
      key: 'description', labels: { fa: 'توضیحات', en: 'Description' }, type: FieldType.LONG_TEXT,
      location: FieldLocation.BLOCK, blockId: 'campaign_details', order: 10, nature: FieldNature.STANDARD,
    },
    {
      key: 'target_audience', labels: { fa: 'جامعه هدف', en: 'Target audience' }, type: FieldType.LONG_TEXT,
      location: FieldLocation.BLOCK, blockId: 'campaign_details', order: 11, nature: FieldNature.STANDARD,
    },
    {
      key: 'start_at', labels: { fa: 'زمان شروع', en: 'Start time' }, type: FieldType.DATETIME,
      location: FieldLocation.BLOCK, blockId: 'schedule', order: 20, nature: FieldNature.STANDARD, isTableColumn: true,
    },
    {
      key: 'end_at', labels: { fa: 'زمان پایان', en: 'End time' }, type: FieldType.DATETIME,
      location: FieldLocation.BLOCK, blockId: 'schedule', order: 21, nature: FieldNature.STANDARD, isTableColumn: true,
    },
    {
      key: 'viewer_user_ids', labels: { fa: 'کاربران مشاهده‌کننده', en: 'Viewer users' }, type: FieldType.JSON,
      location: FieldLocation.BLOCK, blockId: 'visibility', order: 30, nature: FieldNature.STANDARD,
    },
    {
      key: 'viewer_role_ids', labels: { fa: 'نقش‌های مشاهده‌کننده', en: 'Viewer roles' }, type: FieldType.JSON,
      location: FieldLocation.BLOCK, blockId: 'visibility', order: 31, nature: FieldNature.STANDARD,
    },
    {
      key: 'created_at', labels: { fa: 'زمان ایجاد', en: 'Created at' }, type: FieldType.DATETIME,
      location: FieldLocation.SYSTEM_FOOTER, order: 90, nature: FieldNature.SYSTEM, readonly: true,
    },
    {
      key: 'updated_at', labels: { fa: 'زمان آخرین ویرایش', en: 'Updated at' }, type: FieldType.DATETIME,
      location: FieldLocation.SYSTEM_FOOTER, order: 91, nature: FieldNature.SYSTEM, readonly: true,
    },
  ],
  blocks: [
    { id: 'campaign_details', titles: { fa: 'مشخصات کمپین', en: 'Campaign details' }, type: BlockType.FIELD_GROUP, order: 1 },
    { id: 'schedule', titles: { fa: 'زمان‌بندی', en: 'Schedule' }, type: BlockType.FIELD_GROUP, order: 2 },
    { id: 'visibility', titles: { fa: 'دسترسی و مشاهده', en: 'Visibility' }, type: BlockType.FIELD_GROUP, order: 3 },
  ],
  relatedTabs: [
    { id: 'campaign_tools', title: 'ابزارهای کمپین', icon: 'AppstoreOutlined', relationType: 'fk', targetModule: 'advertising_campaign_tools', foreignKey: 'campaign_id', disableCreate: true },
    { id: 'campaign_leads', title: 'لیدهای مرتبط', icon: 'UserAddOutlined', relationType: 'fk', targetModule: 'marketing_leads', foreignKey: 'advertising_campaign_id' },
    { id: 'campaign_customers', title: 'مشتریان مرتبط', icon: 'TeamOutlined', relationType: 'fk', targetModule: 'customers', foreignKey: 'advertising_campaign_id' },
    { id: 'campaign_invoices', title: 'فاکتورهای فروش مرتبط', icon: 'FileTextOutlined', relationType: 'fk', targetModule: 'invoices', foreignKey: 'advertising_campaign_id' },
  ],
};

export default advertisingCampaignsConfig;
