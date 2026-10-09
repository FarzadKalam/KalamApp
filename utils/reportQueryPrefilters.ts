import { FieldType } from '../types';

type ReportCondition = {
  field?: string;
  operator?: string;
  value?: unknown;
};

type ReportField = {
  key?: string;
  type?: FieldType | string;
};

type ReportModuleConfig = {
  id?: string;
  fields?: ReportField[];
};

type FilterQuery = {
  eq: (field: string, value: unknown) => FilterQuery;
  neq: (field: string, value: unknown) => FilterQuery;
  gt: (field: string, value: unknown) => FilterQuery;
  gte: (field: string, value: unknown) => FilterQuery;
  lt: (field: string, value: unknown) => FilterQuery;
  lte: (field: string, value: unknown) => FilterQuery;
  in: (field: string, values: unknown[]) => FilterQuery;
  is: (field: string, value: null) => FilterQuery;
  not: (field: string, operator: string, value: null) => FilterQuery;
  or: (filters: string) => FilterQuery;
};

const DATABASE_FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const COLLECTION_FIELD_TYPES = new Set<string>([
  FieldType.MULTI_SELECT,
  FieldType.CHECKLIST,
  FieldType.MULTI_RELATION,
  FieldType.TAGS,
  FieldType.JSON,
  FieldType.IMAGE,
  FieldType.LOCATION,
]);
const DATE_FIELD_TYPES = new Set<string>([FieldType.DATE, FieldType.DATETIME]);
const WORKFLOW_ASSIGNEE_FIELD_KEY = '__workflow_assignee';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeConditions = (conditions: ReportCondition[] | undefined) =>
  Array.isArray(conditions) ? conditions : [];

const getTehranDateParts = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tehran',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).formatToParts(new Date()).reduce<Record<string, string>>((result, part) => {
  if (part.type !== 'literal') result[part.type] = part.value;
  return result;
}, {});

