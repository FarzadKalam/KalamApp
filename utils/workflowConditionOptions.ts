import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { FieldType, type ModuleField } from '../types';
import { supportsGlobalRoleAssignee } from './assigneeSupport';
import { fetchAssigneeDirectory, fetchDynamicOptionsMap } from './referenceData';
import { doesProcessTemplateSupportModule } from './processTargets';
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
    const { data, error } = await supabase.from('tags').select('id, title').order('title', { ascending: true });
    if (error) throw error;
    return (data || [])
      .map((row: any) => ({
        label: String(row?.title || row?.id || ''),
        value: String(row?.id || ''),
      }))
      .filter((item) => item.value);
  }

  if (field.type === FieldType.USER) {
    const selectVariants = [
      'id, full_name, first_name, last_name',
      'id, first_name, last_name',
      'id',
    ];

    let rows: any[] = [];
    for (const selectColumns of selectVariants) {
      const result = await supabase.from('profiles').select(selectColumns).limit(300);
      if (!result.error) {
        rows = result.data || [];
        break;
      }
      const errorCode = String((result.error as any)?.code || '').toUpperCase();
      const errorText = String((result.error as any)?.message || (result.error as any)?.details || '').toLowerCase();
      const isMissingColumn = errorCode === '42703' || errorCode === 'PGRST204' || errorText.includes('column');
      if (!isMissingColumn) throw result.error;
    }

    return (rows || [])
      .map((row: any) => {
        const fullName = String(row?.full_name || '').trim();
        const composedName = `${String(row?.first_name || '').trim()} ${String(row?.last_name || '').trim()}`.trim();
        return {
          label: fullName || composedName || String(row?.id || ''),
          value: String(row?.id || ''),
        };
      })
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
    const { data, error } = await supabase
      .from('process_templates')
      .select('id, name, module_id, module_ids, is_active')
      .order('name', { ascending: true });
    if (error) throw error;

    const scopedRows = (data || []).filter((row: any) => {
      return row?.is_active !== false && doesProcessTemplateSupportModule(row, scopeModuleId);
    });

    return scopedRows
      .map((row: any) => ({
        label: String(row?.name || row?.id || ''),
        value: String(row?.id || ''),
      }))
      .filter((item) => item.value);
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

  await Promise.all(
    optionFields.map(async (field) => {
      relationOptions[field.key] = await loadWorkflowFieldOptions(field, moduleId);
    })
  );

  return {
    dynamicOptions,
    relationOptions,
  };
};
