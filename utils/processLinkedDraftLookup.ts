import { MODULES } from '../moduleRegistry';
import { parseProcessLinkMap } from './processTargets';

const PROCESS_DRAFT_FIELD_KEYS = [
  'execution_process_draft',
  'marketing_process_draft',
  'production_stages_draft',
  'process_draft',
  'sub_process_draft',
] as const;

const LINKED_DRAFT_CACHE_TTL_MS = 30_000;
const linkedDraftCache = new Map<string, { savedAt: number; stages: Record<string, any>[] }>();

const normalizeText = (value: unknown) => String(value || '').trim();

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
  },
) => {
  const normalizedModuleId = normalizeText(moduleId);
  const normalizedRecordId = normalizeText(recordId);
  if (!supabaseClient || !normalizedModuleId || !normalizedRecordId) return [];

  const cacheKey = `linked-drafts:${normalizedModuleId}:${normalizedRecordId}`;
  const cached = linkedDraftCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < LINKED_DRAFT_CACHE_TTL_MS) {
    return cached.stages;
  }

  const specs = Object.values(MODULES)
    .map((module: any) => {
      const sourceModuleId = normalizeText(module?.id);
      const tableName = normalizeText(module?.table || sourceModuleId);
      const fieldKey = getDraftFieldKey(module);
      if (!sourceModuleId || !tableName || !fieldKey) return null;
      return { moduleId: sourceModuleId, tableName, fieldKey };
    })
    .filter(Boolean) as Array<{ moduleId: string; tableName: string; fieldKey: string }>;

  const found = new Map<string, Record<string, any>>();
  const limitPerModule = Math.max(1, Math.min(Number(options?.limitPerModule || 12), 40));
  const containsPayload = [{ process_link_map: { [normalizedModuleId]: normalizedRecordId } }];
  const metadataContainsPayload = [{ metadata: { process_link_map: { [normalizedModuleId]: normalizedRecordId } } }];

  await runWithConcurrency(specs, 4, async (spec) => {
    if (
      normalizeText(options?.excludeModuleId) === spec.moduleId
      && normalizeText(options?.excludeRecordId) === normalizedRecordId
    ) return;

    const queryRows = async (payload: any[]) => {
      const { data, error } = await supabaseClient
        .from(spec.tableName)
        .select(`id, process_template_id, ${spec.fieldKey}`)
        .contains(spec.fieldKey, payload)
        .limit(limitPerModule);
      if (error || !Array.isArray(data)) return [];
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
        });
      });
    });
  });

  const stages = Array.from(found.values());
  linkedDraftCache.set(cacheKey, { savedAt: Date.now(), stages });
  return stages;
};
