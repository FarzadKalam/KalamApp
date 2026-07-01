import type {
  WebFormAccessScope,
  WebFormConfig,
  WebFormDuplicateStrategy,
  WebFormFieldRecord,
  WebFormFieldType,
  WebFormSelectOption,
} from "./webForms";

const toRecord = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

const normalizeSelectOptions = (value: unknown): WebFormSelectOption[] =>
  Array.isArray(value)
    ? value
        .map((item) => {
          const option = toRecord(item);
          const label = String(option.label || option.value || "").trim();
          const optionValue = String(option.value || option.label || "").trim();
          if (!label || !optionValue) return null;
          return { label, value: optionValue };
        })
        .filter(Boolean) as WebFormSelectOption[]
    : [];

const resolveFieldType = (fallbackType: unknown = "text"): WebFormFieldType => {
  const normalized = String(fallbackType || "").trim();
  if (
    [
      "text",
      "long_text",
      "number",
      "phone",
      "date",
      "time",
      "datetime",
      "image",
      "file",
      "multi_select",
      "location",
      "checkbox",
      "select",
      "relation",
    ].includes(normalized)
  ) {
    return normalized as WebFormFieldType;
  }
  return "text";
};

export const normalizePublicWebFormConfig = (value: unknown): WebFormConfig => {
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
    duplicate_strategy: (
      ["allow", "update", "skip"].includes(String(record.duplicate_strategy || ""))
        ? String(record.duplicate_strategy)
        : "allow"
    ) as WebFormDuplicateStrategy,
    default_record_values: defaultRecordValues,
  };
};

export const normalizePublicWebFormFieldRecord = (
  value: unknown,
  index = 0,
): WebFormFieldRecord => {
  const record = toRecord(value);
  const config = toRecord(record.config);

  return {
    id: String(record.id || "").trim() || undefined,
    field_key: String(record.field_key || `field_${index + 1}`).trim() || `field_${index + 1}`,
    label: String(record.label || "").trim() || `فیلد ${index + 1}`,
    target_field_key: String(record.target_field_key || "").trim() || null,
    field_type: resolveFieldType(record.field_type),
    placeholder: String(record.placeholder || "").trim() || null,
    help_text: String(record.help_text || "").trim() || null,
    default_value: record.default_value ?? null,
    is_required: record.is_required !== false,
    is_hidden: record.is_hidden === true,
    sort_order: Number(record.sort_order || ((index + 1) * 10)),
    config: {
      ...config,
      select_options: normalizeSelectOptions(config.select_options),
      default_to_current_employee: config.default_to_current_employee === true,
      relation_target_module: String(config.relation_target_module || "").trim() || undefined,
      dynamic_options_category: String(config.dynamic_options_category || "").trim() || undefined,
    },
  };
};

export const isPublicWebFormManagedDefaultOnlyField = (
  moduleId?: string | null,
  fieldKey?: string | null,
) =>
  String(moduleId || "").trim() === "leave_requests"
  && String(fieldKey || "").trim() === "status";

export const getPublicWebFormFieldBindingType = (
  field?: Pick<WebFormFieldRecord, "target_field_key" | "config"> | null,
) => {
  const configured = String(field?.config?.binding_type || "").trim();
  if (configured === "template_field") return "template_field";
  return String(field?.target_field_key || "").trim() ? "record_field" : "template_field";
};

export const isPublicWebFormTemplateField = (
  field?: Pick<WebFormFieldRecord, "target_field_key" | "config"> | null,
) => getPublicWebFormFieldBindingType(field) === "template_field";

export const isPublicWebFormCurrentEmployeeDefaultField = (
  field: Pick<WebFormFieldRecord, "field_type" | "config">,
  accessScope?: WebFormAccessScope | string | null,
) => {
  if (String(accessScope || "").trim() !== "internal") return false;
  if (field?.field_type !== "relation") return false;
  if (field?.config?.default_to_current_employee !== true) return false;
  return String(field?.config?.relation_target_module || "").trim() === "employees";
};
