import { FieldNature, FieldType, type ModuleField } from '../types';
import {
  getProcessTaskCustomFieldsFromStage,
  getProcessTaskCustomFieldValuesFromRecurrence,
  getProcessTaskCustomFieldsFromRecurrence,
  mergeProcessTaskCustomFieldValues,
} from './processTaskCustomFields';
import {
  getProcessTargetModuleFields,
  normalizeProcessTargetModuleIds,
} from './processTargets';
import {
  getSyntheticWorkflowAssigneeField,
  getVisibleWorkflowModuleFields,
  getWorkflowConditionFields,
} from './workflowHelpers';

export type ActivityPerformanceProcessScope = 'all_processes' | 'no_process' | 'specific_processes';

export type ActivityPerformancePayItem = {
  id?: string;
  metric_key: string;
  metric_label?: string | null;
  amount?: number | string | null;
};

export type ActivityPerformanceProcessTemplate = {
  id: string;
  name?: string | null;
  module_id?: string | null;
  module_ids?: string[] | null;
};

export type ActivityPerformanceProcessStage = {
  id?: string | null;
  template_id?: string | null;
  stage_name?: string | null;
  metadata?: Record<string, any> | null;
  [key: string]: any;
};

export const ACTIVITY_PERFORMANCE_CUSTOM_FIELD_PREFIX = '__activity_process_field__';

export const ACTIVITY_PERFORMANCE_BASE_PAY_ITEMS: Array<{
  metric_key: string;
  metric_label: string;
  field_key?: string;
}> = [
  { metric_key: 'activity_count', metric_label: 'فعالیت' },
  { metric_key: 'weight', metric_label: 'هر واحد وزن', field_key: 'weight' },
  { metric_key: 'late_minutes', metric_label: 'هر دقیقه تاخیر', field_key: 'late_minutes' },
  { metric_key: 'early_minutes', metric_label: 'هر دقیقه تعجیل', field_key: 'early_minutes' },
  { metric_key: 'activity_minutes', metric_label: 'هر دقیقه فعالیت', field_key: 'activity_minutes' },
];

const NUMERIC_PAY_FIELD_TYPES = new Set<FieldType>([
  FieldType.NUMBER,
  FieldType.PRICE,
  FieldType.STOCK,
  FieldType.PERCENTAGE,
]);

const normalizeText = (value: unknown) => String(value || '').trim();

export const createActivityProcessCustomFieldKey = (templateId: string, fieldKey: string) =>
  `${ACTIVITY_PERFORMANCE_CUSTOM_FIELD_PREFIX}${normalizeText(templateId)}__${normalizeText(fieldKey)}`;

export const parseActivityProcessCustomFieldKey = (fieldKey?: string | null) => {
  const raw = normalizeText(fieldKey);
  if (!raw.startsWith(ACTIVITY_PERFORMANCE_CUSTOM_FIELD_PREFIX)) return null;
  const rest = raw.slice(ACTIVITY_PERFORMANCE_CUSTOM_FIELD_PREFIX.length);
  const separatorIndex = rest.indexOf('__');
  if (separatorIndex <= 0) return null;
  return {
    templateId: rest.slice(0, separatorIndex),
    targetFieldKey: rest.slice(separatorIndex + 2),
  };
};

export const getTaskProcessTemplateId = (task: Record<string, any> | null | undefined) => {
  const recurrence = task?.recurrence_info && typeof task.recurrence_info === 'object'
    ? task.recurrence_info
    : {};
  const processGroup = recurrence?.process_group && typeof recurrence.process_group === 'object'
    ? recurrence.process_group
    : {};
  return normalizeText(processGroup?.template_id || task?.source_template_id || recurrence?.source_template_id);
};

export const getTaskProcessCustomValueMap = (task: Record<string, any> | null | undefined) => {
  const recurrence = task?.recurrence_info && typeof task.recurrence_info === 'object'
    ? task.recurrence_info
    : {};
  const fields = getProcessTaskCustomFieldsFromRecurrence(recurrence);
  return mergeProcessTaskCustomFieldValues(fields, getProcessTaskCustomFieldValuesFromRecurrence(recurrence));
};

export const withActivityPerformanceFieldAliases = (task: Record<string, any>) => {
  const templateId = getTaskProcessTemplateId(task);
  if (!templateId) return { ...(task || {}) };
  const values = getTaskProcessCustomValueMap(task);
  return Object.entries(values).reduce<Record<string, any>>((acc, [fieldKey, value]) => {
    acc[createActivityProcessCustomFieldKey(templateId, fieldKey)] = value;
    return acc;
  }, { ...(task || {}) });
};

