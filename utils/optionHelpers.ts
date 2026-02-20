// ==========================================
// Option Label Helper Functions
// ==========================================
// این utilities برای تمام جاهایی استفاده می‌شوند که نیاز به نمایش برچسب‌های فارسی در جای value‌های انگلیسی داریم

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
    if (opt) return opt.label || value;
  }

  // سپس از dynamicOptions جستجو کن
  if ((field as any).dynamicOptionsCategory) {
    const category = (field as any).dynamicOptionsCategory;
    const dynopts = dynamicOptions[category] || [];
    const opt = dynopts.find((o: any) => o.value === value);
    if (opt) return opt.label || value;
  }

  // برای RELATION fields
  if (field.type === 'relation') {
    const rellopts = relationOptions[field.key] || [];
    const opt = rellopts.find((o: any) => o.value === value);
    if (opt) return opt.label || value;
  }

  // اگر برچسب پیدا نشد، خود value را برگردان
  return value;
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
