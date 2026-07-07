import { MODULES } from '../moduleRegistry';
import { parseProcessLinkMap } from './processTargets';

const PROCESS_DRAFT_FIELD_KEYS = [
  'execution_process_draft',
  'marketing_process_draft',
  'production_stages_draft',
  'process_draft',
  'sub_process_draft',
] as const;

const LINKED_DRAFT_LOOKUP_EXCLUDED_TABLES = new Set([
  'automation_execution_reports',
  'sms_delivery_reports',
  'voip_call_logs',
  'saas_admin_org_candidates_view',
  'saas_admin_users_view',
  'saas_onboarding_requests',
]);

const LINKED_DRAFT_CACHE_TTL_MS = 30_000;
const LINKED_DRAFT_UNSUPPORTED_TTL_MS = 120_000;
const linkedDraftCache = new Map<string, { savedAt: number; stages: Record<string, any>[] }>();
const linkedDraftInFlight = new Map<string, Promise<Record<string, any>[]>>();
const unsupportedLinkedDraftSpecs = new Map<string, number>();

const normalizeText = (value: unknown) => String(value || '').trim();
const normalizeList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(value.map((item) => normalizeText(item)).filter(Boolean))).sort()
    : []
);

const parseObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const getDraftFieldKey = (module: any) => {
  const fieldKeys = new Set((module?.fields || []).map((field: any) => normalizeText(field?.key)).filter(Boolean));
  return PROCESS_DRAFT_FIELD_KEYS.find((fieldKey) => fieldKeys.has(fieldKey)) || '';
};

const isMissingColumnLikeError = (error: any) => {
  const code = normalizeText(error?.code).toUpperCase();
  if (['42703', 'PGRST200', 'PGRST204'].includes(code)) return true;
  const text = normalizeText(error?.message || error?.details || error?.hint).toLowerCase();
  return text.includes('column') || text.includes('schema cache') || text.includes('does not exist');
};

const extractStageLinks = (stage: Record<string, any>) => {
  const metadata = parseObject(stage?.metadata);
  const recurrence = parseObject(stage?.recurrence_info || metadata?.recurrence_info);
  return parseProcessLinkMap(
    stage?.process_link_map
    || stage?.process_links
    || metadata?.process_link_map
    || metadata?.process_links
    || recurrence?.process_links
  );
};

const stageMatchesRecord = (stage: Record<string, any>, moduleId: string, recordId: string) => {
  const links = extractStageLinks(stage);
  return normalizeText(links[moduleId]) === recordId;
};

const getStageDedupeKey = (stage: Record<string, any>, ownerModuleId: string, ownerRecordId: string, index: number) => {
  const metadata = parseObject(stage?.metadata);
  return [
    ownerModuleId,
    ownerRecordId,
    normalizeText(stage?.process_group_id || metadata?.process_group_id || stage?.source_template_id || metadata?.source_template_id),
    normalizeText(stage?.id || stage?.template_stage_id || metadata?.template_stage_id || stage?.process_node_key || metadata?.process_node_key),
    String(Number(stage?.sort_order || index + 1)),
  ].join(':');
};

const runWithConcurrency = async <T>(items: T[], limit: number, worker: (item: T) => Promise<void>) => {
  let index = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current]);
    }
  });
  await Promise.all(runners);
};