const uniqueFieldsByKey = (fields: ModuleField[]) => {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const key = normalizeText(field?.key);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getActivityPerformanceTemplateCustomFields = (
  templates: ActivityPerformanceProcessTemplate[],
  stages: ActivityPerformanceProcessStage[],
  selectedTemplateIds?: string[],
) => {
  const selectedSet = new Set((selectedTemplateIds || []).map(normalizeText).filter(Boolean));
  const templateById = new Map(templates.map((template) => [normalizeText(template.id), template]));

  return uniqueFieldsByKey(
    (stages || []).flatMap((stage) => {
      const templateId = normalizeText(stage?.template_id);
      if (!templateId || (selectedSet.size > 0 && !selectedSet.has(templateId))) return [];
      const templateName = normalizeText(templateById.get(templateId)?.name) || templateId;
      return getProcessTaskCustomFieldsFromStage(stage).map((field) => ({
        ...field,
        key: createActivityProcessCustomFieldKey(templateId, field.key),
        labels: {
          ...field.labels,
          fa: `${field.labels?.fa || field.key} (${templateName})`,
        },
        nature: FieldNature.STANDARD,
        workflowOptionScopeModuleId: 'tasks',
      } as ModuleField));
    }),
  );
};

export const getActivityPerformanceConditionFields = ({
  templates,
  stages,
  processScope,
  selectedTemplateIds,
}: {
  templates: ActivityPerformanceProcessTemplate[];
  stages: ActivityPerformanceProcessStage[];
  processScope: ActivityPerformanceProcessScope;
  selectedTemplateIds?: string[];
}) => {
  const scopedTemplateIds = processScope === 'specific_processes'
    ? (selectedTemplateIds || []).map(normalizeText).filter(Boolean)
    : (processScope === 'all_processes' ? templates.map((template) => normalizeText(template.id)).filter(Boolean) : []);
  const scopedTemplates = scopedTemplateIds.length > 0
    ? templates.filter((template) => scopedTemplateIds.includes(normalizeText(template.id)))
    : [];

  const taskFields = getVisibleWorkflowModuleFields('tasks');
  const customFields = processScope === 'no_process'
    ? []
    : getActivityPerformanceTemplateCustomFields(templates, stages, scopedTemplateIds);
  const linkedModuleIds = processScope === 'no_process'
    ? []
    : normalizeProcessTargetModuleIds(scopedTemplates.flatMap((template) => (
      Array.isArray(template.module_ids) && template.module_ids.length > 0
        ? template.module_ids
        : [template.module_id]
    )));
  const linkedFields = getProcessTargetModuleFields(
    linkedModuleIds,
    getWorkflowConditionFields,
    getSyntheticWorkflowAssigneeField,
  );

  return uniqueFieldsByKey([...taskFields, ...customFields, ...linkedFields]);
};

export const getActivityPerformancePayMetricOptions = ({
  templates,
  stages,
  processScope,
  selectedTemplateIds,
}: {
  templates: ActivityPerformanceProcessTemplate[];
  stages: ActivityPerformanceProcessStage[];
  processScope: ActivityPerformanceProcessScope;
  selectedTemplateIds?: string[];
}) => {
  const scopedTemplateIds = processScope === 'specific_processes'
    ? (selectedTemplateIds || []).map(normalizeText).filter(Boolean)
    : (processScope === 'all_processes' ? templates.map((template) => normalizeText(template.id)).filter(Boolean) : []);
  const customOptions = processScope === 'no_process'
    ? []
    : getActivityPerformanceTemplateCustomFields(templates, stages, scopedTemplateIds)
      .filter((field) => NUMERIC_PAY_FIELD_TYPES.has(field.type))
      .map((field) => ({
        label: field.labels?.fa || field.key,
        value: field.key,
      }));

  return [
    ...ACTIVITY_PERFORMANCE_BASE_PAY_ITEMS.map((item) => ({
      label: item.metric_label,
      value: item.metric_key,
    })),
    ...customOptions,
  ];
};

export const resolveActivityPerformanceMetricQuantity = (
  metricKey: string,
  taskContext: Record<string, any>,
) => {
  const baseItem = ACTIVITY_PERFORMANCE_BASE_PAY_ITEMS.find((item) => item.metric_key === metricKey);
  if (baseItem?.metric_key === 'activity_count') return 1;
  if (baseItem?.field_key) return Number(taskContext?.[baseItem.field_key] ?? 0) || 0;
  return Number(taskContext?.[metricKey] ?? 0) || 0;
};

export const getActivityPerformanceMetricLabel = (
  metricKey: string,
  fallback?: string | null,
) => {
  const baseItem = ACTIVITY_PERFORMANCE_BASE_PAY_ITEMS.find((item) => item.metric_key === metricKey);
  return normalizeText(fallback) || baseItem?.metric_label || metricKey;
};
