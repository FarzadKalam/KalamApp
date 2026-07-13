import { fetchAssigneeDirectory } from './referenceData';

type ProcessAuditRef = { moduleId: string; recordId: string };

type ProcessAuditCard = {
  mode: 'template' | 'run';
  id: string;
  auditSource?: any;
  lanes: Array<{ title?: string; stages: Array<{ source?: any }> }>;
};

const normalizeText = (value: unknown) => String(value || '').trim();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROCESS_INTERNAL_MODULE_IDS = new Set([
  'process_templates',
  'process_template_stages',
  'process_runs',
  'process_run_stages',
  'tasks',
]);
const ROOT_PROCESS_FIELD_KEYS = new Set([
  'process_template_id',
  'execution_process_draft',
  'marketing_process_draft',
  'production_stages_draft',
  'process_draft',
  'sub_process_draft',
]);

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

const addRef = (refs: Map<string, ProcessAuditRef>, moduleId: unknown, recordId: unknown) => {
  const normalizedModuleId = normalizeText(moduleId);
  const normalizedRecordId = normalizeText(recordId);
  if (!/^[a-z0-9_]+$/i.test(normalizedModuleId) || !UUID_RE.test(normalizedRecordId)) return;
  refs.set(`${normalizedModuleId}:${normalizedRecordId}`, {
    moduleId: normalizedModuleId,
    recordId: normalizedRecordId,
  });
};

export const collectProcessAuditRefs = (
  item: ProcessAuditCard,
  root?: { moduleId?: string | null; recordId?: string | null },
) => {
  const refs = new Map<string, ProcessAuditRef>();
  addRef(refs, root?.moduleId, root?.recordId);
  addRef(refs, item.mode === 'template' ? 'process_templates' : 'process_runs', item.id);
  item.lanes.forEach((lane) => lane.stages.forEach((stage) => {
    const source = stage?.source && typeof stage.source === 'object' ? stage.source : {};
    const metadata = parseObject(source?.metadata);
    const sourceStage = source?.source_stage && typeof source.source_stage === 'object' ? source.source_stage : {};
    const sourceMetadata = parseObject(sourceStage?.metadata);
    addRef(
      refs,
      'process_template_stages',
      source?.template_stage_id || metadata?.template_stage_id || sourceStage?.template_stage_id || (item.mode === 'template' ? source?.id : null),
    );
    addRef(
      refs,
      'process_run_stages',
      source?.process_run_stage_id || source?.run_stage_id || metadata?.process_run_stage_id || sourceStage?.process_run_stage_id || (item.mode === 'run' && source?.process_run_id ? source?.id : null),
    );
    addRef(refs, 'tasks', source?.task_id || source?.process_task_id || metadata?.task_id || sourceStage?.task_id || sourceMetadata?.task_id);
  }));
  return Array.from(refs.values());
};

const toTime = (value: unknown) => {
  const parsed = value ? new Date(String(value)).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

export const fetchProcessAudit = async (
  supabaseClient: any,
  item: ProcessAuditCard,
  root?: { moduleId?: string | null; recordId?: string | null },
) => {
  const refs = collectProcessAuditRefs(item, root);
  let rows: any[] = [];
  if (refs.length > 0) {
    const recordIdsByModule = new Map<string, string[]>();
    refs.forEach((ref) => {
      recordIdsByModule.set(ref.moduleId, [
        ...(recordIdsByModule.get(ref.moduleId) || []),
        ref.recordId,
      ]);
    });
    const batches = await Promise.all(Array.from(recordIdsByModule.entries()).map(async ([moduleId, recordIds]) => {
      const { data, error } = await supabaseClient
        .from('changelogs')
        .select('id,module_id,record_id,action,field_name,old_value,new_value,user_id,record_title,metadata,created_at')
        .eq('module_id', moduleId)
        .in('record_id', Array.from(new Set(recordIds)))
        .order('created_at', { ascending: false })
        .limit(120);
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    }));
    const rootModuleId = normalizeText(root?.moduleId);
    const rootRecordId = normalizeText(root?.recordId);
    rows = batches
      .flat()
      .filter((row) => {
        const isExternalRootRow = rootModuleId
          && rootRecordId
          && !PROCESS_INTERNAL_MODULE_IDS.has(rootModuleId)
          && normalizeText(row?.module_id) === rootModuleId
          && normalizeText(row?.record_id) === rootRecordId;
        if (!isExternalRootRow) return true;
        if (ROOT_PROCESS_FIELD_KEYS.has(normalizeText(row?.field_name))) return true;
        const metadataText = JSON.stringify(parseObject(row?.metadata)).toLowerCase();
        return metadataText.includes('process') || metadataText.includes('فرآیند') || metadataText.includes('فرایند');
      })
      .sort((left, right) => toTime(right?.created_at) - toTime(left?.created_at))
      .slice(0, 120);
  }

  const sources = [
    item.auditSource,
    ...item.lanes.flatMap((lane) => lane.stages.map((stage) => stage?.source)),
  ].filter((source) => source && typeof source === 'object');
  const createdSource = sources
    .filter((source) => toTime(source?.created_at) > 0)
    .sort((left, right) => toTime(left?.created_at) - toTime(right?.created_at))[0] || {};
  const latestSource = sources
    .filter((source) => toTime(source?.updated_at || source?.created_at) > 0)
    .sort((left, right) => toTime(right?.updated_at || right?.created_at) - toTime(left?.updated_at || left?.created_at))[0] || {};
  const latestLog = rows[0] || null;
  const earliestLog = rows.length > 0 ? rows[rows.length - 1] : null;
  const latestSourceTime = toTime(latestSource?.updated_at || latestSource?.created_at);
  const latestLogTime = toTime(latestLog?.created_at);
  const useLatestLog = latestLogTime >= latestSourceTime;
  const userIds = Array.from(new Set([
    createdSource?.created_by,
    createdSource?.user_id,
    earliestLog?.user_id,
    latestSource?.updated_by,
    latestLog?.user_id,
    ...rows.map((row) => row?.user_id),
  ].map(normalizeText).filter(Boolean)));
  const userNameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const directory = await fetchAssigneeDirectory(supabaseClient);
    directory.users.forEach((user) => {
      if (!userIds.includes(user.id)) return;
      userNameMap.set(user.id, user.display_name || user.full_name || 'کاربر سیستم');
    });
  }
  const createdById = normalizeText(createdSource?.created_by || createdSource?.user_id || earliestLog?.user_id);
  const updatedById = normalizeText(useLatestLog ? latestLog?.user_id : latestSource?.updated_by);
  return {
    refs,
    rows,
    authorNameMap: Object.fromEntries(userNameMap.entries()),
    createdAt: createdSource?.created_at || item.auditSource?.created_at || earliestLog?.created_at || null,
    createdBy: normalizeText(item.auditSource?.created_by_name)
      || userNameMap.get(createdById)
      || 'کاربر سیستم',
    updatedAt: useLatestLog
      ? latestLog?.created_at
      : (latestSource?.updated_at || latestSource?.created_at || item.auditSource?.updated_at || null),
    updatedBy: userNameMap.get(updatedById)
      || normalizeText(latestSource?.updated_by_name || item.auditSource?.updated_by_name)
      || 'کاربر سیستم',
  };
};
