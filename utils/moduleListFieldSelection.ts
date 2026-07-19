import { FieldType } from '../types';

const MODULE_LIST_UNBACKED_FIELD_KEYS: Record<string, Set<string>> = {
  process_templates: new Set(['image_url', 'template_stages_preview']),
  process_runs: new Set(['run_stages_preview']),
};

const MODULE_LIST_DEFERRED_FIELD_TYPES = new Set<FieldType>([
  FieldType.LONG_TEXT,
  FieldType.SUPER_LONG_TEXT,
  FieldType.JSON,
  FieldType.CHECKLIST,
  FieldType.PROGRESS_STAGES,
]);

type ModuleListFieldLike = {
  key?: string | null;
  type?: FieldType | null;
};

/**
 * فیلدهای حجیم فقط از درخواست اولیه فهرست کنار گذاشته می‌شوند و بعد از نمایش
 * ردیف‌ها، برای همان صفحه به‌صورت batch بارگذاری می‌شوند. این تصمیم بر اساس
 * نوع فیلد است و به هیچ ماژول یا نام ستون خاصی وابسته نیست.
 */
export const shouldDeferModuleListField = (
  moduleId?: string | null,
  field?: ModuleListFieldLike | null,
) => {
  const fieldKey = String(field?.key || '').trim();
  if (!fieldKey || shouldSkipModuleListField(moduleId, fieldKey)) return false;
  return MODULE_LIST_DEFERRED_FIELD_TYPES.has(field?.type as FieldType);
};

export const collectDeferredModuleListFieldKeys = (
  moduleId?: string | null,
  fields?: ModuleListFieldLike[] | null,
) => Array.from(new Set(
  (Array.isArray(fields) ? fields : [])
    .filter((field) => shouldDeferModuleListField(moduleId, field))
    .map((field) => String(field?.key || '').trim())
    .filter(Boolean),
));

export const shouldSkipModuleListField = (
  moduleId?: string | null,
  fieldKey?: string | null,
) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedFieldKey = String(fieldKey || '').trim();
  if (!normalizedModuleId || !normalizedFieldKey) return false;
  return MODULE_LIST_UNBACKED_FIELD_KEYS[normalizedModuleId]?.has(normalizedFieldKey) === true;
};