export const fetchLinkedProcessDraftStagesForRecord = async (
  supabaseClient: any,
  moduleId: string,
  recordId: string,
  options?: {
    excludeModuleId?: string | null;
    excludeRecordId?: string | null;
    limitPerModule?: number;
    sourceModuleIds?: string[] | null;
    allowGlobalScan?: boolean;
  },
) => {
  const normalizedModuleId = normalizeText(moduleId);
  const normalizedRecordId = normalizeText(recordId);
  if (!supabaseClient || !normalizedModuleId || !normalizedRecordId) return [];

  const sourceModuleIds = normalizeList(options?.sourceModuleIds);
  if (sourceModuleIds.length === 0 && options?.allowGlobalScan !== true) return [];

  const cacheKey = [
    'linked-drafts',
    normalizedModuleId,
    normalizedRecordId,
    normalizeText(options?.excludeModuleId),
    normalizeText(options?.excludeRecordId),
    sourceModuleIds.join(','),
    options?.allowGlobalScan === true ? 'global' : 'targeted',
    String(Math.max(1, Math.min(Number(options?.limitPerModule || 12), 40))),
  ].join(':');
  const cached = linkedDraftCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < LINKED_DRAFT_CACHE_TTL_MS) {
    return cached.stages;
  }
  const existingPromise = linkedDraftInFlight.get(cacheKey);
  if (existingPromise) return existingPromise;

  const specs = Object.values(MODULES)
    .map((module: any) => {
      const sourceModuleId = normalizeText(module?.id);
      const tableName = normalizeText(module?.table || sourceModuleId);
      const fieldKey = getDraftFieldKey(module);
      if (LINKED_DRAFT_LOOKUP_EXCLUDED_TABLES.has(tableName)) return null;
      if (sourceModuleIds.length > 0 && !sourceModuleIds.includes(sourceModuleId)) return null;
      if (!sourceModuleId || !tableName || !fieldKey) return null;
      return { moduleId: sourceModuleId, tableName, fieldKey };
    })
    .filter(Boolean) as Array<{ moduleId: string; tableName: string; fieldKey: string }>;

  const found = new Map<string, Record<string, any>>();
  const limitPerModule = Math.max(1, Math.min(Number(options?.limitPerModule || 12), 40));
  const containsPayload = [{ process_link_map: { [normalizedModuleId]: normalizedRecordId } }];
  const metadataContainsPayload = [{ metadata: { process_link_map: { [normalizedModuleId]: normalizedRecordId } } }];

  const lookupPromise = (async () => {
    await runWithConcurrency(specs, 4, async (spec) => {
      if (
        normalizeText(options?.excludeModuleId) === spec.moduleId
        && normalizeText(options?.excludeRecordId) === normalizedRecordId
      ) return;
      const specKey = `${spec.tableName}:${spec.fieldKey}`;
      const unsupportedAt = unsupportedLinkedDraftSpecs.get(specKey);
      if (unsupportedAt && Date.now() - unsupportedAt < LINKED_DRAFT_UNSUPPORTED_TTL_MS) return;

      const queryRows = async (payload: any[]) => {
        const { data, error } = await supabaseClient
          .from(spec.tableName)
          .select(`id, process_template_id, ${spec.fieldKey}`)
          .filter(spec.fieldKey, 'cs', JSON.stringify(payload))
          .limit(limitPerModule);
        if (error) {
          if (isMissingColumnLikeError(error)) unsupportedLinkedDraftSpecs.set(specKey, Date.now());
          return [];
        }
        if (!Array.isArray(data)) return [];
        return data;
      };

      const rows = [
        ...await queryRows(containsPayload),
        ...await queryRows(metadataContainsPayload),
      ];

      rows.forEach((row: any) => {
        const ownerRecordId = normalizeText(row?.id);
        const stages = Array.isArray(row?.[spec.fieldKey]) ? row[spec.fieldKey] : [];
        stages.forEach((stage: any, index: number) => {
          if (!stage || typeof stage !== 'object') return;
          if (!stageMatchesRecord(stage, normalizedModuleId, normalizedRecordId)) return;
          const key = getStageDedupeKey(stage, spec.moduleId, ownerRecordId, index);
          found.set(key, {
            ...stage,
            __process_v2_linked_owner_module_id: spec.moduleId,
            __process_v2_linked_owner_record_id: ownerRecordId,
            __process_v2_linked_owner_field_key: spec.fieldKey,
          });
        });
      });
    });

    const stages = Array.from(found.values());
    linkedDraftCache.set(cacheKey, { savedAt: Date.now(), stages });
    return stages;
  })();

  linkedDraftInFlight.set(cacheKey, lookupPromise);
  try {
    return await lookupPromise;
  } finally {
    linkedDraftInFlight.delete(cacheKey);
  }
};

export const clearLinkedProcessDraftLookupCaches = () => {
  linkedDraftCache.clear();
  linkedDraftInFlight.clear();
  unsupportedLinkedDraftSpecs.clear();
};
