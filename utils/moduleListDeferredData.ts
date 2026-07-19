const DEFERRED_LIST_CACHE_TTL_MS = 60_000;
const DEFERRED_LIST_CACHE_MAX_ROWS = 500;
const DEFERRED_LIST_QUERY_CHUNK_SIZE = 100;

type DeferredCacheEntry = {
  value: Record<string, any>;
  savedAt: number;
};

const deferredRowCache = new Map<string, DeferredCacheEntry>();

const normalizeText = (value: unknown) => String(value || '').trim();

const normalizeFieldKeys = (fieldKeys: string[]) => Array.from(new Set(
  (Array.isArray(fieldKeys) ? fieldKeys : [])
    .map(normalizeText)
    .filter((key) => key && key !== 'id' && !key.startsWith('__') && !key.includes(',') && !key.includes('(') && !key.includes(')')),
)).sort();

const buildCacheKey = ({
  orgId,
  resource,
  row,
  fieldSignature,
}: {
  orgId: string;
  resource: string;
  row: Record<string, any>;
  fieldSignature: string;
}) => [
  orgId,
  resource,
  normalizeText(row?.id),
  normalizeText(row?.updated_at),
  fieldSignature,
].join(':');

const trimCache = () => {
  if (deferredRowCache.size <= DEFERRED_LIST_CACHE_MAX_ROWS) return;
  const overflow = deferredRowCache.size - DEFERRED_LIST_CACHE_MAX_ROWS;
  Array.from(deferredRowCache.keys()).slice(0, overflow).forEach((key) => deferredRowCache.delete(key));
};

/**
 * داده‌های حجیم ستون‌های قابل‌مشاهده را بعد از بار اولیه و به‌صورت batch می‌خواند.
 * کلید کش شامل سازمان، ماژول، شناسه رکورد و updated_at است تا داده بین tenantها
 * یا نسخه‌های متفاوت یک رکورد مشترک نشود.
 */
export const fetchDeferredModuleListFields = async ({
  supabaseClient,
  orgId,
  resource,
  rows,
  fieldKeys,
}: {
  supabaseClient: any;
  orgId?: string | null;
  resource: string;
  rows: Record<string, any>[];
  fieldKeys: string[];
}) => {
  const normalizedResource = normalizeText(resource);
  const normalizedFields = normalizeFieldKeys(fieldKeys);
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => normalizeText(row?.id));
  if (!normalizedResource || normalizedFields.length === 0 || normalizedRows.length === 0) {
    return {} as Record<string, Record<string, any>>;
  }

  const effectiveOrgId = normalizeText(orgId || normalizedRows.find((row) => row?.org_id)?.org_id);
  const fieldSignature = normalizedFields.join(',');
  const now = Date.now();
  const result: Record<string, Record<string, any>> = {};
  const missingRows: Record<string, any>[] = [];

  normalizedRows.forEach((row) => {
    if (!effectiveOrgId) {
      missingRows.push(row);
      return;
    }
    const cacheKey = buildCacheKey({ orgId: effectiveOrgId, resource: normalizedResource, row, fieldSignature });
    const cached = deferredRowCache.get(cacheKey);
    if (cached && now - cached.savedAt < DEFERRED_LIST_CACHE_TTL_MS) {
      result[normalizeText(row.id)] = cached.value;
    } else {
      missingRows.push(row);
    }
  });

  for (let index = 0; index < missingRows.length; index += DEFERRED_LIST_QUERY_CHUNK_SIZE) {
    const chunk = missingRows.slice(index, index + DEFERRED_LIST_QUERY_CHUNK_SIZE);
    const ids = chunk.map((row) => normalizeText(row.id));
    const { data, error } = await supabaseClient
      .from(normalizedResource)
      .select(['id', ...normalizedFields].join(','))
      .in('id', ids);
    if (error) throw error;

    (Array.isArray(data) ? data : []).forEach((loadedRow: Record<string, any>) => {
      const recordId = normalizeText(loadedRow?.id);
      if (!recordId) return;
      result[recordId] = loadedRow;
      const sourceRow = chunk.find((row) => normalizeText(row?.id) === recordId) || loadedRow;
      if (effectiveOrgId) {
        deferredRowCache.set(
          buildCacheKey({ orgId: effectiveOrgId, resource: normalizedResource, row: sourceRow, fieldSignature }),
          { value: loadedRow, savedAt: Date.now() },
        );
      }
    });
  }

  trimCache();
  return result;
};

export const __resetModuleListDeferredDataForTests = () => {
  deferredRowCache.clear();
};
