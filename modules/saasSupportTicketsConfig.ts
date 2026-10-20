import { FieldLocation, FieldNature, FieldType, ModuleDefinition, ModuleNature, ViewMode } from '../types';

export const saasSupportTicketsConfig: ModuleDefinition = {
  id: 'saas_support_tickets',
  table: 'saas_support_tickets',
  titles: { fa: 'تیکت‌های پشتیبانی', faSingular: 'تیکت پشتیبانی', en: 'Support Tickets' },
  nature: ModuleNature.CRM,
  systemManaged: true,
  disableDetailView: true,
  supportedViewModes: [ViewMode.LIST],
  defaultViewMode: ViewMode.LIST,
  registryVisibility: { workflows: true },
  blocks: [],
  fields: [
    { key: 'subject', labels: { fa: 'عنوان تیکت', en: 'Subject' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, nature: FieldNature.STANDARD, isKey: true, isTableColumn: true },
    { key: 'category_code', labels: { fa: 'دسته‌بندی', en: 'Category' }, type: FieldType.SELECT, location: FieldLocation.HEADER, order: 2, nature: FieldNature.STANDARD, isTableColumn: true,
      options: [
        { value: 'pre_sales', label: 'راهنمایی قبل از خرید' }, { value: 'technical', label: 'پشتیبانی فنی' },
        { value: 'billing', label: 'مالی و فاکتورها' }, { value: 'feedback', label: 'انتقاد و پیشنهاد' },
        { value: 'installation', label: 'درخواست نصب' },
      ] },
    { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 3, nature: FieldNature.STANDARD, isTableColumn: true,
      options: [
        { value: 'waiting_operator', label: 'منتظر پاسخ اوپراتور' }, { value: 'in_review', label: 'در حال بررسی' },
        { value: 'answered', label: 'پاسخ داده شده' }, { value: 'closed', label: 'بسته شده' },
      ] },
    { key: 'assigned_to', labels: { fa: 'مسئول', en: 'Assignee' }, type: FieldType.RELATION, location: FieldLocation.HEADER, order: 4, nature: FieldNature.STANDARD,
      relationConfig: { targetModule: 'profiles', targetField: 'full_name' } },
    { key: 'created_at', labels: { fa: 'زمان ثبت', en: 'Created at' }, type: FieldType.DATETIME, location: FieldLocation.HEADER, order: 5, nature: FieldNature.SYSTEM, isTableColumn: true },
  ],
};
