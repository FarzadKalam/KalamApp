import { FieldType, ModuleDefinition, ModuleField } from '../types';
import { getTaskStatusOption } from './processTaskStatusOptions';

const STATUS_HINT_KEYS = new Set([
  'status',
  'state',
  'stage',
  'rank',
]);

const normalizeKey = (value: any) => String(value || '').trim().toLowerCase();

const hasFieldOptions = (field?: ModuleField | null) => Array.isArray(field?.options) && field.options.length > 0;

const getCardFieldKey = (field?: ModuleField | null) => normalizeKey(field?.key);

const getStatusFieldScore = (field?: ModuleField | null, explicitKey?: string | null) => {
  if (!field?.key || !hasFieldOptions(field)) return -1;

  const key = getCardFieldKey(field);
  const type = normalizeKey(field.type);
  const explicit = normalizeKey(explicitKey);

  if (explicit && key === explicit) return 1000;
  if (key === 'status') return 950;
  if (key.endsWith('_status')) return 900;
  if (STATUS_HINT_KEYS.has(key)) return 850;
  if (type === normalizeKey(FieldType.STATUS)) return 800;
  if (type === normalizeKey(FieldType.SELECT) && (key.endsWith('_status') || STATUS_HINT_KEYS.has(key))) return 750;
  if (type === normalizeKey(FieldType.SELECT)) return 100;
  return 0;
};

export const resolveCardStatusField = (moduleConfig?: ModuleDefinition, explicitStatusField?: string | null) => {
  const fields = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [];
  if (!fields.length) return null;

  const explicitKey = normalizeKey(explicitStatusField);
  if (explicitKey) {
    const explicitField = fields.find((field) => normalizeKey(field?.key) === explicitKey);
    if (explicitField && hasFieldOptions(explicitField)) {
      return explicitField;
    }
  }

  return fields
    .map((field) => ({ field, score: getStatusFieldScore(field, explicitStatusField) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || Number(a.field?.order || 0) - Number(b.field?.order || 0))[0]?.field || null;
};

export const resolveCardStatusMeta = (
  item: any,
  moduleConfig?: ModuleDefinition,
  explicitStatusField?: string | null,
) => {
  const statusField = resolveCardStatusField(moduleConfig, explicitStatusField);
  const rawValue = statusField ? item?.[statusField.key] : undefined;
  if (!statusField || rawValue === undefined || rawValue === null || rawValue === '') return null;

  const option = moduleConfig?.id === 'tasks' && String(statusField?.key || '') === 'status'
    ? getTaskStatusOption(rawValue, item, statusField.options || [])
    : (statusField.options || []).find((entry: any) => String(entry?.value || '') === String(rawValue));
  return {
    field: statusField,
    value: rawValue,
    label: String(option?.label || rawValue),
    color: String(option?.color || 'default'),
  };
};

export const getModuleCardSummaryFields = (
  moduleConfig?: ModuleDefinition,
  excludedKeys: string[] = [],
  limit = 4,
) => {
  const fields = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [];
  if (!fields.length) return [];

  const exclusions = new Set([
    'name',
    'title',
    'full_name',
    'business_name',
    'status',
    'priority',
    'assignee_id',
    'assignee_role_id',
    'assignee_type',
    'tags',
    'image_url',
    'system_code',
    'manual_code',
    'buy_price',
    'sell_price',
    ...excludedKeys.map((key) => normalizeKey(key)),
  ]);

  return fields
    .filter((field) => field?.isTableColumn)
    .filter((field) => field?.key && !exclusions.has(normalizeKey(field.key)))
    .slice(0, limit);
};

export const getRecordCardTags = (item: any, tagsField?: string | null) => {
  if (!tagsField) return [];
  const rawTags = item?.[tagsField];
  if (!rawTags) return [];

  const tags = Array.isArray(rawTags) ? rawTags : [rawTags];
  return tags
    .map((tag: any) => {
      if (typeof tag === 'string') {
        return { label: tag, color: 'blue' };
      }
      const label = tag?.title || tag?.label || tag?.name || tag?.value;
      if (!label) return null;
      return {
        label: String(label),
        color: String(tag?.color || 'blue'),
      };
    })
    .filter(Boolean) as Array<{ label: string; color: string }>;
};
