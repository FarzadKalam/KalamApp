import type { SupabaseClient } from '@supabase/supabase-js';
import { getPreferredRelationTargetField } from '../../utils/relationTargetField';
import { supportsSystemCode } from '../../utils/systemCode';
import { insertRecordActivity, touchParentRecord } from '../../utils/recordActivity';

const parseMaybeJson = (value: any) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
};

const serializeValue = (value: any) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const toRowsArray = (value: any) => {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') return [parsed];
  return null;
};

const buildStaticOptionMap = (options: any[] = []) => {
  const map = new Map<string, string>();
  options.forEach((opt: any) => {
    const value = opt?.value;
    if (value === undefined || value === null) return;
    map.set(String(value), String(opt?.label || value));
  });
  return map;
};

const mapOptionValue = (value: any, map: Map<string, string>): any => {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => mapOptionValue(item, map));
  }
  const key = String(value);
  return map.get(key) || value;
};

const fetchDynamicOptionsMap = async (supabase: SupabaseClient, categories: string[]) => {
  const result: Record<string, Map<string, string>> = {};
  const unique = Array.from(new Set(categories.filter(Boolean)));
  if (!unique.length) return result;

  try {
    const { data } = await supabase
      .from('dynamic_options')
      .select('category, label, value')
      .in('category', unique)
      .eq('is_active', true);

    (data || []).forEach((row: any) => {
      const category = String(row?.category || '');
      const value = row?.value;
      if (!category || value === undefined || value === null) return;
      if (!result[category]) result[category] = new Map<string, string>();
      result[category].set(String(value), String(row?.label || value));
    });
  } catch (err) {
    console.warn('Could not load dynamic option labels for changelog', err);
  }

  return result;
};

const fetchRelationLabels = async (
  supabase: SupabaseClient,
  targetModule: string,
  targetField: string | undefined,
  ids: string[]
) => {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, string>();
  if (!uniqueIds.length || !targetModule) return map;

  const normalizedTargetModule = String(targetModule || '').trim();
  const field = normalizedTargetModule === 'profiles'
    ? 'full_name'
    : getPreferredRelationTargetField(normalizedTargetModule, targetField);
  const includeSystemCode = normalizedTargetModule !== 'profiles' && supportsSystemCode(normalizedTargetModule);
  const selectWithCode = includeSystemCode ? `id, ${field}, system_code` : `id, ${field}`;
  const selectNoCode = `id, ${field}`;

  const buildLabel = (row: any) => {
    const base = row?.[field] || row?.name || row?.title || row?.system_code || row?.id;
    const code = row?.system_code;
    if (code && String(code) !== String(base)) {
      return `${base} (${code})`;
    }
    return String(base || row?.id || '');
  };

  try {
    const { data, error } = await supabase.from(normalizedTargetModule).select(selectWithCode).in('id', uniqueIds);
    if (error) throw error;
    (data || []).forEach((row: any) => map.set(String(row.id), buildLabel(row)));
    return map;
  } catch {
    // fall through
  }

  if (!includeSystemCode) {
    uniqueIds.forEach((id) => {
      if (!map.has(String(id))) map.set(String(id), String(id));
    });
    return map;
  }

  try {
    const { data, error } = await supabase.from(normalizedTargetModule).select(selectNoCode).in('id', uniqueIds);
    if (error) throw error;
    (data || []).forEach((row: any) => map.set(String(row.id), String(row?.[field] || row?.id)));
    return map;
  } catch {
    // fall through
  }

  uniqueIds.forEach((id) => map.set(String(id), String(id)));
  return map;
};

const mapRelationValue = (value: any, relationMap: Map<string, string>): any => {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => mapRelationValue(item, relationMap));
  if (typeof value === 'object' && value !== null) {
    if (value.label) return value.label;
    if (value.value !== undefined && value.value !== null) {
      const mapped = relationMap.get(String(value.value));
      return mapped || value.value;
    }
  }
  const mapped = relationMap.get(String(value));
  return mapped || value;
};

