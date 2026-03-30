import { MODULES } from '../moduleRegistry';
import { FieldType, ModuleField } from '../types';
import { getAssigneeLabel } from './assigneeLabel';
import { supportsGlobalAssignee } from './assigneeSupport';
import {
  WORKFLOW_ASSIGNEE_FIELD_KEY,
  createWorkflowRelatedFieldKey,
} from './workflowTypes';

const HIDDEN_WORKFLOW_FIELD_KEYS = new Set([
  'execution_process_draft',
  'marketing_process_draft',
  'production_stages_draft',
  'template_stages_preview',
  'run_stages_preview',
]);

const HIDDEN_WORKFLOW_FIELD_TYPES = new Set<FieldType>([
  FieldType.IMAGE,
  FieldType.JSON,
  FieldType.PROGRESS_STAGES,
]);

const PROCESS_DRAFT_FIELD_KEYS = [
  'execution_process_draft',
  'marketing_process_draft',
  'production_stages_draft',
] as const;

export const getProjectModuleOptions = () =>
  Object.values(MODULES)
    .map((module) => ({
      label: module.titles?.fa || module.id,
      value: module.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fa'));

export const shouldIncludeWorkflowField = (field?: ModuleField | null) => {
  if (!field?.key) return false;
  if (HIDDEN_WORKFLOW_FIELD_KEYS.has(String(field.key))) return false;
  if (HIDDEN_WORKFLOW_FIELD_TYPES.has(field.type)) return false;
  return true;
};

const buildSyntheticAssigneeField = (moduleId: string): ModuleField => ({
  key: WORKFLOW_ASSIGNEE_FIELD_KEY,
  labels: { fa: getAssigneeLabel(moduleId), en: 'Assignee' },
  type: FieldType.SELECT,
  ...( { workflowOptionScopeModuleId: moduleId } as any ),
});

const getVisibleModuleFields = (moduleId: string) =>
  (MODULES[moduleId]?.fields || []).filter((field) => shouldIncludeWorkflowField(field));

export const getWorkflowConditionFields = (moduleId: string): ModuleField[] => {
  if (!moduleId || !MODULES[moduleId]) return [];

  const currentFields = getVisibleModuleFields(moduleId);
  const result: ModuleField[] = [...currentFields];

  if (supportsGlobalAssignee(moduleId)) {
    result.push(buildSyntheticAssigneeField(moduleId));
  }

  currentFields
    .filter((field) => field.type === FieldType.RELATION && field.relationConfig?.targetModule)
    .forEach((relationField) => {
      const targetModuleId = String(relationField.relationConfig?.targetModule || '').trim();
      if (!targetModuleId || !MODULES[targetModuleId]) return;

      const targetTitle = MODULES[targetModuleId]?.titles?.fa || targetModuleId;
      const relatedFields = getVisibleModuleFields(targetModuleId).map((targetField) => ({
        ...targetField,
        ...( { workflowOptionScopeModuleId: targetModuleId } as any ),
        key: createWorkflowRelatedFieldKey(relationField.key, targetModuleId, targetField.key),
        labels: {
          ...targetField.labels,
          fa: `${targetField.labels?.fa || targetField.key} (${targetTitle})`,
        },
      }));

      result.push(...relatedFields);

      if (supportsGlobalAssignee(targetModuleId)) {
        result.push({
          ...buildSyntheticAssigneeField(targetModuleId),
          key: createWorkflowRelatedFieldKey(
            relationField.key,
            targetModuleId,
            WORKFLOW_ASSIGNEE_FIELD_KEY
          ),
          labels: {
            fa: `${getAssigneeLabel(targetModuleId)} (${targetTitle})`,
            en: 'Related Assignee',
          },
        });
      }
    });

  return result;
};

export const resolveWorkflowProcessDraftFieldKey = (moduleId: string) => {
  const moduleConfig = MODULES[moduleId];
  if (!moduleConfig) return null;
  const hasProcessTemplateField = moduleConfig.fields.some((field) => field.key === 'process_template_id');
  if (!hasProcessTemplateField) return null;
  return (
    PROCESS_DRAFT_FIELD_KEYS.find((key) =>
      moduleConfig.fields.some((field) => field.key === key)
    ) || null
  );
};

export const supportsWorkflowProcessTemplateActions = (moduleId: string) =>
  !!resolveWorkflowProcessDraftFieldKey(moduleId);
