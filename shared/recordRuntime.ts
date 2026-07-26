export type RuntimeVariableScope =
  | 'record'
  | 'related'
  | 'process_target'
  | 'task'
  | 'system'
  | 'action_output'
  | 'print';

export type RuntimeVariableDescriptor = {
  key: string;
  labelFa: string;
  moduleId?: string | null;
  fieldKey?: string | null;
  scope: RuntimeVariableScope;
  path?: string[];
  aliases?: string[];
  contexts?: string[];
  neverExposeRawId?: boolean;
};

export const UUID_LIKE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const UUID_IN_TEXT_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

export const isUuidLike = (value: unknown): boolean =>
  UUID_LIKE_PATTERN.test(String(value ?? '').trim());

export const sanitizeOutboundDisplay = (
  value: unknown,
  fallback = '[رکورد مرتبط]'
): string => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^(?:https?:\/\/|\/(?:i|d)\/)/i.test(text)) return text;
  if (isUuidLike(text)) return fallback;
  return text.replace(UUID_IN_TEXT_PATTERN, fallback);
};

export const extractTemplateTokens = (template: unknown): string[] => {
  const tokens = new Set<string>();
  for (const match of String(template ?? '').matchAll(/\{\{\s*([^}]+)\s*\}\}/g)) {
    const key = String(match[1] ?? '').trim();
    if (key) tokens.add(key);
  }
  return Array.from(tokens);
};

export const renderTemplateAsync = async (
  template: unknown,
  resolver: (key: string) => Promise<unknown>,
  formatter: (value: unknown, key: string) => Promise<string> | string,
  options: { bold?: boolean; unresolved?: 'blank' | 'keep' } = {}
): Promise<string> => {
  const raw = String(template ?? '');
  const tokenKeys = extractTemplateTokens(raw);
  if (tokenKeys.length === 0) return raw;

  const replacements = new Map<string, string>();
  await Promise.all(tokenKeys.map(async (key) => {
    const value = await resolver(key);
    if (value === null || value === undefined) {
      replacements.set(key, options.unresolved === 'keep' ? `{{${key}}}` : '');
      return;
    }
    const formatted = sanitizeOutboundDisplay(await formatter(value, key));
    replacements.set(key, formatted && options.bold ? `**${formatted}**` : formatted);
  }));

  return raw.replace(/\{\{\s*([^}]+)\s*\}\}/g, (token, rawKey: string) => {
    const key = String(rawKey ?? '').trim();
    return replacements.has(key) ? replacements.get(key)! : (options.unresolved === 'keep' ? token : '');
  });
};

export const renderTypedTemplateValue = (
  value: any,
  resolver: (key: string) => any,
  options: {
    coerceExact?: (value: any) => any;
    stringify?: (value: any) => string;
    unresolved?: 'blank' | 'keep';
  } = {}
): any => {
  if (Array.isArray(value)) {
    return value.map((item) => renderTypedTemplateValue(item, resolver, options));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      renderTypedTemplateValue(item, resolver, options),
    ]));
  }
  if (typeof value !== 'string') return value;
  const exact = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  if (exact) {
    const resolved = resolver(String(exact[1] || '').trim());
    if (resolved === undefined || resolved === null) return options.unresolved === 'keep' ? value : null;
    return options.coerceExact ? options.coerceExact(resolved) : resolved;
  }
  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (token, rawKey: string) => {
    const resolved = resolver(String(rawKey || '').trim());
    if (resolved === undefined || resolved === null) return options.unresolved === 'keep' ? token : '';
    const text = options.stringify ? options.stringify(resolved) : String(resolved);
    return sanitizeOutboundDisplay(text);
  });
};

export const dedupeRuntimeVariables = <T extends RuntimeVariableDescriptor>(items: T[]): T[] => {
  const seenKeys = new Set<string>();
  const seenSemantic = new Set<string>();
  return items.filter((item) => {
    const key = String(item?.key ?? '').trim();
    if (!key || seenKeys.has(key)) return false;
    const semanticKey = [
      item.scope,
      String(item.moduleId ?? ''),
      String(item.fieldKey ?? ''),
      ...(item.path ?? []),
    ].join('::');
    if (seenSemantic.has(semanticKey)) return false;
    seenKeys.add(key);
    seenSemantic.add(semanticKey);
    return true;
  });
};

const normalizeDigits = (value: unknown) => {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return String(value ?? '')
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)));
};

const comparableValue = (value: any): any => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(comparableValue);
  if (typeof value === 'object') {
    const preferred = value.id ?? value.value ?? value.label ?? value.name ?? value.title ?? value.full_name ?? value.display;
    return preferred === undefined ? JSON.stringify(value) : comparableValue(preferred);
  }
  if (typeof value === 'boolean') return value;
  const text = normalizeDigits(value).replace(/,/g, '').trim();
  const numeric = Number(text);
  return text !== '' && !Number.isNaN(numeric) ? numeric : text;
};

