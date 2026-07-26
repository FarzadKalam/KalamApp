import { formatPersianPrice, toPersianNumber } from './persianNumberFormatter';

export type InvoiceAdjustmentType = 'percent' | 'amount';

type InvoiceAdjustmentDisplayOptions = {
  value: any;
  type?: any;
  baseAmount?: any;
  currencyLabel?: string | null;
  placeholder?: string;
};

const toSafeNumber = (value: any) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatPersianDecimal = (value: number) => {
  if (!Number.isFinite(value)) return '۰';
  const normalized = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3))).replace(/\.?0+$/, '');
  return toPersianNumber(normalized);
};

const appendCurrencyLabel = (value: string, currencyLabel?: string | null) => {
  const label = String(currencyLabel || '').trim();
  return label ? `${value} ${label}` : value;
};

export const normalizeInvoiceAdjustmentType = (value: any): InvoiceAdjustmentType =>
  String(value || '').trim().toLowerCase() === 'percent' ? 'percent' : 'amount';

export const resolveInvoiceRowBaseAmount = (row: any) =>
  Math.max(0, toSafeNumber(row?.quantity) * toSafeNumber(row?.unit_price));

export const hasInvoiceAdjustmentValue = (value: any) => Math.abs(toSafeNumber(value)) > 0;

export const resolveInvoiceAdjustmentAmount = (options: { value: any; type?: any; baseAmount?: any }) => {
  const baseAmount = Math.max(0, toSafeNumber(options.baseAmount));
  const rawValue = Math.max(0, toSafeNumber(options.value));
  const type = normalizeInvoiceAdjustmentType(options.type);
  if (rawValue <= 0) return 0;
  if (type !== 'percent') return rawValue;
  if (baseAmount <= 0) return 0;
  return Math.min(baseAmount, (baseAmount * Math.min(rawValue, 100)) / 100);
};

export const buildInvoiceAdjustmentDisplay = ({
  value,
  type,
  baseAmount,
  currencyLabel,
  placeholder = '—',
}: InvoiceAdjustmentDisplayOptions) => {
  const numericValue = Math.max(0, toSafeNumber(value));
  const normalizedType = normalizeInvoiceAdjustmentType(type);
  if (numericValue <= 0) {
    return {
      hasValue: false,
      type: normalizedType,
      amount: 0,
      primaryText: placeholder,
      secondaryText: null as string | null,
    };
  }

  const amount = resolveInvoiceAdjustmentAmount({ value: numericValue, type: normalizedType, baseAmount });
  if (normalizedType === 'percent') {
    return {
      hasValue: true,
      type: normalizedType,
      amount,
      primaryText: `${formatPersianDecimal(numericValue)} درصد`,
      secondaryText: amount > 0 ? appendCurrencyLabel(formatPersianPrice(amount), currencyLabel) : null,
    };
  }

  return {
    hasValue: true,
    type: normalizedType,
    amount,
    primaryText: appendCurrencyLabel(formatPersianPrice(numericValue), currencyLabel),
    secondaryText: null as string | null,
  };
};

export const resolveInvoiceGlobalDiscountAmount = (subtotal: any, value: any, type?: any) =>
  resolveInvoiceAdjustmentAmount({
    value,
    type,
    baseAmount: subtotal,
  });

const invoiceText = (value: any) => String(value ?? '').trim();

/** متن یکپارچه اجاره تابلو در فاکتور، چاپ و ارسال به سامانه مودیان. */
export const buildBillboardInvoiceItemTitle = (billboard: any) => {
  const fullAddress = invoiceText(billboard?.address || billboard?.full_address);
  const fallbackAddress = [
    invoiceText(billboard?.city_name || billboard?.city),
    invoiceText(billboard?.name || billboard?.short_address),
  ].filter(Boolean).join(' ');
  const billboardType = invoiceText(billboard?.category || billboard?.billboard_type || billboard?.type);
  const location = fullAddress || fallbackAddress;
  if (!billboardType && !location) return '';
  return [
    'اجاره تابلوی تبلیغاتی',
    billboardType,
    location,
  ].filter(Boolean).join(' ');
};

export const buildInvoiceItemDescriptionForTaxpayer = (item: any) => {
  const parts = [
    invoiceText(item?.description) ? `توضیحات: ${invoiceText(item.description)}` : '',
    invoiceText(item?.delivery_time) ? `زمان تحویل: ${invoiceText(item.delivery_time)}` : '',
  ].filter(Boolean);
  return parts.join(' | ');
};
