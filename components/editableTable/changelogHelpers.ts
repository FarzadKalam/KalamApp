import type { SupabaseClient } from '@supabase/supabase-js';

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

  const field = targetField || 'name';
  const selectWithCode = `id, ${field}, system_code`;
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
    const { data } = await supabase.from(targetModule).select(selectWithCode).in('id', uniqueIds);
    (data || []).forEach((row: any) => map.set(String(row.id), buildLabel(row)));
    return map;
  } catch {
    // fall through
  }

  try {
    const { data } = await supabase.from(targetModule).select(selectNoCode).in('id', uniqueIds);
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

    await supabase.from('changelogs').insert([
      {
        module_id: moduleId,
        record_id: recordId,
        action: 'update',
        field_name: block?.id || null,
        field_label: block?.titles?.fa || null,
        old_value: serializeValue(oldPayload),
        new_value: serializeValue(newPayload),
        user_id: userId,
      },
    ]);
  } catch (err) {
    console.warn('Changelog insert failed:', err);
  }
};