const normalizeList = (value: any): string[] => {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim().startsWith('[')
      ? (() => { try { return JSON.parse(value); } catch { return [value]; } })()
      : [value];
  return raw
    .flatMap((item: any) => Array.isArray(item) ? item : [item])
    .flatMap((item: any) => item && typeof item === 'object'
      ? [item.id, item.value, item.label, item.name, item.title, item.full_name, item.display]
      : [item])
    .map((item: any) => String(comparableValue(item) ?? '').trim())
    .filter(Boolean);
};

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const sameDate = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate();

const daysFromNow = (value: unknown, now: Date): number | null => {
  const date = parseDate(value);
  if (!date) return null;
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return (nowStart.getTime() - dateStart.getTime()) / 86_400_000;
};

const hoursFromNow = (value: unknown, now: Date): number | null => {
  const date = parseDate(value);
  return date ? (now.getTime() - date.getTime()) / 3_600_000 : null;
};

export const CORE_ASYNC_CONDITION_OPERATORS = new Set([
  'is_friday',
  'is_official_holiday',
  'occasion_eq',
  'occasion_contains',
  'occasion_neq',
  'occasion_not_contains',
  'days_before_occasion',
]);

export const evaluateCoreConditionOperator = ({
  operator,
  currentValue,
  previousValue,
  expectedValue,
  now = new Date(),
}: {
  operator: string;
  currentValue: any;
  previousValue?: any;
  expectedValue?: any;
  now?: Date;
}): boolean | undefined => {
  const op = String(operator || 'eq').trim();
  if (CORE_ASYNC_CONDITION_OPERATORS.has(op)) return undefined;
  const current = comparableValue(currentValue);
  const previous = comparableValue(previousValue);
  const expected = comparableValue(expectedValue);
  const currentList = normalizeList(currentValue);
  const expectedList = normalizeList(expectedValue);
  const isEmpty = currentValue === null || currentValue === undefined || String(currentValue).trim() === '' || (Array.isArray(currentValue) && currentValue.length === 0);
  const date = parseDate(currentValue);
  const dayDiff = () => daysFromNow(currentValue, now);
  const hourDiff = () => hoursFromNow(currentValue, now);

  switch (op) {
    case 'eq':
      return Array.isArray(currentValue) || Array.isArray(expectedValue)
        ? JSON.stringify([...currentList].sort()) === JSON.stringify([...expectedList].sort())
        : String(current ?? '') === String(expected ?? '');
    case 'neq': return !evaluateCoreConditionOperator({ operator: 'eq', currentValue, expectedValue, now });
    case 'contains': {
      if (expectedList.length === 0) return false;
      const actual = currentList.length > 0 ? currentList : [String(current ?? '')].filter(Boolean);
      return actual.some((item) => expectedList.some((candidate) => item.toLocaleLowerCase('fa').includes(candidate.toLocaleLowerCase('fa'))));
    }
    case 'not_contains': return !evaluateCoreConditionOperator({ operator: 'contains', currentValue, expectedValue, now });
    case 'starts_with': return String(current ?? '').toLocaleLowerCase('fa').startsWith(String(expected ?? '').toLocaleLowerCase('fa'));
    case 'ends_with': return String(current ?? '').toLocaleLowerCase('fa').endsWith(String(expected ?? '').toLocaleLowerCase('fa'));
    case 'gt': return Number(current) > Number(expected);
    case 'gte': return Number(current) >= Number(expected);
    case 'lt': return Number(current) < Number(expected);
    case 'lte': return Number(current) <= Number(expected);
    case 'in': return currentList.length > 0 ? currentList.some((item) => expectedList.includes(item)) : expectedList.includes(String(current ?? ''));
    case 'not_in': return currentList.length > 0 ? !currentList.some((item) => expectedList.includes(item)) : !expectedList.includes(String(current ?? ''));
    case 'is_true': return currentValue === true || currentValue === 'true' || currentValue === 1;
    case 'is_false': return currentValue === false || currentValue === 'false' || currentValue === 0;
    case 'is_null': case 'is_empty': return isEmpty;
    case 'not_null': case 'not_empty': return !isEmpty;
    case 'multi_count_gt': return currentList.length > Number(expectedValue ?? 0);
    case 'multi_count_lt': return currentList.length < Number(expectedValue ?? 0);
    case 'changed': return JSON.stringify(current ?? null) !== JSON.stringify(previous ?? null);
    case 'changed_from': return JSON.stringify(previous ?? null) === JSON.stringify(expected ?? null) && JSON.stringify(current ?? null) !== JSON.stringify(previous ?? null);
    case 'changed_to': return JSON.stringify(current ?? null) === JSON.stringify(expected ?? null) && JSON.stringify(current ?? null) !== JSON.stringify(previous ?? null);
    case 'is_today': return !!date && sameDate(date, now);
    case 'is_yesterday': { const target = new Date(now); target.setDate(target.getDate() - 1); return !!date && sameDate(date, target); }
    case 'is_tomorrow': { const target = new Date(now); target.setDate(target.getDate() + 1); return !!date && sameDate(date, target); }
    case 'is_this_week': { if (!date) return false; const start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999); return date >= start && date <= end; }
    case 'is_last_week': { if (!date) return false; const startThis = new Date(now); startThis.setDate(now.getDate() - now.getDay()); startThis.setHours(0, 0, 0, 0); const start = new Date(startThis); start.setDate(start.getDate() - 7); const end = new Date(startThis); end.setMilliseconds(-1); return date >= start && date <= end; }
    case 'is_this_month': return !!date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    case 'is_last_month': { const last = new Date(now.getFullYear(), now.getMonth() - 1, 1); return !!date && date.getFullYear() === last.getFullYear() && date.getMonth() === last.getMonth(); }
    case 'day_of_month_eq': return !!date && date.getDate() === Number(expectedValue ?? 0);
    case 'day_of_month_neq': return !!date && date.getDate() !== Number(expectedValue ?? 0);
    case 'day_of_week_eq': return !!date && date.getDay() === Number(expectedValue ?? 0);
    case 'day_of_week_neq': return !!date && date.getDay() !== Number(expectedValue ?? 0);
    case 'days_passed_eq': { const diff = dayDiff(); return diff !== null && Math.floor(diff) === Number(expectedValue ?? 0); }
    case 'days_passed_gt': { const diff = dayDiff(); return diff !== null && diff > Number(expectedValue ?? 0); }
    case 'days_passed_lt': { const diff = dayDiff(); return diff !== null && diff < Number(expectedValue ?? 0); }
    case 'days_remaining_eq': { const diff = dayDiff(); return diff !== null && diff < 0 && Math.floor(Math.abs(diff)) === Number(expectedValue ?? 0); }
    case 'days_remaining_gt': { const diff = dayDiff(); return diff !== null && diff < 0 && Math.abs(diff) > Number(expectedValue ?? 0); }
    case 'days_remaining_lt': { const diff = dayDiff(); return diff !== null && diff < 0 && Math.abs(diff) < Number(expectedValue ?? 0); }
    case 'hours_passed_gt': { const diff = hourDiff(); return diff !== null && diff > Number(expectedValue ?? 0); }
    case 'hours_passed_lt': { const diff = hourDiff(); return diff !== null && diff < Number(expectedValue ?? 0); }
    case 'hours_remaining_gt': { const diff = hourDiff(); return diff !== null && diff < 0 && Math.abs(diff) > Number(expectedValue ?? 0); }
    case 'hours_remaining_lt': { const diff = hourDiff(); return diff !== null && diff < 0 && Math.abs(diff) < Number(expectedValue ?? 0); }
    default: return false;
  }
};

