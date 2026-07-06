import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';

const normalizeText = (value: unknown) => String(value || '').trim();
const normalizeProcessReferenceId = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return '';
  return raw.replace(/^(process_run_stage|process_run|process_template_stage|process_template|task)[_:]/i, '').trim();
};
const RECYCLE_BIN_CHECK_CACHE_TTL_MS = 5 * 60_000;

type RecycleBinCheckCacheEntry = {
  savedAt: number;
  value?: boolean;
  promise?: Promise<boolean>;
};

const recycleBinCheckCache = new Map<string, RecycleBinCheckCacheEntry>();

export const clearRecycleBinGuardCache = () => {
  recycleBinCheckCache.clear();
};

const queryRecycleBinRecord = async (sourceTable: string, recordId: string) => {
  try {
    const { data, error } = await supabase
      .from('recycle_bin_records')
      .select('id')
      .eq('source_table', sourceTable)
      .eq('source_record_id', recordId)
      .maybeSingle();
    if (error) return false;
    return Boolean((data as any)?.id);
  } catch {
    return false;
  }
};

export const primeRecycleBinGuardCache = async (
  entries: Array<{ moduleId?: string | null; sourceTable?: string | null; recordId?: string | null }>
) => {
  const bySourceTable = entries.reduce<Record<string, Set<string>>>((acc, entry) => {
    const sourceTable = normalizeText(entry?.sourceTable) || getRecycleBinSourceTableForModule(entry?.moduleId);
    const recordId = normalizeText(entry?.recordId);
    if (!sourceTable || !recordId) return acc;
    if (!acc[sourceTable]) acc[sourceTable] = new Set<string>();
    acc[sourceTable].add(recordId);
    return acc;
  }, {});

  await Promise.all(Object.entries(bySourceTable).map(async ([sourceTable, recordIds]) => {
    const ids = Array.from(recordIds);
    if (ids.length === 0) return;
    const now = Date.now();
    const missingIds = ids.filter((recordId) => {
      const cached = recycleBinCheckCache.get(`${sourceTable}:${recordId}`);
      return !cached || now - cached.savedAt >= RECYCLE_BIN_CHECK_CACHE_TTL_MS;
    });
    if (missingIds.length === 0) return;

    missingIds.forEach((recordId) => {
      recycleBinCheckCache.set(`${sourceTable}:${recordId}`, { savedAt: now, value: false });
    });

    try {
      const { data, error } = await supabase
        .from('recycle_bin_records')
        .select('source_record_id')
        .eq('source_table', sourceTable)
        .in('source_record_id', missingIds);
      if (error) return;
      (Array.isArray(data) ? data : []).forEach((row: any) => {
        const recordId = normalizeText(row?.source_record_id);
        if (recordId) {
          recycleBinCheckCache.set(`${sourceTable}:${recordId}`, { savedAt: Date.now(), value: true });
        }
      });
    } catch {
      // The per-record guard stays fail-open for recycle lookups so automations do not break on a transient UI read.
    }
  }));
};

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

export const getRecycleBinSourceTableForModule = (moduleId?: string | null) => {
  const normalizedModuleId = normalizeText(moduleId);
  return normalizedModuleId ? (MODULES[normalizedModuleId]?.table || normalizedModuleId) : '';
};

export const isDeletedLikeRecord = (record?: Record<string, any> | null) => {
  if (!record || typeof record !== 'object') return false;
  return Boolean(
    record.deleted_at
    || record.deletedAt
    || record.removed_at
    || record.archived_at
    || record.is_deleted === true
    || record.deleted === true
    || record._deleted === true
  );
};

export const isRecordInRecycleBin = async ({
  moduleId,
  sourceTable,
  recordId,
  record,
}: {
  moduleId?: string | null;
  sourceTable?: string | null;
  recordId?: string | null;
  record?: Record<string, any> | null;
}) => {
  const normalizedSourceTable = normalizeText(sourceTable) || getRecycleBinSourceTableForModule(moduleId);
  const normalizedRecordId = normalizeText(recordId || record?.id);
  if (!normalizedSourceTable || !normalizedRecordId) return false;
  const cacheKey = `${normalizedSourceTable}:${normalizedRecordId}`;
  const cached = recycleBinCheckCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < RECYCLE_BIN_CHECK_CACHE_TTL_MS) {
    if (typeof cached.value === 'boolean') return cached.value;
    if (cached.promise) return cached.promise;
  }

  const promise = queryRecycleBinRecord(normalizedSourceTable, normalizedRecordId);
  recycleBinCheckCache.set(cacheKey, { savedAt: Date.now(), promise });
  try {
    const value = await promise;
    recycleBinCheckCache.set(cacheKey, { savedAt: Date.now(), value });
    return value;
  } catch {
    recycleBinCheckCache.set(cacheKey, { savedAt: Date.now(), value: false });
    return false;
  }
};

export const isRecordInRecycleBinUncached = async ({
  moduleId,
  sourceTable,
  recordId,
  record,
}: {
  moduleId?: string | null;
  sourceTable?: string | null;
  recordId?: string | null;
  record?: Record<string, any> | null;
}) => {
  const normalizedSourceTable = normalizeText(sourceTable) || getRecycleBinSourceTableForModule(moduleId);
  const normalizedRecordId = normalizeText(recordId || record?.id);
  if (!normalizedSourceTable || !normalizedRecordId) return false;
  return queryRecycleBinRecord(normalizedSourceTable, normalizedRecordId);
};

const getTaskProcessIds = (task?: Record<string, any> | null) => {
  const recurrence = parseObject(task?.recurrence_info);
  return {
    processRunId: normalizeProcessReferenceId(task?.process_run_id || recurrence?.process_run_id),
    processRunStageId: normalizeProcessReferenceId(task?.process_run_stage_id || recurrence?.process_run_stage_id),
  };
};

export const shouldSkipRecordForAutomation = async ({
  moduleId,
  sourceTable,
  record,
}: {
  moduleId?: string | null;
  sourceTable?: string | null;
  record?: Record<string, any> | null;
}) => {
  if (!record || typeof record !== 'object') return true;
  if (isDeletedLikeRecord(record)) return true;

  const normalizedModuleId = normalizeText(moduleId);
  const normalizedSourceTable = normalizeText(sourceTable) || getRecycleBinSourceTableForModule(normalizedModuleId);
  if (await isRecordInRecycleBin({ moduleId: normalizedModuleId, sourceTable: normalizedSourceTable, record })) {
    return true;
  }

  if (normalizedModuleId === 'tasks' || normalizedSourceTable === 'tasks') {
    const { processRunId, processRunStageId } = getTaskProcessIds(record);
    if (processRunId && await isRecordInRecycleBin({ sourceTable: 'process_runs', recordId: processRunId })) {
      return true;
    }
    if (processRunStageId && await isRecordInRecycleBin({ sourceTable: 'process_run_stages', recordId: processRunStageId })) {
      return true;
    }
  }

  return false;
};
