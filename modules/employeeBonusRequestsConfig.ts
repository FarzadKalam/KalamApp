import { BlockType, FieldLocation, FieldNature, FieldType, ModuleDefinition, ModuleNature, ViewMode } from '../types';
import { getTodayLocalDateValue } from '../utils/defaultValues';

export const employeeBonusRequestsModule: ModuleDefinition = {
  id: 'employee_bonus_requests',
  titles: { fa: 'پاداش‌ها', faSingular: 'درخواست پاداش', en: 'Employee Bonus Requests' },
  nature: ModuleNature.STANDARD,
  table: 'employee_bonus_requests',
  supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
  defaultViewMode: ViewMode.LIST,
  relationDisplay: { labelTemplate: '{{title}}', searchFields: ['title', 'reason', 'notes'] },
  fields: [
    { key: 'title', labels: { fa: 'عنوان', en: 'Title' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, validation: { required: true }, nature: FieldNature.STANDARD, isKey: true, isTableColumn: true },
    { key: 'employee_id', labels: { fa: 'کارمند', en: 'Employee' }, type: FieldType.RELATION, location: FieldLocation.HEADER, order: 2, validation: { required: true }, relationConfig: { targetModule: 'employees', targetField: 'full_name' }, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'request_date', labels: { fa: 'تاریخ درخواست', en: 'Request Date' }, type: FieldType.DATE, location: FieldLocation.HEADER, order: 3, defaultValue: getTodayLocalDateValue, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'effective_date', labels: { fa: 'تاریخ اعمال', en: 'Effective Date' }, type: FieldType.DATE, location: FieldLocation.HEADER, order: 4, validation: { required: true }, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'amount', labels: { fa: 'مبلغ پاداش', en: 'Bonus Amount' }, type: FieldType.PRICE, location: FieldLocation.HEADER, order: 5, validation: { required: true }, nature: FieldNature.STANDARD, isTableColumn: true },
    {
      key: 'status',
      labels: { fa: 'وضعیت', en: 'Status' },
      type: FieldType.STATUS,
      location: FieldLocation.HEADER,
      order: 6,
      defaultValue: 'pending',
      isTableColumn: true,
      nature: FieldNature.STANDARD,
      options: [
        { label: 'پیش‌نویس', value: 'draft', color: 'default' },
        { label: 'در انتظار تایید', value: 'pending', color: 'orange' },
        { label: 'تایید شده', value: 'approved', color: 'green' },
        { label: 'تکمیل شده', value: 'completed', color: 'blue' },
        { label: 'رد شده', value: 'rejected', color: 'red' },
        { label: 'لغو شده', value: 'canceled', color: 'default' },
      ],
    },
    { key: 'assignee_id', labels: { fa: 'مسئول بررسی', en: 'Assignee' }, type: FieldType.RELATION, blockId: 'details', order: 1, relationConfig: { targetModule: 'profiles', targetField: 'full_name' }, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'related_payroll_slip_id', labels: { fa: 'فیش حقوقی مرتبط', en: 'Related Payroll Slip' }, type: FieldType.RELATION, blockId: 'details', order: 2, relationConfig: { targetModule: 'payroll_slips', targetField: 'name' }, nature: FieldNature.STANDARD },
    { key: 'reason', labels: { fa: 'شرح پاداش', en: 'Reason' }, type: FieldType.LONG_TEXT, blockId: 'details', order: 3, nature: FieldNature.STANDARD },
    { key: 'notes', labels: { fa: 'توضیحات تکمیلی', en: 'Notes' }, type: FieldType.LONG_TEXT, blockId: 'details', order: 4, nature: FieldNature.STANDARD },
    { key: 'tags', labels: { fa: 'برچسب‌ها', en: 'Tags' }, type: FieldType.TAGS, location: FieldLocation.HEADER, order: 6.1, nature: FieldNature.STANDARD, isTableColumn: true },
  ],
  blocks: [
    { id: 'details', titles: { fa: 'جزئیات پاداش', en: 'Details' }, type: BlockType.FIELD_GROUP, order: 1 },
  ],
  relatedTabs: [],
};
