import dayjs from 'dayjs';

// --- توابع عمومی ---

export const toPersianNumber = (num: any): string => {
  if (num === null || num === undefined || num === '') return '';
  const str = String(num);
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return str.replace(/\d/g, (digit) => persianDigits[parseInt(digit)]);
};

export const fromPersianNumber = (persianNum: string): number => {
  if (!persianNum) return 0;
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  let str = String(persianNum);
  for (let i = 0; i < 10; i++) {
    str = str.replace(new RegExp(persianDigits[i], 'g'), String(i));
  }
  return parseFloat(str) || 0;
};

export const formatPersianPrice = (num: any, withComma = true): string => {
  if (num === null || num === undefined || num === '') return '';
  const number = Number(num);
  if (isNaN(number)) return String(num);
  const str = withComma ? number.toLocaleString('en-US') : String(number);
  return toPersianNumber(str);
};

// --- توابع تاریخ و زمان ---

const pad2 = (val: number | string) => String(val).padStart(2, '0');
const DEBUG_DATES = typeof window !== 'undefined' && (window as any).__DEBUG_DATES__;

const formatWithIntl = (dateObj: Date, format: string) => {
  const withTime = format.includes('HH');
  const withSeconds = format.includes('ss');
  const options: Intl.DateTimeFormatOptions = withTime
    ? {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: withSeconds ? '2-digit' : undefined,
        hour12: false
      }
    : { year: 'numeric', month: '2-digit', day: '2-digit' };
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', options).format(dateObj);
};

const stripTimezone = (val: string) =>
  val.replace(/([zZ]|[+-]\d{2}(?::?\d{2})?)$/, '');

const normalizeDateString = (val: string) => {
  let trimmed = val.trim();
  trimmed = trimmed.includes(' ') ? trimmed.replace(' ', 'T') : trimmed;
  trimmed = trimmed.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  trimmed = trimmed.replace(/\.(\d{3})\d+/, '.$1');
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);
  return { normalized: trimmed, hasTz };
};

const parseJalaliParts = (val: string) => {
  const match = val.match(
    /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/
  );
  if (!match) return null;
  return {
    y: Number(match[1]),
    m: Number(match[2]),
    d: Number(match[3]),
    hh: Number(match[4] ?? 0),
    mm: Number(match[5] ?? 0),
    ss: Number(match[6] ?? 0),
    hasTime: !!match[4],
  };
};

export const safeJalaliFormat = (value: any, format: string = 'YYYY/MM/DD'): string => {
  if (!value) return '';
  try {
    if (typeof value === 'string') {
      const parts = parseJalaliParts(value);
      if (parts && parts.y >= 1300 && parts.y <= 1499) {
        const datePart = `${parts.y}/${pad2(parts.m)}/${pad2(parts.d)}`;
        if (format.includes('HH')) {
          const timePart = `${pad2(parts.hh)}:${pad2(parts.mm)}`;
          return `${datePart} ${timePart}`;
        }
        return datePart;
      }
    }
    if (dayjs.isDayjs(value)) {
      const dateObj = value.toDate();
      const formatted = formatWithIntl(dateObj, format);
      if (DEBUG_DATES) {
        // eslint-disable-next-line no-console
        console.log('[safeJalaliFormat:dayjs]', { value: value.format(), formatted });
      }
      return formatted;
    }
    if (value instanceof Date) {
      const formatted = formatWithIntl(value, format);
      if (DEBUG_DATES) {
        // eslint-disable-next-line no-console
        console.log('[safeJalaliFormat:date]', { value, formatted });
      }
      return formatted;
    }
    const { normalized } = normalizeDateString(String(value));
    const dateObj = new Date(normalized);
    if (isNaN(dateObj.getTime())) {
      const base = parseDateValue(value);
      if (!base || !base.isValid()) return '';
      const formatted = formatWithIntl(base.toDate(), format);
      if (DEBUG_DATES) {
        // eslint-disable-next-line no-console
        console.log('[safeJalaliFormat:fallback]', { value, normalized, formatted });
      }
      return formatted;
    }
    const formatted = formatWithIntl(dateObj, format);
    if (DEBUG_DATES) {
      // eslint-disable-next-line no-console
      console.log('[safeJalaliFormat:string]', { value, normalized, formatted });
    }
    return formatted;
  } catch (e) {
    try {
      const { normalized } = normalizeDateString(String(value));
      const d = new Date(normalized);
      if (isNaN(d.getTime())) return '';
      return formatWithIntl(d, format);
    } catch {
      return '';
    }
  }
};

