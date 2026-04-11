import { MODULES } from '../moduleRegistry';
import { FieldNature, FieldType, ModuleField } from '../types';

export const PROCESS_TASK_CUSTOM_FIELDS_KEY = 'process_task_custom_fields';
export const PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY = 'process_task_custom_field_values';
export const TASK_AUTOMATION_FIELD_PREFIX = '__task__';
export const PREVIOUS_STAGE_TASK_AUTOMATION_FIELD_PREFIX = 'previous_stage__';

const UNSUPPORTED_PROCESS_TASK_CUSTOM_FIELD_TYPES = new Set<FieldType>([
  FieldType.IMAGE,
  FieldType.JSON,
  FieldType.LOCATION,
  FieldType.PROGRESS_STAGES,
  FieldType.PERCENTAGE_OR_AMOUNT,
  FieldType.READONLY_LOOKUP,
  FieldType.CHECKLIST,
]);

const normalizeFieldType = (raw: any): FieldType => {
  const candidate = String(raw || '').trim() as FieldType;
  return Object.values(FieldType).includes(candidate) ? candidate : FieldType.TEXT;
};

const normalizeSelectOptions = (value: any) =>
  (Array.isArray(value) ? value : [])
    .map((item: any) => {
      const label = String(item?.label ?? item?.value ?? '').trim();
      const rawValue = item?.value ?? item?.label ?? '';
      const normalizedValue = typeof rawValue === 'number' ? rawValue : String(rawValue).trim();
      if (!label || normalizedValue === '') return null;
      return {
        label,
        value: normalizedValue,
        color: String(item?.color || '').trim() || undefined,
      };
    })
    .filter(Boolean);

export const normalizeProcessTaskCustomFieldKey = (raw: any) =>
  String(raw || '')
    .trim()
    .replace(/\s+/g, '_');

export const isReservedProcessTaskCustomFieldKey = (key?: string | null) =>
  new Set<string>([
    ...(MODULES.tasks?.fields || []).map((field: any) => String(field?.key || '').trim()).filter(Boolean),
    'task_name',
    'task_status',
    'task_status_label',
    'task_due_date',
    'status_label',
    'process_links',
    'process_group',
  ]).has(String(key || '').trim());

export const isSupportedProcessTaskCustomFieldType = (type?: FieldType | null) =>
  !!type && !UNSUPPORTED_PROCESS_TASK_CUSTOM_FIELD_TYPES.has(type);

export const normalizeProcessTaskCustomField = (value: any): ModuleField | null => {
  if (!value || typeof value !== 'object') return null;

  const key = normalizeProcessTaskCustomFieldKey(value?.key);
  if (!key || isReservedProcessTaskCustomFieldKey(key)) return null;

  const type = normalizeFieldType(value?.type);
  if (!isSupportedProcessTaskCustomFieldType(type)) return null;

  const relationTargetModule = String(value?.relationConfig?.targetModule || '').trim();
  const relationTargetField = String(value?.relationConfig?.targetField || '').trim();
  const dynamicOptionsCategory = String(value?.dynamicOptionsCategory || '').trim();
  const normalized: ModuleField = {
    key,
    type,
    labels: {
      fa: String(value?.labels?.fa || value?.labelFa || key).trim() || key,
      en: String(value?.labels?.en || key).trim() || key,
    },
    nature: FieldNature.STANDARD,
    validation: {
      required: !!value?.validation?.required,
    },
    options: normalizeSelectOptions(value?.options) as any,
    dynamicOptionsCategory: dynamicOptionsCategory || undefined,
    relationConfig: type === FieldType.RELATION && relationTargetModule
      ? {
          targetModule: relationTargetModule,
          targetField: relationTargetField || undefined,
        }
      : undefined,
    mode: type === FieldType.MULTI_SELECT ? 'multiple' : (type === FieldType.TAGS ? 'tags' : undefined),
    defaultValue: value?.defaultValue,
  };

  if (!normalized.options?.length) delete normalized.options;
  if (!normalized.relationConfig) delete normalized.relationConfig;
  if (!normalized.dynamicOptionsCategory) delete normalized.dynamicOptionsCategory;

  return normalized;
};

