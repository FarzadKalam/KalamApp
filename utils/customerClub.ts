export const CUSTOMER_CLUB_FEATURE = 'customer_club';
export const CUSTOMER_CLUB_PERMISSION_KEY = '__customer_club';

export type CustomerClubDiscountType = 'amount' | 'percent';

/**
 * متن صفحهٔ نتیجهٔ پرداخت فقط به پاداشی تعلق دارد که خودِ پرداخت‌کننده
 * دریافت می‌کند. پاداش معرفی به معرف تعلق می‌گیرد و نباید در رسید مشتری
 * نمایش داده شود.
 */
export const customerClubRuleSupportsOnlinePaymentMessage = (ruleType?: string | null) =>
  ['cashback', 'first_purchase'].includes(String(ruleType || '').trim().toLowerCase());

export const isCustomerPurchaseStatus = (status?: string | null) => {
  const normalized = String(status || '').trim().toLowerCase();
  return !['created', 'proforma', 'canceled', 'cancelled'].includes(normalized);
};

export const toCustomerClubNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const resolveCustomerClubAmount = ({
  baseAmount,
  type,
  amount,
  percent,
  maxAmount,
}: {
  baseAmount: unknown;
  type?: string | null;
  amount?: unknown;
  percent?: unknown;
  maxAmount?: unknown;
}) => {
  const base = Math.max(0, toCustomerClubNumber(baseAmount));
  const normalizedType = String(type || '').trim().toLowerCase() === 'percent' ? 'percent' : 'amount';
  const rawAmount = normalizedType === 'percent'
    ? Math.round((base * Math.max(0, toCustomerClubNumber(percent))) / 100)
    : Math.max(0, toCustomerClubNumber(amount));
  const cap = maxAmount === null || maxAmount === undefined || String(maxAmount).trim() === ''
    ? null
    : Math.max(0, toCustomerClubNumber(maxAmount));
  return Math.max(0, cap === null ? rawAmount : Math.min(rawAmount, cap));
};

export const normalizeCustomerClubCode = (value: unknown) =>
  String(value || '').trim().toUpperCase();
