import { FieldType, ModuleDefinition, ModuleField } from '../types';
import { getRecordCardSummaryFields } from './recordCardHelpers';

const CALENDAR_EXCLUDED_FIELD_KEYS = new Set([
  'name', 'title', 'full_name', 'business_name', 'system_code', 'manual_code',
  'status', 'state', 'stage', 'priority', 'assignee_id', 'assignee_role_id',
  'assignee_type', 'responsible_id', 'responsible_role_id', 'tags', 'image_url',
]);

const CALENDAR_EXCLUDED_FIELD_TYPES = new Set<FieldType>([
  FieldType.STATUS,
  FieldType.DATE,
  FieldType.DATETIME,
  FieldType.IMAGE,
  FieldType.TAGS,
  FieldType.LONG_TEXT,
  FieldType.SUPER_LONG_TEXT,
  FieldType.JSON,
  FieldType.LOCATION,
  FieldType.PROGRESS_STAGES,
  FieldType.CHECKBOX,
  FieldType.LINK,
]);

const hasDisplayValue = (value: any) => (
  value !== null
  && value !== undefined
  && value !== ''
  && (!Array.isArray(value) || value.length > 0)
);

const canUseCalendarSummaryField = (
  field: ModuleField,
  excludedFieldKeys: Set<string>,
  allowConfiguredStatusField = false,
) => {
  const key = String(field?.key || '').trim();
  return Boolean(
    key
    && !excludedFieldKeys.has(key.toLowerCase())
    && (!CALENDAR_EXCLUDED_FIELD_TYPES.has(field.type) || (allowConfiguredStatusField && field.type === FieldType.STATUS))
  );
};

/** فیلدهای کوتاه و قابل‌فهم برای کارت تقویم را بر اساس پیکربندی ماژول انتخاب می‌کند. */
export const getCalendarSummaryFields = (
  item: any,
  moduleConfig: ModuleDefinition,
  options: {
    excludedFieldKeys?: string[];
    canViewField?: (fieldKey: string) => boolean;
    limit?: number;
  } = {},
): ModuleField[] => {
  const limit = Math.max(1, options.limit ?? 2);
  const excludedFieldKeys = new Set([
    ...CALENDAR_EXCLUDED_FIELD_KEYS,
    ...(options.excludedFieldKeys || []).map((key) => String(key || '').trim().toLowerCase()),
  ]);
  const fieldByKey = new Map(
    (moduleConfig.fields || []).map((field) => [String(field?.key || '').trim(), field] as const),
  );
  const canView = (field: ModuleField) => options.canViewField?.(field.key) !== false;
  const preferredFields = (moduleConfig.calendar?.summaryFieldKeys || [])
    .map((key) => fieldByKey.get(String(key || '').trim()))
    .filter((field): field is ModuleField => Boolean(field))
    .filter((field) => canUseCalendarSummaryField(field, excludedFieldKeys, true) && canView(field))
    .filter((field) => hasDisplayValue(item?.[field.key]));
  const fallbackFields = getRecordCardSummaryFields(
    item,
    moduleConfig,
    Array.from(excludedFieldKeys),
    limit * 3,
  ).filter((field) => canUseCalendarSummaryField(field, excludedFieldKeys) && canView(field));

  return Array.from(new Map(
    [...preferredFields, ...fallbackFields].map((field) => [field.key, field] as const),
  ).values()).slice(0, limit);
};
