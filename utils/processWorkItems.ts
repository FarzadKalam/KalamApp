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
  processStatus: 'in_progress' | 'completed';
  reason: 'task' | 'draft_stage' | 'record' | 'linked_record';
  processLinks: Record<string, string>;
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

const PROCESS_RECORD_MODULE_PRIORITY = [
  'projects',
  'invoices',
  'purchase_invoices',
  'customers',
  'marketing_leads',
  'personas',
  'employees',
] as const;

export const normalizeProcessWorkItemLinks = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((links, [moduleId, recordId]) => {
    const normalizedModuleId = normalizeText(moduleId);
    const normalizedRecordId = normalizeText(recordId);
    if (normalizedModuleId && normalizedRecordId && MODULES[normalizedModuleId]) {
      links[normalizedModuleId] = normalizedRecordId;
    }
    return links;
  }, {});
};

export const getProcessWorkItemIdentity = (item: Pick<ProcessWorkItem, 'moduleId' | 'recordId' | 'groupId' | 'templateId'>) => {
  const groupId = normalizeText(item.groupId);
  const templateId = normalizeText(item.templateId);
  // فرآیندهای قدیمی ممکن است شناسهٔ گروه نداشته باشند و شناسهٔ الگو را به‌جای آن ذخیره کرده باشند.
  // در آن حالت، رکورد والد بخشی از هویت فرآیند باقی می‌ماند تا اجرای مستقل یک الگو پنهان نشود.
  if (groupId && groupId !== templateId) return `group:${groupId}`;
  return [
    'record',
    normalizeText(item.moduleId),
    normalizeText(item.recordId),
    groupId || templateId || 'default_process_group',
  ].join(':');
};

export const dedupeProcessWorkItems = (items: ProcessWorkItem[]): ProcessWorkItem[] => {
  const deduped = new Map<string, ProcessWorkItem>();
  items.forEach((item) => {
    const identity = getProcessWorkItemIdentity(item);
    const previous = deduped.get(identity);
    const itemTime = new Date(item.updatedAt || 0).getTime() || 0;
    const previousTime = new Date(previous?.updatedAt || 0).getTime() || 0;
    const newest = !previous || itemTime >= previousTime ? item : previous;
    const oldest = newest === item ? previous : item;
    deduped.set(identity, {
      ...newest,
      key: identity,
      processLinks: {
        ...(oldest?.processLinks || {}),
        ...(newest.processLinks || {}),
      },
    });
  });
  return Array.from(deduped.values());
};

export const getPreferredProcessRecordRef = (
  item: Pick<ProcessWorkItem, 'moduleId' | 'recordId' | 'processLinks'>,
  canViewModule?: (moduleId: string) => boolean,
) => {
  const candidates = new Map<string, { moduleId: string; recordId: string }>();
  Object.entries(item.processLinks || {}).forEach(([moduleId, recordId]) => {
    const normalizedModuleId = normalizeText(moduleId);
    const normalizedRecordId = normalizeText(recordId);
    if (normalizedModuleId && normalizedRecordId && MODULES[normalizedModuleId]) {
      candidates.set(`${normalizedModuleId}:${normalizedRecordId}`, { moduleId: normalizedModuleId, recordId: normalizedRecordId });
    }
  });
  const sourceModuleId = normalizeText(item.moduleId);
  const sourceRecordId = normalizeText(item.recordId);
  if (sourceModuleId && sourceRecordId && MODULES[sourceModuleId]) {
    candidates.set(`${sourceModuleId}:${sourceRecordId}`, { moduleId: sourceModuleId, recordId: sourceRecordId });
  }

  return Array.from(candidates.values())
    .filter((candidate) => !canViewModule || canViewModule(candidate.moduleId))
    .sort((left, right) => {
      const leftPriority = PROCESS_RECORD_MODULE_PRIORITY.indexOf(left.moduleId as typeof PROCESS_RECORD_MODULE_PRIORITY[number]);
      const rightPriority = PROCESS_RECORD_MODULE_PRIORITY.indexOf(right.moduleId as typeof PROCESS_RECORD_MODULE_PRIORITY[number]);
      const normalizedLeftPriority = leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority;
      const normalizedRightPriority = rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority;
      return normalizedLeftPriority - normalizedRightPriority;
    })[0] || null;
};

const isMissingProcessWorkItemsRpcError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    code === '42883'
    || code === 'PGRST202'
    || code === 'PGRST204'
    || message.includes('get_process_work_items_v1')
    || message.includes('get_process_work_items_v2')
    || message.includes('get_process_work_items_v3')
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
    processStatus: normalizeText(row?.processStatus) === 'completed' ? 'completed' : 'in_progress',
    reason: ['task', 'draft_stage', 'record', 'linked_record'].includes(reason) ? reason : 'record',
    processLinks: normalizeProcessWorkItemLinks(row?.processLinks),
  };
};

export const fetchProcessWorkItems = async (
  supabaseClient: any,
  access: Pick<CurrentUserRecordAccessContext, 'permissions'> | null | undefined,
  options?: { limit?: number; status?: 'all' | 'in_progress' | 'completed' }
): Promise<ProcessWorkItem[] | null> => {
  const limit = Math.max(1, Math.min(Number(options?.limit || 15), 80));
  const moduleSpecs = buildProcessWorkItemModuleSpecs(access);
  const { data, error } = await supabaseClient.rpc('get_process_work_items_v3', {
    p_module_specs: moduleSpecs,
    p_limit: limit,
    p_status: options?.status || 'all',
  });

  if (error) {
    if (isMissingProcessWorkItemsRpcError(error)) {
      // نمایش ندادن داده تا اجرای migration، از نمایش فرآیند نامرتبط با کاربر امن‌تر است.
      return [];
    }
    throw error;
  }

  return dedupeProcessWorkItems(
    (Array.isArray(data) ? data : [])
      .map(normalizeProcessWorkItem)
      .filter(Boolean) as ProcessWorkItem[]
  );
};
