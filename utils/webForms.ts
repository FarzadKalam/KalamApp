import { MODULES } from "../moduleRegistry";
import { FieldType, ModuleField } from "../types";
import { ACCOUNTING_MINIMAL_MODULE_IDS } from "./accountingModules";

export type WebFormFieldType =
  | "text"
  | "long_text"
  | "number"
  | "phone"
  | "date"
  | "time"
  | "datetime"
  | "checkbox"
  | "select";

export type WebFormSelectOption = {
  label: string;
  value: string;
};

export type WebFormAccessScope = "public" | "internal";

export type WebFormConfig = {
  header_title?: string;
  header_subtitle?: string;
  submit_label?: string;
  success_message?: string;
  success_redirect_url?: string;
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
  config?: Record<string, any> | null;
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
  FieldType.PHONE,
  FieldType.DATE,
  FieldType.TIME,
  FieldType.DATETIME,
  FieldType.CHECKBOX,
  FieldType.SELECT,
]);

const toRecord = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

export const isWebFormTargetModule = (moduleId?: string | null) => {
  const normalized = String(moduleId || "").trim();
  return !!normalized && !!MODULES[normalized] && !WEB_FORM_EXCLUDED_MODULE_IDS.has(normalized);
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
  if (field.type === FieldType.PHONE) return "phone";
  if (field.type === FieldType.DATE) return "date";
  if (field.type === FieldType.TIME) return "time";
  if (field.type === FieldType.DATETIME) return "datetime";
  if (field.type === FieldType.CHECKBOX) return "checkbox";
  if (field.type === FieldType.SELECT) return "select";
  return "text";
};

export const getWebFormTargetFields = (moduleId?: string | null) => {
  const normalized = String(moduleId || "").trim();
  if (!isWebFormTargetModule(normalized)) return [];

  return (MODULES[normalized]?.fields || [])
    .filter((field) => {
      if (!field?.key) return false;
      if (field.hideInCreateForm) return false;
      if (field.readonly) return false;
      if ((field as any).nature === "system") return false;
      return WEB_FORM_SUPPORTED_FIELD_TYPES.has(field.type);
    })
    .map((field) => ({
      label: field.labels?.fa || field.key,
      value: field.key,
      field,
      inferredType: inferWebFormFieldType(field),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fa"));
};

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
      if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== "") return false;
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
    default_record_values: defaultRecordValues,
  };
};

export const normalizeWebFormFieldRecord = (value: unknown, index = 0): WebFormFieldRecord => {
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
        .filter(Boolean)
    : [];

  return {
    id: String(record.id || "").trim() || undefined,
    field_key: String(record.field_key || `field_${index + 1}`).trim() || `field_${index + 1}`,
    label: String(record.label || "").trim() || `فیلد ${index + 1}`,
    target_field_key: String(record.target_field_key || "").trim() || null,
    field_type: (["text", "long_text", "number", "phone", "date", "time", "datetime", "checkbox", "select"].includes(String(record.field_type || ""))
      ? String(record.field_type)
      : "text") as WebFormFieldType,
    placeholder: String(record.placeholder || "").trim() || null,
    help_text: String(record.help_text || "").trim() || null,
    default_value: record.default_value ?? null,
    is_required: record.is_required !== false,
    is_hidden: record.is_hidden === true,
    sort_order: Number(record.sort_order || ((index + 1) * 10)),
    config: {
      ...config,
      select_options: selectOptions,
    },
  };
};

export const buildWebFormPublicPath = (slug?: string | null) => {
  const normalized = String(slug || "").trim();
  return normalized ? `/inquiry/${normalized}` : "/inquiry";
};

export const buildWebFormPublicUrl = (slug?: string | null) => {
  if (typeof window === "undefined") return buildWebFormPublicPath(slug);
  return `${window.location.origin}${buildWebFormPublicPath(slug)}`;
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
