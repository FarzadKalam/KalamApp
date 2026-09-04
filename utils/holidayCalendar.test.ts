import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const official1405 = JSON.parse(
  readFileSync('public/calendar/1405.json', 'utf8').replace(/^\uFEFF/, ''),
);

const loadHolidayCalendar = async () => {
  vi.resetModules();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => official1405,
    })
  );

  return import('./holidayCalendar');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('holidayCalendar', () => {
  it('keeps the official Hijri day label alongside the official occasion date', () => {
    const khordadSix = official1405[2].days.find(
      (day: any) => !day.disabled && day.day?.jalali === '۶'
    );
    const farvardinOne = official1405[0].days.find(
      (day: any) => !day.disabled && day.day?.jalali === '۱'
    );

    expect(khordadSix?.day?.hijri).toBe('۱۰');
    expect(farvardinOne?.day?.hijri).toBe('۱');
  });

  it('uses the official 1405 date for Eid al-Adha without a runtime date patch', async () => {
    const { getHolidaySummaryForDate } = await loadHolidayCalendar();

    const staleDate = await getHolidaySummaryForDate('2026-05-26');
    const officialDate = await getHolidaySummaryForDate('2026-05-27');

    expect(staleDate?.isOfficialHoliday).toBe(false);
    expect(staleDate?.occasions.map((item) => item.title)).not.toContain('عید قربان');

    expect(officialDate?.isOfficialHoliday).toBe(true);
    expect(officialDate?.occasions.map((item) => item.title)).toContain('عید قربان');
  });

  it('keeps Eid al-Ghadir and the national Imam Khomeini holiday on Khordad 14', async () => {
    const { getHolidaySummaryForDate } = await loadHolidayCalendar();

    const staleDate = await getHolidaySummaryForDate('2026-06-03');
    const officialDate = await getHolidaySummaryForDate('2026-06-04');

    expect(staleDate?.occasions.map((item) => item.title)).not.toContain('عید غدیر');

    expect(officialDate?.isOfficialHoliday).toBe(true);
    expect(officialDate?.occasions.map((item) => item.title)).toEqual(
      expect.arrayContaining(['رحلت امام خمینی', 'عید غدیر'])
    );
  });

  it('distinguishes the weekly Friday closure from a statutory official holiday', async () => {
    const { getHolidaySummaryForDate } = await loadHolidayCalendar();
    const friday = await getHolidaySummaryForDate('2026-03-27');

    expect(friday?.isFriday).toBe(true);
    expect(friday?.isOfficialHoliday).toBe(false);
  });
});