const formatTehranCalendarDate = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const getTehranCalendarDayBounds = (dayOffset = 0) => {
  const dateParts = getTehranDateParts();
  const localDay = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  // ایران ساعت تابستانی ندارد. این مرز با زمان محلی ارزیاب شرط‌ها یکسان است.
  const start = new Date(`${localDay}T00:00:00+03:30`);
  start.setTime(start.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { date: formatTehranCalendarDate(start), start: start.toISOString(), end: end.toISOString() };
};

const getDirectField = (
  condition: ReportCondition,
  moduleConfig: ReportModuleConfig,
  excludedFieldKeys: Set<string>,
) => {
  const fieldKey = String(condition?.field || '').trim();
  if (!DATABASE_FIELD_PATTERN.test(fieldKey) || excludedFieldKeys.has(fieldKey)) return null;
  const field = moduleConfig?.fields?.find((candidate) => String(candidate?.key || '').trim() === fieldKey);
  if (!field || COLLECTION_FIELD_TYPES.has(String(field.type || ''))) return null;
  return { key: fieldKey, type: String(field.type || '') };
};

const getRelativeDateBounds = (operator: string) => {
  if (operator === 'is_today') return getTehranCalendarDayBounds(0);
  if (operator === 'is_yesterday') return getTehranCalendarDayBounds(-1);
  if (operator === 'is_tomorrow') return getTehranCalendarDayBounds(1);
  return null;
};

const getTehranCalendarDayBoundsForValue = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  // مقدار روز را با timezone تهران تفسیر می‌کنیم تا نیمه‌شب UTC روز را جابه‌جا نکند.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00+03:30`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const dateKey = formatTehranCalendarDate(date);
  const start = new Date(`${dateKey}T00:00:00+03:30`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { date: dateKey, start: start.toISOString(), end: end.toISOString() };
};

const getDateComparisonTerm = (
  condition: ReportCondition,
  field: { key: string; type: string },
) => {
  const operator = String(condition?.operator || '').trim();
  if (!DATE_FIELD_TYPES.has(field.type) || (operator !== 'after_date' && operator !== 'before_date')) return null;
  const bounds = getTehranCalendarDayBoundsForValue(condition?.value);
  if (!bounds) return null;
  if (field.type === FieldType.DATE) {
    return `${field.key}.${operator === 'after_date' ? 'gt' : 'lt'}.${bounds.date}`;
  }
  return operator === 'after_date'
    ? `and(${field.key}.gte.${bounds.end})`
    : `and(${field.key}.lt.${bounds.start})`;
};

const toPostgrestInOperand = (values: unknown[]) => `(${values
  .map((value) => `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
  .join(',')})`;

const getTaskAssigneePrefilter = (condition: ReportCondition, moduleConfig: ReportModuleConfig) => {
  if (String(moduleConfig?.id || '').trim() !== 'tasks') return null;
  if (String(condition?.field || '').trim() !== WORKFLOW_ASSIGNEE_FIELD_KEY) return null;
  if (String(condition?.operator || 'eq').trim() !== 'eq') return null;
  const [kind, id] = String(condition?.value || '').trim().split(':', 2);
  if (!UUID_PATTERN.test(String(id || ''))) return null;
  return kind === 'user' || kind === 'role' ? { kind, id } : null;
};

const getSafeAnyTerm = (
  condition: ReportCondition,
  moduleConfig: ReportModuleConfig,
  excludedFieldKeys: Set<string>,
) => {
  const field = getDirectField(condition, moduleConfig, excludedFieldKeys);
  const operator = String(condition?.operator || 'eq').trim();
  const bounds = getRelativeDateBounds(operator);
  if (field && bounds && DATE_FIELD_TYPES.has(field.type)) {
    if (field.type === FieldType.DATE) return `${field.key}.eq.${bounds.date}`;
    return `and(${field.key}.gte.${bounds.start},${field.key}.lt.${bounds.end})`;
  }
  if (!field || !DATE_FIELD_TYPES.has(field.type)) return null;
  return getDateComparisonTerm(condition, field);
};

/**
 * شرط‌های مستقیم و هم‌ارزِ SQL را پیش از row_limit به PostgREST می‌سپارد.
 * شرط‌های رابطه‌ای، چندمقداری و محاسباتی عمداً اینجا اعمال نمی‌شوند تا هیچ
 * رکورد معتبر به‌علت تفاوت معنای runtime و دیتابیس حذف نشود.
 */
export const applySafeReportConditionPrefilters = <T extends FilterQuery>(
  query: T,
  moduleConfig: ReportModuleConfig,
  {
    conditionsAll,
    conditionsAny,
    excludedFieldKeys = [],
  }: {
    conditionsAll?: ReportCondition[];
    conditionsAny?: ReportCondition[];
    excludedFieldKeys?: string[];
  },
): T => {
  let nextQuery: FilterQuery = query;
  const excluded = new Set(excludedFieldKeys.map((key) => String(key || '').trim()).filter(Boolean));

  normalizeConditions(conditionsAll).forEach((condition) => {
    // گزارش فعالیت یک کارمند معمولاً با فیلد synthetic ساخته می‌شود. ترجمهٔ
    // دقیق آن به ستون‌های واقعی tasks باعث می‌شود پیش از row_limit فقط
    // فعالیت‌های همان فرد خوانده شوند؛ evaluator نهایی همچنان اجرا می‌شود.
    const taskAssignee = getTaskAssigneePrefilter(condition, moduleConfig);
    if (taskAssignee) {
      nextQuery = taskAssignee.kind === 'user'
        ? nextQuery.eq('assignee_id', taskAssignee.id)
        : nextQuery.eq('assignee_type', 'role').eq('assignee_role_id', taskAssignee.id);
      return;
    }
    const field = getDirectField(condition, moduleConfig, excluded);
    if (!field) return;
    const operator = String(condition?.operator || 'eq').trim();
    const bounds = getRelativeDateBounds(operator);
    if (bounds && DATE_FIELD_TYPES.has(field.type)) {
      nextQuery = field.type === FieldType.DATE
        ? nextQuery.eq(field.key, bounds.date)
        : nextQuery.gte(field.key, bounds.start).lt(field.key, bounds.end);
      return;
    }
    const dateComparisonTerm = getDateComparisonTerm(condition, field);
    if (dateComparisonTerm) {
      const comparisonBounds = getTehranCalendarDayBoundsForValue(condition?.value);
      if (!comparisonBounds) return;
      if (field.type === FieldType.DATE) {
        nextQuery = operator === 'after_date'
          ? nextQuery.gt(field.key, comparisonBounds.date)
          : nextQuery.lt(field.key, comparisonBounds.date);
      } else {
        nextQuery = operator === 'after_date'
          ? nextQuery.gte(field.key, comparisonBounds.end)
          : nextQuery.lt(field.key, comparisonBounds.start);
      }
      return;
    }
    const value = condition?.value;
    if (operator === 'eq' && !Array.isArray(value) && value !== undefined && value !== null) nextQuery = nextQuery.eq(field.key, value);
    if (operator === 'neq' && !Array.isArray(value) && value !== undefined && value !== null) nextQuery = nextQuery.neq(field.key, value);
    if (operator === 'in' && Array.isArray(value) && value.length > 0) nextQuery = nextQuery.in(field.key, value);
    if (operator === 'not_in' && Array.isArray(value) && value.length > 0) {
      nextQuery = nextQuery.not(field.key, 'in', toPostgrestInOperand(value));
    }
    if (operator === 'not_null') nextQuery = nextQuery.not(field.key, 'is', null);
    if (field.type === FieldType.CHECKBOX && operator === 'is_true') nextQuery = nextQuery.eq(field.key, true);
    if (field.type === FieldType.CHECKBOX && operator === 'is_false') nextQuery = nextQuery.eq(field.key, false);
  });

  // OR را تنها زمانی به سرور می‌دهیم که تمام گزینه‌ها ترجمهٔ دقیق داشته باشند.
  const anyTerms = normalizeConditions(conditionsAny)
    .map((condition) => getSafeAnyTerm(condition, moduleConfig, excluded));
  if (anyTerms.length > 0 && anyTerms.every((term) => !!term)) {
    nextQuery = nextQuery.or(anyTerms.join(','));
  }
  return nextQuery as T;
};