const NEGATIVE_ANY_OPERATORS = new Set(['neq', 'not_in', 'not_contains', 'occasion_neq', 'occasion_not_contains', 'is_false', 'is_null', 'is_empty']);

export const evaluateConditionCollection = async <T extends { field?: unknown; operator?: unknown }>({
  conditionsAll = [],
  conditionsAny = [],
  evaluate,
}: {
  conditionsAll?: T[] | null;
  conditionsAny?: T[] | null;
  evaluate: (condition: T) => Promise<boolean>;
}): Promise<boolean> => {
  for (const condition of conditionsAll || []) {
    if (!await evaluate(condition)) return false;
  }
  const any = conditionsAny || [];
  if (any.length === 0) return true;
  const groups: T[][] = [];
  const byField = new Map<string, T[]>();
  for (const condition of any) {
    const field = String(condition?.field ?? '').trim();
    if (!field) groups.push([condition]);
    else byField.set(field, [...(byField.get(field) || []), condition]);
  }
  byField.forEach((conditions) => {
    if (conditions.length > 1 && conditions.every((item) => NEGATIVE_ANY_OPERATORS.has(String(item?.operator ?? '').trim()))) {
      groups.push(conditions);
    } else {
      conditions.forEach((item) => groups.push([item]));
    }
  });
  for (const group of groups) {
    let passed = true;
    for (const condition of group) {
      if (!await evaluate(condition)) { passed = false; break; }
    }
    if (passed) return true;
  }
  return false;
};
