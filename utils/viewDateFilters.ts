import { FieldType, ModuleField } from '../types';

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
