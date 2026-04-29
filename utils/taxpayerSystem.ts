export const TAXPAYER_LEGACY_BASE_URL = 'https://tp.tax.gov.ir/req/api/self-tsp';
export const TAXPAYER_V2_BASE_URL = 'https://tp.tax.gov.ir/requestsmanager';
export const TAXPAYER_DEFAULT_BASE_URL = TAXPAYER_V2_BASE_URL;

export type TaxpayerIntegrationMode = 'certificate_v2' | 'no_certificate_legacy';

export const TAXPAYER_INTEGRATION_MODE_OPTIONS = [
  { label: 'با گواهی امضا (نسخه ۲)', value: 'certificate_v2' },
  { label: 'بدون گواهی امضا (مسیر قدیمی)', value: 'no_certificate_legacy' },
];


export const TAXPAYER_INVOICE_TYPE_OPTIONS = [
  { label: 'نوع اول', value: '1' },
  { label: 'نوع دوم', value: '2' },
  { label: 'نوع سوم', value: '3' },
];

export const TAXPAYER_INVOICE_PATTERN_OPTIONS = [
  { label: 'فروش', value: '1' },
];

export const TAXPAYER_INVOICE_SUBJECT_OPTIONS = [
  { label: 'اصلی', value: '1' },
];

export const TAXPAYER_SETTLEMENT_METHOD_OPTIONS = [
  { label: 'نقد', value: 'cash' },
  { label: 'نسیه', value: 'credit' },
  { label: 'نقد/نسیه', value: 'mixed' },
];

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const;

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const;

const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9] as const;

export const normalizeTaxpayerFiscalId = (value: string) =>
  String(value || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');

const parseDateUtc = (date: string | Date) => {
  if (date instanceof Date) {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  const [year, month, day] = String(date || '').slice(0, 10).split('-').map((part) => Number(part));
  if (!year || !month || !day) throw new Error('تاریخ فاکتور برای ساخت شماره مالیاتی معتبر نیست.');
  return Date.UTC(year, month - 1, day);
};

export const getTaxpayerEpochDays = (date: string | Date) => {
  const epoch = Date.UTC(1970, 0, 1);
  const days = Math.floor((parseDateUtc(date) - epoch) / 86400000);
  if (!Number.isFinite(days) || days < 0) throw new Error('تاریخ فاکتور برای ساخت شماره مالیاتی معتبر نیست.');
  return days;
};

export const buildTaxpayerTaxDateHex = (date: string | Date) =>
  getTaxpayerEpochDays(date).toString(16).toUpperCase().padStart(5, '0');

export const buildTaxpayerSerialHex = (serial: number | bigint | string) => {
  const value = BigInt(serial);
  if (value <= 0n) throw new Error('سریال داخلی شماره مالیاتی معتبر نیست.');
  const hex = value.toString(16).toUpperCase();
  if (hex.length > 10) throw new Error('سریال داخلی از ظرفیت شماره مالیاتی بیشتر است.');
  return hex.padStart(10, '0');
};

const fiscalIdCheckInput = (fiscalId: string) =>
  normalizeTaxpayerFiscalId(fiscalId)
    .split('')
    .map((char) => (/^\d$/.test(char) ? char : String(char.charCodeAt(0))))
    .join('');

export const buildTaxpayerVerhoeffInput = (fiscalId: string, date: string | Date, serial: number | bigint | string) => {
  const fiscal = normalizeTaxpayerFiscalId(fiscalId);
  if (fiscal.length !== 6) throw new Error('شناسه یکتای حافظه مالیاتی باید ۶ کاراکتر باشد.');
  const dayDecimal = String(getTaxpayerEpochDays(date)).padStart(6, '0');
  const serialDecimal = String(BigInt(serial)).padStart(12, '0');
  return `${fiscalIdCheckInput(fiscal)}${dayDecimal}${serialDecimal}`;
};

export const calculateVerhoeffCheckDigit = (numericInput: string) => {
  const digits = String(numericInput || '').trim();
  if (!/^\d+$/.test(digits)) throw new Error('ورودی رقم کنترل Verhoeff باید عددی باشد.');
  let checksum = 0;
  const reversedDigits = digits.split('').reverse().map((digit) => Number(digit));
  reversedDigits.forEach((digit, index) => {
    checksum = VERHOEFF_D[checksum][VERHOEFF_P[(index + 1) % 8][digit]];
  });
  return VERHOEFF_INV[checksum];
};

export const buildTaxpayerTaxId = (args: {
  fiscalId: string;
  invoiceDate: string | Date;
  internalSerial: number | bigint | string;
}) => {
  const fiscal = normalizeTaxpayerFiscalId(args.fiscalId);
  const dateHex = buildTaxpayerTaxDateHex(args.invoiceDate);
  const serialHex = buildTaxpayerSerialHex(args.internalSerial);
  const checkDigit = calculateVerhoeffCheckDigit(
    buildTaxpayerVerhoeffInput(fiscal, args.invoiceDate, args.internalSerial)
  );
  return `${fiscal}${dateHex}${serialHex}${checkDigit}`;
};

const normalizeStableJsonValue = (value: any): any => {
  if (Array.isArray(value)) return value.map((item) => normalizeStableJsonValue(item));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, any>>((acc, key) => {
        const next = normalizeStableJsonValue(value[key]);
        if (next !== undefined) acc[key] = next;
        return acc;
      }, {});
  }
  if (value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  return value;
};

export const stableStringifyForTaxpayer = (value: any) =>
  JSON.stringify(normalizeStableJsonValue(value)).replace(/#/g, '\\u0023');

const flattenTaxpayerEntries = (target: Record<string, unknown>, value: unknown, prefix = '') => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenTaxpayerEntries(target, item, prefix ? `${prefix}.E${index}` : `E${index}`));
    return;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    Object.entries(value as Record<string, unknown>).forEach(([key, next]) => {
      flattenTaxpayerEntries(target, next, prefix ? `${prefix}.${key}` : key);
    });
    return;
  }
  if (prefix) target[prefix] = value;
};

