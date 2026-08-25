import { BlockType, FieldLocation, FieldNature, FieldType, ModuleDefinition, ModuleNature, ViewMode } from '../types';
import {
  ADVERTISING_CAMPAIGNS_MODULE_ID,
  ADVERTISING_CAMPAIGN_RESPONSES_MODULE_ID,
  ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID,
} from '../utils/advertisingCampaigns';

export const advertisingCampaignResponsesConfig: ModuleDefinition = {
  id: ADVERTISING_CAMPAIGN_RESPONSES_MODULE_ID,
  titles: { fa: 'پاسخ‌های کمپین تبلیغاتی', faSingular: 'پاسخ کمپین', en: 'Advertising Campaign Responses' },
  nature: ModuleNature.MARKETING,
  table: 'advertising_campaign_responses',
  systemManaged: true,
  disableCreate: true,
  registryVisibility: { globalSearch: false, moduleSettings: false, reports: true, workflows: true },
  supportedViewModes: [ViewMode.LIST],
  fields: [
    { key: 'campaign_id', labels: { fa: 'کمپین', en: 'Campaign' }, type: FieldType.RELATION, location: FieldLocation.HEADER, order: 1, relationConfig: { targetModule: ADVERTISING_CAMPAIGNS_MODULE_ID, targetField: 'name' }, isTableColumn: true },
    { key: 'tool_id', labels: { fa: 'ابزار کمپین', en: 'Campaign tool' }, type: FieldType.RELATION, location: FieldLocation.HEADER, order: 2, relationConfig: { targetModule: ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID, targetField: 'tool_type' }, isTableColumn: true },
    { key: 'sender', labels: { fa: 'فرستنده', en: 'Sender' }, type: FieldType.PHONE, blockId: 'response', order: 10, isTableColumn: true },
    { key: 'receiver', labels: { fa: 'گیرنده', en: 'Receiver' }, type: FieldType.PHONE, blockId: 'response', order: 10.5, isTableColumn: true },
    { key: 'message_text', labels: { fa: 'متن پاسخ', en: 'Message' }, type: FieldType.LONG_TEXT, blockId: 'response', order: 11, isTableColumn: true },
    { key: 'created_at', labels: { fa: 'زمان دریافت', en: 'Received at' }, type: FieldType.DATETIME, blockId: 'response', order: 12, isTableColumn: true, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'source_module_id', labels: { fa: 'ماژول رکورد مخاطب', en: 'Source module' }, type: FieldType.TEXT, blockId: 'source', order: 20, nature: FieldNature.SYSTEM, readonly: true },
    { key: 'match_status', labels: { fa: 'وضعیت تطبیق', en: 'Match status' }, type: FieldType.STATUS, blockId: 'source', order: 22, options: [{ label: 'تطبیق‌شده', value: 'matched' }, { label: 'مبهم', value: 'ambiguous' }, { label: 'بدون تطبیق', value: 'unmatched' }], isTableColumn: true },
    { key: 'metadata', labels: { fa: 'اطلاعات تکمیلی', en: 'Metadata' }, type: FieldType.JSON, blockId: 'source', order: 23, nature: FieldNature.SYSTEM, readonly: true },
  ],
  blocks: [
    { id: 'response', titles: { fa: 'پاسخ دریافتی', en: 'Response' }, type: BlockType.FIELD_GROUP, order: 1 },
    { id: 'source', titles: { fa: 'تطبیق مخاطب', en: 'Source matching' }, type: BlockType.FIELD_GROUP, order: 2 },
  ],
};

export default advertisingCampaignResponsesConfig;
