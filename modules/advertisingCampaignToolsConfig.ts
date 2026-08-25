import { BlockType, FieldLocation, FieldNature, FieldType, ModuleDefinition, ModuleNature, ViewMode } from '../types';
import {
  ADVERTISING_CAMPAIGNS_MODULE_ID,
  ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID,
  CAMPAIGN_TOOL_DEFINITIONS,
  CAMPAIGN_TOOL_STATUS_OPTIONS,
} from '../utils/advertisingCampaigns';

export const advertisingCampaignToolsConfig: ModuleDefinition = {
  id: ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID,
  titles: { fa: 'ابزارهای کمپین تبلیغاتی', faSingular: 'ابزار کمپین', en: 'Advertising Campaign Tools' },
  nature: ModuleNature.MARKETING,
  table: 'advertising_campaign_tools',
  systemManaged: true,
  disableCreate: true,
  registryVisibility: { globalSearch: false, moduleSettings: true, reports: true, workflows: true },
  supportedViewModes: [ViewMode.LIST],
  relationDisplay: { labelTemplate: '{{tool_type}} - {{status}}', searchFields: ['tool_type', 'status'] },
  fields: [
    { key: 'title', labels: { fa: 'عنوان ابزار', en: 'Title' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 0.5, isTableColumn: true },
    { key: 'campaign_id', labels: { fa: 'کمپین', en: 'Campaign' }, type: FieldType.RELATION, location: FieldLocation.HEADER, order: 1, validation: { required: true }, relationConfig: { targetModule: ADVERTISING_CAMPAIGNS_MODULE_ID, targetField: 'name' }, isTableColumn: true },
    { key: 'tool_type', labels: { fa: 'ابزار تبلیغاتی', en: 'Tool type' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 2, options: CAMPAIGN_TOOL_DEFINITIONS.map((item) => ({ label: item.label, value: item.value })), validation: { required: true }, isTableColumn: true },
    { key: 'status', labels: { fa: 'وضعیت اجرا', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 3, options: CAMPAIGN_TOOL_STATUS_OPTIONS.map((item) => ({ ...item })), defaultValue: 'draft', isTableColumn: true },
    { key: 'enabled', labels: { fa: 'فعال', en: 'Enabled' }, type: FieldType.CHECKBOX, location: FieldLocation.HEADER, order: 4, defaultValue: true },
    { key: 'assignee_id', labels: { fa: 'مسئول ابزار', en: 'Assignee' }, type: FieldType.USER, location: FieldLocation.HEADER, order: 5, isTableColumn: true },
    { key: 'assignee_role_id', labels: { fa: 'نقش مسئول ابزار', en: 'Assignee role' }, type: FieldType.JSON, location: FieldLocation.HEADER, order: 5.1, readonly: true, nature: FieldNature.SYSTEM, botSettingsOnly: true },
    { key: 'collaborator_user_ids', labels: { fa: 'کاربران همکار', en: 'Collaborator users' }, type: FieldType.USER, blockId: 'automation', order: 42, mode: 'multiple' },
    { key: 'collaborator_role_ids', labels: { fa: 'نقش‌های همکار', en: 'Collaborator roles' }, type: FieldType.JSON, blockId: 'automation', order: 43, readonly: true, nature: FieldNature.SYSTEM, botSettingsOnly: true },
    { key: 'estimated_cost', labels: { fa: 'هزینه برآوردی', en: 'Estimated cost' }, type: FieldType.PRICE, blockId: 'estimates', order: 10, isTableColumn: true },
    { key: 'actual_cost', labels: { fa: 'هزینه واقعی', en: 'Actual cost' }, type: FieldType.PRICE, blockId: 'results', order: 11, isTableColumn: true },
    { key: 'planned_start_at', labels: { fa: 'شروع برنامه‌ریزی‌شده', en: 'Planned start' }, type: FieldType.DATETIME, blockId: 'schedule', order: 20, isTableColumn: true },
    { key: 'planned_end_at', labels: { fa: 'پایان برنامه‌ریزی‌شده', en: 'Planned end' }, type: FieldType.DATETIME, blockId: 'schedule', order: 21, isTableColumn: true },
    { key: 'actual_start_at', labels: { fa: 'شروع واقعی', en: 'Actual start' }, type: FieldType.DATETIME, blockId: 'results', order: 22 },
    { key: 'actual_end_at', labels: { fa: 'پایان واقعی', en: 'Actual end' }, type: FieldType.DATETIME, blockId: 'results', order: 23 },
    { key: 'expected_leads', labels: { fa: 'لید مورد انتظار', en: 'Expected leads' }, type: FieldType.NUMBER, blockId: 'estimates', order: 30 },
    { key: 'expected_customers', labels: { fa: 'مشتری مورد انتظار', en: 'Expected customers' }, type: FieldType.NUMBER, blockId: 'estimates', order: 31 },
    { key: 'actual_leads', labels: { fa: 'لید واقعی', en: 'Actual leads' }, type: FieldType.NUMBER, blockId: 'results', order: 32, readonly: true },
    { key: 'actual_customers', labels: { fa: 'مشتری واقعی', en: 'Actual customers' }, type: FieldType.NUMBER, blockId: 'results', order: 33, readonly: true },
    { key: 'result_summary', labels: { fa: 'خلاصه نتیجه اجرا', en: 'Result summary' }, type: FieldType.LONG_TEXT, blockId: 'results', order: 34 },
    { key: 'process_template_id', labels: { fa: 'الگوی فرآیند', en: 'Process template' }, type: FieldType.RELATION, blockId: 'automation', order: 40, relationConfig: { targetModule: 'process_templates', targetField: 'name' } },
    { key: 'execution_process_draft', labels: { fa: 'اجرای فرآیند', en: 'Process execution' }, type: FieldType.JSON, blockId: 'automation', order: 41 },
    { key: 'config', labels: { fa: 'تنظیمات اختصاصی ابزار', en: 'Tool configuration' }, type: FieldType.JSON, blockId: 'tool_config', order: 50, nature: FieldNature.STANDARD },
  ],
  blocks: [
    { id: 'schedule', titles: { fa: 'زمان‌بندی', en: 'Schedule' }, type: BlockType.FIELD_GROUP, order: 1 },
    { id: 'estimates', titles: { fa: 'برآوردها', en: 'Estimates' }, type: BlockType.FIELD_GROUP, order: 2 },
    { id: 'results', titles: { fa: 'نتیجه واقعی', en: 'Actual result' }, type: BlockType.FIELD_GROUP, order: 3 },
    { id: 'automation', titles: { fa: 'اتوماسیون', en: 'Automation' }, type: BlockType.FIELD_GROUP, order: 4 },
    { id: 'tool_config', titles: { fa: 'تنظیمات اختصاصی', en: 'Configuration' }, type: BlockType.FIELD_GROUP, order: 5 },
  ],
};

export default advertisingCampaignToolsConfig;
