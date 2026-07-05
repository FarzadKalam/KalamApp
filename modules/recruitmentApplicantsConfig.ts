import { BlockType, FieldLocation, FieldNature, FieldType, ModuleDefinition, ModuleNature, ViewMode } from '../types';
import { createWebFormTemplateRecordSaver } from '../utils/webFormTemplateFormAdapter';

const saveRecruitmentApplicantRecord = createWebFormTemplateRecordSaver({
  moduleId: 'recruitment_applicants',
  table: 'recruitment_applicants',
});

export const recruitmentApplicantsConfig: ModuleDefinition = {
  id: 'recruitment_applicants',
  titles: { fa: 'متقاضیان استخدام', faSingular: 'متقاضی استخدام', en: 'Recruitment Applicants' },
  nature: ModuleNature.STANDARD,
  table: 'recruitment_applicants',
  supportedViewModes: [ViewMode.LIST, ViewMode.GRID, ViewMode.KANBAN],
  defaultViewMode: ViewMode.KANBAN,
  formAdapter: {
    save: saveRecruitmentApplicantRecord,
  },
  relationDisplay: { labelTemplate: '{{system_code}} - {{name}}', searchFields: ['name', 'system_code', 'mobile', 'email', 'position_title'] },
  fields: [
    { key: 'image_url', labels: { fa: 'تصویر', en: 'Image' }, type: FieldType.IMAGE, location: FieldLocation.HEADER, order: 0.8, nature: FieldNature.PREDEFINED, isTableColumn: true },
    { key: 'name', labels: { fa: 'نام متقاضی', en: 'Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, validation: { required: true }, nature: FieldNature.PREDEFINED, isKey: true, isTableColumn: true },
    { key: 'system_code', labels: { fa: 'کد متقاضی', en: 'Applicant No.' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
    {
      key: 'status',
      labels: { fa: 'وضعیت', en: 'Status' },
      type: FieldType.STATUS,
      location: FieldLocation.HEADER,
      order: 3,
      defaultValue: 'new',
      isTableColumn: true,
      options: [
        { label: 'جدید', value: 'new', color: 'blue' },
        { label: 'غربالگری', value: 'screening', color: 'orange' },
        { label: 'مصاحبه', value: 'interview', color: 'purple' },
        { label: 'پذیرفته شده', value: 'accepted', color: 'green' },
        { label: 'رد شده', value: 'rejected', color: 'red' },
        { label: 'استخدام شده', value: 'hired', color: 'cyan' },
        { label: 'بایگانی', value: 'archived', color: 'default' },
      ],
    },
    { key: 'position_title', labels: { fa: 'عنوان شغلی', en: 'Position' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 4, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'mobile', labels: { fa: 'موبایل', en: 'Mobile' }, type: FieldType.PHONE, location: FieldLocation.HEADER, order: 5, nature: FieldNature.STANDARD, isTableColumn: true },
    {
      key: 'survey_template_id',
      labels: { fa: 'قالب وب‌فرم', en: 'Web Form Template' },
      type: FieldType.RELATION,
      location: FieldLocation.HEADER,
      order: 5.5,
      isTableColumn: true,
      nature: FieldNature.STANDARD,
      relationConfig: {
        targetModule: 'web_forms',
        filter: {
          target_module_id: 'recruitment_applicants',
          is_active: true,
        },
      },
    },
    { key: 'department', labels: { fa: 'واحد سازمانی', en: 'Department' }, type: FieldType.SELECT, dynamicOptionsCategory: 'employee_departments', location: FieldLocation.BLOCK, blockId: 'details', order: 1, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'source', labels: { fa: 'منبع جذب', en: 'Source' }, type: FieldType.SELECT, dynamicOptionsCategory: 'recruitment_source', location: FieldLocation.BLOCK, blockId: 'details', order: 2, nature: FieldNature.STANDARD },
    { key: 'email', labels: { fa: 'ایمیل', en: 'Email' }, type: FieldType.TEXT, location: FieldLocation.BLOCK, blockId: 'details', order: 3, nature: FieldNature.STANDARD },
    { key: 'expected_salary', labels: { fa: 'حقوق مورد انتظار', en: 'Expected Salary' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'details', order: 4, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'interview_at', labels: { fa: 'زمان مصاحبه', en: 'Interview At' }, type: FieldType.DATETIME, location: FieldLocation.BLOCK, blockId: 'review', order: 1, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'score', labels: { fa: 'امتیاز ارزیابی', en: 'Score' }, type: FieldType.NUMBER, location: FieldLocation.BLOCK, blockId: 'review', order: 2, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'assigned_reviewer_id', labels: { fa: 'مسئول بررسی', en: 'Reviewer' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'review', order: 3, relationConfig: { targetModule: 'profiles', targetField: 'full_name' }, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'related_employee_id', labels: { fa: 'کارمند ایجادشده', en: 'Related Employee' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'review', order: 4, relationConfig: { targetModule: 'employees', targetField: 'full_name' }, nature: FieldNature.STANDARD },
    { key: 'resume_url', labels: { fa: 'رزومه', en: 'Resume' }, type: FieldType.LINK, location: FieldLocation.BLOCK, blockId: 'review', order: 5, nature: FieldNature.STANDARD },
    { key: 'notes', labels: { fa: 'یادداشت ارزیابی', en: 'Notes' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'review', order: 6, nature: FieldNature.STANDARD },
    { key: 'template_field_values', labels: { fa: 'داده‌های قالب', en: 'Template Values' }, type: FieldType.JSON, location: FieldLocation.BLOCK, blockId: 'review', order: 90, readonly: true, hideInCreateForm: true, nature: FieldNature.SYSTEM },
    { key: 'template_schema_snapshot', labels: { fa: 'اسنپ‌شات قالب', en: 'Template Snapshot' }, type: FieldType.JSON, location: FieldLocation.BLOCK, blockId: 'review', order: 91, readonly: true, hideInCreateForm: true, nature: FieldNature.SYSTEM },
    { key: 'tags', labels: { fa: 'برچسب‌ها', en: 'Tags' }, type: FieldType.TAGS, location: FieldLocation.HEADER, order: 7, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'process_template_id', labels: { fa: 'الگوی فرآیند اجرا', en: 'Execution Template' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'process', order: 1, relationConfig: { targetModule: 'process_templates', targetField: 'name' }, nature: FieldNature.STANDARD },
    { key: 'execution_process_draft', labels: { fa: 'فرآیند اجرا', en: 'Execution Process' }, type: FieldType.JSON, location: FieldLocation.BLOCK, blockId: 'process', order: 2, nature: FieldNature.STANDARD },
  ],
  blocks: [
    { id: 'details', titles: { fa: 'اطلاعات متقاضی', en: 'Applicant Info' }, type: BlockType.FIELD_GROUP, order: 1 },
    { id: 'review', titles: { fa: 'ارزیابی و مصاحبه', en: 'Review' }, type: BlockType.FIELD_GROUP, order: 2 },
    { id: 'process', titles: { fa: 'فرآیند جذب', en: 'Recruitment Process' }, type: BlockType.FIELD_GROUP, order: 3 },
  ],
  relatedTabs: [
    {
      id: 'applicant_contracts',
      title: 'قراردادها',
      icon: 'FileTextOutlined',
      targetModule: 'employee_contracts',
      foreignKey: 'applicant_id',
    },
  ],
};
