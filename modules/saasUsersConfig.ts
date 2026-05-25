import { BlockType, FieldLocation, FieldNature, FieldType, ModuleDefinition, ModuleNature, ViewMode } from '../types';

const AUDIT_STATUS_OPTIONS = [
  { value: 'critical', label: 'بحرانی', color: 'red' },
  { value: 'repair_required', label: 'نیازمند اصلاح', color: 'orange' },
  { value: 'warning', label: 'هشدار', color: 'gold' },
  { value: 'healthy', label: 'سالم', color: 'green' },
];

export const saasUsersConfig: ModuleDefinition = {
  id: 'saas_users',
  titles: { fa: 'همه کاربران', faSingular: 'کاربر', en: 'All Users' },
  nature: ModuleNature.CRM,
  table: 'saas_admin_users_view',
  systemManaged: true,
  disableCreate: true,
  disableDetailView: true,
  listDetailSurface: 'saas_user_drawer',
  supportedViewModes: [ViewMode.LIST],
  defaultViewMode: ViewMode.LIST,
  fields: [
    { key: 'full_name', labels: { fa: 'نام کاربر', en: 'Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, isKey: true, isTableColumn: true, nature: FieldNature.SYSTEM },
    { key: 'email', labels: { fa: 'ایمیل', en: 'Email' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, isTableColumn: true, nature: FieldNature.SYSTEM },
    { key: 'mobile', labels: { fa: 'موبایل', en: 'Mobile' }, type: FieldType.PHONE, location: FieldLocation.HEADER, order: 3, isTableColumn: true, nature: FieldNature.SYSTEM },
    { key: 'org_name', labels: { fa: 'سازمان', en: 'Organization' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 4, isTableColumn: true, nature: FieldNature.SYSTEM },
    { key: 'role_title', labels: { fa: 'نقش', en: 'Role' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 5, isTableColumn: true, nature: FieldNature.SYSTEM },
    {
      key: 'audit_status',
      labels: { fa: 'وضعیت بررسی', en: 'Audit Status' },
      type: FieldType.SELECT,
      options: AUDIT_STATUS_OPTIONS,
      location: FieldLocation.HEADER,
      order: 6,
      isTableColumn: true,
      nature: FieldNature.SYSTEM,
    },
    { key: 'issues', labels: { fa: 'مشکلات', en: 'Issues' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'audit', order: 1, isTableColumn: true, nature: FieldNature.SYSTEM },
    { key: 'is_active', labels: { fa: 'فعال', en: 'Active' }, type: FieldType.CHECKBOX, location: FieldLocation.BLOCK, blockId: 'access', order: 1, isTableColumn: true, nature: FieldNature.SYSTEM },
    { key: 'is_demo', labels: { fa: 'سازمان دمو', en: 'Demo Organization' }, type: FieldType.CHECKBOX, location: FieldLocation.BLOCK, blockId: 'access', order: 2, isTableColumn: true, nature: FieldNature.SYSTEM },
    { key: 'phone_confirmed', labels: { fa: 'ورود پیامکی تایید شده', en: 'Phone Confirmed' }, type: FieldType.CHECKBOX, location: FieldLocation.BLOCK, blockId: 'login', order: 1, nature: FieldNature.SYSTEM },
  ],
  blocks: [
    { id: 'audit', titles: { fa: 'نتیجه بررسی', en: 'Audit' }, type: BlockType.FIELD_GROUP, order: 1 },
    { id: 'access', titles: { fa: 'دسترسی سازمانی', en: 'Access' }, type: BlockType.FIELD_GROUP, order: 2 },
    { id: 'login', titles: { fa: 'ورود', en: 'Login' }, type: BlockType.FIELD_GROUP, order: 3 },
  ],
  relatedTabs: [],
};
