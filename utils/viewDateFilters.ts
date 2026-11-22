import { FieldType, ModuleField } from '../types';
import { getCoreCalendarConditionBounds } from '../shared/recordRuntime';

export const CALENDAR_VIEW_OPERATORS = [
  'is_today', 'is_yesterday', 'is_tomorrow', 'is_this_week', 'is_last_week',
  'is_this_month', 'is_last_month', 'date_between',
] as const;

export const buildCalendarViewFilters = (field: Pick<ModuleField, 'key' | 'type'>, operator: string, value?: unknown, now?: Date) => {
  if (field.type !== FieldType.DATE && field.type !== FieldType.DATETIME) return null;
  const bounds = getCoreCalendarConditionBounds(operator, value, now);
  if (!bounds) return null;
  return [
    { field: field.key, operator: 'gte', value: field.type === FieldType.DATE ? bounds.startDate : bounds.startInstant, _calendarOperator: operator },
    { field: field.key, operator: 'lt', value: field.type === FieldType.DATE ? bounds.endDate : bounds.endInstant, _calendarOperator: operator },
  ] as const;
};

export const refreshRelativeViewDateFilter = <T extends { field?: string; operator?: string; value?: unknown; _calendarOperator?: string }>(
  filter: T,
  fields: readonly Pick<ModuleField, 'key' | 'type'>[],
  now?: Date,
): T => {
  const operator = filter._calendarOperator;
  if (!operator || operator === 'date_between') return filter;
  const field = fields.find(({ key }) => key === filter.field);
  if (!field) return filter;
  const range = buildCalendarViewFilters(field, operator, undefined, now);
  const current = range?.find((entry) => entry.operator === filter.operator);
  return current ? { ...filter, value: current.value } : filter;
};

export type DateBoundary = 'start' | 'end';

export const formatLocalCalendarDate = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

/**
 * مقدار مناسب PostgREST برای ابتدا یا انتهای یک روزِ محلی را می‌سازد.
 * ستون DATE باید تقویمی بماند و نباید با تبدیل UTC به روز قبل یا بعد برود؛
 * اما ستون DATETIME باید ISO/UTC بگیرد تا مرز دقیق زمان حفظ شود.
 */
export const buildViewDateBoundaryValue = (
  field: Pick<ModuleField, 'type'> | undefined,
  date: Date,
  boundary: DateBoundary,
) => {
  const normalized = new Date(date);
  if (boundary === 'start') {
    normalized.setHours(0, 0, 0, 0);
  } else {
    normalized.setHours(23, 59, 59, 999);
  }

  return field?.type === FieldType.DATE
    ? formatLocalCalendarDate(normalized)
    : normalized.toISOString();
};
