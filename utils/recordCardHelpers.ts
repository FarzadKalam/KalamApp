import { FieldType, ModuleDefinition, ModuleField } from '../types';
import { getTaskStatusOption, getTaskStatusLabel, getTaskStatusColor } from './processTaskStatusOptions';
import { buildConditionalFieldStateMap } from './conditionalFieldRules';
import { getResolvedModuleConditionalDisplay } from './moduleSettingsRuntime';

const STATUS_HINT_KEYS = new Set([
  'status',
  'state',
  'stage',
  'rank',
]);

const normalizeKey = (value: any) => String(value || '').trim().toLowerCase();

const hasFieldOptions = (field?: ModuleField | null) => Array.isArray(field?.options) && field.options.length > 0;

const getCardFieldKey = (field?: ModuleField | null) => normalizeKey(field?.key);
const isEmptyValue = (value: any) => (
  value === null
  || value === undefined
  || value === ''
  || (Array.isArray(value) && value.length === 0)
);

const CARD_FIELD_TYPE_SCORES: Record<string, number> = {
  [normalizeKey(FieldType.PHONE)]: 260,
  [normalizeKey(FieldType.RELATION)]: 240,
  [normalizeKey(FieldType.USER)]: 220,
  [normalizeKey(FieldType.STATUS)]: 210,
  [normalizeKey(FieldType.SELECT)]: 200,
  [normalizeKey(FieldType.MULTI_SELECT)]: 180,
  [normalizeKey(FieldType.DATE)]: 190,
  [normalizeKey(FieldType.DATETIME)]: 185,
  [normalizeKey(FieldType.PRICE)]: 230,
  [normalizeKey(FieldType.NUMBER)]: 170,
  [normalizeKey(FieldType.TEXT)]: 150,
  [normalizeKey(FieldType.CHECKBOX)]: 110,
  [normalizeKey(FieldType.LONG_TEXT)]: 40,
  [normalizeKey(FieldType.SUPER_LONG_TEXT)]: 10,
  [normalizeKey(FieldType.JSON)]: -100,
  [normalizeKey(FieldType.IMAGE)]: -1000,
  [normalizeKey(FieldType.LOCATION)]: 20,
  [normalizeKey(FieldType.TAGS)]: -1000,
  [normalizeKey(FieldType.PROGRESS_STAGES)]: -1000,
  [normalizeKey(FieldType.READONLY_LOOKUP)]: 160,
};

const HIGH_SIGNAL_HINTS: Array<[string, number]> = [
  ['mobile', 420],
  ['phone', 420],
  ['tel', 420],
  ['email', 400],
  ['amount', 390],
  ['total', 380],
  ['balance', 380],
  ['remaining', 370],
  ['city', 350],
  ['province', 330],
  ['category', 320],
  ['industry', 315],
  ['rank', 310],
  ['type', 280],
  ['date', 250],
  ['code', 220],
  ['count', 210],
  ['position', 205],
];

const LOW_SIGNAL_HINTS = new Set([
  'first_name',
  'last_name',
  'prefix',
  'notes',
  'description',
  'address',
  'location',
  'portal_permissions_override',
]);

const getCardFieldPriorityScore = (
  field?: ModuleField | null,
  moduleConfig?: ModuleDefinition,
  excludedKeys: string[] = [],
) => {
  if (!field?.key) return -10000;

  const key = getCardFieldKey(field);
  const type = normalizeKey(field.type);
  const recentList = new Set(
    (moduleConfig?.dashboard?.recentListFields || []).map((entry) => normalizeKey(entry)),
  );
  const exclusions = new Set(excludedKeys.map((entry) => normalizeKey(entry)));

  if (exclusions.has(key)) return -10000;
  if (LOW_SIGNAL_HINTS.has(key)) return -200;

  let score = Number(CARD_FIELD_TYPE_SCORES[type] ?? 0);

  if (field?.isKey) score += 1200;
  if (recentList.has(key)) score += 900;
  if (field?.isTableColumn) score += 320;
  if (field?.location === 'header') score += 180;

  HIGH_SIGNAL_HINTS.forEach(([hint, hintScore]) => {
    if (key.includes(hint)) score += hintScore;
  });

  if (key.endsWith('_id') && type !== normalizeKey(FieldType.RELATION) && type !== normalizeKey(FieldType.USER)) {
    score -= 400;
  }

  score -= Number(field?.order || 0) / 100;
  return score;
};

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

  const isTaskStatus = moduleConfig?.id === 'tasks' && String(statusField?.key || '') === 'status';
  const option = isTaskStatus
    ? getTaskStatusOption(rawValue, item, statusField.options || [])
    : (statusField.options || []).find((entry: any) => String(entry?.value || '') === String(rawValue));
  const label = isTaskStatus
    ? getTaskStatusLabel(rawValue, item, statusField.options || [])
    : String(option?.label || rawValue);
  const color = isTaskStatus
    ? (String(option?.color || '').trim() || getTaskStatusColor(rawValue, item, statusField.options || []))
    : String(option?.color || 'default');
  return {
    field: statusField,
    value: rawValue,
    label,
    color,
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
    .filter((field) => field?.key && !exclusions.has(normalizeKey(field.key)))
    .map((field) => ({
      field,
      score: getCardFieldPriorityScore(field, moduleConfig, Array.from(exclusions)),
    }))
    .filter((entry) => entry.score > -1000)
    .sort((a, b) => b.score - a.score || Number(a.field?.order || 0) - Number(b.field?.order || 0))
    .slice(0, limit)
    .map((entry) => entry.field);
};

export const getRecordCardSummaryFields = (
  item: any,
  moduleConfig?: ModuleDefinition,
  excludedKeys: string[] = [],
  limit = 4,
) => {
  const candidateFields = getModuleCardSummaryFields(moduleConfig, excludedKeys, Math.max(limit * 3, limit + 4));
  const visibleFieldStateMap = buildConditionalFieldStateMap(
    Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [],
    item || {},
    moduleConfig?.id ? getResolvedModuleConditionalDisplay(moduleConfig.id) : undefined,
  );
  return candidateFields
    .filter((field) => visibleFieldStateMap[field.key]?.visible !== false)
    .filter((field) => field?.key && !isEmptyValue(item?.[field.key]))
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
