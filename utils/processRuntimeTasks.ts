import { getAppRuntimeCached } from './appRuntimeCache';

export type ProcessRuntimeTaskContext = {
  runs?: any[];
  stages?: any[];
};

type TaskRequest = {
  recordId: string;
  context: ProcessRuntimeTaskContext;
  resolve: (tasks: any[]) => void;
  reject: (error: unknown) => void;
};

const TASK_CACHE_TTL_MS = 30_000;
const queues = new Map<string, TaskRequest[]>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

const normalizeText = (value: unknown) => String(value || '').trim();

const normalizeUuid = (value: unknown) => {
  const text = normalizeText(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : '';
};

const cacheKey = (moduleId: string, recordId: string) =>
  `process-runtime-tasks:${moduleId}:${recordId}`;

const isMissingBatchRpc = (error: any) => {
  const code = normalizeText(error?.code).toUpperCase();
  const message = normalizeText(error?.message || error?.details || error?.hint).toLowerCase();
  return code === '42883'
    || code === 'PGRST202'
    || code === 'PGRST204'
    || message.includes('get_process_runtime_tasks_batch_for_records')
    || message.includes('could not find the function');
};

const collectContextIds = (context: ProcessRuntimeTaskContext) => ({
  taskIds: Array.from(new Set((context.stages || []).map((stage) => normalizeUuid(stage?.task_id)).filter(Boolean))),
  runIds: Array.from(new Set((context.runs || []).map((run) => normalizeUuid(run?.id)).filter(Boolean))),
  stageIds: Array.from(new Set((context.stages || []).flatMap((stage) => [
    normalizeUuid(stage?.id),
    normalizeUuid(stage?.process_run_stage_id),
  ]).filter(Boolean))),
});

const fetchSingle = async (
  supabaseClient: any,
  moduleId: string,
  request: TaskRequest,
) => {
  const ids = collectContextIds(request.context);
  const { data, error } = await supabaseClient.rpc('get_process_runtime_tasks_for_record', {
    p_module_id: moduleId,
    p_record_id: request.recordId,
    p_task_ids: ids.taskIds,
    p_process_run_ids: ids.runIds,
    p_process_run_stage_ids: ids.stageIds,
  });
  if (error) throw error;
  if (Array.isArray(data)) return data;
  return data && typeof data === 'object' && Array.isArray(data.tasks) ? data.tasks : [];
};

const flush = async (supabaseClient: any, moduleId: string) => {
  const queue = queues.get(moduleId) || [];
  queues.delete(moduleId);
  timers.delete(moduleId);
  if (queue.length === 0) return;

  const uniqueRecordIds = Array.from(new Set(queue.map((item) => item.recordId)));
  const tasksByRecord = new Map<string, any[]>();
  try {
    const { data, error } = await supabaseClient.rpc('get_process_runtime_tasks_batch_for_records', {
      p_module_id: moduleId,
      p_record_ids: uniqueRecordIds,
    });
    if (error) throw error;
    const rows = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray(data.records) ? data.records : [];
    rows.forEach((row: any) => {
      const recordId = normalizeText(row?.record_id);
      if (recordId) tasksByRecord.set(recordId, Array.isArray(row?.tasks) ? row.tasks : []);
    });
  } catch (error) {
    if (!isMissingBatchRpc(error)) {
      queue.forEach((item) => item.reject(error));
      return;
    }
    try {
      await Promise.all(queue.map(async (item) => {
        tasksByRecord.set(item.recordId, await fetchSingle(supabaseClient, moduleId, item));
      }));
    } catch (fallbackError) {
      queue.forEach((item) => item.reject(fallbackError));
      return;
    }
  }

  queue.forEach((item) => item.resolve(tasksByRecord.get(item.recordId) || []));
};

export const fetchProcessRuntimeTasksForRecord = (
  supabaseClient: any,
  moduleId: string,
  recordId: string,
  context: ProcessRuntimeTaskContext,
  options?: { force?: boolean },
): Promise<any[]> => {
  const normalizedModuleId = normalizeText(moduleId);
  const normalizedRecordId = normalizeUuid(recordId);
  if (!normalizedModuleId || !normalizedRecordId) return Promise.resolve([]);

  return getAppRuntimeCached({
    key: cacheKey(normalizedModuleId, normalizedRecordId),
    ttlMs: TASK_CACHE_TTL_MS,
    force: options?.force,
    loader: () => new Promise<any[]>((resolve, reject) => {
      const queue = queues.get(normalizedModuleId) || [];
      queue.push({ recordId: normalizedRecordId, context, resolve, reject });
      queues.set(normalizedModuleId, queue);
      if (!timers.has(normalizedModuleId)) {
        timers.set(normalizedModuleId, setTimeout(() => {
          void flush(supabaseClient, normalizedModuleId);
        }, 0));
      }
    }),
  });
};
