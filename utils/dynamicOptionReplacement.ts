import type { SupabaseClient } from '@supabase/supabase-js';
import { MODULES } from '../moduleRegistry';
import { FieldType } from '../types';

type ReplaceParams = {
  supabase: SupabaseClient;
  category: string;
  oldValue: string;
  newValue: string;
};

const PAGE_SIZE = 1000;

const normalize = (value: any) => String(value ?? '').trim();

const isMultiValueType = (type: any) =>
  type === FieldType.MULTI_SELECT || type === FieldType.CHECKLIST;

const replaceValue = (value: any, isMulti: boolean, oldValue: string, newValue: string) => {
  if (isMulti) {
    if (!Array.isArray(value)) return { changed: false, next: value };
    let changed = false;
    const next = value.map((item: any) => {
      const normalized = normalize(item);
      if (normalized === oldValue) {
        changed = true;
        return newValue;
      }
      return item;
    });
    return { changed, next };
  }

  const normalized = normalize(value);
  if (!normalized || normalized !== oldValue) return { changed: false, next: value };
  return { changed: true, next: newValue };
};

export const replaceDynamicOptionValueAcrossModules = async ({
  supabase,
  category,
  oldValue,
  newValue,
}: ReplaceParams) => {
  const normalizedCategory = normalize(category);
  const fromValue = normalize(oldValue);
  const toValue = normalize(newValue);

  if (!normalizedCategory || !fromValue || !toValue || fromValue === toValue) {
    return { updatedRows: 0 };
  }

  let updatedRows = 0;

  for (const moduleConfig of Object.values(MODULES || {})) {
    const table = String(moduleConfig?.table || '').trim();
    if (!table) continue;

    const directFields = (moduleConfig.fields || [])
      .filter((field: any) => String(field?.dynamicOptionsCategory || '') === normalizedCategory)
      .map((field: any) => ({
        key: String(field.key),
        isMulti: isMultiValueType(field.type),
      }));

    const blockFields = (moduleConfig.blocks || [])
      .flatMap((block: any) =>
        (block?.tableColumns || [])
          .filter((column: any) => String(column?.dynamicOptionsCategory || '') === normalizedCategory)
          .map((column: any) => ({
            blockId: String(block.id),
            key: String(column.key),
            isMulti: isMultiValueType(column.type),
          }))
      );

    if (!directFields.length && !blockFields.length) continue;

    const selectColumns = Array.from(
      new Set<string>([
        'id',
        ...directFields.map((item) => item.key),
        ...blockFields.map((item) => item.blockId),
      ])
    );

    let from = 0;
    while (true) {
      const to = from + PAGE_SIZE - 1;
      const { data: rows, error } = await supabase
        .from(table as any)
        .select(selectColumns.join(', '))
        .range(from, to);

      if (error) throw error;
      if (!rows?.length) break;

      for (const row of rows) {
        const patch: Record<string, any> = {};

        directFields.forEach((fieldMeta) => {
          const current = (row as any)?.[fieldMeta.key];
          const replaced = replaceValue(current, fieldMeta.isMulti, fromValue, toValue);
          if (replaced.changed) patch[fieldMeta.key] = replaced.next;
        });

        const byBlock = new Map<string, Array<{ key: string; isMulti: boolean }>>();
        blockFields.forEach((meta) => {
          const list = byBlock.get(meta.blockId) || [];
          list.push({ key: meta.key, isMulti: meta.isMulti });
          byBlock.set(meta.blockId, list);
        });

        byBlock.forEach((columns, blockId) => {
          const currentRows = (row as any)?.[blockId];
          if (!Array.isArray(currentRows)) return;

          let blockChanged = false;
          const nextRows = currentRows.map((item: any) => {
            if (!item || typeof item !== 'object') return item;
            let rowChanged = false;
            const nextItem: Record<string, any> = { ...item };
            columns.forEach((columnMeta) => {
              const replaced = replaceValue(item[columnMeta.key], columnMeta.isMulti, fromValue, toValue);
              if (!replaced.changed) return;
              nextItem[columnMeta.key] = replaced.next;
              rowChanged = true;
            });
            if (rowChanged) blockChanged = true;
            return rowChanged ? nextItem : item;
          });

          if (blockChanged) patch[blockId] = nextRows;
        });

        if (!Object.keys(patch).length) continue;
        const rowId = (row as any)?.id;
        if (!rowId) continue;

        const { error: updateError } = await supabase
          .from(table as any)
          .update(patch)
          .eq('id', rowId);
        if (updateError) throw updateError;

        updatedRows += 1;
      }

      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  return { updatedRows };
};

