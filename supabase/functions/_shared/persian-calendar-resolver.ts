type CalendarEvent = {
  isHoliday?: boolean;
  event?: string;
  calendarType?: 'jalali' | 'hijri' | 'gregorian';
};

type CalendarDay = {
  disabled?: boolean;
  day?: { jalali?: string };
  events?: { isHoliday?: boolean; list?: CalendarEvent[] };
};

type CalendarMonth = { days?: CalendarDay[] };

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const yearCache = new Map<number, Promise<CalendarMonth[] | null>>();

const toEnglishDigits = (value: unknown) => String(value ?? '')
  .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));

const toPersianDigits = (value: unknown) => String(value ?? '').replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]);

const pad = (value: number) => String(value).padStart(2, '0');

const resolvePublicCalendarBaseUrl = () => String(
  (globalThis as any).Deno?.env?.get('KALAMAPP_PUBLIC_BASE_URL')
  || (globalThis as any).Deno?.env?.get('PUBLIC_APP_URL')
  || (globalThis as any).Deno?.env?.get('PUBLIC_SITE_URL')
  || (globalThis as any).Deno?.env?.get('SITE_URL')
  || '',
).trim().replace(/\/+$/, '');

const gregorianToJalali = (gyInput: number, gmInput: number, gdInput: number): [number, number, number] => {
  const jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  const gMonthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gy = gyInput - 1600;
  const gm = gmInput - 1;
  const gd = gdInput - 1;
  let gDayNumber = 365 * gy + Math.floor((gy + 3) / 4) - Math.floor((gy + 99) / 100) + Math.floor((gy + 399) / 400);
  for (let index = 0; index < gm; index += 1) gDayNumber += gMonthDays[index];
  if (gm > 1 && ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0)) gDayNumber += 1;
  gDayNumber += gd;
  let jDayNumber = gDayNumber - 79;
  const jNp = Math.floor(jDayNumber / 12053);
  jDayNumber %= 12053;
  let jy = 979 + 33 * jNp + 4 * Math.floor(jDayNumber / 1461);
  jDayNumber %= 1461;
  if (jDayNumber >= 366) {
    jy += Math.floor((jDayNumber - 1) / 365);
    jDayNumber = (jDayNumber - 1) % 365;
  }
  let jm = 0;
  for (let index = 0; index < 11 && jDayNumber >= jDaysInMonth[index]; index += 1) {
    jDayNumber -= jDaysInMonth[index];
    jm = index + 1;
  }
  return [jy, jm + 1, jDayNumber + 1];
};

/** Deterministic conversion used for record dates; input months are 1-based. */
export const jalaliToGregorian = (jyInput: number, jmInput: number, jdInput: number): [number, number, number] => {
  const jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  const gMonthDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let jy = jyInput - 979;
  const jm = jmInput - 1;
  const jd = jdInput - 1;
  let jDayNumber = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4);
  for (let index = 0; index < jm; index += 1) jDayNumber += jDaysInMonth[index];
  jDayNumber += jd;
  let gDayNumber = jDayNumber + 79;
  let gy = 1600 + 400 * Math.floor(gDayNumber / 146097);
  gDayNumber %= 146097;
  let leap = true;
  if (gDayNumber >= 36525) {
    gDayNumber -= 1;
    gy += 100 * Math.floor(gDayNumber / 36524);
    gDayNumber %= 36524;
    if (gDayNumber >= 365) gDayNumber += 1;
    else leap = false;
  }
  gy += 4 * Math.floor(gDayNumber / 1461);
  gDayNumber %= 1461;
  if (gDayNumber >= 366) {
    leap = false;
    gDayNumber -= 1;
    gy += Math.floor(gDayNumber / 365);
    gDayNumber %= 365;
  }
  let gm = 0;
  while (gDayNumber >= gMonthDays[gm] + (gm === 1 && !leap ? -1 : 0)) {
    gDayNumber -= gMonthDays[gm] + (gm === 1 && !leap ? -1 : 0);
    gm += 1;
  }
  return [gy, gm + 1, gDayNumber + 1];
};

const getTehranDateParts = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: read('year'), month: read('month'), day: read('day') };
};

const toIsoDate = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const toJalaliKey = (year: number, month: number, day: number) => `${year}/${pad(month)}/${pad(day)}`;

const isValidJalaliDate = (year: number, month: number, day: number) => year >= 1200 && year <= 1600 && month >= 1 && month <= 12 && day >= 1 && day <= (month <= 6 ? 31 : month <= 11 ? 30 : 30);

const isExactJalaliDate = (year: number, month: number, day: number) => {
  if (!isValidJalaliDate(year, month, day)) return false;
  const [gregorianYear, gregorianMonth, gregorianDay] = jalaliToGregorian(year, month, day);
  const [resolvedYear, resolvedMonth, resolvedDay] = gregorianToJalali(gregorianYear, gregorianMonth, gregorianDay);
  return resolvedYear === year && resolvedMonth === month && resolvedDay === day;
};

const loadCalendarYear = async (jalaliYear: number): Promise<CalendarMonth[] | null> => {
  const baseUrl = resolvePublicCalendarBaseUrl();
  if (!baseUrl || !Number.isFinite(jalaliYear)) return null;
  if (!yearCache.has(jalaliYear)) {
    yearCache.set(jalaliYear, fetch(`${baseUrl}/calendar/${jalaliYear}.json`, { cache: 'force-cache' })
      .then(async (response) => response.ok ? await response.json() : null)
      .then((data) => Array.isArray(data) ? data as CalendarMonth[] : null)
      .catch(() => null));
  }
  return yearCache.get(jalaliYear) || null;
};

