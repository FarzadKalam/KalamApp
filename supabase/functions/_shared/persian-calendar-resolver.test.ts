import { describe, expect, it } from 'vitest';
import { jalaliToGregorian, resolvePersianCalendarContext } from './persian-calendar-resolver';

describe('Persian calendar resolver', () => {
  it('converts explicit Jalali dates deterministically', () => {
    expect(jalaliToGregorian(1405, 1, 1)).toEqual([2026, 3, 21]);
    expect(jalaliToGregorian(1404, 1, 1)).toEqual([2025, 3, 21]);
  });

  it('exposes verified date conversion to the agent instead of relying on model memory', async () => {
    const context = await resolvePersianCalendarContext('برای ۱۴۰۵/۰۱/۰۱ یک فعالیت بساز.');
    expect(context.explicit_user_dates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        jalali: '1405/01/01',
        gregorian: '2026-03-21',
      }),
    ]));
  });
});
