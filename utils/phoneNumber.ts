export type PhoneCountry = {
  code: string;
  faName: string;
  enName: string;
  dialCode: string;
  trunkPrefix?: string;
  dropTrunkPrefixInE164?: boolean;
};

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: 'IR', faName: 'ایران', enName: 'Iran', dialCode: '98', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'AE', faName: 'امارات', enName: 'United Arab Emirates', dialCode: '971', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'SA', faName: 'عربستان', enName: 'Saudi Arabia', dialCode: '966', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'IQ', faName: 'عراق', enName: 'Iraq', dialCode: '964', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'TR', faName: 'ترکیه', enName: 'Turkey', dialCode: '90', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'AF', faName: 'افغانستان', enName: 'Afghanistan', dialCode: '93', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'PK', faName: 'پاکستان', enName: 'Pakistan', dialCode: '92', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'IN', faName: 'هند', enName: 'India', dialCode: '91', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'CN', faName: 'چین', enName: 'China', dialCode: '86', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'RU', faName: 'روسیه', enName: 'Russia', dialCode: '7', trunkPrefix: '8', dropTrunkPrefixInE164: true },
  { code: 'DE', faName: 'آلمان', enName: 'Germany', dialCode: '49', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'FR', faName: 'فرانسه', enName: 'France', dialCode: '33', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'IT', faName: 'ایتالیا', enName: 'Italy', dialCode: '39', trunkPrefix: '0', dropTrunkPrefixInE164: false },
  { code: 'ES', faName: 'اسپانیا', enName: 'Spain', dialCode: '34' },
  { code: 'NL', faName: 'هلند', enName: 'Netherlands', dialCode: '31', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'BE', faName: 'بلژیک', enName: 'Belgium', dialCode: '32', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'CH', faName: 'سوئیس', enName: 'Switzerland', dialCode: '41', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'AT', faName: 'اتریش', enName: 'Austria', dialCode: '43', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'SE', faName: 'سوئد', enName: 'Sweden', dialCode: '46', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'NO', faName: 'نروژ', enName: 'Norway', dialCode: '47' },
  { code: 'DK', faName: 'دانمارک', enName: 'Denmark', dialCode: '45' },
  { code: 'GB', faName: 'بریتانیا', enName: 'United Kingdom', dialCode: '44', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'IE', faName: 'ایرلند', enName: 'Ireland', dialCode: '353', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'US', faName: 'آمریکا', enName: 'United States', dialCode: '1' },
  { code: 'CA', faName: 'کانادا', enName: 'Canada', dialCode: '1' },
  { code: 'MX', faName: 'مکزیک', enName: 'Mexico', dialCode: '52', trunkPrefix: '01', dropTrunkPrefixInE164: true },
  { code: 'BR', faName: 'برزیل', enName: 'Brazil', dialCode: '55', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'AR', faName: 'آرژانتین', enName: 'Argentina', dialCode: '54', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'ZA', faName: 'آفریقای جنوبی', enName: 'South Africa', dialCode: '27', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'EG', faName: 'مصر', enName: 'Egypt', dialCode: '20', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'JO', faName: 'اردن', enName: 'Jordan', dialCode: '962', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'QA', faName: 'قطر', enName: 'Qatar', dialCode: '974' },
  { code: 'KW', faName: 'کویت', enName: 'Kuwait', dialCode: '965' },
  { code: 'OM', faName: 'عمان', enName: 'Oman', dialCode: '968' },
  { code: 'BH', faName: 'بحرین', enName: 'Bahrain', dialCode: '973' },
  { code: 'SY', faName: 'سوریه', enName: 'Syria', dialCode: '963', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'LB', faName: 'لبنان', enName: 'Lebanon', dialCode: '961', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'AU', faName: 'استرالیا', enName: 'Australia', dialCode: '61', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'NZ', faName: 'نیوزیلند', enName: 'New Zealand', dialCode: '64', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'JP', faName: 'ژاپن', enName: 'Japan', dialCode: '81', trunkPrefix: '0', dropTrunkPrefixInE164: true },
  { code: 'KR', faName: 'کره جنوبی', enName: 'South Korea', dialCode: '82', trunkPrefix: '0', dropTrunkPrefixInE164: true },
];

export const DEFAULT_PHONE_COUNTRY_CODE = 'IR';

const PHONE_COUNTRY_BY_CODE = new Map(PHONE_COUNTRIES.map((country) => [country.code, country]));
const PHONE_COUNTRIES_BY_DIAL_LENGTH_DESC = [...PHONE_COUNTRIES].sort(
  (left, right) => right.dialCode.length - left.dialCode.length
);

