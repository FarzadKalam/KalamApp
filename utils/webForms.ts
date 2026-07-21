import { MODULES } from "../moduleRegistry";
import { FieldType, ModuleField } from "../types";
import { ACCOUNTING_MINIMAL_MODULE_IDS } from "./accountingModules";
import { isSaasAdminModuleId } from "./permissions";

export type WebFormFieldType =
  | "text"
  | "long_text"
  | "number"
  | "percentage"
  | "phone"
  | "date"
  | "time"
  | "datetime"
  | "image"
  | "file"
  | "multi_select"
  | "location"
  | "checkbox"
  | "select"
  | "relation";

export type WebFormSelectOption = {
  label: string;
  value: string;
};

export type WebFormAccessScope = "public" | "internal";
export type WebFormDisplayMode = "list" | "slide";
export type WebFormDuplicateStrategy = "allow" | "update" | "skip";
export type WebFormKind = "record_create" | "survey";

export type WebFormConfig = {
  header_title?: string;
  header_subtitle?: string;
  submit_label?: string;
  success_message?: string;
  success_redirect_url?: string;
  display_mode?: WebFormDisplayMode;
  slide_show_progress?: boolean;
  slide_allow_back?: boolean;
  slide_auto_advance?: boolean;
  duplicate_match_field?: string;
  duplicate_strategy?: WebFormDuplicateStrategy;
  default_record_values?: Record<string, any>;
};

export type WebFormFieldRecord = {
  id?: string;
  field_key: string;
  label: string;
  target_field_key?: string | null;
  field_type: WebFormFieldType;
  placeholder?: string | null;
  help_text?: string | null;
  default_value?: any;
  is_required?: boolean;
  is_hidden?: boolean;
  sort_order?: number;
  config?: WebFormFieldConfig | null;
};

export type WebFormFieldConfig = {
  select_options?: WebFormSelectOption[];
  default_to_current_employee?: boolean;
  binding_type?: "record_field" | "template_field";
  relation_target_module?: string;
  allow_other?: boolean;
  allow_none?: boolean;
  show_progress_bar?: boolean;
  progress_max?: number;
  [key: string]: any;
};

export type WebFormTargetFieldItem = {
  label: string;
  value: string;
  field: ModuleField | null;
  inferredType: WebFormFieldType;
  isModuleRequired: boolean;
  hasModuleDefault: boolean;
  moduleDefaultValue: unknown;
  isManaged: boolean;
  isVirtual: boolean;
  isKeyField: boolean;
  isTableColumn: boolean;
  isSuggested: boolean;
  suggestionPriority: number;
  isDuplicateComparable: boolean;
};

const WEB_FORM_EXCLUDED_MODULE_IDS = new Set<string>([
  ...ACCOUNTING_MINIMAL_MODULE_IDS,
  "journal_entries",
  "web_forms",
]);

const WEB_FORM_SUPPORTED_FIELD_TYPES = new Set<FieldType>([
  FieldType.TEXT,
  FieldType.LONG_TEXT,
  FieldType.SUPER_LONG_TEXT,
  FieldType.NUMBER,
  FieldType.PRICE,
  FieldType.PERCENTAGE,
  FieldType.PHONE,
  FieldType.DATE,
  FieldType.TIME,
  FieldType.DATETIME,
  FieldType.IMAGE,
  FieldType.MULTI_SELECT,
  FieldType.LOCATION,
  FieldType.CHECKBOX,
  FieldType.SELECT,
  FieldType.STATUS,
]);

export const WEB_FORM_OTHER_VALUE = "__web_form_other__";
export const WEB_FORM_NONE_VALUE = "__web_form_none__";

const WEB_FORM_DUPLICATE_COMPARABLE_FIELD_TYPES = new Set<WebFormFieldType>([
  "text",
  "number",
  "phone",
  "date",
  "time",
  "datetime",
  "select",
]);

export const WEB_FORM_RECORD_IMAGE_TARGET_KEY = "__record_image__";
export const WEB_FORM_RECORD_FILE_TARGET_KEY = "__record_files__";

export const isWebFormManagedDefaultOnlyField = (
  moduleId?: string | null,
  fieldKey?: string | null,
) =>
  String(moduleId || "").trim() === "leave_requests"
  && String(fieldKey || "").trim() === "status";