export const normalizeTaxpayerLegacySignatureValue = (
  data: unknown,
  headers?: Record<string, string | null | undefined> | null
) => {
  const merged: Record<string, unknown> = {};
  if (data !== null && data !== undefined) {
    if (Array.isArray(data)) merged.packets = data;
    else Object.assign(merged, typeof data === 'object' ? data as Record<string, unknown> : { value: data });
  }
  Object.entries(headers || {}).forEach(([key, value]) => {
    if (value === undefined) return;
    merged[key] = key === 'Authorization' && typeof value === 'string' && value.length > 7
      ? value.slice(7)
      : value;
  });

  const flattened: Record<string, unknown> = {};
  flattenTaxpayerEntries(flattened, merged);
  return Object.keys(flattened)
    .sort((left, right) => left.localeCompare(right, 'en'))
    .map((key) => {
      const value = flattened[key];
      if (value === null || value === undefined || String(value) === '') return '#';
      return String(value).replace(/#/g, '##');
    })
    .join('#');
};

export const omitNullTaxpayerLegacySignatureKeyId = <T extends Record<string, any>>(packet: T): T => {
  if (packet?.signatureKeyId === null || packet?.signatureKeyId === undefined || packet?.signatureKeyId === '') {
    const { signatureKeyId: _signatureKeyId, ...rest } = packet;
    return rest as T;
  }
  return packet;
};

export const normalizeTaxpayerMoneyToRial = (amount: unknown, currencyCode?: string | null) => {
  const parsed = Number(amount || 0);
  if (!Number.isFinite(parsed)) return 0;
  const normalizedCurrency = String(currencyCode || 'IRT').trim().toUpperCase();
  if (normalizedCurrency === 'IRT') return Math.round(parsed * 10);
  if (normalizedCurrency === 'IRR') return Math.round(parsed);
  throw new Error('ارسال به سامانه مودیان فقط با واحد پولی ریال یا تومان پشتیبانی می‌شود.');
};

export const mapTaxpayerSettlementMethodToSetm = (value: string | null | undefined) => {
  const normalized = String(value || '').trim();
  if (normalized === 'cash') return 1;
  if (normalized === 'credit') return 2;
  if (normalized === 'mixed') return 3;
  return null;
};
