import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { FieldType, type ModuleField } from '../types';
import { supportsGlobalRoleAssignee } from './assigneeSupport';
import {
  fetchAssigneeDirectory,
  fetchDynamicOptionsMap,
  fetchProcessTemplateOptions,
  fetchTagOptions,
} from './referenceData';
import { fetchRelationOptionsForField } from './relationOptions';
import { getRelationOptionSelectVariants, getPreferredRelationTargetField } from './relationTargetField';
import { supportsSystemCode } from './systemCode';
import { parseWorkflowRelatedFieldKey, WORKFLOW_ASSIGNEE_FIELD_KEY } from './workflowTypes';

const mapGenericRowsToOptions = (rows: any[], targetField: string) =>
  (rows || [])
    .map((row: any) => {
      const label =
        row?.[targetField] ||
        row?.name ||
        row?.title ||
        row?.full_name ||
        row?.business_name ||
        row?.shelf_number ||
        row?.system_code ||
        row?.id;
      const code = row?.system_code ? ` (${row.system_code})` : '';
      return {
        label: `${label}${code}`,
        value: String(row?.id || ''),
      };
    })
    .filter((item) => item.value);

export const loadWorkflowFieldOptions = async (
  field: ModuleField,
  moduleScopeId: string
): Promise<Array<{ label: string; value: string }>> => {
  const relatedMeta = parseWorkflowRelatedFieldKey(field.key);
  const scopeModuleId = String(
    (field as any)?.workflowOptionScopeModuleId
    || relatedMeta?.targetModuleId
    || moduleScopeId
    || ''
  ).trim();

  if (field.key === WORKFLOW_ASSIGNEE_FIELD_KEY || relatedMeta?.targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) {
    const directory = await fetchAssigneeDirectory(supabase);
    const userOptions = (directory.users || [])
      .map((user) => ({
        label: String(user?.display_name || user?.full_name || user?.id || '').trim(),
        value: `user_${String(user?.id || '').trim()}`,
      }))
      .filter((item) => item.value !== 'user_');

    const roleOptions = supportsGlobalRoleAssignee(scopeModuleId)
      ? (directory.roles || [])
          .map((role) => ({
            label: String(role?.title || role?.id || '').trim(),
            value: `role_${String(role?.id || '').trim()}`,
          }))
          .filter((item) => item.value !== 'role_')
      : [];

    return [...userOptions, ...roleOptions];
  }

  if (field.type === FieldType.TAGS) {
    return fetchTagOptions(supabase);
  }

  if (field.type === FieldType.USER) {
    const directory = await fetchAssigneeDirectory(supabase);

    return (directory.users || [])
      .map((user) => ({
        label: String(user?.display_name || user?.full_name || 'بدون عنوان').trim(),
        value: String(user?.id || '').trim(),
      }))
      .filter((item) => item.value);
  }

  const targetModule = String(field?.relationConfig?.targetModule || '').trim();
  if (!targetModule || !MODULES[targetModule]) {
    return [];
  }

  if (Array.isArray(field?.relationConfig?.sourceModules) && field.relationConfig.sourceModules.length > 0) {
    return fetchRelationOptionsForField(supabase, field, { limit: 300 });
  }

  if (targetModule === 'process_templates') {
    return fetchProcessTemplateOptions(supabase, scopeModuleId);
  }

  const targetField = getPreferredRelationTargetField(targetModule, field?.relationConfig?.targetField);
  const includeSystemCode = supportsSystemCode(targetModule);
  const selectVariants = getRelationOptionSelectVariants(
    targetModule,
    field?.relationConfig?.targetField,
    includeSystemCode
  );

  let rows: any[] = [];
  for (const selectColumns of selectVariants) {
    const result = await supabase.from(targetModule).select(selectColumns).limit(300);
    if (!result.error) {
      rows = result.data || [];
      break;
    }
    const errorCode = String((result.error as any)?.code || '').toUpperCase();
    const errorText = String((result.error as any)?.message || (result.error as any)?.details || '').toLowerCase();
    const isMissingColumn = errorCode === '42703' || errorCode === 'PGRST204' || errorText.includes('column');
    if (!isMissingColumn) throw result.error;
  }

  return mapGenericRowsToOptions(rows, targetField);
};

export const loadWorkflowConditionEditorOptions = async (
  moduleId: string,
  fields: ModuleField[]
): Promise<{
  dynamicOptions: Record<string, Array<{ label: string; value: string }>>;
  relationOptions: Record<string, Array<{ label: string; value: string }>>;
}> => {
  const dynamicCategories = Array.from(
    new Set(
      (fields || [])
        .map((field) => field.dynamicOptionsCategory)
        .filter((category): category is string => !!category)
    )
  );

  const dynamicOptions = await fetchDynamicOptionsMap(supabase, dynamicCategories);
  const relationOptions: Record<string, Array<{ label: string; value: string }>> = {};

  const optionFields = (fields || []).filter(
    (field) =>
      field.key === WORKFLOW_ASSIGNEE_FIELD_KEY ||
      parseWorkflowRelatedFieldKey(field.key)?.targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY ||
      field.type === FieldType.RELATION ||
      field.type === FieldType.USER ||
      field.type === FieldType.TAGS
  );

  await Promise.allSettled(
    optionFields.map(async (field) => {
      relationOptions[field.key] = await loadWorkflowFieldOptions(field, moduleId);
    })
  );

  return {
    dynamicOptions,
    relationOptions,
  };
};
