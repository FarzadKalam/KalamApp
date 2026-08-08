import dayjs, { type Dayjs } from 'dayjs';
import { parseDateValue, toGregorianDateString } from './persianNumberFormatter';

export const HR_SESSION_KEY_RANGE = 'hr_filter_range';
export const HR_SESSION_KEY_RANGE_INITIALIZED = 'hr_filter_range_initialized';
export const HR_SESSION_KEY_EMPLOYEES = 'hr_filter_employee_ids';
export const HR_QUERY_KEY_EMPLOYEES = 'employees';
export const HR_QUERY_VALUE_ALL_EMPLOYEES = 'all';

const parseDateParam = (rawDate: string | null): Dayjs | null => {
  if (!rawDate) return null;
  const parsed = parseDateValue(rawDate);
  if (!parsed || !parsed.isValid()) return null;
  const gregorian = toGregorianDateString(parsed, 'YYYY-MM-DD');
  if (!gregorian) return null;
  const year = Number(gregorian.slice(0, 4));
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null;
  const normalized = dayjs(gregorian);
  return normalized.isValid() ? normalized : null;
};

export const toNativeGregorianDateString = (value: Dayjs | null | undefined): string | null => {
  if (!value?.isValid?.()) return null;
  const date = value.toDate();
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const readStorageValue = (storage: Storage | null, key: string): string | null => {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorageValue = (storage: Storage | null, key: string, value: string) => {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {}
};

const readPersistedJson = (key: string): unknown => {
  if (typeof window === 'undefined') return null;
  const candidates = [
    readStorageValue(window.sessionStorage, key),
    readStorageValue(window.localStorage, key),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  return null;
};

const normalizePersistedHrRange = (value: unknown): [Dayjs, Dayjs] | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { from?: unknown; to?: unknown };
  const savedFrom = parseDateParam(typeof raw.from === 'string' ? raw.from : null);
  const savedTo = parseDateParam(typeof raw.to === 'string' ? raw.to : null);
  if (savedFrom?.isValid() && savedTo?.isValid() && savedFrom.valueOf() <= savedTo.valueOf()) {
    return [savedFrom.startOf('day'), savedTo.endOf('day')];
  }
  return null;
};

export const readPersistedHrRange = (): [Dayjs, Dayjs] | null => {
  return normalizePersistedHrRange(readPersistedJson(HR_SESSION_KEY_RANGE));
};

export const persistHrRange = (range: [Dayjs, Dayjs]) => {
  if (typeof window === 'undefined') return;
  const from = toNativeGregorianDateString(range[0]);
  const to = toNativeGregorianDateString(range[1]);
  if (!from || !to) return;
  const serialized = JSON.stringify({ from, to });
  writeStorageValue(window.sessionStorage, HR_SESSION_KEY_RANGE, serialized);
  writeStorageValue(window.localStorage, HR_SESSION_KEY_RANGE, serialized);
  writeStorageValue(window.localStorage, HR_SESSION_KEY_RANGE_INITIALIZED, '1');
};

export const getInitialHrRangeFromQuery = (
  search: string = typeof window !== 'undefined' ? window.location.search : '',
): [Dayjs, Dayjs] => {
  const fromUrl = readHrRangeFromSearch(search);
  if (fromUrl) return fromUrl;
  const persistedRange = readPersistedHrRange();
  if (persistedRange) return persistedRange;
  const initialRange: [Dayjs, Dayjs] = [dayjs().startOf('month').startOf('day'), dayjs().endOf('month').endOf('day')];
  if (typeof window !== 'undefined') {
    const initialized = readStorageValue(window.localStorage, HR_SESSION_KEY_RANGE_INITIALIZED) === '1';
    if (!initialized) {
      persistHrRange(initialRange);
    }
  }
  return initialRange;
};

export const readHrRangeFromSearch = (search: string): [Dayjs, Dayjs] | null => {
  const query = new URLSearchParams(search);
  const from = parseDateParam(query.get('from'));
  const to = parseDateParam(query.get('to'));
  if (from && to && from.valueOf() <= to.valueOf()) {
    return [from.startOf('day'), to.endOf('day')];
  }
  return null;
};

export const isSameHrRange = (left: [Dayjs, Dayjs], right: [Dayjs, Dayjs]) => {
  const leftFrom = toNativeGregorianDateString(left[0].startOf('day'));
  const leftTo = toNativeGregorianDateString(left[1].endOf('day'));
  const rightFrom = toNativeGregorianDateString(right[0].startOf('day'));
  const rightTo = toNativeGregorianDateString(right[1].endOf('day'));
  return leftFrom === rightFrom && leftTo === rightTo;
};

/**
 * بازهٔ فعلی را یک ماه جابه‌جا می‌کند.
 * بازه‌های سفارشی نیز بر پایهٔ همان تاریخ‌های انتخاب‌شده جابه‌جا می‌شوند.
 */
export const shiftHrRangeByMonths = (
  range: [Dayjs, Dayjs],
  monthOffset: number,
): [Dayjs, Dayjs] => [
  range[0].add(monthOffset, 'month').startOf('day'),
  range[1].add(monthOffset, 'month').endOf('day'),
];

export const parseHrEmployeeFilterParam = (rawValue: string | null): { hasValue: boolean; ids: string[] } => {
  if (rawValue === null) return { hasValue: false, ids: [] };
  const trimmed = rawValue.trim();
  if (!trimmed || trimmed === HR_QUERY_VALUE_ALL_EMPLOYEES) return { hasValue: true, ids: [] };
  return {
    hasValue: true,
    ids: trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  };
};

export const readPersistedHrEmployees = (): string[] | null => {
  const parsed = readPersistedJson(HR_SESSION_KEY_EMPLOYEES);
  return Array.isArray(parsed) ? parsed.map((id) => String(id || '').trim()).filter(Boolean) : null;
};

export const persistHrEmployees = (employeeIds: string[]) => {
  if (typeof window === 'undefined') return;
  const serialized = JSON.stringify(employeeIds);
  writeStorageValue(window.sessionStorage, HR_SESSION_KEY_EMPLOYEES, serialized);
  writeStorageValue(window.localStorage, HR_SESSION_KEY_EMPLOYEES, serialized);
};

const normalizeEmployeeIds = (employeeIds: string[]) =>
  employeeIds.map((id) => String(id || '').trim()).filter(Boolean);

export const isSameHrEmployeeFilter = (left: string[], right: string[]) => {
  const leftIds = normalizeEmployeeIds(left);
  const rightIds = normalizeEmployeeIds(right);
  return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index]);
};

