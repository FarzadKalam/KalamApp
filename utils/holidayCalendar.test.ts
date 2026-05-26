import { afterEach, describe, expect, it, vi } from 'vitest';

const buildYearData = () => {
  const months = Array.from({ length: 12 }, () => ({ days: [] as unknown[] }));

  months[2] = {
    days: [
      {
        day: { jalali: '۵', gregorian: '26', hijri: '١٠' },
        events: {
          isHoliday: true,
          list: [
            { isHoliday: true, event: 'عید سعید قربان', calendarType: 'hijri' },
            { isHoliday: false, event: 'آغاز دههٔ امامت و ولایت', calendarType: 'hijri' },
          ],
        },
      },
      {
        day: { jalali: '۶', gregorian: '27', hijri: '١١' },
        events: { isHoliday: false, list: [] },
      },
      {
        day: { jalali: '۱۳', gregorian: '3', hijri: '١٨' },
        events: {
          isHoliday: true,
          list: [{ isHoliday: true, event: 'عید سعید غدیر خم(۱۰ ه‍‍.ق)', calendarType: 'hijri' }],
        },
      },
      {
        day: { jalali: '۱۴', gregorian: '4', hijri: '١٩' },
        events: {
          isHoliday: true,
          list: [{ isHoliday: true, event: 'رحلت حضرت امام خمینی', calendarType: 'jalali' }],
        },
      },
    ],
  };

  return months;
};

const loadHolidayCalendar = async () => {
  vi.resetModules();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => buildYearData(),
    })
  );

  return import('./holidayCalendar');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('holidayCalendar', () => {
  it('keeps Eid al-Adha 1405 on Khordad 6 instead of the stale Khordad 5 source date', async () => {
    const { getHolidaySummaryForDate } = await loadHolidayCalendar();

    const staleDate = await getHolidaySummaryForDate('2026-05-26');
    const officialDate = await getHolidaySummaryForDate('2026-05-27');

    expect(staleDate?.isOfficialHoliday).toBe(false);
    expect(staleDate?.occasions.map((item) => item.title)).not.toContain('عید سعید قربان');

    expect(officialDate?.isOfficialHoliday).toBe(true);
    expect(officialDate?.occasions.map((item) => item.title)).toContain('عید سعید قربان');
  });

  it('moves Eid al-Ghadir 1405 to Khordad 14 while preserving existing national holidays', async () => {
    const { getHolidaySummaryForDate } = await loadHolidayCalendar();

    const staleDate = await getHolidaySummaryForDate('2026-06-03');
    const officialDate = await getHolidaySummaryForDate('2026-06-04');

    expect(staleDate?.occasions.map((item) => item.title)).not.toContain('عید سعید غدیر خم(۱۰ ه‍‍.ق)');

    expect(officialDate?.isOfficialHoliday).toBe(true);
    expect(officialDate?.occasions.map((item) => item.title)).toEqual(
      expect.arrayContaining(['رحلت حضرت امام خمینی', 'عید سعید غدیر خم(۱۰ ه‍‍.ق)'])
    );
  });
});
