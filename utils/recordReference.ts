import { MODULES } from '../moduleRegistry';
import { getRecordDisplayLabel } from './recordLabel';
import { buildRecordTitleSelectColumns, selectByIdsWithCompatibleColumns } from './selectCompat';

type RecordReferenceLike = {
  module_id?: string | null;
  record_id?: string | null;
  moduleId?: string | null;
  recordId?: string | null;
};

const normalizeText = (value: unknown): string => String(value || '').trim();
const RECORD_REFERENCE_LABEL_TTL_MS = 5 * 60_000;
const recordReferenceLabelCache = new Map<string, { label: string; expiresAt: number }>();
const recordReferenceRequestCache = new Map<string, Promise<Record<string, string>>>();

// Some application routes are record-reference module ids but do not have a
// table with the same name. Keep their title lookups on the actual tenant table.
const RECORD_REFERENCE_TABLE_OVERRIDES: Record<string, string> = {
  reports: 'report_definitions',
};

export const buildRecordReferenceKey = (moduleId?: string | null, recordId?: string | null) => {
  const normalizedModuleId = normalizeText(moduleId);
  const normalizedRecordId = normalizeText(recordId);
  if (!normalizedModuleId || !normalizedRecordId) return '';
  return `${normalizedModuleId}:${normalizedRecordId}`;
};

export const fetchRecordReferenceLabels = async (
  supabaseClient: any,
  records: RecordReferenceLike[],
): Promise<Record<string, string>> => {
  const grouped = new Map<string, Set<string>>();
  const now = Date.now();
  const nextMap: Record<string, string> = {};

  (records || []).forEach((item) => {
    const moduleId = normalizeText(item?.module_id || item?.moduleId);
    const recordId = normalizeText(item?.record_id || item?.recordId);
    if (!moduleId || !recordId) return;
    const referenceKey = buildRecordReferenceKey(moduleId, recordId);
    const cached = recordReferenceLabelCache.get(referenceKey);
    if (cached && cached.expiresAt > now) {
      nextMap[referenceKey] = cached.label;
      return;
    }
    if (!grouped.has(moduleId)) grouped.set(moduleId, new Set<string>());
    grouped.get(moduleId)?.add(recordId);
  });

  await Promise.all(
    Array.from(grouped.entries()).map(async ([moduleId, idSet]) => {
      const ids = Array.from(idSet).filter(Boolean);
      if (!ids.length) return;

      const moduleConfig = MODULES[moduleId];
      const table = RECORD_REFERENCE_TABLE_OVERRIDES[moduleId] || moduleConfig?.table || moduleId;
      if (!table) return;

      const batchSize = table === 'customers' || table === 'suppliers' ? 25 : 80;
      const requestKey = `${moduleId}:${ids.slice().sort().join(',')}`;
      let pending = recordReferenceRequestCache.get(requestKey);
      if (!pending) {
        pending = (async () => {
          const resolvedMap: Record<string, string> = {};
          const result = await selectByIdsWithCompatibleColumns<any>({
            cacheKey: `record-reference:${moduleId}`,
            columns: buildRecordTitleSelectColumns(moduleId),
            ids,
            batchSize,
            // عنوان رکوردِ مرتبط فقط برای نمایش است. در schemaهای قدیمی، به‌جای
            // حذف‌کردن ستون‌ها یکی‌یکی و ایجاد ده‌ها درخواست 400، اولین projection
            // سازگار و عنوان‌محور برای همان جدول cache می‌شود.
            preferCompactProjectionAfterMissingColumn: true,
            execute: (selectExpr, idBatch) =>
              supabaseClient
                .from(table)
                .select(selectExpr)
                .in('id', idBatch),
          });

          if (result.error || !Array.isArray(result.data)) return resolvedMap;

          (result.data || []).forEach((row: any) => {
            const label = getRecordDisplayLabel(row, moduleId, { fallback: '' });
            if (!label) return;
            const referenceKey = buildRecordReferenceKey(moduleId, row?.id);
            resolvedMap[referenceKey] = label;
            recordReferenceLabelCache.set(referenceKey, {
              label,
              expiresAt: Date.now() + RECORD_REFERENCE_LABEL_TTL_MS,
            });
          });
          return resolvedMap;
        })();
        recordReferenceRequestCache.set(requestKey, pending);
        void pending.then(() => {
          if (recordReferenceRequestCache.get(requestKey) === pending) {
            recordReferenceRequestCache.delete(requestKey);
          }
        }, () => {
          if (recordReferenceRequestCache.get(requestKey) === pending) {
            recordReferenceRequestCache.delete(requestKey);
          }
        });
      }

      Object.assign(nextMap, await pending);
    }),
  );

  return nextMap;
};
