import { normalizeCashBankPaymentType } from './cashBankPaymentType';
import { CASH_BANK_PAYMENT_TYPE_OPTIONS } from './cashBankFieldCatalog';

// ---------------------------------------------------------------------------
// منبع مرکزی لیبل‌های فارسی برای مقادیر نقد/بانک، دریافت‌ها، پرداخت‌ها و وضعیت‌ها.
// هرجا یک مقدار خام انگلیسی (مثل card / received / cheque) به کاربر نشان داده
// می‌شود، باید از این util برای تبدیل به فارسی استفاده شود تا در کل پروژه یکدست
// بماند: جدول نقد و بانک، وضعیت مالی مشتری، قالب‌های پرینت، رندر متغیرهای گردش‌کار
// و اتوماسیون‌ها، و فاکتورهای آنلاین.
// ---------------------------------------------------------------------------

const normalizeToken = (value: any) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

// روش پرداخت / دریافت (payment_type / payment_method)
// منبع حقیقت واحد: همان گزینه‌هایی که در فرم‌ها انتخاب می‌شوند
// (CASH_BANK_PAYMENT_TYPE_OPTIONS) — فقط مقادیر canonical، بدون alias.
export const FINANCIAL_PAYMENT_TYPE_LABELS_FA: Record<string, string> = {
  ...Object.fromEntries(CASH_BANK_PAYMENT_TYPE_OPTIONS.map((option) => [option.value, option.label])),
};

// alias های مقادیر قدیمی/جایگزین — فقط برای تطبیق هنگام نمایش، نه برای لیست گزینه‌ها.
const PAYMENT_TYPE_ALIAS_LABELS: Record<string, string> = {
  ...FINANCIAL_PAYMENT_TYPE_LABELS_FA,
  bank_transfer: 'انتقال شبا',
  check: 'چک',
  other: 'سایر',
};

// نوع عملیات / جهت (operation_type / direction)
export const FINANCIAL_OPERATION_TYPE_LABELS_FA: Record<string, string> = {
  receipt: 'دریافت',
  payment: 'پرداخت',
  transfer: 'انتقال',
  incoming: 'ورودی',
  outgoing: 'خروجی',
  inbound: 'ورودی',
  outbound: 'خروجی',
};

// وضعیت (status / cheque_status) — فاکتور، چک، عملیات، درخواست‌ها و ...
export const FINANCIAL_STATUS_LABELS_FA: Record<string, string> = {
  created: 'ایجاد شده',
  proforma: 'پیش‌فاکتور',
  prepayment: 'پیش‌پرداخت',
  opening: 'اول دوره',
  confirmed: 'تایید شده',
  draft: 'پیش‌نویس',
  final: 'نهایی',
  completed: 'تکمیل شده',
  pending: 'در انتظار',
  approved: 'تایید شده',
  rejected: 'رد شده',
  requested: 'درخواست شده',
  canceled: 'لغو شده',
  cancelled: 'لغو شده',
  received: 'دریافت شده',
  paid: 'پرداخت شده',
  unpaid: 'پرداخت نشده',
  partial: 'جزئی',
  settled: 'تسویه شده',
  posted: 'سند شده',
  open: 'باز',
  closed: 'بسته',
  active: 'فعال',
  inactive: 'غیرفعال',
  // وضعیت‌های چک
  new: 'جدید',
  in_bank: 'در جریان وصول',
  cleared: 'وصول شده',
  bounced: 'برگشتی',
  returned: 'برگشت‌خورده',
  processing: 'در حال پردازش',
  failed: 'ناموفق',
  expired: 'منقضی شده',
  refunded: 'بازپرداخت شده',
  in_review: 'در حال بررسی',
};

// نگاشت ادغام‌شده برای حالت auto (همهٔ توکن‌های مالی شناخته‌شده).
const MERGED_FINANCIAL_LABELS: Record<string, string> = {
  ...PAYMENT_TYPE_ALIAS_LABELS,
  ...FINANCIAL_OPERATION_TYPE_LABELS_FA,
  ...FINANCIAL_STATUS_LABELS_FA,
};

export type FinancialValueKind = 'payment_type' | 'operation_type' | 'status' | 'auto';

const lookup = (map: Record<string, string>, token: string): string | null => {
  if (map[token]) return map[token];
  const underscored = token.replace(/[\s\-/]+/g, '_');
  return map[underscored] || null;
};

/**
 * مقدار خام مالی را به لیبل فارسی تبدیل می‌کند. اگر توکن شناخته‌شده نباشد null
 * برمی‌گرداند تا فراخواننده بتواند مقدار اصلی را نگه دارد.
 *
 * - kind = 'payment_type' از normalizer روش پرداخت استفاده می‌کند (انواع فارسی/مترادف).
 * - kind = 'status' / 'operation_type' فقط تطبیق دقیق توکن.
 * - kind = 'auto' (پیش‌فرض) برای زمانی که نوع فیلد مشخص نیست؛ فقط توکن‌های دقیقِ
 *   شناخته‌شده را ترجمه می‌کند و رشته‌های دلخواه را دست‌نخورده می‌گذارد.
 */
export const localizeFinancialValue = (value: any, kind: FinancialValueKind = 'auto'): string | null => {
  if (value === null || value === undefined) return null;
  const token = normalizeToken(value);
  if (!token) return null;

  if (kind === 'payment_type') {
    const canonical = normalizeCashBankPaymentType(value);
    if (canonical && FINANCIAL_PAYMENT_TYPE_LABELS_FA[canonical]) {
      return FINANCIAL_PAYMENT_TYPE_LABELS_FA[canonical];
    }
    return lookup(PAYMENT_TYPE_ALIAS_LABELS, token);
  }
  if (kind === 'operation_type') {
    return lookup(FINANCIAL_OPERATION_TYPE_LABELS_FA, token);
  }
  if (kind === 'status') {
    return lookup(FINANCIAL_STATUS_LABELS_FA, token) || lookup(FINANCIAL_OPERATION_TYPE_LABELS_FA, token);
  }
  return lookup(MERGED_FINANCIAL_LABELS, token);
};

/** نسخهٔ راحت برای روش پرداخت. */
export const localizeFinancialPaymentType = (value: any): string | null =>
  localizeFinancialValue(value, 'payment_type');

/** روش پرداخت را بدون افشای مقدار فنی برای مخاطب نمایش می‌دهد. */
export const getFinancialPaymentTypeLabelFa = (value: any, fallback = '-'): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const localized = localizeFinancialPaymentType(raw);
  if (localized) return localized;
  return /[\u0600-\u06FF]/.test(raw) ? raw : 'روش پرداخت تعریف‌نشده';
};

/**
 * برچسب امن وضعیت برای نمایش به مخاطب. مقدار فنیِ انگلیسی هیچ‌گاه بدون ترجمه
 * برنمی‌گردد؛ وضعیت‌های اختصاصی فارسی نیز بدون تغییر حفظ می‌شوند.
 */
export const getFinancialStatusLabelFa = (value: any, fallback = '-'): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const localized = localizeFinancialValue(raw, 'status');
  if (localized) return localized;
  return /[\u0600-\u06FF]/.test(raw) ? raw : 'وضعیت تعریف‌نشده';
};
