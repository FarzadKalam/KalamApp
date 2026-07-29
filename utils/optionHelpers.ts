// ==========================================
// Option Label Helper Functions
// ==========================================
// این utilities برای تمام جاهایی استفاده می‌شوند که نیاز به نمایش برچسب‌های فارسی در جای value‌های انگلیسی داریم

import { getFinancialPaymentTypeLabelFa, getFinancialStatusLabelFa } from './financialValueLabels';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuidLikeValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  return UUID_REGEX.test(String(value).trim());
};

export const getSafeOptionFallback = (value: unknown, fallback = '-'): string => {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  if (!normalized) return fallback;
  return isUuidLikeValue(normalized) ? fallback : normalized;
};

/**
 * گرفتن برچسب برای یک مقدار بر اساس فیلد و options موجود
 * این تابع برای SELECT، MULTI_SELECT و RELATION کار می‌کند
 */
export const getOptionLabel = (
  field: any,
  value: any,
  dynamicOptions: Record<string, any[]> = {},
  relationOptions: Record<string, any[]> = {}
): string => {
  if (!value) return '-';

  // برای MULTI_SELECT (آرایه)
  if (Array.isArray(value)) {
    return value.map(v => getSingleOptionLabel(field, v, dynamicOptions, relationOptions)).join(', ');
  }

  // برای SELECT و RELATION (تک مقدار)
  return getSingleOptionLabel(field, value, dynamicOptions, relationOptions);
};

/**
 * گرفتن برچسب برای یک مقدار تک
 */
export const getSingleOptionLabel = (
  field: any,
  value: any,
  dynamicOptions: Record<string, any[]> = {},
  relationOptions: Record<string, any[]> = {}
): string => {
  if (!value) return '-';

  // ابتدا از field.options جستجو کن (static options)
  if (field.options) {
    const opt = field.options.find((o: any) => o.value === value);
    if (opt) return opt.label || getSafeOptionFallback(value);
  }

  // سپس از dynamicOptions جستجو کن
  if ((field as any).dynamicOptionsCategory) {
    const category = (field as any).dynamicOptionsCategory;
    const dynopts = dynamicOptions[category] || [];
    const opt = dynopts.find((o: any) => o.value === value);
    if (opt) return opt.label || getSafeOptionFallback(value);
  }

  // برای RELATION fields
  if (field.type === 'relation') {
    const rellopts = relationOptions[field.key] || [];
    const opt = rellopts.find((o: any) => o.value === value);
    if (opt) return opt.label || getSafeOptionFallback(value);
  }

  const fieldKey = String(field?.key || '').trim().toLowerCase();

  // وضعیت‌های مالی و چک ممکن است از داده‌های قدیمی یا یکپارچه‌سازی خارجی بیایند؛
  // مقدار فنی انگلیسی نباید در جدول‌ها و نمای عمومی به مخاطب نمایش داده شود.
  if (field.type === 'status' || fieldKey.includes('status')) {
    return getFinancialStatusLabelFa(value);
  }
  if (['payment_type', 'payment_method', 'paymenttype', 'paymentmethod', 'method'].includes(fieldKey)) {
    return getFinancialPaymentTypeLabelFa(value);
  }

  // اگر برچسب پیدا نشد، UUID خام را به کاربر نشان نده
  return getSafeOptionFallback(value);
};

/**
 * تبدیل مقدار به array برای MULTI_SELECT
 */
export const normalizeMultiSelectValue = (value: any): string[] => {
  if (Array.isArray(value)) return value;
  if (value) return [value];
  return [];
};

/**
 * گرفتن لیست تمام options برای یک فیلد
 */
export const getFieldOptions = (
  field: any,
  dynamicOptions: Record<string, any[]> = {},
  relationOptions: Record<string, any[]> = {}
): any[] => {
  // اگر field.options موجود است (static options)
  if (field.options) {
    return field.options;
  }

  // اگر dynamicOptionsCategory موجود است
  if ((field as any).dynamicOptionsCategory) {
    const category = (field as any).dynamicOptionsCategory;
    return dynamicOptions[category] || [];
  }

  // اگر RELATION است
  if (field.type === 'relation') {
    return relationOptions[field.key] || [];
  }

  return [];
};
