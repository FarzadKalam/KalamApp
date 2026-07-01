const DELETED_STAGE_MARK_TTL_MS = 30_000;

type DeletedStageMarkStatus = {
  deleted: boolean;
  savedAt: number;
};

type DeletedStageMarkRequest = {
  ids: string[];
  resolve: (value: Map<string, boolean>) => void;
  reject: (error: unknown) => void;
};

const deletedStageMarkCache = new Map<string, DeletedStageMarkStatus>();
const deletedStageMarkQueue: DeletedStageMarkRequest[] = [];
let deletedStageMarkFlushTimer: ReturnType<typeof setTimeout> | null = null;

const normalizeText = (value: unknown) => String(value || '').trim();
const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeDbUuid = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return '';
  const stripped = raw.replace(/^(process_run_stage|process_run|process_template_stage|process_template|task|user|role)[_:]/i, '');
  return UUID_LIKE_RE.test(stripped) ? stripped : '';
};

const parseObject = (value: unknown) => {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, any>;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : null;
  } catch {
    return null;
  }
};

const isFreshStatus = (status?: DeletedStageMarkStatus | null) =>
  Boolean(status && Date.now() - status.savedAt < DELETED_STAGE_MARK_TTL_MS);

const buildDeletedStageMarkMap = (ids: string[]) => {
  const result = new Map<string, boolean>();
  ids.forEach((id) => {
    const status = deletedStageMarkCache.get(id);
    result.set(id, Boolean(status?.deleted));
  });
  return result;
};

const flushDeletedStageMarkQueue = async (supabaseClient: any) => {
  const queue = deletedStageMarkQueue.splice(0, deletedStageMarkQueue.length);
  deletedStageMarkFlushTimer = null;
  if (queue.length === 0) return;

  const ids = Array.from(new Set(queue.flatMap((item) => item.ids).map(normalizeDbUuid).filter(Boolean)));
  if (ids.length === 0) {
    queue.forEach((item) => item.resolve(new Map()));
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('process_v2_deleted_stage_marks')
      .select('process_run_stage_id')
      .in('process_run_stage_id', ids);
    if (error) throw error;

    const deletedIds = new Set(
      (Array.isArray(data) ? data : [])
        .map((row: any) => normalizeDbUuid(row?.process_run_stage_id))
        .filter(Boolean),
    );
    const savedAt = Date.now();

    ids.forEach((id) => {
      deletedStageMarkCache.set(id, {
        deleted: deletedIds.has(id),
        savedAt,
      });
    });

    queue.forEach((item) => {
      item.resolve(buildDeletedStageMarkMap(item.ids));
    });
  } catch (error) {
    queue.forEach((item) => item.reject(error));
  }
};

export const fetchDeletedProcessRunStageMarkMap = async (
  supabaseClient: any,
  ids: string[],
  options?: { force?: boolean },
) => {
  const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map(normalizeDbUuid).filter(Boolean)));
  if (normalizedIds.length === 0) return new Map<string, boolean>();

  const uncachedIds = options?.force
    ? normalizedIds
    : normalizedIds.filter((id) => !isFreshStatus(deletedStageMarkCache.get(id)));

  if (uncachedIds.length === 0) {
    return buildDeletedStageMarkMap(normalizedIds);
  }

  return new Promise<Map<string, boolean>>((resolve, reject) => {
    deletedStageMarkQueue.push({
      ids: normalizedIds,
      resolve,
      reject,
    });
    if (!deletedStageMarkFlushTimer) {
      deletedStageMarkFlushTimer = setTimeout(() => {
        void flushDeletedStageMarkQueue(supabaseClient);
      }, 0);
    }
  });
};

const isProcessV2DeletedRow = (row: any) => {
  const metadata = parseObject(row?.metadata);
  return metadata?.process_v2_deleted === true || metadata?.deleted_from_process_v2 === true;
};

export const filterDeletedProcessRunStageMarks = async (
  supabaseClient: any,
  rows: any[],
  options?: { force?: boolean },
) => {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const visibleRows = normalizedRows.filter((row: any) => !isProcessV2DeletedRow(row));
  const ids = visibleRows
    .map((row: any) => normalizeDbUuid(row?.id || row?.process_run_stage_id))
    .filter(Boolean);

  if (ids.length === 0) return visibleRows;

  try {
    const deletedMap = await fetchDeletedProcessRunStageMarkMap(supabaseClient, ids, options);
    return visibleRows.filter((row: any) => {
      const rowId = normalizeDbUuid(row?.id || row?.process_run_stage_id);
      return !rowId || deletedMap.get(rowId) !== true;
    });
  } catch {
    return visibleRows;
  }
};

export const __resetProcessDeletedStageMarksForTests = () => {
  deletedStageMarkCache.clear();
  deletedStageMarkQueue.splice(0, deletedStageMarkQueue.length);
  if (deletedStageMarkFlushTimer) {
    clearTimeout(deletedStageMarkFlushTimer);
    deletedStageMarkFlushTimer = null;
  }
};
