import { FieldType } from '../types';

export const MIN_TABLE_COLUMN_WIDTH = 64;
export const MAX_TABLE_COLUMN_WIDTH = 720;
export const clampTableColumnWidth = (width: number) => Math.max(MIN_TABLE_COLUMN_WIDTH, Math.min(MAX_TABLE_COLUMN_WIDTH, Math.round(width)));
export const tableColumnWidthVariable = (key: string) => `--smarttable-col-${key.replace(/[^a-zA-Z0-9_-]/g, (char) => `_${char.charCodeAt(0).toString(16)}_`)}`;

export const estimateTableColumnWidth = ({ field, label, samples, primary, mobile }: {
  field: { key: string; type: FieldType };
  label: string;
  samples: string[];
  primary?: boolean;
  mobile?: boolean;
}) => {
  if (field.type === FieldType.IMAGE) return 64;
  if (field.type === FieldType.PROGRESS_STAGES || /(?:process|stages)_draft$|stages_preview$/.test(field.key)) return mobile ? 340 : 460;
  const headerWidth = Math.min(220, label.length * 6.5 + 88);
  const contentLength = samples.slice(0, 16).reduce((max, value) => Math.max(max, Math.min(64, value.length)), 0);
  const contentWidth = contentLength * 7 + 32;
  const cap = primary ? (mobile ? 260 : 360)
    : [FieldType.RELATION, FieldType.MULTI_RELATION, FieldType.USER, FieldType.TEXT, FieldType.MULTI_SELECT].includes(field.type) ? 240 : 190;
  return clampTableColumnWidth(Math.min(cap, Math.max(headerWidth, contentWidth, primary ? 200 : 100)));
};

export const reconcileTableColumnOrder = (keys: string[], order: string[]) => {
  const allowed = new Set(keys);
  return [...new Set([...order.filter((key) => allowed.has(key)), ...keys])];
};

export type TableColumnPreferences = { order: string[]; widths: Record<string, number> };
export const readTableColumnPreferences = (key?: string): TableColumnPreferences => {
  try {
    const value = key ? JSON.parse(localStorage.getItem(key) || 'null') : null;
    return {
      order: Array.isArray(value?.order) ? value.order.filter((item: unknown) => typeof item === 'string') : [],
      widths: Object.fromEntries(Object.entries(value?.widths || {}).filter(([, width]) => typeof width === 'number' && Number.isFinite(width)).map(([field, width]) => [field, clampTableColumnWidth(Number(width))])),
    };
  } catch { return { order: [], widths: {} }; }
};
