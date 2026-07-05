import {
  BlockType,
  FieldLocation,
  FieldNature,
  FieldType,
  ModuleDefinition,
  ModuleNature,
  ViewMode,
} from '../types';

const JOB_DESCRIPTION_FIELD_KEYS = [
  'job_goal',
  'job_responsibilities',
  'job_duties',
  'job_requirements',
  'behavioral_traits',
  'career_path',
  'performance_kpi',
  'competency_ksa',
  'role_relationships',
  'salary_calculation_notes',
  'job_description_notes',
] as const;

export const JOB_DESCRIPTION_POPULATE_FIELDS = Object.fromEntries(
  JOB_DESCRIPTION_FIELD_KEYS.map((key) => [key, key])
);

export const jobDescriptionsModule: ModuleDefinition = {
  id: 'job_descriptions',
  titles: { fa: 'شرح شغل‌ها', faSingular: 'شرح شغل', en: 'Job Descriptions' },
  nature: ModuleNature.STANDARD,
  table: 'job_descriptions',
  relationDisplay: {
    labelTemplate: '{{name}} - {{system_code}}',
    searchFields: ['name', 'system_code', 'job_goal', 'job_responsibilities', 'job_duties'],
  },
  supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
  defaultViewMode: ViewMode.LIST,
  fields: [
    { key: 'image_url', labels: { fa: 'تصویر', en: 'Image' }, type: FieldType.IMAGE, location: FieldLocation.HEADER, order: 0.8, nature: FieldNature.PREDEFINED, isTableColumn: true },
    { key: 'name', labels: { fa: 'عنوان شرح شغل', en: 'Job Description Title' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, validation: { required: true }, nature: FieldNature.PREDEFINED, isKey: true, isTableColumn: true },
    { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'System Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1.1, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
    { key: 'job_goal', labels: { fa: 'هدف', en: 'Goal' }, type: FieldType.LONG_TEXT, blockId: 'job_description_info', order: 10 },
    { key: 'job_responsibilities', labels: { fa: 'مسئولیت ها', en: 'Responsibilities' }, type: FieldType.SUPER_LONG_TEXT, blockId: 'job_description_info', order: 10.1 },
    { key: 'job_duties', labels: { fa: 'شرح وظایف', en: 'Duties' }, type: FieldType.SUPER_LONG_TEXT, blockId: 'job_description_info', order: 10.2 },
    { key: 'job_requirements', labels: { fa: 'شرایط احراز', en: 'Requirements' }, type: FieldType.SUPER_LONG_TEXT, blockId: 'job_description_info', order: 10.3 },
    { key: 'behavioral_traits', labels: { fa: 'ویژگی های رفتاری', en: 'Behavioral Traits' }, type: FieldType.LONG_TEXT, blockId: 'job_description_info', order: 10.4 },
    { key: 'career_path', labels: { fa: 'مسیر ارتقا', en: 'Career Path' }, type: FieldType.LONG_TEXT, blockId: 'job_description_info', order: 10.5 },
    { key: 'performance_kpi', labels: { fa: 'ارزیابی عملکرد (KPI)', en: 'Performance Evaluation (KPI)' }, type: FieldType.SUPER_LONG_TEXT, blockId: 'job_description_info', order: 10.6 },
    { key: 'competency_ksa', labels: { fa: 'نظام شایستگی (KSA)', en: 'Competency System (KSA)' }, type: FieldType.SUPER_LONG_TEXT, blockId: 'job_description_info', order: 10.7 },
    { key: 'role_relationships', labels: { fa: 'ارتباط با سایر نقش ها', en: 'Role Relationships' }, type: FieldType.LONG_TEXT, blockId: 'job_description_info', order: 10.8 },
    { key: 'salary_calculation_notes', labels: { fa: 'محاسبه حقوق', en: 'Salary Calculation' }, type: FieldType.SUPER_LONG_TEXT, blockId: 'job_description_info', order: 10.9 },
    { key: 'job_description_notes', labels: { fa: 'توضیحات تکمیلی', en: 'Additional Notes' }, type: FieldType.LONG_TEXT, blockId: 'job_description_info', order: 11 },
    { key: 'created_at', labels: { fa: 'زمان ایجاد', en: 'Created At' }, type: FieldType.DATETIME, blockId: 'system_info', order: 90, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'created_by', labels: { fa: 'ایجاد کننده', en: 'Created By' }, type: FieldType.USER, blockId: 'system_info', order: 90.1, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'updated_at', labels: { fa: 'زمان ویرایش', en: 'Updated At' }, type: FieldType.DATETIME, blockId: 'system_info', order: 90.2, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'updated_by', labels: { fa: 'ویرایش کننده', en: 'Updated By' }, type: FieldType.USER, blockId: 'system_info', order: 90.3, readonly: true, nature: FieldNature.SYSTEM },
  ],
  blocks: [
    { id: 'job_description_info', titles: { fa: 'شرح شغل', en: 'Job Description' }, type: BlockType.FIELD_GROUP, order: 1 },
    { id: 'system_info', titles: { fa: 'اطلاعات سیستمی', en: 'System Info' }, type: BlockType.FIELD_GROUP, order: 99 },
  ],
  relatedTabs: [
    {
      id: 'job_description_employees',
      title: 'کارکنان مرتبط',
      icon: 'TeamOutlined',
      relationType: 'fk_from_field',
      targetModule: 'employees',
      sourceField: 'id',
      foreignKey: 'job_description_id',
    },
    {
      id: 'job_description_tasks',
      title: 'فعالیت ها',
      icon: 'CheckSquareOutlined',
      relationType: 'fk',
      targetModule: 'tasks',
      foreignKey: 'source_record_id',
      filters: [{ field: 'related_to_module', value: 'job_descriptions' }],
    },
  ],
};