const WEB_FORM_VIRTUAL_TARGET_FIELDS = [
  {
    label: "پیوست تصویر",
    value: WEB_FORM_RECORD_IMAGE_TARGET_KEY,
    field: null,
    inferredType: "image" as WebFormFieldType,
    isModuleRequired: false,
    hasModuleDefault: false,
    moduleDefaultValue: undefined,
    isManaged: false,
    isVirtual: true,
    isKeyField: false,
    isTableColumn: false,
    isSuggested: false,
    suggestionPriority: 999,
    isDuplicateComparable: false,
  },
  {
    label: "پیوست فایل",
    value: WEB_FORM_RECORD_FILE_TARGET_KEY,
    field: null,
    inferredType: "file" as WebFormFieldType,
    isModuleRequired: false,
    hasModuleDefault: false,
    moduleDefaultValue: undefined,
    isManaged: false,
    isVirtual: true,
    isKeyField: false,
    isTableColumn: false,
    isSuggested: false,
    suggestionPriority: 999,
    isDuplicateComparable: false,
  },
] as const satisfies readonly WebFormTargetFieldItem[];

const toRecord = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

export const isWebFormTargetModule = (moduleId?: string | null) => {
  const normalized = String(moduleId || "").trim();
  return !!normalized && !!MODULES[normalized] && !isSaasAdminModuleId(normalized) && !WEB_FORM_EXCLUDED_MODULE_IDS.has(normalized);
};

