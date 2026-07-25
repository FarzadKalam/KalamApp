import { MODULES } from '../moduleRegistry';
import { FieldType, ModuleField } from '../types';
import { getAssigneeLabel } from './assigneeLabel';
import { supportsGlobalAssignee } from './assigneeSupport';
import { getFieldLabelFa } from './fieldLabel';
import { isSaasAdminModuleId } from './permissions';
import {
  getProcessTargetModuleFields,
  normalizeProcessTargetModuleIds,
} from './processTargets';
import {
  WORKFLOW_ASSIGNEE_FIELD_KEY,
  WORKFLOW_RECORD_LINK_FIELD_KEY,
  createWorkflowRelatedFieldKey,
} from './workflowTypes';
import { PROCESS_TEMPLATE_TARGET_MODULE_EXCLUDED_IDS } from './processModuleSupport';
import {
  PROCESS_LANE_NAME_TEMPLATE_FIELD_KEY,
  PROCESS_NAME_TEMPLATE_FIELD_KEY,
  PROCESS_TEMPLATE_SYSTEM_VARIABLES,
} from './processTemplateContext';
import {
  buildRelatedVariableLabel,
  dedupeModuleFields,
  getCanonicalModuleFields,
} from './recordVariableCatalog';

const HIDDEN_WORKFLOW_FIELD_KEYS = new Set([
  'id',
  'org_id',
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
    .filter((module) => !isSaasAdminModuleId(module.id))
    .map((module) => ({
      label: module.titles?.fa || module.id,
      value: module.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fa'));

export const getProcessTemplateModuleOptions = () =>
  getProjectModuleOptions().filter(
    (option) => !PROCESS_TEMPLATE_TARGET_MODULE_EXCLUDED_IDS.has(String(option.value || '').trim())
  );

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

export const getSyntheticWorkflowRecordLinkField = (moduleId: string): ModuleField => ({
  key: WORKFLOW_RECORD_LINK_FIELD_KEY,
  labels: { fa: 'لینک رکورد', en: 'Record Link' },
  type: FieldType.LINK,
  nature: 'system' as any,
  readonly: true,
  ...( { workflowOptionScopeModuleId: moduleId } as any ),
});

const getAssigneeProfileFields = (sourceModuleId: string, assigneeFieldKey = 'assignee_id'): ModuleField[] => {
  if (!sourceModuleId || !supportsGlobalAssignee(sourceModuleId)) return [];
  const assigneeLabel = getAssigneeLabel(sourceModuleId);
  return getVisibleWorkflowModuleFields('profiles')
    .filter((field) => {
      const key = String(field?.key || '').trim();
      return key && key !== 'assignee_id' && key !== 'tags' && key !== 'org_id';
    })
    .map((field) => {
      const profileFieldLabel = getFieldLabelFa(field, { moduleId: 'profiles', fallback: field.key });
      return {
        ...field,
        ...( { workflowOptionScopeModuleId: 'profiles' } as any ),
        key: createWorkflowRelatedFieldKey(assigneeFieldKey, 'profiles', field.key),
        labels: {
          ...field.labels,
          fa: `${assigneeLabel}: ${profileFieldLabel}`,
        },
      };
    });
};

export const getSyntheticWorkflowAssigneeField = (moduleId: string) =>
  supportsGlobalAssignee(moduleId) ? buildSyntheticAssigneeField(moduleId) : null;

export const getVisibleWorkflowModuleFields = (moduleId: string) =>
  getCanonicalModuleFields(moduleId).filter((field) => shouldIncludeWorkflowField(field));

export const getWorkflowConditionFields = (moduleId: string): ModuleField[] => {
  if (!moduleId || !MODULES[moduleId]) return [];

  const currentFields = getVisibleWorkflowModuleFields(moduleId);
  const result: ModuleField[] = [getSyntheticWorkflowRecordLinkField(moduleId), ...currentFields];

  if (supportsGlobalAssignee(moduleId)) {
    result.push(buildSyntheticAssigneeField(moduleId));
    result.push(...getAssigneeProfileFields(moduleId));
  }

  currentFields
    .filter((field) => field.type === FieldType.RELATION && field.relationConfig?.targetModule)
    .forEach((relationField) => {
      const targetModuleId = String(relationField.relationConfig?.targetModule || '').trim();
      if (!targetModuleId || !MODULES[targetModuleId]) return;

      const relatedRecordLinkField = getSyntheticWorkflowRecordLinkField(targetModuleId);
      result.push({
        ...relatedRecordLinkField,
        key: createWorkflowRelatedFieldKey(
          relationField.key,
          targetModuleId,
          WORKFLOW_RECORD_LINK_FIELD_KEY
        ),
        labels: {
          fa: buildRelatedVariableLabel(moduleId, relationField, targetModuleId, relatedRecordLinkField),
          en: 'Related Record Link',
        },
      });
      const relatedFields = getVisibleWorkflowModuleFields(targetModuleId).map((targetField) => ({
        ...targetField,
        ...( { workflowOptionScopeModuleId: targetModuleId } as any ),
        key: createWorkflowRelatedFieldKey(relationField.key, targetModuleId, targetField.key),
        labels: {
          ...targetField.labels,
          fa: buildRelatedVariableLabel(moduleId, relationField, targetModuleId, targetField),
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
            fa: `${getFieldLabelFa(relationField, { moduleId, fallback: relationField.key })} (${getAssigneeLabel(targetModuleId)})`,
            en: 'Related Assignee',
          },
        });
      }
    });

  return dedupeModuleFields(result);
};

export const getProcessAutomationTaskFields = () => {
  const hiddenTaskFieldKeys = new Set([
    'related_to_module',
    'source_record_id',
    'related_product',
    'related_customer',
    'related_supplier',
    'related_production_order',
    'related_invoice',
    'project_id',
    'purchase_invoice_id',
    'marketing_lead_id',
  ]);

  const taskFields = getVisibleWorkflowModuleFields('tasks')
    .filter((field) => !hiddenTaskFieldKeys.has(String(field.key || '').trim()))
    .map((field) => ({
      ...field,
      key: `__task__${field.key}`,
      labels: {
        ...field.labels,
        fa: `${field.labels?.fa || field.key} (فعالیت)`,
      },
      ...( { workflowOptionScopeModuleId: 'tasks' } as any ),
    }));

  const preferredOrder = ['__task__task_type', '__task__status'];

  const prioritized = preferredOrder
    .map((key) => taskFields.find((field) => field.key === key))
    .filter((field): field is ModuleField => Boolean(field));

  const remaining = taskFields.filter((field) => !preferredOrder.includes(field.key));
  const result: ModuleField[] = [...prioritized, ...remaining];

  result.push({
    ...getSyntheticWorkflowRecordLinkField('tasks'),
    key: '__task__' + WORKFLOW_RECORD_LINK_FIELD_KEY,
    labels: { fa: 'لینک رکورد (فعالیت)', en: 'Task Record Link' },
  });

  if (supportsGlobalAssignee('tasks')) {
    result.push({
      ...buildSyntheticAssigneeField('tasks'),
      key: '__task__' + WORKFLOW_ASSIGNEE_FIELD_KEY,
      labels: { fa: `${getAssigneeLabel('tasks')} (فعالیت)`, en: 'Task Assignee' },
    });
  }

  return result;
};

export const getProcessTemplateIdentityFields = (): ModuleField[] => ([
  {
    key: PROCESS_NAME_TEMPLATE_FIELD_KEY,
    labels: { fa: 'نام فرآیند', en: 'Process Name' },
    type: FieldType.TEXT,
    nature: 'system' as any,
    readonly: true,
  },
  {
    key: PROCESS_LANE_NAME_TEMPLATE_FIELD_KEY,
    labels: { fa: 'نام ردیف', en: 'Process Lane Name' },
    type: FieldType.TEXT,
    nature: 'system' as any,
    readonly: true,
  },
  ...PROCESS_TEMPLATE_SYSTEM_VARIABLES.map(({ key, labelFa }) => ({
    key,
    labels: { fa: labelFa, en: labelFa },
    type: FieldType.TEXT,
    nature: 'system' as any,
    readonly: true,
  })),
]);

export const getProcessAutomationConditionFields = (moduleId?: string | null): ModuleField[] => {
  const taskFields = getProcessAutomationTaskFields();
  if (!moduleId || !MODULES[moduleId]) return taskFields;
  return dedupeModuleFields([...taskFields, ...getWorkflowConditionFields(moduleId)]);
};

export const getProcessAutomationConditionFieldsForModules = (moduleIds?: Array<string | null | undefined>) => {
  const taskFields = getProcessAutomationTaskFields();
  const normalizedModuleIds = normalizeProcessTargetModuleIds(moduleIds || []);
  if (normalizedModuleIds.length === 0) return taskFields;
  return dedupeModuleFields([
    ...taskFields,
    ...getProcessTargetModuleFields(
      normalizedModuleIds,
      getWorkflowConditionFields,
      getSyntheticWorkflowAssigneeField
    ),
  ]);
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
