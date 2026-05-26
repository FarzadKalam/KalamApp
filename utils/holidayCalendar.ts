import DateObject from 'react-date-object';
import gregorian from 'react-date-object/calendars/gregorian';
import persian from 'react-date-object/calendars/persian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import persian_fa from 'react-date-object/locales/persian_fa';

export type OccasionCategory = 'national' | 'religious' | 'global';

export type HolidayOccasion = {
  title: string;
  category: OccasionCategory;
  isHoliday: boolean;
  source: 'jalali' | 'hijri' | 'gregorian';
};

export type HolidayDaySummary = {
  dateKey: string;
  jalaliLabel: string;
  weekdayLabel: string;
  isFriday: boolean;
  isOfficialHoliday: boolean;
  occasions: HolidayOccasion[];
  categories: Record<OccasionCategory, HolidayOccasion[]>;
};

export type HolidayOccasionOption = {
  label: string;
  value: string;
  isHoliday: boolean;
  source: HolidayOccasion['source'];
};

type HolidayApiEvent = {
  isHoliday?: boolean;
  event?: string;
  calendarType?: 'jalali' | 'hijri' | 'gregorian';
};

type HolidayApiDay = {
  day?: {
    jalali?: string;
    gregorian?: string;
    hijri?: string;
  };
  events?: {
    isHoliday?: boolean;
    list?: HolidayApiEvent[];
  };
};

type HolidayApiMonth = {
  days?: HolidayApiDay[];
};

type CalendarEventMove = {
  from: string;
  to: string;
  eventIncludes: string;
  event: HolidayApiEvent;
};

const OCCASION_EMPTY_GROUPS: Record<OccasionCategory, HolidayOccasion[]> = {
  national: [],
  religious: [],
  global: [],
};

const yearCache = new Map<number, Promise<HolidayApiMonth[] | null>>();
const occasionOptionsCache = new Map<string, Promise<HolidayOccasionOption[]>>();

const FALLBACK_HOLIDAY_OCCASION_OPTIONS: HolidayOccasionOption[] = [
  { label: 'عید سعید قربان', value: 'عید سعید قربان', isHoliday: true, source: 'hijri' },
  { label: 'عید سعید غدیر خم', value: 'عید سعید غدیر خم', isHoliday: true, source: 'hijri' },
  { label: 'عید سعید فطر', value: 'عید سعید فطر', isHoliday: true, source: 'hijri' },
  { label: 'تاسوعای حسینی', value: 'تاسوعای حسینی', isHoliday: true, source: 'hijri' },
  { label: 'عاشورای حسینی', value: 'عاشورای حسینی', isHoliday: true, source: 'hijri' },
  { label: 'اربعین حسینی', value: 'اربعین حسینی', isHoliday: true, source: 'hijri' },
  { label: 'رحلت حضرت امام خمینی', value: 'رحلت حضرت امام خمینی', isHoliday: true, source: 'jalali' },
  { label: 'قیام 15 خرداد', value: 'قیام 15 خرداد', isHoliday: true, source: 'jalali' },
  { label: 'روز جمهوری اسلامی', value: 'روز جمهوری اسلامی', isHoliday: true, source: 'jalali' },
  { label: 'روز طبیعت', value: 'روز طبیعت', isHoliday: true, source: 'jalali' },
];

const CALENDAR_EVENT_MOVES: CalendarEventMove[] = [
  {
    from: '1405/03/05',
    to: '1405/03/06',
    eventIncludes: 'عید سعید قربان',
    event: {
      isHoliday: true,
      event: 'عید سعید قربان',
      calendarType: 'hijri',
    },
  },
  {
    from: '1405/03/05',
    to: '1405/03/06',
    eventIncludes: 'آغاز دههٔ امامت و ولایت',
    event: {
      isHoliday: false,
      event: 'آغاز دههٔ امامت و ولایت',
      calendarType: 'hijri',
    },
  },
  {
    from: '1405/03/13',
    to: '1405/03/14',
    eventIncludes: 'عید سعید غدیر خم',
    event: {
      isHoliday: true,
      event: 'عید سعید غدیر خم(۱۰ ه‍‍.ق)',
      calendarType: 'hijri',
    },
  },
];

