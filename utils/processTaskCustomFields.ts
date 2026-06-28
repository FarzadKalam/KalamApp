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

const normalizeFieldOrder = (value: any) => {
  const order = Number(value);
  return Number.isFinite(order) ? order : undefined;
};

const copyPlainObject = (value: any): Record<string, any> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : undefined
);

const hasTruthyFlag = (containers: any[], keys: string[]) => (
  containers.some((container) => {
    if (!container || typeof container !== 'object' || Array.isArray(container)) return false;
    return keys.some((key) => container[key] === true);
  })
);

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
  const order = normalizeFieldOrder(value?.order);
  const rawMetadata = copyPlainObject(value?.metadata);
  const rawConfig = copyPlainObject(value?.config);
  const rawRules = copyPlainObject(value?.rules);
  const rawValidation = copyPlainObject(value?.validation) || {};
  const flagContainers = [value, rawMetadata, rawConfig, rawRules, rawValidation];
  const requiredForCompletion = hasTruthyFlag(flagContainers, [
    'required_for_completion',
    'requiredForCompletion',
    'completion_required',
    'completionRequired',
    'required_on_complete',
    'requiredOnComplete',
  ]) || rawValidation.required === true;
  const requiredForCreation = hasTruthyFlag(flagContainers, [
    'required_for_creation',
    'requiredForCreation',
    'creation_required',
    'creationRequired',
    'required_on_create',
    'requiredOnCreate',
  ]);
  const normalized: ModuleField = {
    key,
    type,
    labels: {
      fa: String(value?.labels?.fa || value?.labelFa || key).trim() || key,
      en: String(value?.labels?.en || key).trim() || key,
    },
    nature: FieldNature.STANDARD,
    validation: {
      ...rawValidation,
      required: requiredForCompletion,
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
    order,
    ...(rawMetadata ? { metadata: rawMetadata } : {}),
    ...(rawConfig ? { config: rawConfig } : {}),
    ...(rawRules ? { rules: rawRules } : {}),
    ...(requiredForCompletion ? {
      requiredForCompletion: true,
      required_for_completion: true,
    } : {}),
    ...(requiredForCreation ? {
      requiredForCreation: true,
      required_for_creation: true,
    } : {}),
  } as ModuleField;

  if (!normalized.options?.length) delete normalized.options;
  if (!normalized.relationConfig) delete normalized.relationConfig;
  if (!normalized.dynamicOptionsCategory) delete normalized.dynamicOptionsCategory;
  if (normalized.order === undefined) delete normalized.order;

  return normalized;
};

export const assignProcessTaskCustomFieldOrder = (fields: ModuleField[]): ModuleField[] =>
  (Array.isArray(fields) ? fields : []).map((field, index) => ({
    ...field,
    order: (index + 1) * 10,
  }));

export const normalizeProcessTaskCustomFields = (value: any): ModuleField[] =>
  (Array.isArray(value) ? value : [])
    .map((field, index) => ({ field: normalizeProcessTaskCustomField(field), index }))
    .filter((entry): entry is { field: ModuleField; index: number } => Boolean(entry.field))
    .sort((left, right) => {
      const leftOrder = normalizeFieldOrder(left.field.order);
      const rightOrder = normalizeFieldOrder(right.field.order);
      const leftRank = leftOrder ?? (100000 + left.index);
      const rightRank = rightOrder ?? (100000 + right.index);
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.index - right.index;
    })
    .map((entry) => entry.field);

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

const hasProcessTaskCustomFieldValue = (field: ModuleField, value: unknown): boolean => {
  if (value === null || value === undefined) return false;

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value === 'boolean') {
    return true;
  }

  if (field.type === FieldType.RELATION && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }

  return true;
};

export const getMissingRequiredProcessTaskCustomFields = (task: any): ModuleField[] => {
  const recurrence = task?.recurrence_info && typeof task.recurrence_info === 'object'
    ? task.recurrence_info
    : {};
  const fields = getProcessTaskCustomFieldsFromRecurrence(recurrence);
  if (fields.length === 0) return [];

  const fallbackValues = fields.reduce<Record<string, any>>((acc, field) => {
    const key = String(field?.key || '').trim();
    if (!key) return acc;
    if (Object.prototype.hasOwnProperty.call(task || {}, key)) {
      acc[key] = task[key];
    }
    return acc;
  }, {});

  const values = mergeProcessTaskCustomFieldValues(
    fields,
    {
      ...getProcessTaskCustomFieldValuesFromRecurrence(recurrence),
      ...fallbackValues,
    }
  );

  return fields.filter((field) => {
    if (!field?.validation?.required) return false;
    const key = String(field?.key || '').trim();
    if (!key) return false;
    return !hasProcessTaskCustomFieldValue(field, values[key]);
  });
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
