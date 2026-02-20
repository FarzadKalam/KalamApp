import { FieldType, ModuleDefinition } from "../types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATIC_TITLE_KEYS = [
  "name",
  "title",
  "business_name",
  "full_name",
  "last_name",
  "first_name",
  "subject",
  "bundle_number",
  "shelf_number",
  "order_number",
  "invoice_number",
  "system_code",
  "manual_code",
  "code",
];

type GetRecordTitleOptions = {
  fallback?: string;
  allowIdFallback?: boolean;
};

const normalize = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
};

const unique = (items: string[]): string[] => Array.from(new Set(items.filter(Boolean)));

const isUuidLike = (value: string): boolean => UUID_REGEX.test(value);

const getCandidateKeys = (moduleConfig?: ModuleDefinition): string[] => {
  if (!moduleConfig?.fields?.length) return STATIC_TITLE_KEYS;

  const keyFields = moduleConfig.fields.filter((f) => f.isKey).map((f) => f.key);
  const textLikeFields = moduleConfig.fields
    .filter(
      (f) =>
        f.type === FieldType.TEXT ||
        f.type === FieldType.LONG_TEXT ||
        /name|title|code|number|subject/i.test(f.key),
    )
    .map((f) => f.key);

  return unique([...keyFields, ...STATIC_TITLE_KEYS, ...textLikeFields]);
};

export const getRecordTitle = (
  record: any,
  moduleConfig?: ModuleDefinition,
  options: GetRecordTitleOptions = {},
): string => {
  const fallback = options.fallback ?? "";
  if (!record || typeof record !== "object") return fallback;

  const firstName = normalize(record.first_name);
  const lastName = normalize(record.last_name);
  if (firstName || lastName) {
    return [firstName, lastName].filter(Boolean).join(" ").trim();
  }

  const candidateKeys = getCandidateKeys(moduleConfig);
  for (const key of candidateKeys) {
    const value = normalize(record[key]);
    if (!value) continue;
    if (isUuidLike(value)) continue;
    return value;
  }

  if (options.allowIdFallback) {
    const id = normalize(record.id);
    if (id && !isUuidLike(id)) return id;
  }

  return fallback;
};

export const getModuleDisplayTitle = (moduleConfig?: ModuleDefinition, moduleId?: string): string => {
  return moduleConfig?.titles?.fa || moduleConfig?.titles?.en || moduleId || "";
};