export const getWebFormModuleOptions = () =>
  Object.values(MODULES)
    .filter((module) => isWebFormTargetModule(module.id))
    .map((module) => ({
      label: module.titles?.fa || module.id,
      value: module.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fa"));

export const inferWebFormFieldType = (field?: ModuleField | null): WebFormFieldType => {
  if (!field) return "text";
  if (field.type === FieldType.LONG_TEXT || field.type === FieldType.SUPER_LONG_TEXT) return "long_text";
  if (field.type === FieldType.NUMBER || field.type === FieldType.PRICE) return "number";
  if (field.type === FieldType.PERCENTAGE) return "percentage";
  if (field.type === FieldType.PHONE) return "phone";
  if (field.type === FieldType.DATE) return "date";
  if (field.type === FieldType.TIME) return "time";
  if (field.type === FieldType.DATETIME) return "datetime";
  if (field.type === FieldType.IMAGE) return "image";
  if (field.type === FieldType.MULTI_SELECT) return "multi_select";
  if (field.type === FieldType.LOCATION) return "location";
  if (field.type === FieldType.CHECKBOX) return "checkbox";
  if (field.type === FieldType.RELATION) return "relation";
  if (field.type === FieldType.SELECT || field.type === FieldType.STATUS) return "select";
  return "text";
};

export const resolveModuleFieldDefaultValue = (field?: ModuleField | null) => {
  if (!field) return undefined;
  const rawDefaultValue = field.defaultValue;
  if (typeof rawDefaultValue === "function") {
    try {
      return rawDefaultValue();
    } catch {
      return undefined;
    }
  }
  return rawDefaultValue;
};

const hasMeaningfulDefaultValue = (value: unknown) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
};

const normalizeWebFormProgressMax = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const getWebFormSuggestionPriority = (field: Pick<WebFormTargetFieldItem, "isModuleRequired" | "isKeyField" | "isTableColumn" | "isVirtual">) => {
  if (field.isVirtual) return 999;
  if (field.isModuleRequired) return 1;
  if (field.isKeyField) return 2;
  if (field.isTableColumn) return 3;
  return 999;
};

const compareWebFormTargetFieldItems = (left: WebFormTargetFieldItem, right: WebFormTargetFieldItem) => {
  const leftOrder = Number(left.field?.order ?? Number.MAX_SAFE_INTEGER);
  const rightOrder = Number(right.field?.order ?? Number.MAX_SAFE_INTEGER);
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return left.label.localeCompare(right.label, "fa");
};

export const formatWebFormTargetFieldLabel = (
  item: Pick<WebFormTargetFieldItem, "label" | "isModuleRequired" | "field">,
) => {
  const relatedModuleId = String(item.field?.relationConfig?.targetModule || "").trim();
  const relatedModuleLabel = relatedModuleId
    ? String(MODULES[relatedModuleId]?.titles?.fa || "").trim().replace(/^مدیریت\s+/, "")
    : "";
  const label = relatedModuleLabel ? `${item.label} (${relatedModuleLabel})` : item.label;
  return item.isModuleRequired ? `${label} *` : label;
};

export const isWebFormVirtualTargetField = (fieldKey?: string | null) =>
  [WEB_FORM_RECORD_IMAGE_TARGET_KEY, WEB_FORM_RECORD_FILE_TARGET_KEY].includes(String(fieldKey || "").trim());

export const getWebFormTargetField = (moduleId?: string | null, fieldKey?: string | null) => {
  const normalizedModuleId = String(moduleId || "").trim();
  const normalizedFieldKey = String(fieldKey || "").trim();
  if (!normalizedModuleId || !normalizedFieldKey) return null;
  return (MODULES[normalizedModuleId]?.fields || []).find((field) => field?.key === normalizedFieldKey) || null;
};

export const resolveWebFormFieldType = (
  moduleId?: string | null,
  targetFieldKey?: string | null,
  fallbackType: unknown = "text",
): WebFormFieldType => {
  if (String(targetFieldKey || "").trim() === WEB_FORM_RECORD_IMAGE_TARGET_KEY) return "image";
  if (String(targetFieldKey || "").trim() === WEB_FORM_RECORD_FILE_TARGET_KEY) return "file";
  const targetField = getWebFormTargetField(moduleId, targetFieldKey);
  if (targetField) return inferWebFormFieldType(targetField);
  return (["text", "long_text", "number", "percentage", "phone", "date", "time", "datetime", "image", "file", "multi_select", "location", "checkbox", "select", "relation"].includes(String(fallbackType || ""))
    ? String(fallbackType)
    : "text") as WebFormFieldType;
};

export const getWebFormTargetFields = (
  moduleId?: string | null,
  options?: { accessScope?: WebFormAccessScope | string | null },
): WebFormTargetFieldItem[] => {
  const normalized = String(moduleId || "").trim();
  if (!isWebFormTargetModule(normalized)) return [];
  const allowRelation = String(options?.accessScope || "").trim() === "internal";

  const moduleFields = (MODULES[normalized]?.fields || [])
    .filter((field) => {
      if (!field?.key) return false;
      if (field.hideInCreateForm) return false;
      if (field.readonly) return false;
      if ((field as any).nature === "system") return false;
      if (isWebFormManagedDefaultOnlyField(normalized, field.key)) return false;
      if (field.type === FieldType.RELATION) return allowRelation;
      return WEB_FORM_SUPPORTED_FIELD_TYPES.has(field.type);
    })
    .map((field) => {
      const rawModuleDefaultValue = resolveModuleFieldDefaultValue(field);
      const moduleDefaultValue =
        normalized === "attendance_logs" && field.key === "source_type"
          ? "web_form"
          : rawModuleDefaultValue;
      const isModuleRequired = field.validation?.required === true;
      const hasModuleDefault = hasMeaningfulDefaultValue(moduleDefaultValue);
      const isKeyField = field.isKey === true;
      const isTableColumn = field.isTableColumn === true;
      const suggestionPriority = getWebFormSuggestionPriority({
        isModuleRequired,
        isKeyField,
        isTableColumn,
        isVirtual: false,
      });
      return {
        label: field.labels?.fa || field.key,
        value: field.key,
        field,
        inferredType: inferWebFormFieldType(field),
        isModuleRequired,
        hasModuleDefault,
        moduleDefaultValue,
        isManaged: isModuleRequired || (hasModuleDefault && field.key !== "status"),
        isVirtual: false,
        isKeyField,
        isTableColumn,
        isSuggested: suggestionPriority < 999,
        suggestionPriority,
        isDuplicateComparable: WEB_FORM_DUPLICATE_COMPARABLE_FIELD_TYPES.has(inferWebFormFieldType(field)),
      };
    })
    .sort(compareWebFormTargetFieldItems);

  return [...moduleFields, ...WEB_FORM_VIRTUAL_TARGET_FIELDS];
};

export const getSuggestedWebFormTargetFields = (
  moduleId?: string | null,
  options?: { accessScope?: WebFormAccessScope | string | null },
) =>
  getWebFormTargetFields(moduleId, options)
    .filter((item) => !item.isVirtual && (item.isManaged || item.isSuggested))
    .sort((left, right) => {
      if (left.suggestionPriority !== right.suggestionPriority) {
        return left.suggestionPriority - right.suggestionPriority;
      }
      return compareWebFormTargetFieldItems(left, right);
    });

export const getWebFormModuleDefaultValues = (
  moduleId?: string | null,
  options?: { accessScope?: WebFormAccessScope | string | null },
) => {
  const normalizedModuleId = String(moduleId || "").trim();
  const defaults = getWebFormTargetFields(moduleId, options).reduce<Record<string, any>>((acc, item) => {
    if (item.isVirtual || !item.hasModuleDefault) return acc;
    acc[item.value] =
      normalizedModuleId === "attendance_logs" && item.value === "source_type"
        ? "web_form"
        : item.moduleDefaultValue;
    return acc;
  }, {});
  for (const field of MODULES[normalizedModuleId]?.fields || []) {
    if (!field?.key || !isWebFormManagedDefaultOnlyField(normalizedModuleId, field.key)) continue;
    const defaultValue = resolveModuleFieldDefaultValue(field);
    if (hasMeaningfulDefaultValue(defaultValue)) defaults[field.key] = defaultValue;
  }
  return defaults;
};

export const getWebFormDuplicateFieldOptions = (
  moduleId?: string | null,
  options?: { accessScope?: WebFormAccessScope | string | null },
) =>
  getWebFormTargetFields(moduleId, options).filter((item) => !item.isVirtual && item.isDuplicateComparable);

export const findDuplicateWebFormTargetKeys = (fields: Array<Partial<WebFormFieldRecord>> | undefined) => {
  const counts = new Map<string, number>();
  for (const field of fields || []) {
    const key = String(field?.target_field_key || "").trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
};

export const getWebFormRecordBoundFieldEntries = <T extends Partial<WebFormFieldRecord>>(
  fields: T[] | undefined,
) => (
  (fields || [])
    .map((field, index) => ({
      field,
      index,
      targetFieldKey: String(field?.target_field_key || '').trim(),
      bindingType: getWebFormFieldBindingType(field),
    }))
    .filter((item) => item.bindingType === 'record_field' && item.targetFieldKey)
);

export const getMissingWebFormRequiredFields = (
  moduleId: string | undefined,
  fields: Array<Partial<WebFormFieldRecord>> | undefined,
) => {
  const normalized = String(moduleId || "").trim();
  if (!isWebFormTargetModule(normalized)) return [];

  const mappedTargetKeys = new Set(
    (fields || [])
      .map((field) => String(field?.target_field_key || "").trim())
      .filter(Boolean)
  );

  return (MODULES[normalized]?.fields || [])
    .filter((field) => {
      if (!field?.key) return false;
      if (field.hideInCreateForm) return false;
      if (field.readonly) return false;
      if (!field.validation?.required) return false;
      if (hasMeaningfulDefaultValue(resolveModuleFieldDefaultValue(field))) return false;
      return WEB_FORM_SUPPORTED_FIELD_TYPES.has(field.type) && !mappedTargetKeys.has(field.key);
    })
    .map((field) => field.labels?.fa || field.key);
};

export const normalizeWebFormConfig = (value: unknown): WebFormConfig => {
  const record = toRecord(value);
  const defaultRecordValues = toRecord(record.default_record_values);
  return {
    header_title: String(record.header_title || "").trim(),
    header_subtitle: String(record.header_subtitle || "").trim(),
    submit_label: String(record.submit_label || "").trim(),
    success_message: String(record.success_message || "").trim(),
    success_redirect_url: String(record.success_redirect_url || "").trim(),
    display_mode: String(record.display_mode || "").trim() === "slide" ? "slide" : "list",
    slide_show_progress: record.slide_show_progress !== false,
    slide_allow_back: record.slide_allow_back !== false,
    slide_auto_advance: record.slide_auto_advance === true,
    duplicate_match_field: String(record.duplicate_match_field || "").trim(),
    duplicate_strategy: (["allow", "update", "skip"].includes(String(record.duplicate_strategy || ""))
      ? String(record.duplicate_strategy)
      : "allow") as WebFormDuplicateStrategy,
    default_record_values: defaultRecordValues,
  };
};

export const normalizeWebFormFieldRecord = (
  value: unknown,
  index = 0,
  options?: { targetModuleId?: string | null },
): WebFormFieldRecord => {
  const record = toRecord(value);
  const config = toRecord(record.config);
  const selectOptions = Array.isArray(config.select_options)
    ? config.select_options
        .map((item) => {
          const option = toRecord(item);
          const label = String(option.label || option.value || "").trim();
          const optionValue = String(option.value || option.label || "").trim();
          if (!label || !optionValue) return null;
          return { label, value: optionValue };
        })
        .filter((item): item is WebFormSelectOption => Boolean(item))
    : [];

  return {
    id: String(record.id || "").trim() || undefined,
    field_key: String(record.field_key || `field_${index + 1}`).trim() || `field_${index + 1}`,
    label: String(record.label || "").trim() || `فیلد ${index + 1}`,
    target_field_key: String(record.target_field_key || "").trim() || null,
    field_type: resolveWebFormFieldType(
      options?.targetModuleId,
      String(record.target_field_key || "").trim() || String(record.field_key || "").trim(),
      record.field_type,
    ),
    placeholder: String(record.placeholder || "").trim() || null,
    help_text: String(record.help_text || "").trim() || null,
    default_value: record.default_value ?? null,
    is_required: record.is_required !== false,
    is_hidden: record.is_hidden === true,
    sort_order: Number(record.sort_order || ((index + 1) * 10)),
    config: {
      ...config,
      select_options: selectOptions,
      default_to_current_employee: config.default_to_current_employee === true,
      allow_other: config.allow_other === true,
      allow_none: config.allow_none === true,
      show_progress_bar: config.show_progress_bar === true,
      progress_max: normalizeWebFormProgressMax(config.progress_max),
    },
  };
};

export const isWebFormCurrentEmployeeDefaultField = (
  field: Pick<WebFormFieldRecord, "field_type" | "target_field_key" | "config">,
  targetModuleId?: string | null,
  accessScope?: WebFormAccessScope | string | null,
) => {
  if (String(accessScope || "").trim() !== "internal") return false;
  if (field?.field_type !== "relation") return false;
  if (field?.config?.default_to_current_employee !== true) return false;
  const targetField = getWebFormTargetField(targetModuleId, field.target_field_key);
  return String(targetField?.relationConfig?.targetModule || "").trim() === "employees";
};

export const getWebFormFieldBindingType = (field?: Pick<WebFormFieldRecord, "target_field_key" | "config"> | null) => {
  const configured = String(field?.config?.binding_type || "").trim();
  if (configured === "template_field") return "template_field";
  return String(field?.target_field_key || "").trim() ? "record_field" : "template_field";
};

export const isWebFormTemplateField = (field?: Pick<WebFormFieldRecord, "target_field_key" | "config"> | null) =>
  getWebFormFieldBindingType(field) === "template_field";

export const buildWebFormPublicPath = (slug?: string | null, accessToken?: string | null) => {
  const normalized = String(slug || "").trim();
  const basePath = normalized ? `/inquiry/${normalized}` : "/inquiry";
  const normalizedToken = String(accessToken || "").trim();
  if (!normalizedToken) return basePath;
  const params = new URLSearchParams({ token: normalizedToken });
  return `${basePath}?${params.toString()}`;
};

export const buildWebFormPublicUrl = (slug?: string | null, accessToken?: string | null) => {
  if (typeof window === "undefined") return buildWebFormPublicPath(slug, accessToken);
  return `${window.location.origin}${buildWebFormPublicPath(slug, accessToken)}`;
};

export const parseWebFormOptionsText = (raw: string): WebFormSelectOption[] =>
  String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [labelPart, valuePart] = line.split("|");
      const label = String(labelPart || "").trim();
      const value = String(valuePart || labelPart || "").trim();
      if (!label || !value) return null;
      return { label, value };
    })
    .filter(Boolean) as WebFormSelectOption[];

export const formatWebFormOptionsText = (options: unknown) => {
  if (!Array.isArray(options)) return "";
  return options
    .map((item) => {
      const option = toRecord(item);
      const label = String(option.label || option.value || "").trim();
      const value = String(option.value || option.label || "").trim();
      if (!label || !value) return "";
      return label === value ? label : `${label}|${value}`;
    })
    .filter(Boolean)
    .join("\n");
};
