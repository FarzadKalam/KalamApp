import { beforeEach, describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import {
  buildHrFilterQuery,
  persistHrEmployees,
  persistHrRange,
  readHrRangeFromSearch,
  resolveHrDashboardHref,
  shouldDeferHrFilterUrlSync,
} from './hrFilters';

describe('hrFilters', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('بازه را از query می‌خواند', () => {
    const range = readHrRangeFromSearch('?from=2026-06-10&to=2026-06-20&employees=all');
    expect(range?.[0].format('YYYY-MM-DD')).toBe('2026-06-10');
    expect(range?.[1].format('YYYY-MM-DD')).toBe('2026-06-20');
  });

  it('تا وقتی state با query یکی نشده، sync آدرس را عقب می‌اندازد', () => {
    const currentRange: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs('2026-07-01'), dayjs('2026-07-31')];
    const shouldDefer = shouldDeferHrFilterUrlSync(
      '?from=2026-06-10&to=2026-06-20&employees=emp-1',
      currentRange,
      ['emp-1'],
    );
    expect(shouldDefer).toBe(true);
  });

  it('وقتی state و query یکسان باشند، sync را مجاز می‌کند', () => {
    const range: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs('2026-06-10'), dayjs('2026-06-20')];
    const shouldDefer = shouldDeferHrFilterUrlSync(
      `?${buildHrFilterQuery(range, ['emp-1'])}`,
      range,
      ['emp-1'],
    );
    expect(shouldDefer).toBe(false);
  });

  it('لینک داشبورد HR را از آخرین فیلتر ذخیره‌شده می‌سازد', () => {
    persistHrRange([dayjs('2026-06-10'), dayjs('2026-06-20')]);
    persistHrEmployees(['emp-1', 'emp-2']);
    expect(resolveHrDashboardHref()).toBe('/hr?from=2026-06-10&to=2026-06-20&employees=emp-1%2Cemp-2');
  });
});