export const normalizeProcessTaskCustomFields = (value: any): ModuleField[] =>
  (Array.isArray(value) ? value : [])
    .map((field) => normalizeProcessTaskCustomField(field))
    .filter((field): field is ModuleField => Boolean(field));

export const getProcessTaskCustomFieldsFromStage = (stage: any): ModuleField[] =>
  normalizeProcessTaskCustomFields(
    stage?.process_task_custom_fields
    || stage?.custom_task_fields
    || stage?.metadata?.[PROCESS_TASK_CUSTOM_FIELDS_KEY]
  );

export const getProcessTaskCustomFieldsFromRecurrence = (recurrence: any): ModuleField[] =>
  normalizeProcessTaskCustomFields(recurrence?.[PROCESS_TASK_CUSTOM_FIELDS_KEY]);

export const getProcessTaskCustomFieldValuesFromRecurrence = (recurrence: any): Record<string, any> => {
  const rawValues = recurrence?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY];
  return rawValues && typeof rawValues === 'object' && !Array.isArray(rawValues)
    ? { ...rawValues }
    : {};
};

export const buildProcessTaskCustomFieldValueDefaults = (fields: ModuleField[]) =>
  fields.reduce<Record<string, any>>((acc, field) => {
    const key = String(field?.key || '').trim();
    if (!key) return acc;
    if (field.defaultValue !== undefined) {
      acc[key] = field.defaultValue;
      return acc;
    }
    if (field.type === FieldType.MULTI_SELECT || field.type === FieldType.TAGS) {
      acc[key] = [];
      return acc;
    }
    if (field.type === FieldType.CHECKBOX) {
      acc[key] = false;
    }
    return acc;
  }, {});

export const mergeProcessTaskCustomFieldValues = (
  fields: ModuleField[],
  values?: Record<string, any> | null,
) => {
  const defaults = buildProcessTaskCustomFieldValueDefaults(fields);
  const rawValues = values && typeof values === 'object' ? values : {};
  return {
    ...defaults,
    ...rawValues,
  };
};

export const withProcessTaskCustomFieldValues = (task: any) => {
  const recurrence = task?.recurrence_info && typeof task.recurrence_info === 'object'
    ? task.recurrence_info
    : {};
  const fields = getProcessTaskCustomFieldsFromRecurrence(recurrence);
  const values = mergeProcessTaskCustomFieldValues(
    fields,
    getProcessTaskCustomFieldValuesFromRecurrence(recurrence)
  );

  return fields.reduce((acc, field) => {
    const key = String(field?.key || '').trim();
    if (!key) return acc;
    return {
      ...acc,
      [key]: values[key],
    };
  }, { ...(task || {}) });
};

export const buildProcessTaskCustomAutomationFields = (fields: ModuleField[]): ModuleField[] =>
  normalizeProcessTaskCustomFields(fields).map((field) => ({
    ...field,
    key: `${TASK_AUTOMATION_FIELD_PREFIX}${field.key}`,
    labels: {
      ...field.labels,
      fa: `${field.labels?.fa || field.key} (فعالیت)`,
    },
    ...( { workflowOptionScopeModuleId: 'tasks' } as any ),
  }));

export const buildPreviousStageTaskCustomAutomationFields = (fields: ModuleField[]): ModuleField[] =>
  normalizeProcessTaskCustomFields(fields).map((field) => ({
    ...field,
    key: `${PREVIOUS_STAGE_TASK_AUTOMATION_FIELD_PREFIX}${field.key}`,
    labels: {
      ...field.labels,
      fa: `${field.labels?.fa || field.key} (مرحله قبل)`,
    },
    ...( { workflowOptionScopeModuleId: 'tasks' } as any ),
  }));
