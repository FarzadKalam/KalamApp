const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const ZERO_WIDTH_REGEX = /[\u200b-\u200f\u202a-\u202e\uFEFF]/g;

export const digitsToEnglish = (value: unknown): string => String(value ?? '')
  .replace(/[۰-۹]/g, digit => String(PERSIAN_DIGITS.indexOf(digit)))
  .replace(/[٠-٩]/g, digit => String(ARABIC_DIGITS.indexOf(digit)));

export const normalizePersianSearchText = (value: unknown): string => digitsToEnglish(value)
  .replace(ZERO_WIDTH_REGEX, ' ').replace(/[ـ]+/g, '').replace(/ك/g, 'ک').replace(/[يى]/g, 'ی')
  .replace(/ۀ/g, 'ه').replace(/ة/g, 'ه').trim().toLocaleLowerCase('fa').replace(/\s+/g, ' ');
