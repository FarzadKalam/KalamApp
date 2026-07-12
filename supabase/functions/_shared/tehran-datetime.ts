const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

const normalizeDigits = (value: unknown) => String(value ?? '')
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .trim();

const div = (a: number, b: number) => Math.trunc(a / b);

const jalaliToGregorian = (jy: number, jm: number, jd: number) => {
  jy -= 979;
  jm -= 1;
  jd -= 1;
  let days = 365 * jy + div(jy, 33) * 8 + div((jy % 33) + 3, 4);
  for (let i = 0; i < jm; i += 1) days += i < 6 ? 31 : 30;
  days += jd + 79;
  let gy = 1600 + 400 * div(days, 146097);
  days %= 146097;
  let leap = true;
  if (days >= 36525) {
    days -= 1;
    gy += 100 * div(days, 36524);
    days %= 36524;
    if (days >= 365) days += 1;
    else leap = false;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days >= 366) {
    leap = false;
    days -= 1;
    gy += div(days, 365);
    days %= 365;
  }
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  while (gm < monthDays.length && days >= monthDays[gm]) days -= monthDays[gm++];
  return { year: gy, month: gm + 1, day: days + 1 };
};

const localTehranPartsToIso = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
) => new Date(Date.UTC(year, month - 1, day, hour, minute, second) - TEHRAN_OFFSET_MS).toISOString();

export const parseTehranProviderDateTimeToUtcIso = (value: unknown): string | null => {
  const raw = normalizeDigits(value);
  if (!raw) return null;

  const parts = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (parts) {
    const [, yearText, monthText, dayText, hourText = '0', minuteText = '0', secondText = '0'] = parts;
    const sourceYear = Number(yearText);
    const date = sourceYear >= 1300 && sourceYear <= 1499
      ? jalaliToGregorian(sourceYear, Number(monthText), Number(dayText))
      : { year: sourceYear, month: Number(monthText), day: Number(dayText) };
    return localTehranPartsToIso(
      date.year,
      date.month,
      date.day,
      Number(hourText),
      Number(minuteText),
      Number(secondText),
    );
  }

  const normalizedOffset = raw
    .replace(' ', 'T')
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const date = new Date(normalizedOffset);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
