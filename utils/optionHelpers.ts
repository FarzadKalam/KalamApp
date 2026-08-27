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

const normalizeOptionValue = (value: unknown): string => String(value ?? '').trim();

const RELATION_FIELD_TYPES = new Set(['relation', 'multi_relation', 'user']);

/**
 * داده‌های قدیمی بعضی relationها به‌جای null با boolean یا متن‌های معادل آن
 * ذخیره شده‌اند. این مقادیر هیچ شناسه/عنوان معتبری ندارند و باید در همه نماها
 * دقیقاً مانند مقدار خالی رفتار کنند.
 */
export const isEmptyRelationValue = (value: unknown): boolean => {
  if (value === null || value === undefined || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length === 0 || value.every(isEmptyRelationValue);

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return !normalized || ['true', 'false', 'null', 'undefined', '{}', '[]'].includes(normalized);
  }

  if (typeof value === 'object') {
    const relationObject = value as Record<string, unknown>;
    const candidate = relationObject.id
      ?? relationObject.value
      ?? relationObject.record_id
      ?? relationObject.label
      ?? relationObject.name
      ?? relationObject.title
      ?? relationObject.system_code;
    return isEmptyRelationValue(candidate);
  }

  return false;
};

const getRelationConfig = (field: any) => (
  String(field?.type || '') === 'multi_relation'
    ? (field?.multiRelationConfig || field?.relationConfig)
    : field?.relationConfig
);

/**
 * همهٔ مصرف‌کننده‌های relation باید گزینه را از یک مسیر مشترک پیدا کنند.
 * بعضی loaderها گزینه‌ها را با کلید خود فیلد و بعضی با کلید ماژول مقصد cache
 * می‌کنند؛ جستجو در هر دو مسیر مانع نمایش fallback یا UUID با وجود عنوان آماده می‌شود.
 */
export const findRelationOption = (
  field: any,
  value: unknown,
  relationOptions: Record<string, any[]> = {},
): any | null => {
  if (isEmptyRelationValue(value)) return null;
  const normalizedValue = normalizeOptionValue(value);
  if (!normalizedValue) return null;

  const relationConfig = getRelationConfig(field);
  const candidateKeys = new Set<string>([
    normalizeOptionValue(field?.key),
    normalizeOptionValue(relationConfig?.targetModule),
  ]);
  (relationConfig?.sourceModules || []).forEach((source: any) => {
    candidateKeys.add(normalizeOptionValue(source?.targetModule));
  });
  if (String(field?.type || '') === 'user') candidateKeys.add('profiles');

  for (const key of candidateKeys) {
    if (!key) continue;
    const option = (relationOptions[key] || []).find(
      (item: any) => normalizeOptionValue(item?.value) === normalizedValue,
    );
    if (option) return option;
  }

  return null;
};

export const getRelationFallbackLabel = (field: any): string => (
  String(field?.type || '') === 'user' ? 'کاربر مرتبط' : 'رکورد مرتبط'
);

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
  if (RELATION_FIELD_TYPES.has(String(field?.type || '')) && isEmptyRelationValue(value)) return '';
  if (!value) return '-';

  // برای MULTI_SELECT (آرایه)
  if (Array.isArray(value)) {
    const labels = value
      .map(v => getSingleOptionLabel(field, v, dynamicOptions, relationOptions))
      .filter(Boolean);
    return labels.join(', ') || (RELATION_FIELD_TYPES.has(String(field?.type || '')) ? '' : '-');
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
  if (RELATION_FIELD_TYPES.has(String(field?.type || '')) && isEmptyRelationValue(value)) return '';
  if (!value) return '-';

  // ابتدا از field.options جستجو کن (static options)
  if (field.options) {
    const opt = field.options.find((o: any) => o.value === value);
    if (opt) {
      const label = normalizeOptionValue(opt.label);
      if (label && !isUuidLikeValue(label)) return label;
    }
  }

  // سپس از dynamicOptions جستجو کن
  if ((field as any).dynamicOptionsCategory) {
    const category = (field as any).dynamicOptionsCategory;
    const dynopts = dynamicOptions[category] || [];
    const opt = dynopts.find((o: any) => o.value === value);
    if (opt) {
      const label = normalizeOptionValue(opt.label);
      if (label && !isUuidLikeValue(label)) return label;
    }
  }

  // برای RELATION، MULTI_RELATION و USER fields
  if (RELATION_FIELD_TYPES.has(String(field?.type || ''))) {
    const opt = findRelationOption(field, value, relationOptions);
    const optionLabel = normalizeOptionValue(opt?.label);
    if (optionLabel && !isUuidLikeValue(optionLabel)) return optionLabel;
    return getRelationFallbackLabel(field);
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

  // اگر relation است، گزینه‌های field-scoped بر target-scoped اولویت دارند.
  if (['relation', 'multi_relation', 'user'].includes(String(field?.type || ''))) {
    const relationConfig = getRelationConfig(field);
    const keys = new Set<string>([
      normalizeOptionValue(field?.key),
      normalizeOptionValue(relationConfig?.targetModule),
    ]);
    (relationConfig?.sourceModules || []).forEach((source: any) => {
      keys.add(normalizeOptionValue(source?.targetModule));
    });
    if (String(field?.type || '') === 'user') keys.add('profiles');
    const merged = new Map<string, any>();
    keys.forEach((key) => {
      (relationOptions[key] || []).forEach((option: any) => {
        const optionValue = normalizeOptionValue(option?.value);
        const optionModule = normalizeOptionValue(option?.module);
        if (!optionValue) return;
        const mergeKey = `${optionModule}:${optionValue}`;
        const current = merged.get(mergeKey);
        // field-scoped hydrated options carry access/deletion metadata and must
        // win over a generic recent-option entry for the same target.
        if (!current || option?.missing || option?.inaccessible || option?.linkable === false) {
          merged.set(mergeKey, option);
        }
      });
    });
    return Array.from(merged.values());
  }

  return [];
};
