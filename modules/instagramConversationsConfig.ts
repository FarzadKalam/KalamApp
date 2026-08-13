import { BlockType, FieldLocation, FieldNature, FieldType, ModuleDefinition, ModuleNature, ViewMode } from '../types';

// این تعریف فقط منبع یکپارچهٔ برچسب‌ها و کنترل دسترسی در صفحهٔ نقش‌هاست؛
// تجربهٔ عملیاتی گفتگوها در صندوق اختصاصی اینستاگرام باقی می‌ماند.
export const instagramConversationsConfig: ModuleDefinition = {
  id: 'instagram_conversations',
  titles: { fa: 'گفتگوهای اینستاگرام', faSingular: 'گفتگوی اینستاگرام', en: 'Instagram Conversations' },
  nature: ModuleNature.CRM,
  table: 'instagram_conversations',
  systemManaged: true,
  disableCreate: true,
  disableDetailView: true,
  hideFullRecordAction: true,
  supportedViewModes: [ViewMode.LIST],
  defaultViewMode: ViewMode.LIST,
  fields: [
    { key: 'account_id', labels: { fa: 'حساب اینستاگرام', en: 'Instagram Account' }, type: FieldType.SELECT, location: FieldLocation.HEADER, order: 1, isTableColumn: true, nature: FieldNature.SYSTEM },
    { key: 'status', labels: { fa: 'وضعیت گفتگو', en: 'Conversation Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 2, isTableColumn: true, nature: FieldNature.SYSTEM, options: [{ label: 'باز', value: 'open', color: 'blue' }, { label: 'در انتظار', value: 'pending', color: 'orange' }, { label: 'بسته', value: 'closed', color: 'default' }] },
    { key: 'priority', labels: { fa: 'اولویت', en: 'Priority' }, type: FieldType.SELECT, location: FieldLocation.HEADER, order: 3, isTableColumn: true, nature: FieldNature.SYSTEM, options: [{ label: 'عادی', value: 'normal' }, { label: 'بالا', value: 'high', color: 'red' }] },
    { key: 'tags', labels: { fa: 'برچسب‌ها', en: 'Tags' }, type: FieldType.TAGS, location: FieldLocation.HEADER, order: 4, isTableColumn: true, nature: FieldNature.STANDARD },
    { key: 'assignee_user_id', labels: { fa: 'مسئول', en: 'Assignee' }, type: FieldType.USER, location: FieldLocation.BLOCK, blockId: 'details', order: 1, nature: FieldNature.SYSTEM },
    { key: 'last_message_preview', labels: { fa: 'آخرین پیام', en: 'Last Message' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'details', order: 2, nature: FieldNature.SYSTEM },
  ],
  blocks: [{ id: 'details', titles: { fa: 'جزئیات گفتگو', en: 'Conversation Details' }, type: BlockType.FIELD_GROUP, order: 1 }],
};
