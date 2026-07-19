import { getAppRuntimeCached } from './appRuntimeCache';

type ProcessRuntimeBatchRow = {
  record_id?: string | null;
  runs?: any[];
  stages?: any[];
};

type ProcessRuntimeSnapshot = {
  runs: any[];
  stages: any[];
  isSummary?: boolean;
};

export type ProcessRuntimeLoadMode = 'full' | 'summary';

type BatchRequest = {
  recordId: string;
  resolve: (value: ProcessRuntimeSnapshot) => void;
  reject: (error: unknown) => void;
};

const PROCESS_RUNTIME_TTL_MS = 30_000;
const batchQueues = new Map<string, BatchRequest[]>();
const batchTimers = new Map<string, ReturnType<typeof setTimeout>>();

const normalizeText = (value: unknown) => String(value || '').trim();

const buildCacheKey = (moduleId: string, recordId: string, mode: ProcessRuntimeLoadMode) =>
  `process-runtime:${mode}:${normalizeText(moduleId)}:${normalizeText(recordId)}`;

const buildQueueKey = (moduleId: string, mode: ProcessRuntimeLoadMode) =>
  `${normalizeText(moduleId)}:${mode}`;

const normalizeSnapshot = (value: unknown, isSummary = false): ProcessRuntimeSnapshot => {
  const row = value && typeof value === 'object' ? value as ProcessRuntimeBatchRow : {};
  return {
    runs: Array.isArray(row?.runs) ? row.runs : [],
    stages: Array.isArray(row?.stages) ? row.stages : [],
    isSummary,
  };
};

const isMissingBatchRuntimeRpcError = (error: any, functionName: string) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    code === '42883'
    || code === 'PGRST202'
    || code === 'PGRST204'
    || message.includes(functionName)
    || message.includes('could not find the function')
  );
};

const readRows = (data: unknown) => (
  Array.isArray(data)
    ? data
    : (data && typeof data === 'object' && Array.isArray((data as any).records) ? (data as any).records : [])
);

const flushBatchQueue = async (
  supabaseClient: any,
  moduleId: string,
  mode: ProcessRuntimeLoadMode,
) => {
  const queueKey = buildQueueKey(moduleId, mode);
  const queue = batchQueues.get(queueKey) || [];
  batchQueues.delete(queueKey);
  batchTimers.delete(queueKey);
  if (queue.length === 0) return;

  const recordIds = Array.from(new Set(queue.map((item) => normalizeText(item.recordId)).filter(Boolean)));
  const snapshots = new Map<string, ProcessRuntimeSnapshot>();
  const rpcName = mode === 'summary'
    ? 'get_process_runtime_summary_batch_for_records'
    : 'get_process_runtime_batch_for_records';

  try {
    const { data, error } = await supabaseClient.rpc(rpcName, {
      p_module_id: moduleId,
      p_record_ids: recordIds,
    });
    if (error) throw error;

    readRows(data).forEach((row: any) => {
      const recordId = normalizeText(row?.record_id);
      if (recordId) snapshots.set(recordId, normalizeSnapshot(row, mode === 'summary'));
    });
  } catch (error) {
    if (!isMissingBatchRuntimeRpcError(error, rpcName)) {
      queue.forEach((item) => item.reject(error));
      return;
    }

    try {
      if (mode === 'summary') {
        // تا زمان اعمال migration، نمایش ستون‌ها با RPC کامل قبلی سازگار می‌ماند.
        const { data, error: fallbackError } = await supabaseClient.rpc('get_process_runtime_batch_for_records', {
          p_module_id: moduleId,
          p_record_ids: recordIds,
        });
        if (fallbackError) throw fallbackError;
        readRows(data).forEach((row: any) => {
          const recordId = normalizeText(row?.record_id);
          if (recordId) snapshots.set(recordId, normalizeSnapshot(row));
        });
      } else {
        await Promise.all(recordIds.map(async (recordId) => {
          const { data, error: fallbackError } = await supabaseClient.rpc('get_process_runtime_for_record', {
            p_module_id: moduleId,
            p_record_id: recordId,
          });
          if (fallbackError) throw fallbackError;
          snapshots.set(recordId, normalizeSnapshot(data));
        }));
      }
    } catch (fallbackError) {
      queue.forEach((item) => item.reject(fallbackError));
      return;
    }
  }

  queue.forEach((item) => {
    const cacheKey = buildCacheKey(moduleId, item.recordId, mode);
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
  options?: { force?: boolean; mode?: ProcessRuntimeLoadMode }
): Promise<ProcessRuntimeSnapshot> => {
  const normalizedModuleId = normalizeText(moduleId);
  const normalizedRecordId = normalizeText(recordId);
  if (!normalizedModuleId || !normalizedRecordId) {
    return { runs: [], stages: [] };
  }

  const mode = options?.mode || 'full';
  const cacheKey = buildCacheKey(normalizedModuleId, normalizedRecordId, mode);
  const queueKey = buildQueueKey(normalizedModuleId, mode);
  const enqueue = () => new Promise<ProcessRuntimeSnapshot>((resolve, reject) => {
    const queue = batchQueues.get(queueKey) || [];
    queue.push({ recordId: normalizedRecordId, resolve, reject });
    batchQueues.set(queueKey, queue);
    if (!batchTimers.has(queueKey)) {
      batchTimers.set(
        queueKey,
        setTimeout(() => { void flushBatchQueue(supabaseClient, normalizedModuleId, mode); }, 0),
      );
    }
  });

  if (options?.force) return enqueue();

  return getAppRuntimeCached({
    key: cacheKey,
    ttlMs: PROCESS_RUNTIME_TTL_MS,
    loader: enqueue,
  });
};