export const formatPersianTime = (val: any): string => {
  if (!val) return '';
  try {
    if (typeof val === 'string' && val.includes(':')) {
       const parts = val.split(':');
       return toPersianNumber(`${parts[0]}:${parts[1]}`);
    }
    const d = dayjs(val);
    if (!d.isValid()) return '';
    return toPersianNumber(d.format('HH:mm'));
  } catch { return ''; }
};

export const toEnglishTimeForDB = (val: any): string | null => {
  if (!val) return null;
  try {
    if (dayjs.isDayjs(val)) {
      return val.format('HH:mm:ss');
    }
    const str = String(val);
    const englishStr = str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
    if (englishStr.length === 5) return `${englishStr}:00`;
    return englishStr;
  } catch { return null; }
};

export const toGregorianDateString = (
  dateVal: any,
  format: string = 'YYYY-MM-DD',
  options?: { setMidday?: boolean }
): string | null => {
  if (!dateVal) return null;
  try {
    const parsed = parseDateValue(dateVal);
    if (!parsed || !parsed.isValid()) return null;
    const hasCalendar = (o: any): o is { calendar: (cal: string) => dayjs.Dayjs } =>
      !!o && typeof o.calendar === 'function';
    let greg = hasCalendar(parsed) ? parsed.calendar('gregory') : parsed;
    if (options?.setMidday) {
      greg = greg.hour(12).minute(0).second(0).millisecond(0);
    }
    return greg.format(format);
  } catch (e) { return null; }
};

export const parseDateValue = (val: any) => {
  if (!val) return null;

  const finalize = (d: dayjs.Dayjs | null) => {
    if (!d || !dayjs.isDayjs(d) || !d.isValid()) return null;
    return d;
  };

  if (dayjs.isDayjs(val)) {
    const out = finalize(val);
    if (DEBUG_DATES) {
      // eslint-disable-next-line no-console
      console.log('[parseDateValue:dayjs]', { input: val?.format?.(), output: out?.format?.() });
    }
    return out;
  }

  if (val instanceof Date) {
    const out = finalize(dayjs(val));
    if (DEBUG_DATES) {
      // eslint-disable-next-line no-console
      console.log('[parseDateValue:date]', { input: val, output: out?.format?.() });
    }
    return out;
  }

  if (typeof val === 'string') {
    const timeMatch = val.match(/^(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/);
    if (timeMatch) {
      const clean = stripTimezone(val);
      const normalized = timeMatch[3] ? clean : `${clean}:00`;
      const out = finalize(dayjs(`1970-01-01T${normalized}`));
      if (DEBUG_DATES) {
        // eslint-disable-next-line no-console
        console.log('[parseDateValue:time]', { input: val, normalized, output: out?.format?.() });
      }
      return out;
    }

    const dateTimeMatch = val.match(
      /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/
    );
    if (dateTimeMatch) {
      const y = Number(dateTimeMatch[1]);
      const hasTime = !!dateTimeMatch[4];

      const isJalaliYear = y >= 1300 && y <= 1499;
      if (isJalaliYear) {
        const clean = stripTimezone(val).replace(' ', 'T');
        let jalali = dayjs(clean, { jalali: true });
        if (!hasTime && jalali.isValid()) {
          jalali = jalali.hour(12).minute(0).second(0).millisecond(0);
        }
        const out = finalize(jalali);
        if (DEBUG_DATES) {
          // eslint-disable-next-line no-console
          console.log('[parseDateValue:jalali]', { input: val, clean, output: out?.format?.() });
        }
        return out;
      }

      const { normalized } = normalizeDateString(val);
      const dateObj = new Date(normalized);
      let gregorian = !isNaN(dateObj.getTime()) ? dayjs(dateObj) : dayjs(normalized);
      if (!gregorian.isValid()) {
        gregorian = dayjs(stripTimezone(normalized));
      }
      if (gregorian.isValid() && !hasTime) {
        gregorian = gregorian.hour(12).minute(0).second(0).millisecond(0);
      }
      const out = finalize(gregorian);
      if (DEBUG_DATES) {
        // eslint-disable-next-line no-console
        console.log('[parseDateValue:gregorian]', { input: val, normalized, output: out?.format?.() });
      }
      return out;
    }
  }

  const out = finalize(dayjs(val));
  if (DEBUG_DATES) {
    // eslint-disable-next-line no-console
    console.log('[parseDateValue:other]', { input: val, output: out?.format?.() });
  }
  return out;
};