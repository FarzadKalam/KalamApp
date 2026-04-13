import { MODULES } from '../moduleRegistry';
import { getRecordDisplayLabel } from './recordLabel';
import { buildRecordTitleSelectColumns, runSelectWithCompatibleColumns } from './selectCompat';

type RecordReferenceLike = {
  module_id?: string | null;
  record_id?: string | null;
  moduleId?: string | null;
  recordId?: string | null;
};

const normalizeText = (value: unknown): string => String(value || '').trim();

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

  (records || []).forEach((item) => {
    const moduleId = normalizeText(item?.module_id || item?.moduleId);
    const recordId = normalizeText(item?.record_id || item?.recordId);
    if (!moduleId || !recordId) return;
    if (!grouped.has(moduleId)) grouped.set(moduleId, new Set<string>());
    grouped.get(moduleId)?.add(recordId);
  });

  const nextMap: Record<string, string> = {};

  await Promise.all(
    Array.from(grouped.entries()).map(async ([moduleId, idSet]) => {
      const ids = Array.from(idSet).filter(Boolean);
      if (!ids.length) return;

      const moduleConfig = MODULES[moduleId];
      const table = moduleConfig?.table || moduleId;
      if (!table) return;

      const result = await runSelectWithCompatibleColumns<any[]>({
        cacheKey: `record-reference:${moduleId}`,
        columns: buildRecordTitleSelectColumns(moduleId),
        execute: (selectExpr) =>
          supabaseClient
            .from(table)
            .select(selectExpr)
            .in('id', ids),
      });

      if (result.error || !Array.isArray(result.data)) return;

      (result.data || []).forEach((row: any) => {
        const label = getRecordDisplayLabel(row, moduleId, { fallback: '' });
        if (!label) return;
        nextMap[buildRecordReferenceKey(moduleId, row?.id)] = label;
      });
    }),
  );

  return nextMap;
};