const humanizeTableRows = async (
  supabase: SupabaseClient,
  block: any,
  rawValue: any
) => {
  const rows = toRowsArray(rawValue);
  if (!rows || !Array.isArray(block?.tableColumns)) return rawValue;
  const columns = block.tableColumns || [];

  const dynamicCategories = columns
    .map((col: any) => String(col?.dynamicOptionsCategory || ''))
    .filter(Boolean);
  const dynamicOptionMaps = await fetchDynamicOptionsMap(supabase, dynamicCategories);

  const relationCols = columns.filter((col: any) => col?.type === 'relation' && col?.relationConfig?.targetModule);
  const relationMapsByKey = new Map<string, Map<string, string>>();

  await Promise.all(
    relationCols.map(async (col: any) => {
      const colKey = String(col?.key || '');
      if (!colKey) return;
      const ids: string[] = [];
      rows.forEach((row: any) => {
        const value = row?.[colKey];
        if (value === undefined || value === null || value === '') return;
        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (item !== undefined && item !== null && item !== '') ids.push(String(item));
          });
          return;
        }
        if (typeof value === 'object') {
          if (value?.value !== undefined && value?.value !== null) ids.push(String(value.value));
          return;
        }
        ids.push(String(value));
      });
      const map = await fetchRelationLabels(
        supabase,
        String(col.relationConfig.targetModule),
        col.relationConfig.targetField,
        ids
      );
      relationMapsByKey.set(colKey, map);
    })
  );

  return rows.map((row: any) => {
    const nextRow = { ...row };
    columns.forEach((col: any) => {
      const key = String(col?.key || '');
      if (!key) return;
      const value = nextRow[key];
      if (value === undefined || value === null || value === '') return;

      if (col?.type === 'relation') {
        const relationMap = relationMapsByKey.get(key) || new Map<string, string>();
        nextRow[key] = mapRelationValue(value, relationMap);
        return;
      }

      if (col?.dynamicOptionsCategory) {
        const map = dynamicOptionMaps[String(col.dynamicOptionsCategory)] || new Map<string, string>();
        nextRow[key] = mapOptionValue(value, map);
        return;
      }

      if (Array.isArray(col?.options) && col.options.length > 0) {
        const map = buildStaticOptionMap(col.options);
        nextRow[key] = mapOptionValue(value, map);
      }
    });
    return nextRow;
  });
};

