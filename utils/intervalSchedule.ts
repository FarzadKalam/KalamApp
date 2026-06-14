export type IntervalUnit = 'hour' | 'day' | 'week' | 'month';

export type IntervalScheduleParams = {
  lastRunAt?: string | Date | null;
  intervalValue?: number | null;
  intervalUnit?: IntervalUnit | null;
  intervalAt?: string | null;
  intervalFirstRunAt?: string | null;
  intervalMinute?: number | null;
  intervalAllowedFromHour?: number | null;
  intervalAllowedToHour?: number | null;
  intervalDayOfMonth?: number | null;
  now?: Date;
};

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

const normalizeDigitsToEnglish = (value: string) =>
  String(value || '')
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));

export const parseDateSafe = (value: unknown): Date | null => {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const clampIntervalValue = (value: unknown, fallback = 1) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
};

export const normalizeIntervalUnit = (value: unknown, fallback: IntervalUnit = 'day'): IntervalUnit => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'hour' || normalized === 'day' || normalized === 'week' || normalized === 'month') {
    return normalized;
  }
  return fallback;
};

export const parseIntervalAtTime = (value: unknown): { hour: number; minute: number } | null => {
  const raw = normalizeDigitsToEnglish(String(value || '').trim());
  if (!raw) return null;
  const match = raw.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  if (!match) return null;
  const hour = Number.parseInt(String(match[1] || ''), 10);
  const minute = Number.parseInt(String(match[2] || ''), 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
};

const applyTimeOfDay = (base: Date, intervalAt?: string | null) => {
  const parsed = parseIntervalAtTime(intervalAt || null);
  if (!parsed) return new Date(base);
  const next = new Date(base);
  next.setHours(parsed.hour, parsed.minute, 0, 0);
  return next;
};

export const addIntervalToDate = (source: Date, value: number, unit: IntervalUnit) => {
  const safeValue = clampIntervalValue(value, 1);
  const next = new Date(source);
  if (unit === 'hour') {
    next.setHours(next.getHours() + safeValue);
    return next;
  }
  if (unit === 'day') {
    next.setDate(next.getDate() + safeValue);
    return next;
  }
  if (unit === 'week') {
    next.setDate(next.getDate() + (safeValue * 7));
    return next;
  }
  next.setMonth(next.getMonth() + safeValue);
  return next;
};

export const getNextIntervalDueAt = ({
  lastRunAt,
  intervalValue,
  intervalUnit,
  intervalAt,
  now = new Date(),
}: {
  lastRunAt?: string | Date | null;
  intervalValue?: number | null;
  intervalUnit?: IntervalUnit | null;
  intervalAt?: string | null;
  now?: Date;
}) => {
  const normalizedUnit = normalizeIntervalUnit(intervalUnit || 'day');
  const normalizedValue = clampIntervalValue(intervalValue, 1);
  const last = lastRunAt instanceof Date ? lastRunAt : parseDateSafe(lastRunAt);

  if (!last) {
    const anchor = applyTimeOfDay(now, intervalAt || null);
    if (anchor.getTime() > now.getTime()) return anchor;
    return new Date(now);
  }

  let next = addIntervalToDate(last, normalizedValue, normalizedUnit);
  const parsedTime = parseIntervalAtTime(intervalAt || null);
  if (parsedTime) {
    if (normalizedUnit === 'hour') {
      // For hourly: only set the minute within the computed hour (not the full H:M)
      // applyTimeOfDay would collapse e.g. 01:40 → 00:10 causing an infinite loop
      next.setMinutes(parsedTime.minute, 0, 0);
      while (next.getTime() <= last.getTime()) {
        next = addIntervalToDate(next, normalizedValue, normalizedUnit);
        next.setMinutes(parsedTime.minute, 0, 0);
      }
    } else {
      next = applyTimeOfDay(next, intervalAt || null);
      while (next.getTime() <= last.getTime()) {
        next = addIntervalToDate(next, normalizedValue, normalizedUnit);
        next = applyTimeOfDay(next, intervalAt || null);
      }
    }
  }
  return next;
};

const isHourInAllowedWindow = (
  hour: number,
  fromHour: number | null | undefined,
  toHour: number | null | undefined
): boolean => {
  const from = typeof fromHour === 'number' ? fromHour : null;
  const to = typeof toHour === 'number' ? toHour : null;
  if (from === null && to === null) return true;
  if (from !== null && to !== null) {
    if (from <= to) return hour >= from && hour <= to;
    return hour >= from || hour <= to;
  }
  if (from !== null) return hour >= from;
  if (to !== null) return hour <= to;
  return true;
};

export const isIntervalDue = (params: IntervalScheduleParams): boolean => {
  const {
    lastRunAt,
    intervalValue,
    intervalUnit,
    intervalAt,
    intervalFirstRunAt,
    intervalMinute,
    intervalAllowedFromHour,
    intervalAllowedToHour,
    intervalDayOfMonth,
    now = new Date(),
  } = params;

  const normalizedUnit = normalizeIntervalUnit(intervalUnit || 'day');

  if (!lastRunAt && intervalFirstRunAt) {
    const firstRun = parseDateSafe(intervalFirstRunAt);
    if (firstRun && now.getTime() < firstRun.getTime()) return false;
  }

  if (normalizedUnit === 'hour') {
    if (!isHourInAllowedWindow(now.getHours(), intervalAllowedFromHour, intervalAllowedToHour)) {
      return false;
    }
  }

  if (normalizedUnit === 'month' && intervalDayOfMonth) {
    const targetDay = Math.min(Math.max(1, intervalDayOfMonth), 31);
    if (now.getDate() !== targetDay) return false;
  }

  const effectiveIntervalAt = normalizedUnit === 'hour'
    ? (typeof intervalMinute === 'number' ? `00:${String(intervalMinute).padStart(2, '0')}` : null)
    : intervalAt;

  const next = getNextIntervalDueAt({
    lastRunAt,
    intervalValue,
    intervalUnit,
    intervalAt: effectiveIntervalAt,
    now,
  });
  return now.getTime() >= next.getTime();
};
