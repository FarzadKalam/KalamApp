import { safeJalaliFormat } from './persianNumberFormatter';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const MONTH_NAMES = [
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
];

const ONES = [
  '',
  'یک',
  'دو',
  'سه',
  'چهار',
  'پنج',
  'شش',
  'هفت',
  'هشت',
  'نه',
  'ده',
  'یازده',
  'دوازده',
  'سیزده',
  'چهارده',
  'پانزده',
  'شانزده',
  'هفده',
  'هجده',
  'نوزده',
];

const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون', 'کوادریلیون'];

const normalizeDigits = (value: string): string =>
  value.replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)));

const parseInteger = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const normalized = normalizeDigits(String(value)).replace(/,/g, '').trim();
  if (!normalized) return null;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
};

const underThousandToWords = (value: number): string => {
  if (value === 0) return '';
  const parts: string[] = [];

  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;

  if (hundreds > 0) {
    parts.push(HUNDREDS[hundreds]);
  }

  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(ONES[remainder]);
    } else {
      const tens = Math.floor(remainder / 10);
      const ones = remainder % 10;
      if (tens > 0) parts.push(TENS[tens]);
      if (ones > 0) parts.push(ONES[ones]);
    }
  }

  return parts.join(' و ');
};

export const toPersianWords = (value: unknown): string => {
  const parsed = parseInteger(value);
  if (parsed === null) return '';
  if (parsed === 0) return 'صفر';

  const negative = parsed < 0;
  let remaining = Math.abs(parsed);
  const parts: string[] = [];
  let scaleIndex = 0;

  while (remaining > 0) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      const chunkWord = underThousandToWords(chunk);
      const scale = SCALES[scaleIndex];
      parts.unshift(scale ? `${chunkWord} ${scale}` : chunkWord);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIndex += 1;
  }

  const words = parts.join(' و ');
  return negative ? `منفی ${words}` : words;
};

export const amountToPersianRialWords = (value: unknown): string => {
  const parsed = parseInteger(value);
  if (parsed === null) return '-';
  return `${toPersianWords(parsed)} ریال`;
};

export const jalaliDateToPersianWords = (value: unknown): string => {
  if (!value) return '';
  const jalaliDate = safeJalaliFormat(value, 'YYYY/MM/DD');
  if (!jalaliDate) return '';

  const normalized = normalizeDigits(jalaliDate);
  const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return '';

  const dayWords = toPersianWords(day);
  const yearWords = toPersianWords(year);
  return `${dayWords} ${MONTH_NAMES[month - 1]} ${yearWords}`;
};