const toEnglishDigits = (value: string) =>
  String(value || '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

const toJsDate = (value?: Date | string | number | DateObject | null): Date | null => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (value instanceof DateObject) {
    const next = value.toDate();
    return Number.isNaN(next.getTime()) ? null : next;
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const next = new Date(`${value}T12:00:00+03:30`);
    return Number.isNaN(next.getTime()) ? null : next;
  }

  const next = new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
};

const buildGregorianDateObject = (value?: Date | string | number | DateObject | null) => {
  const jsDate = toJsDate(value);
  if (!jsDate) return null;

  return new DateObject({
    date: jsDate,
    calendar: gregorian,
    locale: gregorian_en,
  });
};

const mapCategory = (calendarType?: string): OccasionCategory => {
  if (calendarType === 'hijri') return 'religious';
  if (calendarType === 'gregorian') return 'global';
  return 'national';
};

const normalizeDateKey = (dateKey: string) =>
  toEnglishDigits(dateKey)
    .replace(/-/g, '/')
    .split('/')
    .map((part, index) => (index === 0 ? part.padStart(4, '0') : part.padStart(2, '0')))
    .join('/');

const applyCalendarEventMoves = (dateKey: string, events: HolidayApiEvent[]) => {
  const normalizedDateKey = normalizeDateKey(dateKey);
  let nextEvents = [...events];

  for (const move of CALENDAR_EVENT_MOVES) {
    const from = normalizeDateKey(move.from);
    const to = normalizeDateKey(move.to);
    if (normalizedDateKey === from) {
      nextEvents = nextEvents.filter((item) => !String(item?.event || '').includes(move.eventIncludes));
    }

    if (
      normalizedDateKey === to &&
      !nextEvents.some((item) => String(item?.event || '').includes(move.eventIncludes))
    ) {
      nextEvents.push(move.event);
    }
  }

  return nextEvents;
};

const buildEmptySummary = (dateObject: DateObject): HolidayDaySummary => {
  const dateKey = dateObject.convert(persian, persian_fa).format('YYYY/MM/DD');
  const weekdayLabel = dateObject.convert(persian, persian_fa).format('dddd');
  const isFriday = weekdayLabel === 'جمعه';

  return {
    dateKey,
    jalaliLabel: dateKey,
    weekdayLabel,
    isFriday,
    isOfficialHoliday: isFriday,
    occasions: [],
    categories: {
      national: [],
      religious: [],
      global: [],
    },
  };
};

const loadHolidayYear = async (jalaliYear: number) => {
  if (!yearCache.has(jalaliYear)) {
    yearCache.set(
      jalaliYear,
      fetch(`/calendar/${jalaliYear}.json`, { cache: 'force-cache' })
        .then(async (response) => {
          if (!response.ok) return null;
          const data = (await response.json()) as HolidayApiMonth[] | null;
          return Array.isArray(data) ? data : null;
        })
        .catch(() => null)
    );
  }

  return yearCache.get(jalaliYear) || Promise.resolve(null);
};

export const getHolidayOccasionOptions = async (jalaliYears?: number[]): Promise<HolidayOccasionOption[]> => {
  const years = Array.from(
    new Set((jalaliYears || []).map((year) => Number(year)).filter((year) => Number.isFinite(year) && year > 0))
  );
  const cacheKey = years.length > 0 ? years.join(',') : 'fallback';
  if (!occasionOptionsCache.has(cacheKey)) {
    occasionOptionsCache.set(cacheKey, (async () => {
      const rows = years.length > 0
        ? (await Promise.all(years.map((year) => loadHolidayYear(year)))).flatMap((yearData) => yearData || [])
        : [];
      const events = rows.flatMap((month) =>
        (month?.days || []).flatMap((day) => (day?.events?.list || []).map((event) => ({
          title: String(event?.event || '').trim(),
          isHoliday: !!event?.isHoliday,
          source: (event?.calendarType || 'jalali') as HolidayOccasion['source'],
        })))
      );
      const mapped = events
        .filter((item) => item.title)
        .reduce<Map<string, HolidayOccasionOption>>((acc, item) => {
          const key = item.title;
          const existing = acc.get(key);
          acc.set(key, {
            label: key,
            value: key,
            isHoliday: Boolean(existing?.isHoliday || item.isHoliday),
            source: existing?.source || item.source,
          });
          return acc;
        }, new Map());
      const options = Array.from(mapped.values()).sort((a, b) => {
        if (a.isHoliday !== b.isHoliday) return a.isHoliday ? -1 : 1;
        return a.label.localeCompare(b.label, 'fa');
      });
      return options.length > 0 ? options : FALLBACK_HOLIDAY_OCCASION_OPTIONS;
    })().catch(() => FALLBACK_HOLIDAY_OCCASION_OPTIONS));
  }

  return occasionOptionsCache.get(cacheKey) || Promise.resolve(FALLBACK_HOLIDAY_OCCASION_OPTIONS);
};

