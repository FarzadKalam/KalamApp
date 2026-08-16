import { MODULES } from '../moduleRegistry';
import { FieldType, ModuleField } from '../types';
import { getFieldLabelFa } from './fieldLabel';
import type { WorkflowModuleOption } from './workflowTypes';

const TASKS_MODULE_ID = 'tasks';
const TASK_SOURCE_RECORD_FIELD_KEY = 'source_record_id';
export const PROCESS_RUN_LINK_FIELD_KEY = '__process_run_link__';
export const PROCESS_RUN_SOURCE_MODULE_ID = '__process_run__';

const normalizeModuleId = (value: unknown) => String(value || '').trim();

const buildModuleOption = (moduleId: string, label?: string): WorkflowModuleOption | null => {
  const normalizedModuleId = normalizeModuleId(moduleId);
  if (!normalizedModuleId || !MODULES[normalizedModuleId]) return null;
  return {
    value: normalizedModuleId,
    label: String(label || MODULES[normalizedModuleId]?.titles?.fa || normalizedModuleId).trim() || normalizedModuleId,
  };
};

export const isProcessRunRelatedRecordSource = (moduleId: unknown) =>
  normalizeModuleId(moduleId) === PROCESS_RUN_SOURCE_MODULE_ID;

/**
 * در اتوماسیون الگوی فرآیند، مرجع واقعی یک اجرای فرآیند است نه صرفاً یکی از
 * رکوردهای هدف آن. گزینهٔ نخست عمداً ثابت است تا backend بتواند رکورد ساخته‌شده
 * را به همان process_run متصل کند.
 */
export const getCreateRelatedRecordSourceModuleOptions = (
  sourceModuleOptions: WorkflowModuleOption[] = [],
  processTargetModuleIds: string[] = [],
): WorkflowModuleOption[] => {
  const normalizedProcessTargetIds = (Array.isArray(processTargetModuleIds) ? processTargetModuleIds : [])
    .map(normalizeModuleId)
    .filter((moduleId) => Boolean(moduleId && MODULES[moduleId]));
  const sourceOptions = (Array.isArray(sourceModuleOptions) ? sourceModuleOptions : [])
    .map((option) => {
      const value = normalizeModuleId(option?.value);
      if (!value || value === PROCESS_RUN_SOURCE_MODULE_ID) return null;
      return {
        value,
        label: String(option?.label || MODULES[value]?.titles?.fa || value).trim() || value,
      };
    })
    .filter((option): option is WorkflowModuleOption => Boolean(option));

  if (normalizedProcessTargetIds.length === 0) return sourceOptions;
  return [
    { value: PROCESS_RUN_SOURCE_MODULE_ID, label: 'همین فرآیند' },
    ...sourceOptions,
  ];
};

const hasRelationToSourceModule = (field: ModuleField | null | undefined, sourceModuleId: string) =>
  !!field
  && field.type === FieldType.RELATION
  && normalizeModuleId((field.relationConfig as any)?.targetModule) === sourceModuleId;

export const isCreateRelatedRecordTaskTarget = (targetModuleId?: string | null) =>
  normalizeModuleId(targetModuleId) === TASKS_MODULE_ID;

export const getCreateRelatedRecordTargetModuleOptions = (
  sourceModuleId: string,
  moduleOptions: WorkflowModuleOption[] = [],
  processTargetModuleIds: string[] = [],
): WorkflowModuleOption[] => {
  const normalizedSourceModuleId = normalizeModuleId(sourceModuleId);
  const result: WorkflowModuleOption[] = [];
  const seen = new Set<string>();

  const addOption = (moduleId: string, label?: string) => {
    const option = buildModuleOption(moduleId, label);
    if (!option || seen.has(option.value)) return;
    seen.add(option.value);
    result.push(option);
  };

  const processTargets = Array.from(new Set(
    (Array.isArray(processTargetModuleIds) ? processTargetModuleIds : [])
      .map(normalizeModuleId)
      .filter((moduleId) => Boolean(moduleId && MODULES[moduleId])),
  ));
  if (processTargets.length > 0) {
    processTargets.forEach((moduleId) => {
      const configuredLabel = (moduleOptions || []).find((option) => normalizeModuleId(option?.value) === moduleId)?.label;
      addOption(moduleId, configuredLabel);
    });
    return result;
  }

  (Array.isArray(moduleOptions) ? moduleOptions : []).forEach((option) => {
    const targetModuleId = normalizeModuleId(option?.value);
    if (!targetModuleId) return;
    if (targetModuleId === TASKS_MODULE_ID) {
      addOption(targetModuleId, option?.label);
      return;
    }
    if (!normalizedSourceModuleId) return;
    const targetModule = MODULES[targetModuleId];
    if (!targetModule) return;
    if ((targetModule.fields || []).some((field) => hasRelationToSourceModule(field, normalizedSourceModuleId))) {
      addOption(targetModuleId, option?.label);
    }
  });

  if (!seen.has(TASKS_MODULE_ID)) {
    addOption(TASKS_MODULE_ID);
  }

  return result;
};

export const getCreateRelatedRecordRelationFieldOptions = (
  targetModuleId: string,
  sourceModuleId: string,
  processTargetModuleIds: string[] = [],
): Array<{ label: string; value: string }> => {
  const normalizedTargetModuleId = normalizeModuleId(targetModuleId);
  const normalizedSourceModuleId = normalizeModuleId(sourceModuleId);
  if (!normalizedTargetModuleId || !MODULES[normalizedTargetModuleId]) return [];

  if ((processTargetModuleIds || []).map(normalizeModuleId).includes(normalizedTargetModuleId)) {
    return [{
      label: 'پیوند با رکوردهای مرتبط فرآیند',
      value: PROCESS_RUN_LINK_FIELD_KEY,
    }];
  }

  if (normalizedTargetModuleId === TASKS_MODULE_ID) {
    const taskField = (MODULES.tasks?.fields || []).find(
      (field) => normalizeModuleId(field?.key) === TASK_SOURCE_RECORD_FIELD_KEY,
    );
    return [{
      label: getFieldLabelFa(taskField, { moduleId: TASKS_MODULE_ID, fallback: TASK_SOURCE_RECORD_FIELD_KEY }),
      value: TASK_SOURCE_RECORD_FIELD_KEY,
    }];
  }

  if (!normalizedSourceModuleId) return [];

  return (MODULES[normalizedTargetModuleId]?.fields || [])
    .filter((field) => hasRelationToSourceModule(field, normalizedSourceModuleId))
    .map((field) => ({
      label: getFieldLabelFa(field, { moduleId: normalizedTargetModuleId, fallback: field.key }),
      value: String(field.key || '').trim(),
    }))
    .filter((option) => option.value);
};

export const getDefaultCreateRelatedRecordRelationFieldKey = (
  targetModuleId: string,
  sourceModuleId: string,
  processTargetModuleIds: string[] = [],
) =>
  getCreateRelatedRecordRelationFieldOptions(targetModuleId, sourceModuleId, processTargetModuleIds)[0]?.value || '';