export const insertChangelog = async (
  supabase: SupabaseClient,
  moduleId: string | undefined,
  recordId: string | undefined,
  block: any,
  oldValue: any,
  newValue: any
) => {
  if (!moduleId || !recordId) return;
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || null;

    let oldPayload: any = oldValue ?? null;
    let newPayload: any = newValue ?? null;

    if (Array.isArray(block?.tableColumns)) {
      oldPayload = await humanizeTableRows(supabase, block, oldPayload);
      newPayload = await humanizeTableRows(supabase, block, newPayload);
    }

    const blockId = String(block?.id || '').trim();
    const blockLabel = String(block?.titles?.fa || blockId || 'جدول').trim() || 'جدول';
    const columns = Array.isArray(block?.tableColumns) ? block.tableColumns : [];

    const normalizeRow = (row: any) => {
      if (!row || typeof row !== 'object') return row;
      const next: Record<string, any> = {};
      Object.entries(row).forEach(([key, value]) => {
        const normalizedKey = String(key || '').trim();
        if (!normalizedKey || normalizedKey === 'key' || normalizedKey.startsWith('_')) return;
        next[normalizedKey] = value;
      });
      return next;
    };

    const stableStringify = (value: any): string => {
      if (value === null || value === undefined) return 'null';
      if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
      if (typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${key}:${stableStringify(value[key])}`).join(',')}}`;
      }
      return JSON.stringify(value);
    };

    const buildRowKey = (row: any, index: number) => {
      const normalizedRow = normalizeRow(row);
      const explicitId = String(normalizedRow?.id || normalizedRow?.row_id || '').trim();
      if (explicitId) return `id:${explicitId}`;
      return `idx:${index}:${stableStringify(normalizedRow)}`;
    };

    const buildRowSummary = (row: any) => {
      const normalizedRow = normalizeRow(row);
      const summary = columns
        .map((column: any) => {
          const key = String(column?.key || '').trim();
          if (!key) return null;
          const value = normalizedRow?.[key];
          if (value === undefined || value === null || value === '') return null;
          return `${String(column?.title || 'فیلد').trim() || 'فیلد'}: ${serializeValue(value)}`;
        })
        .filter(Boolean)
        .slice(0, 3)
        .join(' | ');
      return summary || 'جزئیات ردیف ثبت شد';
    };

    const createColumnEvents = (oldRow: any, newRow: any, rowKey: string) => {
      const normalizedOldRow = normalizeRow(oldRow);
      const normalizedNewRow = normalizeRow(newRow);
      const compareKeys = Array.from(new Set([
        ...Object.keys(normalizedOldRow || {}),
        ...Object.keys(normalizedNewRow || {}),
      ]));
      return compareKeys
        .map((columnKey) => {
          const column = columns.find((item: any) => String(item?.key || '').trim() === String(columnKey));
          const previousValue = normalizedOldRow?.[columnKey];
          const nextValue = normalizedNewRow?.[columnKey];
          if (stableStringify(previousValue) === stableStringify(nextValue)) return null;
          const columnLabel = String(column?.title || columnKey || 'فیلد').trim() || 'فیلد';
          return {
            action: 'table_cell_updated',
            field_name: blockId || null,
            field_label: blockLabel,
            old_value: previousValue,
            new_value: nextValue,
            metadata: {
              blockId,
              blockLabel,
              rowKey,
              columnKey,
              columnLabel,
              changeKind: 'cell_updated',
              summary: `«${columnLabel}» در جدول «${blockLabel}» تغییر کرد`,
            },
          };
        })
        .filter(Boolean) as any[];
    };

    const oldRows = Array.isArray(oldPayload) ? oldPayload.map(normalizeRow) : [];
    const newRows = Array.isArray(newPayload) ? newPayload.map(normalizeRow) : [];
    const oldMap = new Map(oldRows.map((row, index) => [buildRowKey(row, index), row]));
    const newMap = new Map(newRows.map((row, index) => [buildRowKey(row, index), row]));
    const events: Array<{ action: string; field_name: string | null; field_label: string; old_value: any; new_value: any; metadata: Record<string, any> }> = [];

    oldMap.forEach((oldRow, rowKey) => {
      if (!newMap.has(rowKey)) {
        events.push({
          action: 'table_row_removed',
          field_name: blockId || null,
          field_label: blockLabel,
          old_value: oldRow,
          new_value: null,
          metadata: {
            blockId,
            blockLabel,
            rowKey,
            changeKind: 'row_removed',
            rowSummary: buildRowSummary(oldRow),
            summary: `ردیفی از جدول «${blockLabel}» حذف شد`,
          },
        });
        return;
      }
      events.push(...createColumnEvents(oldRow, newMap.get(rowKey), rowKey));
    });

    newMap.forEach((newRow, rowKey) => {
      if (oldMap.has(rowKey)) return;
      events.push({
        action: 'table_row_added',
        field_name: blockId || null,
        field_label: blockLabel,
        old_value: null,
        new_value: newRow,
        metadata: {
          blockId,
          blockLabel,
          rowKey,
          changeKind: 'row_added',
          rowSummary: buildRowSummary(newRow),
          summary: `ردیف جدیدی به جدول «${blockLabel}» اضافه شد`,
        },
      });
    });

    if (events.length === 0 && serializeValue(oldPayload) !== serializeValue(newPayload)) {
      events.push({
        action: 'update',
        field_name: blockId || null,
        field_label: blockLabel,
        old_value: oldPayload,
        new_value: newPayload,
        metadata: {
          blockId,
          blockLabel,
          changeKind: 'table_updated',
          summary: `جدول «${blockLabel}» بروزرسانی شد`,
        },
      });
    }

    for (const event of events) {
      await insertRecordActivity({
        supabase,
        moduleId,
        recordId,
        action: event.action,
        fieldName: event.field_name,
        fieldLabel: event.field_label,
        oldValue: event.old_value,
        newValue: event.new_value,
        userId,
        metadata: event.metadata,
      });
    }
    await touchParentRecord({ supabase, moduleId, recordId, userId });
  } catch (err) {
    console.warn('Changelog insert failed:', err);
  }
};
