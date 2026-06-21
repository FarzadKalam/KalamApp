import { MODULES } from '../moduleRegistry';
import type { CurrentUserRecordAccessContext } from './permissions';

export type ProcessWorkItem = {
  key: string;
  moduleId: string;
  recordId: string;
  lineId: string | null;
  groupId: string | null;
  templateId: string | null;
  templateName: string | null;
  updatedAt: string | null;
  reason: 'task' | 'draft_stage' | 'record' | 'linked_record';
};

export type ProcessWorkItemModuleSpec = {
  moduleId: string;
  tableName: string;
  draftField: string;
};

const PROCESS_DRAFT_FIELD_KEYS = [
  'execution_process_draft',
  'marketing_process_draft',
  'process_draft',
  'sub_process_draft',
] as const;

const PROCESS_RECORD_SCAN_EXCLUDED_MODULE_IDS = new Set([
  'automation_execution_reports',
  'sms_delivery_reports',
  'voip_call_reports',
  'petty_funds',
  'surveys',
  'instructions',
]);

const normalizeText = (value: unknown) => String(value || '').trim();

const isMissingProcessWorkItemsRpcError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    code === '42883'
    || code === 'PGRST202'
    || code === 'PGRST204'
    || message.includes('get_process_work_items_v1')
    || message.includes('could not find the function')
  );
};

export const buildProcessWorkItemModuleSpecs = (
  access: Pick<CurrentUserRecordAccessContext, 'permissions'> | null | undefined
): ProcessWorkItemModuleSpec[] =>
  Object.values(MODULES)
    .map((module: any) => {
      const moduleId = normalizeText(module?.id);
      const tableName = normalizeText(module?.table || moduleId);
      if (!moduleId || !tableName) return null;
      if (PROCESS_RECORD_SCAN_EXCLUDED_MODULE_IDS.has(moduleId)) return null;
      if (module?.systemManaged || module?.disableDetailView) return null;
      if (access?.permissions?.[moduleId]?.view === false) return null;

      const fieldKeys = new Set((module?.fields || []).map((field: any) => normalizeText(field?.key)).filter(Boolean));
      const draftField = PROCESS_DRAFT_FIELD_KEYS.find((fieldKey) => fieldKeys.has(fieldKey));
      if (!draftField) return null;
      return { moduleId, tableName, draftField };
    })
    .filter(Boolean) as ProcessWorkItemModuleSpec[];

const normalizeProcessWorkItem = (row: any): ProcessWorkItem | null => {
  const moduleId = normalizeText(row?.moduleId);
  const recordId = normalizeText(row?.recordId);
  if (!moduleId || !recordId || !MODULES[moduleId]) return null;
  const groupId = normalizeText(row?.groupId) || null;
  const templateId = normalizeText(row?.templateId) || null;
  const key = normalizeText(row?.key) || [moduleId, recordId, groupId || templateId || 'default_process_group'].join(':');
  const reason = normalizeText(row?.reason) as ProcessWorkItem['reason'];
  return {
    key,
    moduleId,
    recordId,
    lineId: normalizeText(row?.lineId) || null,
    groupId,
    templateId,
    templateName: normalizeText(row?.templateName) || null,
    updatedAt: normalizeText(row?.updatedAt) || null,
    reason: ['task', 'draft_stage', 'record', 'linked_record'].includes(reason) ? reason : 'record',
  };
};

export const fetchProcessWorkItems = async (
  supabaseClient: any,
  access: Pick<CurrentUserRecordAccessContext, 'permissions'> | null | undefined,
  options?: { limit?: number }
): Promise<ProcessWorkItem[] | null> => {
  const limit = Math.max(1, Math.min(Number(options?.limit || 15), 80));
  const moduleSpecs = buildProcessWorkItemModuleSpecs(access);
  const { data, error } = await supabaseClient.rpc('get_process_work_items_v1', {
    p_module_specs: moduleSpecs,
    p_limit: limit,
  });

  if (error) {
    if (isMissingProcessWorkItemsRpcError(error)) return null;
    throw error;
  }

  return (Array.isArray(data) ? data : [])
    .map(normalizeProcessWorkItem)
    .filter(Boolean) as ProcessWorkItem[];
};