export const buildHrFilterQuery = (range: [Dayjs, Dayjs], employeeIds: string[]) => {
  const params = new URLSearchParams();
  params.set('from', toNativeGregorianDateString(range[0].startOf('day')) || '');
  params.set('to', toNativeGregorianDateString(range[1].endOf('day')) || '');
  params.set(HR_QUERY_KEY_EMPLOYEES, employeeIds.length ? employeeIds.join(',') : HR_QUERY_VALUE_ALL_EMPLOYEES);
  return params.toString();
};

export const shouldDeferHrFilterUrlSync = (search: string, range: [Dayjs, Dayjs], employeeIds: string[]) => {
  const rangeFromUrl = readHrRangeFromSearch(search);
  if (rangeFromUrl && !isSameHrRange(range, rangeFromUrl)) {
    return true;
  }
  const employeesFromUrl = parseHrEmployeeFilterParam(new URLSearchParams(search).get(HR_QUERY_KEY_EMPLOYEES));
  if (employeesFromUrl.hasValue && !isSameHrEmployeeFilter(employeeIds, employeesFromUrl.ids)) {
    return true;
  }
  return false;
};

export const resolveHrDashboardHref = (basePath: string = '/hr') => {
  const range = readPersistedHrRange();
  if (!range) return basePath;
  return `${basePath}?${buildHrFilterQuery(range, readPersistedHrEmployees() || [])}`;
};
