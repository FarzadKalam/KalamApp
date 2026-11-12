import { FieldLocation, FieldNature, FieldType, ModuleDefinition, ModuleNature, ViewMode } from '../types';
const field = (key: string, label: string, order: number, type = FieldType.TEXT, extra = {}) => ({ key, labels: { fa: label, en: key }, order, type, location: FieldLocation.HEADER, nature: FieldNature.SYSTEM, isTableColumn: true, ...extra });
export const emailDeliveryReportsConfig: ModuleDefinition = {
  id: 'email_delivery_reports', table: 'email_messages', titles: { fa: 'گزارش‌های ایمیل', faSingular: 'ایمیل', en: 'Email reports' }, nature: ModuleNature.STANDARD,
  systemManaged: true, disableCreate: true, disableDetailView: true, hideFullRecordAction: true, listPreviewMode: 'modal',
  defaultSorters: [{ field: 'message_at', order: 'desc' }], supportedViewModes: [ViewMode.LIST], defaultViewMode: ViewMode.LIST,
  quickPreview: { fieldKeys: ['subject', 'direction', 'source', 'from_address', 'to_addresses', 'cc_addresses', 'body_text', 'status', 'message_at', 'error_message'] },
  blocks: [],
  fields: [
    field('subject', 'موضوع', 1, FieldType.TEXT, { isKey: true }),
    field('direction', 'جهت', 2, FieldType.STATUS, { options: [{ value: 'inbound', label: 'دریافتی', color: 'blue' }, { value: 'outbound', label: 'ارسالی', color: 'green' }] }),
    field('source', 'منبع', 3, FieldType.SELECT, { options: [{ value: 'manual', label: 'ارسال کاربر' }, { value: 'automation', label: 'اتوماسیون' }, { value: 'system', label: 'اطلاع‌رسانی سامانه' }, { value: 'imap', label: 'صندوق ایمیل' }] }),
    field('from_address', 'ایمیل فرستنده', 4), field('to_addresses', 'گیرندگان', 5), field('cc_addresses', 'رونوشت', 6),
    field('status', 'نتیجه', 7, FieldType.STATUS, { options: [{ value: 'queued', label: 'در صف', color: 'orange' }, { value: 'sending', label: 'در حال ارسال', color: 'blue' }, { value: 'provider_accepted', label: 'پذیرفته‌شده توسط سرور؛ تحویل تأیید نشده', color: 'cyan' }, { value: 'delivered', label: 'تحویل تأیید شده', color: 'green' }, { value: 'bounced', label: 'برگشت خورده', color: 'red' }, { value: 'failed', label: 'ناموفق', color: 'red' }, { value: 'unknown_delivery', label: 'نتیجه نامشخص', color: 'orange' }, { value: 'received', label: 'دریافت شده', color: 'blue' }] }),
    field('message_at', 'زمان ایمیل', 8, FieldType.DATETIME), field('body_text', 'متن ایمیل', 9, FieldType.LONG_TEXT, { isTableColumn: false }), field('error_message', 'توضیح نتیجه', 10, FieldType.LONG_TEXT, { isTableColumn: false }),
  ],
};
