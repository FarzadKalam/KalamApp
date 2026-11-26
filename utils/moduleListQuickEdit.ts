import { FieldNature, FieldType, type ModuleDefinition, type ModuleField } from '../types';
import { canFieldAction } from './fieldAccess';
import { supportsModuleAssignee } from './assigneeSupport';
import { isWorkflowVirtualField, shouldRenderInGeneralModuleUi } from './moduleFieldVisibility';
import type { ModulePermissionConfig } from './permissions';

export function canQuickEditModuleField(module: ModuleDefinition, field: ModuleField, permissions: ModulePermissionConfig) {
  return module.disableInlineFieldEditing !== true
    && shouldRenderInGeneralModuleUi(field) && !isWorkflowVirtualField(field)
    && (field.nature !== FieldNature.SYSTEM || field.key === 'assignee_id' || field.type === FieldType.PROGRESS_STAGES)
    && !field.readonly && !field.isCalculated && field.type !== FieldType.READONLY_LOOKUP
    && !['id', 'org_id', 'system_code', 'created_at', 'created_by', 'updated_at', 'updated_by', 'is_locked', 'locked_at', 'locked_by', 'template_stages_preview', 'run_stages_preview'].includes(field.key)
    && (!module.systemManaged || field.type === FieldType.TAGS)
    && canFieldAction(permissions, field.key, 'edit');
}

export function getQuickEditAssigneeField(module: ModuleDefinition, label: string): ModuleField | undefined {
  if (!supportsModuleAssignee(module)) return;
  return module.fields.find(field => field.key === 'assignee_id') ?? {
    key: 'assignee_id', type: FieldType.USER, labels: { fa: label },
  };
}
