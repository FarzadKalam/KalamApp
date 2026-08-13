import { BlockType, FieldLocation, FieldNature, FieldType, ModuleDefinition, ModuleNature, ViewMode } from '../types';

// رویدادهای ورودی شبکهٔ اجتماعی، منبع شرط‌ها و triggerهای گردش‌کارند؛
// کاربر آن‌ها را در UI اختصاصی اینستاگرام می‌بیند، نه در CRUD عمومی.
export const instagramInteractionEventsConfig: ModuleDefinition = {
  id: 'instagram_interaction_events',
  titles: { fa: 'رویدادهای اینستاگرام', faSingular: 'رویداد اینستاگرام', en: 'Instagram Interaction Events' },
  nature: ModuleNature.CRM,
  table: 'instagram_interaction_events',
  systemManaged: true,
  disableCreate: true,
  disableDetailView: true,
  hideFullRecordAction: true,
  supportedViewModes: [ViewMode.LIST],
  defaultViewMode: ViewMode.LIST,
  fields: [
    { key: 'event_type', labels: { fa: 'نوع رویداد', en: 'Event Type' }, type: FieldType.SELECT, location: FieldLocation.HEADER, order: 1, isKey: true, isTableColumn: true, nature: FieldNature.SYSTEM, options: [{ value: 'direct_received', label: 'دایرکت جدید', color: 'blue' }, { value: 'comment_received', label: 'کامنت جدید', color: 'orange' }, { value: 'comment_replied', label: 'پاسخ به کامنت', color: 'green' }, { value: 'showcase_button_clicked', label: 'کلیک دکمه ویترین', color: 'magenta' }] },
    { key: 'account_username', labels: { fa: 'پیج اینستاگرام', en: 'Instagram Page' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, isTableColumn: true, nature: FieldNature.SYSTEM },
    { key: 'media_type', labels: { fa: 'نوع رسانه', en: 'Media Type' }, type: FieldType.SELECT, location: FieldLocation.HEADER, order: 2.2, isTableColumn: true, nature: FieldNature.SYSTEM, options: [{ value: 'post', label: 'پست', color: 'blue' }, { value: 'reel', label: 'ریل', color: 'purple' }, { value: 'story', label: 'استوری', color: 'gold' }] },
    { key: 'button_key', labels: { fa: 'دکمه انتخاب‌شده', en: 'Button' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 3, isTableColumn: true, nature: FieldNature.SYSTEM },
    { key: 'message_text', labels: { fa: 'متن پیام یا کامنت', en: 'Message Text' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'details', order: 1, nature: FieldNature.SYSTEM },
    { key: 'media_caption', labels: { fa: 'کپشن پست یا استوری', en: 'Media Caption' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'details', order: 1.5, nature: FieldNature.SYSTEM },
    { key: 'media_permalink', labels: { fa: 'لینک پست یا استوری', en: 'Media Permalink' }, type: FieldType.TEXT, location: FieldLocation.BLOCK, blockId: 'details', order: 1.6, nature: FieldNature.SYSTEM },
    { key: 'tags', labels: { fa: 'برچسب‌ها', en: 'Tags' }, type: FieldType.TAGS, location: FieldLocation.HEADER, order: 3.5, isTableColumn: true, nature: FieldNature.STANDARD },
    { key: 'showcase_id', labels: { fa: 'ویترین محصولات', en: 'Showcase' }, type: FieldType.TEXT, location: FieldLocation.BLOCK, blockId: 'details', order: 2, nature: FieldNature.SYSTEM },
    { key: 'occurred_at', labels: { fa: 'زمان رویداد', en: 'Occurred At' }, type: FieldType.DATETIME, location: FieldLocation.HEADER, order: 4, isTableColumn: true, nature: FieldNature.SYSTEM },
  ],
  blocks: [{ id: 'details', titles: { fa: 'جزئیات رویداد', en: 'Event Details' }, type: BlockType.FIELD_GROUP, order: 1 }],
};
