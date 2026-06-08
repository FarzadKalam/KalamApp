import { getAppRuntimeCached } from './appRuntimeCache';

type ProcessRuntimeBatchRow = {
  record_id?: string | null;
  runs?: any[];
  stages?: any[];
};

type ProcessRuntimeSnapshot = {
  runs: any[];
  stages: any[];
};

type BatchRequest = {
  recordId: string;
  resolve: (value: ProcessRuntimeSnapshot) => void;
  reject: (error: unknown) => void;
  force?: boolean;
};

const PROCESS_RUNTIME_TTL_MS = 30_000;
const batchQueues = new Map<string, BatchRequest[]>();
const batchTimers = new Map<string, ReturnType<typeof setTimeout>>();

const normalizeText = (value: unknown) => String(value || '').trim();

const buildCacheKey = (moduleId: string, recordId: string) =>
  `process-runtime:${normalizeText(moduleId)}:${normalizeText(recordId)}`;

const normalizeSnapshot = (value: unknown): ProcessRuntimeSnapshot => {
  const row = value && typeof value === 'object' ? value as ProcessRuntimeBatchRow : {};
  return {
    runs: Array.isArray(row?.runs) ? row.runs : [],
    stages: Array.isArray(row?.stages) ? row.stages : [],
  };
};

const isMissingBatchRuntimeRpcError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    code === '42883'
    || code === 'PGRST202'
    || code === 'PGRST204'
    || message.includes('get_process_runtime_batch_for_records')
    || message.includes('could not find the function')
  );
};

const flushBatchQueue = async (supabaseClient: any, moduleId: string) => {
  const queue = batchQueues.get(moduleId) || [];
  batchQueues.delete(moduleId);
  batchTimers.delete(moduleId);
  if (queue.length === 0) return;

  const recordIds = Array.from(new Set(queue.map((item) => normalizeText(item.recordId)).filter(Boolean)));
  const snapshots = new Map<string, ProcessRuntimeSnapshot>();

  try {
    const { data, error } = await supabaseClient.rpc('get_process_runtime_batch_for_records', {
      p_module_id: moduleId,
      p_record_ids: recordIds,
    });
    if (error) throw error;

    const rows = Array.isArray(data)
      ? data
      : (data && typeof data === 'object' && Array.isArray((data as any).records) ? (data as any).records : []);

    (rows || []).forEach((row: any) => {
      const recordId = normalizeText(row?.record_id);
      if (!recordId) return;
      snapshots.set(recordId, normalizeSnapshot(row));
    });
  } catch (error) {
    if (!isMissingBatchRuntimeRpcError(error)) {
      queue.forEach((item) => item.reject(error));
      return;
    }

    try {
      await Promise.all(recordIds.map(async (recordId) => {
        const { data, error: fallbackError } = await supabaseClient.rpc('get_process_runtime_for_record', {
          p_module_id: moduleId,
          p_record_id: recordId,
        });
        if (fallbackError) throw fallbackError;
        snapshots.set(recordId, normalizeSnapshot(data));
      }));
    } catch (fallbackError) {
      queue.forEach((item) => item.reject(fallbackError));
      return;
    }
  }

  queue.forEach((item) => {
    const cacheKey = buildCacheKey(moduleId, item.recordId);
    const snapshot = snapshots.get(normalizeText(item.recordId)) || { runs: [], stages: [] };
    void getAppRuntimeCached({
      key: cacheKey,
      ttlMs: PROCESS_RUNTIME_TTL_MS,
      force: true,
      loader: async () => snapshot,
    });
    item.resolve(snapshot);
  });
};

export const fetchProcessRuntimeBatchForRecord = async (
  supabaseClient: any,
  moduleId: string,
  recordId: string,
  options?: { force?: boolean }
): Promise<ProcessRuntimeSnapshot> => {
  const normalizedModuleId = normalizeText(moduleId);
  const normalizedRecordId = normalizeText(recordId);
  if (!normalizedModuleId || !normalizedRecordId) {
    return { runs: [], stages: [] };
  }

  const cacheKey = buildCacheKey(normalizedModuleId, normalizedRecordId);
  if (options?.force) {
    return new Promise<ProcessRuntimeSnapshot>((resolve, reject) => {
      const queue = batchQueues.get(normalizedModuleId) || [];
      queue.push({ recordId: normalizedRecordId, resolve, reject, force: true });
      batchQueues.set(normalizedModuleId, queue);
      if (!batchTimers.has(normalizedModuleId)) {
        batchTimers.set(
          normalizedModuleId,
          setTimeout(() => { void flushBatchQueue(supabaseClient, normalizedModuleId); }, 0),
        );
      }
    });
  }

  return getAppRuntimeCached({
    key: cacheKey,
    ttlMs: PROCESS_RUNTIME_TTL_MS,
    loader: () => new Promise<ProcessRuntimeSnapshot>((resolve, reject) => {
      const queue = batchQueues.get(normalizedModuleId) || [];
      queue.push({ recordId: normalizedRecordId, resolve, reject });
      batchQueues.set(normalizedModuleId, queue);
      if (!batchTimers.has(normalizedModuleId)) {
        batchTimers.set(
          normalizedModuleId,
          setTimeout(() => { void flushBatchQueue(supabaseClient, normalizedModuleId); }, 0),
        );
      }
    }),
  });
};
