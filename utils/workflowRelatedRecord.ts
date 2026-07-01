import { MODULES } from '../moduleRegistry';
import { FieldType, ModuleField } from '../types';
import { getFieldLabelFa } from './fieldLabel';
import type { WorkflowModuleOption } from './workflowTypes';

const TASKS_MODULE_ID = 'tasks';
const TASK_SOURCE_RECORD_FIELD_KEY = 'source_record_id';

const normalizeModuleId = (value: unknown) => String(value || '').trim();

const buildModuleOption = (moduleId: string, label?: string): WorkflowModuleOption | null => {
  const normalizedModuleId = normalizeModuleId(moduleId);
  if (!normalizedModuleId || !MODULES[normalizedModuleId]) return null;
  return {
    value: normalizedModuleId,
    label: String(label || MODULES[normalizedModuleId]?.titles?.fa || normalizedModuleId).trim() || normalizedModuleId,
  };
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
): Array<{ label: string; value: string }> => {
  const normalizedTargetModuleId = normalizeModuleId(targetModuleId);
  const normalizedSourceModuleId = normalizeModuleId(sourceModuleId);
  if (!normalizedTargetModuleId || !MODULES[normalizedTargetModuleId]) return [];

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
) =>
  getCreateRelatedRecordRelationFieldOptions(targetModuleId, sourceModuleId)[0]?.value || '';