export const getHolidaySummaryForDate = async (
  value?: Date | string | number | DateObject | null
): Promise<HolidayDaySummary | null> => {
  const gregorianDate = buildGregorianDateObject(value);
  if (!gregorianDate) return null;

  const jalaliDate = new DateObject(gregorianDate).convert(persian, persian_fa);
  const jalaliYear = Number(jalaliDate.year);
  const jalaliMonth = Number(jalaliDate.month.number);
  const jalaliDay = Number(jalaliDate.day);

  const fallback = buildEmptySummary(jalaliDate);
  const yearData = await loadHolidayYear(jalaliYear);
  const monthData = Array.isArray(yearData) ? yearData[jalaliMonth - 1] : null;
  const dayData = monthData?.days?.find((item) => Number(toEnglishDigits(item?.day?.jalali || '0')) === jalaliDay);

  if (!dayData) {
    return fallback;
  }

  const rawEvents = applyCalendarEventMoves(fallback.dateKey, (dayData.events?.list || []) as HolidayApiEvent[]);
  const occasions = rawEvents
    .map((item) => ({
      title: String(item?.event || '').trim(),
      category: mapCategory(item?.calendarType),
      isHoliday: !!item?.isHoliday,
      source: (item?.calendarType || 'jalali') as HolidayOccasion['source'],
    }))
    .filter((item) => item.title);

  const dedupedOccasions = occasions.filter(
    (item, index, source) =>
      source.findIndex((candidate) => candidate.title === item.title && candidate.category === item.category) === index
  );

  const categories = dedupedOccasions.reduce<Record<OccasionCategory, HolidayOccasion[]>>(
    (acc, item) => {
      acc[item.category].push(item);
      return acc;
    },
    {
      national: [],
      religious: [],
      global: [],
    }
  );

  const isOfficialHoliday = fallback.isFriday || dedupedOccasions.some((item) => item.isHoliday);

  return {
    dateKey: jalaliDate.format('YYYY/MM/DD'),
    jalaliLabel: jalaliDate.format('dddd DD MMMM YYYY'),
    weekdayLabel: jalaliDate.format('dddd'),
    isFriday: fallback.isFriday,
    isOfficialHoliday,
    occasions: dedupedOccasions,
    categories,
  };
};

export const getUpcomingHolidaySummaries = async (
  daysAhead = 14
): Promise<HolidayDaySummary[]> => {
  const summaries: HolidayDaySummary[] = [];

  for (let offset = 1; offset <= Math.max(1, daysAhead); offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const summary = await getHolidaySummaryForDate(date);
    if (!summary) continue;
    if (summary.occasions.length === 0) continue;
    summaries.push(summary);
  }

  return summaries;
};

export const getOccasionCategoryLabel = (category: OccasionCategory) => {
  switch (category) {
    case 'religious':
      return 'مذهبی';
    case 'global':
      return 'جهانی';
    case 'national':
    default:
      return 'ملی';
  }
};

export const hasAnyOccasionCategory = (summary: HolidayDaySummary | null | undefined) => {
  if (!summary) return false;
  return (Object.keys(OCCASION_EMPTY_GROUPS) as OccasionCategory[]).some(
    (category) => summary.categories[category]?.length > 0
  );
};
