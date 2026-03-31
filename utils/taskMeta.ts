import { MODULES } from '../moduleRegistry';
import { getProjectModuleOptions } from './workflowHelpers';
import { mergeSelectOptions } from './selectOptions';
import { fetchRelationOptionsForField } from './relationOptions';
import { FieldType } from '../types';

type SimpleOption = { label: string; value: string };

const TASK_RELATION_FIELD_BY_MODULE: Record<string, string> = {
  products: 'related_product',
  customers: 'related_customer',
  suppliers: 'related_supplier',
  production_orders: 'related_production_order',
  invoices: 'related_invoice',
  purchase_invoices: 'purchase_invoice_id',
  projects: 'project_id',
  marketing_leads: 'marketing_lead_id',
};

export const TASK_LEGACY_SOURCE_FIELD_KEYS = Object.values(TASK_RELATION_FIELD_BY_MODULE);

const getTaskField = (fieldKey: string) =>
  (MODULES.tasks?.fields || []).find((field: any) => String(field?.key || '').trim() === fieldKey);

const normalizeSimpleOptions = (rows?: any[] | null): SimpleOption[] =>
  (rows || [])
    .map((row: any) => ({
      label: String(row?.label || row?.value || '').trim(),
      value: String(row?.value || row?.label || '').trim(),
    }))
    .filter((row: SimpleOption) => row.label && row.value);

export const getTaskTypeStaticOptions = (): SimpleOption[] =>
  normalizeSimpleOptions(getTaskField('task_type')?.options || []);

export const getTaskTypeProtectedValues = (): string[] =>
  getTaskTypeStaticOptions().map((item) => item.value);

export const getMergedTaskTypeOptions = (dynamicOptions?: any[] | null): SimpleOption[] =>
  normalizeSimpleOptions(mergeSelectOptions(getTaskTypeStaticOptions(), normalizeSimpleOptions(dynamicOptions)));

export const getTaskModuleOptions = (): SimpleOption[] =>
  normalizeSimpleOptions(getProjectModuleOptions());

export const getTaskRelationFieldKey = (moduleId?: string | null) =>
  TASK_RELATION_FIELD_BY_MODULE[String(moduleId || '').trim()] || null;

export const isTaskLegacySourceField = (fieldKey?: string | null) =>
  TASK_LEGACY_SOURCE_FIELD_KEYS.includes(String(fieldKey || '').trim());

const getTaskSourceModuleId = (values: any): string => {
  const primary = String(values?.source_module_id || values?.related_to_module || '').trim();
  if (primary) return primary;

  const fallback = Object.entries(TASK_RELATION_FIELD_BY_MODULE).find(([, fieldKey]) => {
    const raw = values?.[fieldKey];
    return raw !== undefined && raw !== null && String(raw).trim() !== '';
  });

  return String(fallback?.[0] || '').trim();
};

const getTaskSourceRecordId = (values: any, moduleId?: string | null): string => {
  const direct = String(values?.source_record_id || '').trim();
  if (direct) return direct;

  const relationFieldKey = getTaskRelationFieldKey(moduleId || getTaskSourceModuleId(values));
  return relationFieldKey ? String(values?.[relationFieldKey] || '').trim() : '';
};

export const normalizeTaskSourceValues = (values: any) => {
  const next = { ...(values || {}) };
  const moduleId = getTaskSourceModuleId(next);
  const recordId = getTaskSourceRecordId(next, moduleId);

  next.related_to_module = moduleId || null;
  next.source_module_id = moduleId || null;
  next.source_record_id = recordId || null;

  Object.values(TASK_RELATION_FIELD_BY_MODULE).forEach((fieldKey) => {
    next[fieldKey] = null;
  });

  const relationFieldKey = getTaskRelationFieldKey(moduleId);
  if (relationFieldKey && recordId) {
    next[relationFieldKey] = recordId;
  }

  return next;
};

export const buildTaskSourcePatch = (values: any) => {
  const normalized = normalizeTaskSourceValues(values);
  const patch: Record<string, any> = {
    related_to_module: normalized.related_to_module || null,
    source_module_id: normalized.source_module_id || null,
    source_record_id: normalized.source_record_id || null,
  };

  TASK_LEGACY_SOURCE_FIELD_KEYS.forEach((fieldKey) => {
    patch[fieldKey] = normalized[fieldKey] || null;
  });

  return patch;
};

export const buildTaskSourceInitialValues = (moduleId?: string | null, recordId?: string | null) => {
  const normalizedModuleId = String(moduleId || '').trim() || null;
  const normalizedRecordId = String(recordId || '').trim() || null;
  const relationFieldKey = getTaskRelationFieldKey(normalizedModuleId);

  return {
    related_to_module: normalizedModuleId,
    source_module_id: normalizedModuleId,
    source_record_id: normalizedRecordId,
    ...(relationFieldKey && normalizedRecordId ? { [relationFieldKey]: normalizedRecordId } : {}),
  };
};

export const applyTaskSourceRecordFilter = (
  query: any,
  moduleId?: string | null,
  recordId?: string | null,
) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  if (!normalizedModuleId || !normalizedRecordId) return query;

  const relationFieldKey = getTaskRelationFieldKey(normalizedModuleId);
  if (relationFieldKey) {
    return query.or(
      `${relationFieldKey}.eq.${normalizedRecordId},and(source_module_id.eq.${normalizedModuleId},source_record_id.eq.${normalizedRecordId})`
    );
  }

  return query
    .eq('source_module_id', normalizedModuleId)
    .eq('source_record_id', normalizedRecordId);
};

export const fetchTaskSourceRecordOptions = async (
  supabaseClient: any,
  sourceModuleId?: string | null,
  options?: { exactId?: string | number | null; limit?: number; search?: string }
) => {
  const targetModule = String(sourceModuleId || '').trim();
  if (!targetModule || !MODULES[targetModule]) return [];

  return fetchRelationOptionsForField(
    supabaseClient,
    {
      key: 'source_record_id',
      type: FieldType.RELATION,
      relationConfig: {
        targetModule,
      },
    },
    {
      exactId: options?.exactId ?? null,
      limit: options?.limit ?? 200,
      search: options?.search ?? '',
    }
  );
};

export const resolveTaskSourceLink = (task: any): { moduleId: string | null; recordId: string | null } => {
  const sourceModuleId = String(task?.source_module_id || task?.related_to_module || '').trim() || null;
  const directSourceRecordId = String(task?.source_record_id || '').trim() || null;
  if (sourceModuleId && directSourceRecordId) {
    return { moduleId: sourceModuleId, recordId: directSourceRecordId };
  }

  const relationFieldKey = getTaskRelationFieldKey(sourceModuleId || task?.related_to_module);
  const fallbackRecordId = relationFieldKey ? String(task?.[relationFieldKey] || '').trim() || null : null;

  return {
    moduleId: sourceModuleId,
    recordId: fallbackRecordId,
  };
};