export const getOfficialCalendarEventsForJalaliDate = async (year: number, month: number, day: number) => {
  const calendar = await loadCalendarYear(year);
  if (!calendar) return { available: false, events: [] as CalendarEvent[] };
  const monthDays = calendar[month - 1]?.days || [];
  const match = monthDays.find(
    (item) => !item?.disabled && Number(toEnglishDigits(item?.day?.jalali || '0')) === day,
  );
  return { available: true, events: Array.isArray(match?.events?.list) ? match.events.list : [] as CalendarEvent[] };
};

/** همهٔ مسیرهای سروری، روز را در منطقهٔ زمانی رسمی ایران به دادهٔ سالانهٔ واحد نگاشت می‌کنند. */
export const getOfficialCalendarEventsForDate = async (value: unknown) => {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return { available: false, events: [] as CalendarEvent[] };
  const tehran = getTehranDateParts(date);
  const [year, month, day] = gregorianToJalali(tehran.year, tehran.month, tehran.day);
  return getOfficialCalendarEventsForJalaliDate(year, month, day);
};

export const isFridayAtTehranDate = (value: unknown) => {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return false;
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', weekday: 'short' }).format(date);
  return weekday === 'Fri';
};

const extractExplicitJalaliDateKeys = (message: string) => Array.from(toEnglishDigits(message).matchAll(/(^|[^\d])((?:13|14)\d{2})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{1,2})(?!\d)/g))
  .map((match) => ({ year: Number(match[2]), month: Number(match[3]), day: Number(match[4]), input: `${match[2]}/${match[3]}/${match[4]}` }))
  .filter((date) => isExactJalaliDate(date.year, date.month, date.day));

const hasRelativeDateIntent = (message: string) => /امروز|فردا|پس.?فردا|هفته.?آینده|هفته.?بعد|شنبه|یکشنبه|دوشنبه|سه.?شنبه|چهارشنبه|پنجشنبه|جمعه|موعد|مهلت|شروع|تکمیل|فرآیند|فرایند|فعالیت|وظیفه/i.test(message);

const formatWeekday = (isoDate: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'Asia/Tehran', weekday: 'long',
}).format(new Date(`${isoDate}T12:00:00+03:30`));

const resolveDateDetails = async (year: number, month: number, day: number, source: string) => {
  const [gregorianYear, gregorianMonth, gregorianDay] = jalaliToGregorian(year, month, day);
  const gregorian = toIsoDate(gregorianYear, gregorianMonth, gregorianDay);
  const lookup = await getOfficialCalendarEventsForJalaliDate(year, month, day);
  const events = lookup.events.map((event) => ({
    title: String(event?.event || '').trim(),
    is_official_holiday: event?.isHoliday === true,
    calendar_type: event?.calendarType || 'jalali',
  })).filter((event) => event.title);
  return {
    source,
    jalali: toJalaliKey(year, month, day),
    jalali_fa: toPersianDigits(toJalaliKey(year, month, day)),
    gregorian,
    tehran_weekday_fa: formatWeekday(gregorian),
    is_friday: formatWeekday(gregorian) === 'جمعه',
    is_official_holiday: events.some((event) => event.is_official_holiday),
    occasions: events,
    calendar_lookup: lookup.available ? 'verified' : 'unavailable',
  };
};

export const resolvePersianCalendarContext = async (message: string, now = new Date()) => {
  const tehran = getTehranDateParts(now);
  const [currentYear, currentMonth, currentDay] = gregorianToJalali(tehran.year, tehran.month, tehran.day);
  const explicitDates = extractExplicitJalaliDateKeys(message);
  const dateRequests = new Map<string, { year: number; month: number; day: number; source: string }>();
  dateRequests.set(toJalaliKey(currentYear, currentMonth, currentDay), { year: currentYear, month: currentMonth, day: currentDay, source: 'today' });
  explicitDates.forEach((date) => dateRequests.set(toJalaliKey(date.year, date.month, date.day), { ...date, source: 'explicit_user_date' }));

  if (hasRelativeDateIntent(message)) {
    for (let offset = 1; offset <= 21; offset += 1) {
      const candidate = new Date(Date.UTC(tehran.year, tehran.month - 1, tehran.day + offset, 12));
      const [year, month, day] = gregorianToJalali(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, candidate.getUTCDate());
      dateRequests.set(toJalaliKey(year, month, day), { year, month, day, source: `next_${offset}_days` });
    }
  }

  const resolvedDates = await Promise.all(Array.from(dateRequests.values()).map((date) => resolveDateDetails(date.year, date.month, date.day, date.source)));
  const today = resolvedDates.find((date) => date.source === 'today') || null;
  return {
    calendar: 'jalali',
    timezone: 'Asia/Tehran',
    source: resolvePublicCalendarBaseUrl() ? 'organization_calendar' : 'calendar_source_not_configured',
    tehran_now_jalali: new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', dateStyle: 'full', timeStyle: 'short' }).format(now),
    tehran_today_gregorian: toIsoDate(tehran.year, tehran.month, tehran.day),
    today,
    explicit_user_dates: resolvedDates.filter((date) => date.source === 'explicit_user_date'),
    upcoming_dates: resolvedDates.filter((date) => date.source.startsWith('next_')),
    guidance: 'برای تاریخ صریح جلالی فقط از explicit_user_dates استفاده کن و مقدار gregorian آن را برای فیلدهای تاریخ/زمان برگردان. برای عبارت نسبی (فردا، جمعه، هفته آینده) از upcoming_dates استفاده کن. مناسبت یا تعطیلی را فقط هنگامی قطعی اعلام کن که calendar_lookup=verified باشد. اگر زمان، سال یا تاریخ لازم برای ثبت فرآیند/فعالیت روشن نیست، از کاربر سؤال دقیق بپرس و تاریخ را حدس نزن.',
  };
};
