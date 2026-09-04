import { BlockType, FieldLocation, FieldNature, FieldType, ModuleDefinition, ModuleNature, ViewMode } from '../types';
import { BILLBOARD_STATUS_APPROVAL_ACTION, BILLBOARD_STATUS_CHANGE_REQUEST_OPTIONS, BILLBOARD_STATUS_CHANGES_MODULE_ID, BILLBOARD_STATUS_OPTIONS } from '../utils/billboardStatusChanges';

export const billboardStatusChangesConfig: ModuleDefinition = {
  id: BILLBOARD_STATUS_CHANGES_MODULE_ID,
  titles: { fa: 'تغییر وضعیت تبلیغات محیطی', faSingular: 'درخواست تغییر وضعیت', en: 'Billboard Status Changes' },
  nature: ModuleNature.STANDARD,
  table: 'billboard_status_changes',
  supportedViewModes: [ViewMode.LIST],
  defaultViewMode: ViewMode.LIST,
  disableDelete: true,
  disableInlineFieldEditing: true,
  actionButtons: [
    { id: BILLBOARD_STATUS_APPROVAL_ACTION, label: 'تأیید یا رد درخواست', placement: 'header', variant: 'primary' },
  ],
  relationDisplay: { labelTemplate: '{{title}}', searchFields: ['title', 'system_code'] },
  registryVisibility: { globalSearch: false, moduleSettings: true, reports: true, workflows: true },
  fields: [
    { key: 'title', labels: { fa: 'عنوان درخواست', en: 'Request title' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, readonly: true, isKey: true, isTableColumn: true, nature: FieldNature.SYSTEM },
    { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true, isTableColumn: true, nature: FieldNature.SYSTEM },
    { key: 'billboard_id', labels: { fa: 'تابلو', en: 'Billboard' }, type: FieldType.RELATION, location: FieldLocation.HEADER, order: 3, validation: { required: true }, relationConfig: { targetModule: 'billboards', targetField: 'name' }, isTableColumn: true },
    { key: 'target_status', labels: { fa: 'وضعیت مقصد', en: 'Target status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 4, options: [...BILLBOARD_STATUS_OPTIONS], validation: { required: true }, isTableColumn: true },
    { key: 'request_status', labels: { fa: 'وضعیت درخواست', en: 'Request status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 5, options: [...BILLBOARD_STATUS_CHANGE_REQUEST_OPTIONS], readonly: true, isTableColumn: true, nature: FieldNature.SYSTEM },
    { key: 'source_status', labels: { fa: 'وضعیت پیشین', en: 'Previous status' }, type: FieldType.STATUS, location: FieldLocation.BLOCK, blockId: 'review', order: 1, options: [...BILLBOARD_STATUS_OPTIONS], readonly: true, nature: FieldNature.SYSTEM },
    { key: 'customer_id', labels: { fa: 'مشتری', en: 'Customer' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'reservation', order: 1, relationConfig: { targetModule: 'customers', targetField: 'business_name' } },
    { key: 'invoice_id', labels: { fa: 'فاکتور مرتبط', en: 'Invoice' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'reservation', order: 2, relationConfig: { targetModule: 'invoices', targetField: 'name' } },
    { key: 'start_date', labels: { fa: 'شروع اکران', en: 'Start date' }, type: FieldType.DATE, location: FieldLocation.BLOCK, blockId: 'reservation', order: 3 },
    { key: 'end_date', labels: { fa: 'پایان اکران', en: 'End date' }, type: FieldType.DATE, location: FieldLocation.BLOCK, blockId: 'reservation', order: 4 },
    { key: 'block_reason', labels: { fa: 'دلیل مسدودسازی', en: 'Block reason' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'details', order: 1 },
    { key: 'description', labels: { fa: 'توضیحات', en: 'Description' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'details', order: 2 },
    { key: 'requested_at', labels: { fa: 'زمان ثبت', en: 'Requested at' }, type: FieldType.DATETIME, location: FieldLocation.BLOCK, blockId: 'review', order: 2, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'requested_by', labels: { fa: 'ثبت‌کننده', en: 'Requester' }, type: FieldType.USER, location: FieldLocation.BLOCK, blockId: 'review', order: 3, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'approved_at', labels: { fa: 'زمان تصمیم', en: 'Decision time' }, type: FieldType.DATETIME, location: FieldLocation.BLOCK, blockId: 'review', order: 4, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'approved_by', labels: { fa: 'تأییدکننده', en: 'Approver' }, type: FieldType.USER, location: FieldLocation.BLOCK, blockId: 'review', order: 5, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'approval_note', labels: { fa: 'یادداشت تأیید یا رد', en: 'Decision note' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'review', order: 6, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'process_run_id', labels: { fa: 'فرآیند اجراشده', en: 'Process run' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'process', order: 3, readonly: true, relationConfig: { targetModule: 'process_runs', targetField: 'name' }, nature: FieldNature.SYSTEM },
  ],
  blocks: [
    { id: 'reservation', titles: { fa: 'اطلاعات رزرو و اکران', en: 'Reservation' }, type: BlockType.FIELD_GROUP, order: 1 },
    { id: 'details', titles: { fa: 'توضیحات', en: 'Details' }, type: BlockType.FIELD_GROUP, order: 2 },
    { id: 'review', titles: { fa: 'تأیید و سوابق', en: 'Review' }, type: BlockType.FIELD_GROUP, order: 3 },
    { id: 'process', titles: { fa: 'فرآیند اجرا', en: 'Process' }, type: BlockType.FIELD_GROUP, order: 4 },
  ],
};