const toEnglishDigits = (value: unknown): string =>
  String(value || '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

export const normalizePhoneDigits = (value: unknown): string => {
  const raw = toEnglishDigits(value).trim();
  if (!raw) return '';
  return raw.replace(/\D/g, '');
};

export const getPhoneCountryFlag = (countryCode: string): string => {
  const code = String(countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '🌐';
  return String.fromCodePoint(...code.split('').map((char) => 127397 + char.charCodeAt(0)));
};

export const getPhoneCountryByCode = (countryCode?: string | null): PhoneCountry => {
  const normalizedCode = String(countryCode || DEFAULT_PHONE_COUNTRY_CODE).trim().toUpperCase();
  return PHONE_COUNTRY_BY_CODE.get(normalizedCode) || PHONE_COUNTRY_BY_CODE.get(DEFAULT_PHONE_COUNTRY_CODE)!;
};

const findPhoneCountryByDialCode = (digits: string): PhoneCountry | null => {
  for (const country of PHONE_COUNTRIES_BY_DIAL_LENGTH_DESC) {
    if (digits.startsWith(country.dialCode)) return country;
  }
  return null;
};

const stripCountryPrefix = (digits: string, country: PhoneCountry): string => {
  let next = digits;
  if (next.startsWith(country.dialCode)) {
    next = next.slice(country.dialCode.length);
  }
  if (country.dropTrunkPrefixInE164 && country.trunkPrefix && next.startsWith(country.trunkPrefix)) {
    next = next.slice(country.trunkPrefix.length);
  }
  return next;
};

const addDisplayTrunkPrefix = (digits: string, country: PhoneCountry): string => {
  if (!digits) return '';
  if (country.code === 'IR') {
    if (digits.startsWith('9') && digits.length === 10) return `0${digits}`;
    if (!digits.startsWith('0') && digits.length >= 10) return `0${digits}`;
  }
  if (country.trunkPrefix && !digits.startsWith(country.trunkPrefix) && country.dropTrunkPrefixInE164) {
    return `${country.trunkPrefix}${digits}`;
  }
  return digits;
};

const normalizeNationalNumberForStorage = (value: unknown, country: PhoneCountry): string => {
  let digits = normalizePhoneDigits(value);
  if (!digits) return '';

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith(country.dialCode)) {
    digits = digits.slice(country.dialCode.length);
  }
  if (country.dropTrunkPrefixInE164 && country.trunkPrefix && digits.startsWith(country.trunkPrefix)) {
    digits = digits.slice(country.trunkPrefix.length);
  }
  return digits;
};

export const normalizePhoneForStorageWithCountry = (
  value: unknown,
  countryCode?: string | null
): string => {
  const country = getPhoneCountryByCode(countryCode);
  const nationalDigits = normalizeNationalNumberForStorage(value, country);
  if (!nationalDigits) return '';
  return `+${country.dialCode}${nationalDigits}`;
};

export const parsePhoneNumber = (value: unknown): {
  country: PhoneCountry;
  nationalNumber: string;
  e164: string;
  isE164: boolean;
} => {
  const raw = toEnglishDigits(value).trim();
  const fallbackCountry = getPhoneCountryByCode(DEFAULT_PHONE_COUNTRY_CODE);
  if (!raw) {
    return {
      country: fallbackCountry,
      nationalNumber: '',
      e164: '',
      isE164: false,
    };
  }

  if (raw.startsWith('+') || raw.startsWith('00')) {
    const digits = raw.startsWith('+') ? normalizePhoneDigits(raw) : normalizePhoneDigits(raw).replace(/^00/, '');
    const country = findPhoneCountryByDialCode(digits) || fallbackCountry;
    const nationalDigits = stripCountryPrefix(digits, country);
    const e164 = digits ? `+${digits}` : '';
    return {
      country,
      nationalNumber: addDisplayTrunkPrefix(nationalDigits, country),
      e164,
      isE164: true,
    };
  }

  const iranMobile = normalizeIranMobile(raw);
  if (iranMobile) {
    return {
      country: fallbackCountry,
      nationalNumber: formatIranMobileForInput(iranMobile),
      e164: iranMobile,
      isE164: true,
    };
  }

  const plainDigits = normalizePhoneDigits(raw);
  return {
    country: fallbackCountry,
    nationalNumber: addDisplayTrunkPrefix(plainDigits, fallbackCountry),
    e164: plainDigits ? normalizePhoneForStorageWithCountry(plainDigits, fallbackCountry.code) : '',
    isE164: false,
  };
};

export const normalizeIranMobile = (value: unknown): string | null => {
  const raw = toEnglishDigits(value).trim();
  if (!raw) return null;

  const digits = normalizePhoneDigits(raw);
  if (!digits) return null;

  if (/^00989\d{9}$/.test(digits)) {
    return `+${digits.slice(2)}`;
  }
  if (/^989\d{9}$/.test(digits)) {
    return `+${digits}`;
  }
  if (/^09\d{9}$/.test(digits)) {
    return `+98${digits.slice(1)}`;
  }
  if (/^9\d{9}$/.test(digits)) {
    return `+98${digits}`;
  }

  return null;
};

export const formatIranMobileForInput = (value: unknown): string => {
  const normalized = normalizeIranMobile(value);
  if (!normalized) return String(value || '').trim();
  return `0${normalized.slice(3)}`;
};

export const normalizePhoneForStorage = (value: unknown): string => {
  const parsed = parsePhoneNumber(value);
  if (parsed.e164) return parsed.e164;

  const raw = toEnglishDigits(value).trim();
  if (!raw) return '';

  const digits = normalizePhoneDigits(raw);
  if (!digits) return '';
  return raw.startsWith('+') ? `+${digits}` : digits;
};

export const formatPhoneForDisplay = (value: unknown): string => parsePhoneNumber(value).nationalNumber;

export const getPhoneDisplayMeta = (value: unknown) => {
  const parsed = parsePhoneNumber(value);
  return {
    ...parsed,
    flag: getPhoneCountryFlag(parsed.country.code),
    dialCodeLabel: `+${parsed.country.dialCode}`,
    countryLabel: parsed.country.faName,
  };
};

export const isIranMobile = (value: unknown): boolean => normalizeIranMobile(value) !== null;
