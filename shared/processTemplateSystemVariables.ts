const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

const JALALI_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

const PERSIAN_WEEK_ORDINALS = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم'] as const;
const JALALI_SEASONS = ['بهار', 'تابستان', 'پاییز', 'زمستان'] as const;
const PERSIAN_DAY_ORDINALS = [
  '',
  'اول',
  'دوم',
  'سوم',
  'چهارم',
  'پنجم',
  'ششم',
  'هفتم',
  'هشتم',
  'نهم',
  'دهم',
  'یازدهم',
  'دوازدهم',
  'سیزدهم',
  'چهاردهم',
  'پانزدهم',
  'شانزدهم',
  'هفدهم',
  'هجدهم',
  'نوزدهم',
  'بیستم',
  'بیست و یکم',
  'بیست و دوم',
  'بیست و سوم',
  'بیست و چهارم',
  'بیست و پنجم',
  'بیست و ششم',
  'بیست و هفتم',
  'بیست و هشتم',
  'بیست و نهم',
  'سی‌ام',
  'سی و یکم',
] as const;

export const PROCESS_TEMPLATE_SYSTEM_VARIABLES = [
  { key: 'current_date_numeric', labelFa: 'تاریخ امروز (عددی)' },
  { key: 'current_date_words', labelFa: 'تاریخ امروز (حروف)' },
  { key: 'current_datetime', labelFa: 'اکنون' },
  { key: 'current_month', labelFa: 'ماه جاری' },
  { key: 'current_week', labelFa: 'هفته جاری' },
  { key: 'current_season', labelFa: 'فصل جاری' },
  { key: 'current_year', labelFa: 'سال جاری' },
] as const;

type ProcessTemplateSystemVariableKey = (typeof PROCESS_TEMPLATE_SYSTEM_VARIABLES)[number]['key'];

type JalaliDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const toPersianNumber = (value: number | string) => String(value).replace(/\d/g, (digit) => (
  PERSIAN_DIGITS[Number(digit)]
));

const pad2 = (value: number) => String(value).padStart(2, '0');

const getPartNumber = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) => {
  const value = parts.find((part) => part.type === type)?.value || '';
  const normalized = value.replace(/[^0-9]/g, '');
  return Number(normalized || 0);
};

const getCurrentJalaliDateParts = (now: Date): JalaliDateParts => {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  return {
    year: getPartNumber(parts, 'year'),
    month: getPartNumber(parts, 'month'),
    day: getPartNumber(parts, 'day'),
    hour: getPartNumber(parts, 'hour'),
    minute: getPartNumber(parts, 'minute'),
  };
};

const buildDateWords = ({ year, month, day }: JalaliDateParts) => {
  const dayWord = PERSIAN_DAY_ORDINALS[day] || toPersianNumber(day);
  const monthName = JALALI_MONTH_NAMES[month - 1] || '';
  return monthName ? `${dayWord} ${monthName} ${toPersianNumber(year)}` : '';
};

export const getProcessTemplateSystemVariableValues = (now = new Date()): Record<ProcessTemplateSystemVariableKey, string> => {
  const date = getCurrentJalaliDateParts(now);
  const numericDate = `${toPersianNumber(date.year)}/${toPersianNumber(pad2(date.month))}/${toPersianNumber(pad2(date.day))}`;
  const monthName = JALALI_MONTH_NAMES[date.month - 1] || '';
  const weekNumber = Math.floor((date.day - 1) / 7) + 1;
  const weekOrdinal = PERSIAN_WEEK_ORDINALS[weekNumber - 1] || toPersianNumber(weekNumber);
  const season = JALALI_SEASONS[Math.floor((date.month - 1) / 3)] || '';
  const year = toPersianNumber(date.year);

  return {
    current_date_numeric: numericDate,
    current_date_words: buildDateWords(date),
    current_datetime: `${numericDate} ${toPersianNumber(pad2(date.hour))}:${toPersianNumber(pad2(date.minute))}`,
    current_month: monthName ? `${monthName} ${year}` : '',
    current_week: monthName ? `هفته ${weekOrdinal} ${monthName} ${year}` : '',
    current_season: season ? `${season} ${year}` : '',
    current_year: `سال ${year}`,
  };
};

export const assignProcessTemplateSystemVariableValues = <T extends Record<string, any>>(
  target: T,
  now = new Date(),
) => {
  const values = getProcessTemplateSystemVariableValues(now);
  PROCESS_TEMPLATE_SYSTEM_VARIABLES.forEach(({ key, labelFa }) => {
    target[key] = values[key];
    target[labelFa] = values[key];
  });
  return target;
};
