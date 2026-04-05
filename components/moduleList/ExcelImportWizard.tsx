
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Checkbox,
  Empty,
  Input,
  InputNumber,
  Modal,
  Select,
  Spin,
  Switch,
  Table,
  Tag,
  Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import {
  CloseOutlined,
  DeleteOutlined,
  FileOutlined,
  InboxOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { FieldNature, FieldType, ModuleDefinition, ModuleField } from "../../types";
import { supabase } from "../../supabaseClient";
import { attachTaskCompletionIfNeeded } from "../../utils/taskCompletion";
import { normalizePhoneForStorage } from "../../utils/phoneNumber";
import { toGregorianDateString } from "../../utils/persianNumberFormatter";
import { syncCustomerLevelsByInvoiceCustomers } from "../../utils/customerLeveling";
import { getAssigneeLabel } from "../../utils/assigneeLabel";
import { supportsGlobalAssignee, supportsGlobalAssigneeType, supportsGlobalRoleAssignee } from "../../utils/assigneeSupport";
import { supportsSystemCode } from "../../utils/systemCode";
import { getPreferredRelationTargetField, getRelationLabelFallbackFields } from "../../utils/relationTargetField";
import { toFaErrorMessage } from "../../utils/errorMessageFa";
import DynamicSelectField from "../DynamicSelectField";
import PersianDatePicker from "../PersianDatePicker";
import { fetchAssigneeDirectory, fetchDynamicOptionsByCategory } from "../../utils/referenceData";
import { fetchRelationOptionsForField } from "../../utils/relationOptions";

type DuplicateStrategy = "skip" | "overwrite" | "merge";
type EncodingType = "utf-8" | "windows-1256";
type ImportMode = "simple" | "grouped_invoice";
type MappingTargetScope = "header" | "item";

type MappingRow = {
  sourceColumn: string;
  sampleValue: string;
  targetScope: MappingTargetScope;
  targetFieldKey: string | null;
  defaultValue: string;
};

type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
  firstRow: Record<string, string> | null;
};

type RelationLookupMap = Record<string, Map<string, string>>;
type DynamicOptionLookupMap = Record<string, Map<string, string>>;

type ImportRuntimeContext = {
  relationLookups: RelationLookupMap;
  dynamicOptionLookups: DynamicOptionLookupMap;
};

type QueryResult<T> = {
  data: T | null;
  error: unknown | null;
};

type ImportFieldDescriptor = {
  key: string;
  type: FieldType;
  labels: { fa: string; en?: string };
  options?: ModuleField["options"];
  dynamicOptionsCategory?: ModuleField["dynamicOptionsCategory"];
  relationConfig?: ModuleField["relationConfig"];
  defaultValue?: ModuleField["defaultValue"];
  validation?: ModuleField["validation"];
  readonly?: boolean;
  nature?: FieldNature;
  scope: MappingTargetScope;
};

type GroupedRecord = {
  key: string;
  firstRow: Record<string, string>;
  rows: Record<string, string>[];
  sourceLines: number[];
};

interface ExcelImportWizardProps {
  open: boolean;
  moduleId: string;
  moduleConfig: ModuleDefinition;
  onClose: () => void;
  onImported?: () => void;
}

const WIZARD_STEPS = [
  { index: 0, title: "بارگذاری فایل" },
  { index: 1, title: "مدیریت تکرار" },
  { index: 2, title: "تطبیق فیلدها" },
] as const;

const RENDER_STEPS = [...WIZARD_STEPS].reverse();
const DUPLICATE_OPTIONS = [
  { label: "ثبت نکن", value: "skip" },
  { label: "بازنویسی کن", value: "overwrite" },
  { label: "ادغام کن", value: "merge" },
] as const;

const IMPORTABLE_TYPES = new Set<FieldType>([
  FieldType.TEXT,
  FieldType.LONG_TEXT,
  FieldType.SUPER_LONG_TEXT,
  FieldType.NUMBER,
  FieldType.PRICE,
  FieldType.PERCENTAGE,
  FieldType.CHECKBOX,
  FieldType.STOCK,
  FieldType.SELECT,
  FieldType.MULTI_SELECT,
  FieldType.CHECKLIST,
  FieldType.DATE,
  FieldType.TIME,
  FieldType.DATETIME,
  FieldType.LINK,
  FieldType.RELATION,
  FieldType.USER,
  FieldType.STATUS,
  FieldType.PHONE,
  FieldType.TAGS,
  FieldType.PERCENTAGE_OR_AMOUNT,
]);

const GROUPED_INVOICE_SUMMARY_FIELD_KEYS = new Set([
  "total_invoice_amount",
  "total_received_amount",
  "remaining_balance",
]);
const CUSTOMER_IMPORTABLE_READONLY_FIELD_KEYS = new Set([
  "first_purchase_date",
  "last_purchase_date",
  "purchase_count",
  "total_spend",
  "total_paid_amount",
  "acquaintance_days",
  "cooperation_days",
]);
const DYNAMIC_OPTION_IMPORT_TYPES = new Set<FieldType>([
  FieldType.SELECT,
  FieldType.MULTI_SELECT,
  FieldType.CHECKLIST,
]);
const RELATION_AUTOCREATE_TARGET_MODULES = new Set(["customers", "suppliers", "employees"]);

const LEGACY_PREFIX_REGEX = /^(contacts|accounts|products)\s*::::\s*/i;

const toEnglishDigits = (value: string): string =>
  value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));

const normalizeText = (value: unknown): string =>
  toEnglishDigits(String(value ?? ""))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[_-]+/g, " ");

const normalizeKey = (value: unknown): string => normalizeText(value).replace(/\s+/g, "");
const GENERIC_IMPORT_FIELD_ALIASES: Record<string, string> = {
  [normalizeKey("نام مسئول")]: "assignee_id",
  [normalizeKey("مسئول")]: "assignee_id",
  [normalizeKey("نام بازاریاب")]: "assignee_id",
  [normalizeKey("بازاریاب")]: "assignee_id",
};

const supportsAssigneeField = (moduleId: string): boolean => supportsGlobalAssignee(moduleId);
const supportsAssigneeTypeField = (moduleId: string): boolean => supportsGlobalAssigneeType(moduleId);
const isExplicitlyImportableReadonlyField = (moduleId: string, fieldKey: string): boolean =>
  moduleId === "customers" && CUSTOMER_IMPORTABLE_READONLY_FIELD_KEYS.has(fieldKey);

const buildAutoCustomerName = (values: Record<string, unknown>) => {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const businessName = normalize(values?.business_name);
  const personType = normalize(values?.person_type).toLowerCase();

  if (personType === "legal") {
    const legalName = normalize(values?.legal_name);
    if (legalName && businessName) return `${legalName} - ${businessName}`;
    return legalName || businessName;
  }

  const realName = [values?.prefix, values?.first_name, values?.last_name]
    .map((part) => normalize(part))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (realName && businessName) return `${realName} - ${businessName}`;
  return realName || businessName;
};

const stripLegacyReferencePrefix = (value: unknown): string =>
  String(value ?? "").trim().replace(LEGACY_PREFIX_REGEX, "").trim();

const LEGACY_INVOICE_HEADER_ALIASES: Record<string, { scope: MappingTargetScope; key: string }> = {
  [normalizeKey("شماره ی فاکتور")]: { scope: "header", key: "legacy_invoice_number" },
  [normalizeKey("شماره فاکتور")]: { scope: "header", key: "legacy_invoice_number" },
  [normalizeKey("موضوع")]: { scope: "header", key: "name" },
  [normalizeKey("تاريخ فاکتور")]: { scope: "header", key: "invoice_date" },
  [normalizeKey("تاریخ فاکتور")]: { scope: "header", key: "invoice_date" },
  [normalizeKey("وضعیت فاکتور")]: { scope: "header", key: "legacy_status" },
  [normalizeKey("وضعیت فاکتور حسابداری")]: { scope: "header", key: "legacy_accounting_status" },
  [normalizeKey("نام مخاطب")]: { scope: "header", key: "customer_id" },
  [normalizeKey("نام سازمان")]: { scope: "header", key: "customer_id" },
  [normalizeKey("توضیحات")]: { scope: "header", key: "description" },
  [normalizeKey("نمونه متن های توضیحات")]: { scope: "header", key: "legacy_ready_text" },
  [normalizeKey("منبع")]: { scope: "header", key: "legacy_source" },
  [normalizeKey("نام مسئول")]: { scope: "header", key: "assignee_id" },
  [normalizeKey("بازاریاب")]: { scope: "header", key: "assignee_id" },
  [normalizeKey("پیامک بعد از تایید ارسال شود؟")]: { scope: "header", key: "notify_customer" },
  [normalizeKey("مجموع")]: { scope: "header", key: "total_invoice_amount" },
  [normalizeKey("دریافت شده")]: { scope: "header", key: "total_received_amount" },
  [normalizeKey("باقیمانده")]: { scope: "header", key: "remaining_balance" },
  [normalizeKey("نام آیتم")]: { scope: "item", key: "product_id" },
  [normalizeKey("مقدار / تعداد")]: { scope: "item", key: "quantity" },
  [normalizeKey("مقدار/تعداد")]: { scope: "item", key: "quantity" },
  [normalizeKey("لیست قیمت")]: { scope: "item", key: "unit_price" },
  [normalizeKey("قیمت خالص")]: { scope: "item", key: "total_price" },
  [normalizeKey("مالیات بر ارزش افزوده")]: { scope: "item", key: "vat" },
  [normalizeKey("میزان تخفیف آیتم")]: { scope: "item", key: "discount" },
  [normalizeKey("یادداشت آیتم")]: { scope: "item", key: "description" },
};

const splitByDelimiters = (value: string): string[] =>
  value
    .split(/[,،;|\n\r]+/g)
    .map((item) => item.trim())
    .filter(Boolean);

const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  result.push(current);
  return result.map((item) => item.trim());
};

const parseCsvText = (text: string): string[][] => {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const rows = lines
    .map((line) => parseCsvLine(line))
    .filter((cells) => cells.some((cell) => cell.trim() !== ""));

  if (!rows.length) return [];
  const maxLength = Math.max(...rows.map((cells) => cells.length));
  return rows.map((cells) =>
    Array.from({ length: maxLength }).map((_, idx) => (cells[idx] ?? "").trim())
  );
};

const isValueEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

const createUniqueHeaders = (rawHeaderRow: string[]): string[] => {
  const used = new Map<string, number>();
  return rawHeaderRow.map((raw, idx) => {
    const base = String(raw ?? "").trim() || `ستون ${idx + 1}`;
    const normalized = normalizeKey(base) || `column_${idx + 1}`;
    const count = used.get(normalized) ?? 0;
    used.set(normalized, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
};

const matrixToSheetData = (matrix: string[][], hasHeader: boolean): ParsedSheet => {
  if (!matrix.length) {
    return { headers: [], rows: [], firstRow: null };
  }

  const headerRow = hasHeader
    ? matrix[0].map((item) => String(item ?? "").trim())
    : matrix[0].map((_, idx) => `ستون ${idx + 1}`);
  const headers = createUniqueHeaders(headerRow);
  const startIndex = hasHeader ? 1 : 0;
  const rows = matrix.slice(startIndex).map((rawRow) => {
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = String(rawRow[idx] ?? "").trim();
    });
    return row;
  });

  return {
    headers,
    rows,
    firstRow: rows[0] ?? null,
  };
};

const resolveDate = (value: string): Date | null => {
  const numeric = parseFloat(toEnglishDigits(value).replace(/,/g, ""));
  if (!Number.isNaN(numeric) && numeric > 25569 && numeric < 70000) {
    const utcDays = Math.floor(numeric - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    return Number.isNaN(dateInfo.getTime()) ? null : dateInfo;
  }
  return null;
};

const buildNormalizedSlashDate = (value: string): string | null => {
  const normalized = toEnglishDigits(String(value || "").trim()).replace(/\./g, "/");
  const match = normalized.match(
    /^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!match) return null;

  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = Number(match[3]);
  const hh = match[4] ? String(match[4]).padStart(2, "0") : null;
  const mm = match[5] ? String(match[5]).padStart(2, "0") : null;
  const ss = match[6] ? String(match[6]).padStart(2, "0") : "00";

  if (String(match[1]).length === 4) {
    const base = `${String(first).padStart(4, "0")}-${String(second).padStart(2, "0")}-${String(third).padStart(2, "0")}`;
    return hh && mm ? `${base} ${hh}:${mm}:${ss}` : base;
  }

  if (String(match[3]).length !== 4) return null;

  let month = first;
  let day = second;
  if (first > 12 && second <= 12) {
    month = second;
    day = first;
  }

  const base = `${String(third).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return hh && mm ? `${base} ${hh}:${mm}:${ss}` : base;
};

const normalizeImportedDateValue = (value: string, fieldType: FieldType.DATE | FieldType.DATETIME): string => {
  const raw = String(value || "").trim();
  if (!raw) return raw;

  const excelDate = resolveDate(raw);
  if (excelDate) {
    return fieldType === FieldType.DATETIME ? excelDate.toISOString() : excelDate.toISOString().slice(0, 10);
  }

  const englishRaw = toEnglishDigits(raw).trim();
  const normalizedSlash = buildNormalizedSlashDate(englishRaw);
  const candidateValues = Array.from(
    new Set(
      [
        englishRaw,
        englishRaw.replace(/\./g, "/"),
        normalizedSlash,
      ].filter((item): item is string => Boolean(item && item.trim()))
    )
  );
  const targetFormat = fieldType === FieldType.DATETIME ? "YYYY-MM-DDTHH:mm:ss[Z]" : "YYYY-MM-DD";
  const formatOptions = fieldType === FieldType.DATE ? { setMidday: true } : undefined;

  for (const candidate of candidateValues) {
    const formatted = toGregorianDateString(candidate, targetFormat, formatOptions);
    if (formatted) return formatted;
  }

  return englishRaw || raw;
};

const parseBoolean = (value: string): boolean | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (["true", "1", "yes", "on", "فعال", "بله", "بلی", "صحیح"].includes(normalized)) return true;
  if (["false", "0", "no", "off", "غیرفعال", "خیر", "غلط", "نادرست"].includes(normalized)) return false;
  return null;
};

const parseNumber = (value: string): number | null => {
  const normalized = toEnglishDigits(value).replace(/[,\s٬]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const guessTargetField = (
  sourceColumn: string,
  fields: Array<Pick<ImportFieldDescriptor, "key" | "labels">>
): string | null => {
  const sourceKey = normalizeKey(sourceColumn);
  if (!sourceKey) return null;

  const aliasedFieldKey = GENERIC_IMPORT_FIELD_ALIASES[sourceKey];
  if (aliasedFieldKey && fields.some((field) => field.key === aliasedFieldKey)) {
    return aliasedFieldKey;
  }

  for (const field of fields) {
    if (normalizeKey(field.key) === sourceKey) return field.key;
  }
  for (const field of fields) {
    if (normalizeKey(field.labels.fa) === sourceKey) return field.key;
    if (field.labels.en && normalizeKey(field.labels.en) === sourceKey) return field.key;
  }
  for (const field of fields) {
    const bag = [field.key, field.labels.fa, field.labels.en || ""]
      .map((item) => normalizeKey(item))
      .filter(Boolean);
    if (bag.some((item) => item.includes(sourceKey) || sourceKey.includes(item))) {
      return field.key;
    }
  }
  return null;
};

const guessGroupedInvoiceTarget = (
  sourceColumn: string,
  headerFields: ImportFieldDescriptor[],
  itemFields: ImportFieldDescriptor[]
): { scope: MappingTargetScope; key: string | null } => {
  const sourceKey = normalizeKey(sourceColumn);
  const aliased = LEGACY_INVOICE_HEADER_ALIASES[sourceKey];
  if (aliased) return aliased;

  const guessedHeader = guessTargetField(sourceColumn, headerFields);
  if (guessedHeader) return { scope: "header", key: guessedHeader };

  const guessedItem = guessTargetField(sourceColumn, itemFields);
  if (guessedItem) return { scope: "item", key: guessedItem };

  return { scope: "header", key: null };
};

const encodeForLookup = (value: unknown): string => normalizeKey(stripLegacyReferencePrefix(value));

const isProbablyDuplicateInsertError = (error: unknown): boolean => {
  const code = String((error as any)?.code || "").toUpperCase();
  const message = String((error as any)?.message || (error as any)?.details || "").toLowerCase();
  return code === "23505" || message.includes("duplicate key") || message.includes("unique constraint");
};

const isMissingColumnError = (error: unknown): boolean => {
  const code = String((error as any)?.code || "").toUpperCase();
  const text = String((error as any)?.message || (error as any)?.details || "").toLowerCase();
  return code === "42703" || code === "PGRST204" || text.includes("column");
};

const isIntegerOutOfRangeError = (error: unknown): boolean => {
  const code = String((error as any)?.code || "").toUpperCase();
  const text = String((error as any)?.message || (error as any)?.details || "").toLowerCase();
  return code === "22003" || text.includes("out of range for type integer");
};

const getRelationLookupColumns = (targetModule: string, targetField: string): string[] => {
  const columns = new Set<string>(["id", targetField]);
  if (supportsSystemCode(targetModule)) {
    columns.add("system_code");
  }
  if (targetModule === "customers") {
    ["full_name", "prefix", "first_name", "last_name", "business_name", "legal_name", "mobile_1", "legacy_contact_code"].forEach((column) =>
      columns.add(column)
    );
  }
  if (targetModule === "products") {
    ["name", "manual_code", "crm_code", "accounting_code"].forEach((column) => columns.add(column));
  }
  return Array.from(columns);
};

const getRelationLookupCandidates = (
  targetModule: string,
  row: Record<string, unknown>,
  targetField: string
): string[] => {
  if (targetModule === "customers") {
    return getCustomerLookupCandidates(row);
  }
  if (targetModule === "products") {
    return getProductLookupCandidates(row, targetField);
  }
  return [row[targetField], row.system_code]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
};

const getRelationLookupFields = (targetModule: string, targetField: string): string[] =>
  Array.from(
    new Set(
      [
        targetField,
        ...getRelationLabelFallbackFields(targetModule),
        ...(supportsSystemCode(targetModule) ? ["system_code"] : []),
        ...(targetModule === "customers" ? ["legacy_contact_code", "mobile_1"] : []),
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );

const getRelationSelectVariants = (targetModule: string, targetField: string): string[] => {
  const columns = getRelationLookupColumns(targetModule, targetField);
  return Array.from(
    new Set(
      [
        columns.join(", "),
        columns.filter((column) => column !== "system_code").join(", "),
        Array.from(new Set(["id", targetField])).join(", "),
        "id",
      ].filter(Boolean)
    )
  );
};

const buildRelationAutoCreatePayload = (
  targetModule: string,
  rawValue: string
): Record<string, unknown> | null => {
  const value = stripLegacyReferencePrefix(rawValue);
  if (!value) return null;
  if (targetModule === "customers") {
    return { full_name: value, rank: "normal" };
  }
  if (targetModule === "suppliers") {
    return { business_name: value };
  }
  if (targetModule === "employees") {
    return { full_name: value };
  }
  return null;
};

const toImportField = (field: ModuleField, scope: MappingTargetScope): ImportFieldDescriptor => ({
  key: field.key,
  type: field.type,
  labels: field.labels,
  options: field.options,
  dynamicOptionsCategory: field.dynamicOptionsCategory,
  relationConfig: field.relationConfig,
  defaultValue: field.defaultValue,
  validation: field.validation,
  readonly: field.readonly,
  nature: field.nature,
  scope,
});

const buildGroupedRecords = (
  rows: Record<string, string>[],
  groupingColumn: string,
  hasHeader: boolean
): { records: GroupedRecord[]; missingGroupSourceLines: number[] } => {
  const map = new Map<string, GroupedRecord>();
  const missingGroupSourceLines: number[] = [];

  rows.forEach((row, rowIndex) => {
    const sourceLine = hasHeader ? rowIndex + 2 : rowIndex + 1;
    const rawKey = String(row[groupingColumn] ?? "").trim();
    if (!rawKey) {
      missingGroupSourceLines.push(sourceLine);
      return;
    }

    const existing = map.get(rawKey);
    if (existing) {
      existing.rows.push(row);
      existing.sourceLines.push(sourceLine);
      return;
    }

    map.set(rawKey, {
      key: rawKey,
      firstRow: row,
      rows: [row],
      sourceLines: [sourceLine],
    });
  });

  return {
    records: Array.from(map.values()),
    missingGroupSourceLines,
  };
};

const mapLegacyInvoiceStatus = (value: unknown): string | null => {
  const normalized = normalizeKey(value);
  if (!normalized) return null;

  if (["paid", normalizeKey("پرداخت شده")].includes(normalized)) return "settled";
  if (["approved", normalizeKey("تایید شده")].includes(normalized)) return "confirmed";
  if ([normalizeKey("پیش پرداخت"), "prepayment"].includes(normalized)) return "prepayment";
  if (["created", normalizeKey("ایجاد شده")].includes(normalized)) return "created";
  if (["cancel", "cancelled", "canceled", normalizeKey("لغو شده")].includes(normalized)) return "canceled";
  return null;
};

const getCustomerLookupCandidates = (row: Record<string, unknown>): string[] => {
  const values = [
    row.full_name,
    row.legal_name,
    row.business_name,
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim(),
    [row.prefix, row.first_name, row.last_name].filter(Boolean).join(" ").trim(),
    row.system_code,
    row.legacy_contact_code,
    row.mobile_1,
  ];
  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
};

const getProductLookupCandidates = (row: Record<string, unknown>, targetField: string): string[] => {
  const values = [
    row[targetField],
    row.name,
    row.system_code,
    row.manual_code,
    row.crm_code,
    row.accounting_code,
  ];
  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
};

const finalizeInvoiceHeaderPayload = (payload: Record<string, unknown>): Record<string, unknown> => {
  if (isValueEmpty(payload.status) && !isValueEmpty(payload.legacy_status)) {
    const mappedStatus = mapLegacyInvoiceStatus(payload.legacy_status);
    if (mappedStatus) payload.status = mappedStatus;
  }

  if (isValueEmpty(payload.name) && !isValueEmpty(payload.legacy_invoice_number)) {
    payload.name = String(payload.legacy_invoice_number);
  }

  return payload;
};

const finalizeInvoiceItemPayload = (payload: Record<string, unknown>): Record<string, unknown> => {
  const quantity = Number(payload.quantity ?? 0);
  const unitPrice = Number(payload.unit_price ?? 0);
  const discount = Number(payload.discount ?? 0);
  const vat = Number(payload.vat ?? 0);

  if (isValueEmpty(payload.total_price) && (quantity > 0 || unitPrice > 0)) {
    payload.total_price = quantity * unitPrice - discount + vat;
  }

  return payload;
};

const buildRowHasAnyValue = (row: Record<string, string>): boolean =>
  Object.values(row).some((value) => !isValueEmpty(value));

const withTimeout = async <T,>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  label: string
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label}: زمان پاسخ تمام شد.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const ExcelImportWizard: React.FC<ExcelImportWizardProps> = ({
  open,
  moduleId,
  moduleConfig,
  onClose,
  onImported,
}) => {
  const { message } = App.useApp();
  const supportsGroupedInvoiceImport =
    moduleId === "invoices" || moduleId === "purchase_invoices";

  const [step, setStep] = useState<number>(0);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [hasHeader, setHasHeader] = useState<boolean>(true);
  const [encoding, setEncoding] = useState<EncodingType>("utf-8");
  const [importMode, setImportMode] = useState<ImportMode>(
    supportsGroupedInvoiceImport ? "grouped_invoice" : "simple"
  );
  const [groupingColumn, setGroupingColumn] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [rawMatrix, setRawMatrix] = useState<string[][]>([]);
  const [mappingRows, setMappingRows] = useState<MappingRow[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>("skip");
  const [duplicateFields, setDuplicateFields] = useState<string[]>([]);
  const [saveCustomMapping, setSaveCustomMapping] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [autoSyncCustomerStats, setAutoSyncCustomerStats] = useState<boolean>(moduleId === "invoices");
  const [duplicateFieldSearch, setDuplicateFieldSearch] = useState<string>("");
  const [defaultEditorRelationOptions, setDefaultEditorRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [defaultEditorDynamicOptions, setDefaultEditorDynamicOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [defaultEditorAssigneeOptions, setDefaultEditorAssigneeOptions] = useState<Array<{ label: string; value: string }>>([]);
  const parsedSheet = useMemo(() => matrixToSheetData(rawMatrix, hasHeader), [rawMatrix, hasHeader]);

  const headerImportableFields = useMemo(() => {
    const fields = [...moduleConfig.fields]
      .filter((field) => {
        if (!IMPORTABLE_TYPES.has(field.type)) return false;
        if (
          supportsGroupedInvoiceImport &&
          importMode === "grouped_invoice" &&
          GROUPED_INVOICE_SUMMARY_FIELD_KEYS.has(field.key)
        ) {
          return true;
        }
        if (field.readonly && !isExplicitlyImportableReadonlyField(moduleId, field.key)) return false;
        if (field.nature === FieldNature.SYSTEM) return false;
        return true;
      })
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .map((field) => toImportField(field, "header"));

    if (supportsAssigneeField(moduleId) && !fields.some((field) => field.key === "assignee_id")) {
      fields.push({
        key: "assignee_id",
        type: FieldType.USER,
        labels: { fa: getAssigneeLabel(moduleId), en: "Assignee" },
        scope: "header",
      });
    }

    return fields;
  }, [importMode, moduleConfig.fields, moduleId, supportsGroupedInvoiceImport]);

  const invoiceItemsBlock = useMemo(() => {
    if (!supportsGroupedInvoiceImport || importMode !== "grouped_invoice") return null;
    return moduleConfig.blocks?.find((block) => block.id === "invoiceItems" && Array.isArray(block.tableColumns)) ?? null;
  }, [importMode, moduleConfig.blocks, supportsGroupedInvoiceImport]);

  const itemImportableFields = useMemo<ImportFieldDescriptor[]>(() => {
    if (!invoiceItemsBlock?.tableColumns?.length) return [];
    return invoiceItemsBlock.tableColumns
      .filter((column) => IMPORTABLE_TYPES.has(column.type))
      .map((column: any) => ({
        key: column.key,
        type: column.type,
        labels: { fa: column.title },
        options: column.options,
        dynamicOptionsCategory: column.dynamicOptionsCategory,
        relationConfig: column.relationConfig,
        readonly: column.readonly,
        scope: "item" as const,
      }));
  }, [invoiceItemsBlock]);

  const headerFieldByKey = useMemo(() => {
    const map = new Map<string, ImportFieldDescriptor>();
    headerImportableFields.forEach((field) => map.set(field.key, field));
    return map;
  }, [headerImportableFields]);

  const itemFieldByKey = useMemo(() => {
    const map = new Map<string, ImportFieldDescriptor>();
    itemImportableFields.forEach((field) => map.set(field.key, field));
    return map;
  }, [itemImportableFields]);

  const requiredFields = useMemo(
    () => headerImportableFields.filter((field) => field.validation?.required),
    [headerImportableFields]
  );

  const groupedData = useMemo(() => {
    if (importMode !== "grouped_invoice" || !groupingColumn) {
      return { records: [] as GroupedRecord[], missingGroupSourceLines: [] as number[] };
    }
    return buildGroupedRecords(parsedSheet.rows, groupingColumn, hasHeader);
  }, [groupingColumn, hasHeader, importMode, parsedSheet.rows]);

  const mappedHeaderFieldKeys = useMemo(() => {
    return mappingRows
      .filter((row) => row.targetScope === "header")
      .map((row) => row.targetFieldKey)
      .filter((key): key is string => Boolean(key));
  }, [mappingRows]);
  const mappedHeaderFieldKeySet = useMemo(() => new Set(mappedHeaderFieldKeys), [mappedHeaderFieldKeys]);

  const mappedItemFieldKeys = useMemo(() => {
    return mappingRows
      .filter((row) => row.targetScope === "item")
      .map((row) => row.targetFieldKey)
      .filter((key): key is string => Boolean(key));
  }, [mappingRows]);
  const mappedItemFieldKeySet = useMemo(() => new Set(mappedItemFieldKeys), [mappedItemFieldKeys]);

  const mappedRequiredFieldKeys = useMemo(() => {
    const set = new Set(mappedHeaderFieldKeys);
    if (set.has("legacy_status")) set.add("status");
    return requiredFields.filter((field) => set.has(field.key)).map((field) => field.key);
  }, [mappedHeaderFieldKeys, requiredFields]);

  const missingRequiredFields = useMemo(() => {
    const set = new Set(mappedRequiredFieldKeys);
    return requiredFields.filter((field) => !set.has(field.key));
  }, [mappedRequiredFieldKeys, requiredFields]);

  const resetWizard = useCallback(() => {
    setStep(0);
    setIsParsing(false);
    setIsImporting(false);
    setHasHeader(true);
    setEncoding("utf-8");
    setImportMode(supportsGroupedInvoiceImport ? "grouped_invoice" : "simple");
    setGroupingColumn("");
    setSelectedFile(null);
    setFileList([]);
    setRawMatrix([]);
    setMappingRows([]);
    setDuplicateStrategy("skip");
    setDuplicateFields([]);
    setDuplicateFieldSearch("");
    setSaveCustomMapping(false);
    setAutoSyncCustomerStats(moduleId === "invoices");
    setDefaultEditorRelationOptions({});
    setDefaultEditorDynamicOptions({});
    setDefaultEditorAssigneeOptions([]);
  }, [moduleId, supportsGroupedInvoiceImport]);

  useEffect(() => {
    if (!open) return;
    resetWizard();
  }, [open, moduleId, resetWizard]);

  const parseFile = useCallback(
    async (file: File, textEncoding: EncodingType) => {
      setIsParsing(true);
      try {
        const extension = file.name.split(".").pop()?.toLowerCase() || "";
        if (extension === "csv") {
          const buffer = await file.arrayBuffer();
          const decoder = new TextDecoder(textEncoding);
          const text = decoder.decode(buffer);
          const matrix = parseCsvText(text);
          setRawMatrix(matrix);
          return;
        }

        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setRawMatrix([]);
          return;
        }
        const worksheet = workbook.Sheets[firstSheetName];
        const matrix = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
          raw: false,
        }) as any[][];
        setRawMatrix(matrix.map((row: any[]) => row.map((cell: any) => String(cell ?? "").trim())));
      } finally {
        setIsParsing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedFile) return;
    const extension = selectedFile.name.split(".").pop()?.toLowerCase() || "";
    if (extension !== "csv") return;
    void parseFile(selectedFile, encoding);
  }, [encoding, parseFile, selectedFile]);

  useEffect(() => {
    if (!supportsGroupedInvoiceImport || importMode !== "grouped_invoice") return;
    if (!parsedSheet.headers.length) {
      setGroupingColumn("");
      return;
    }
    if (groupingColumn && parsedSheet.headers.includes(groupingColumn)) return;

    const preferred =
      parsedSheet.headers.find((header) =>
        [normalizeKey("شماره ی فاکتور"), normalizeKey("شماره فاکتور"), normalizeKey("invoice number")].includes(
          normalizeKey(header)
        )
      ) ?? parsedSheet.headers[0];
    setGroupingColumn(preferred ?? "");
  }, [groupingColumn, importMode, parsedSheet.headers, supportsGroupedInvoiceImport]);

  useEffect(() => {
    if (!parsedSheet.headers.length) {
      setMappingRows([]);
      return;
    }

    const rows: MappingRow[] = parsedSheet.headers.map((header) => {
      if (supportsGroupedInvoiceImport && importMode === "grouped_invoice") {
        const guessed = guessGroupedInvoiceTarget(header, headerImportableFields, itemImportableFields);
        return {
          sourceColumn: header,
          sampleValue: parsedSheet.firstRow?.[header] ?? "",
          targetScope: guessed.scope,
          targetFieldKey: guessed.key,
          defaultValue: "",
        };
      }

      return {
        sourceColumn: header,
        sampleValue: parsedSheet.firstRow?.[header] ?? "",
        targetScope: "header",
        targetFieldKey: guessTargetField(header, headerImportableFields),
        defaultValue: "",
      };
    });
    setMappingRows(rows);
  }, [
    headerImportableFields,
    importMode,
    itemImportableFields,
    parsedSheet.firstRow,
    parsedSheet.headers,
    supportsGroupedInvoiceImport,
  ]);

  const handleSelectFile = useCallback(
    async (file: File) => {
      setSelectedFile(file);
      setFileList([
        {
          uid: String(Date.now()),
          name: file.name,
          status: "done",
          size: file.size,
          type: file.type,
        },
      ]);

      try {
        await parseFile(file, encoding);
      } catch (error) {
        setRawMatrix([]);
        message.error(toFaErrorMessage(error as any, "خطا در خواندن فایل"));
      }
    },
    [encoding, message, parseFile]
  );

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setFileList([]);
    setRawMatrix([]);
    setMappingRows([]);
    setGroupingColumn("");
  }, []);

  const updateMappingRow = useCallback(
    (sourceColumn: string, patch: Partial<MappingRow>) => {
      setMappingRows((prev) =>
        prev.map((row) => (row.sourceColumn === sourceColumn ? { ...row, ...patch } : row))
      );
    },
    []
  );
  const selectPopupContainer = useCallback(
    (node?: HTMLElement | null) => node?.parentElement || document.body,
    []
  );
  const wizardSelectProps = useMemo(
    () => ({
      getPopupContainer: selectPopupContainer,
      popupMatchSelectWidth: false,
      virtual: false,
      listHeight: 280,
      styles: { popup: { root: { zIndex: 1700, minWidth: 220 } } },
    }),
    [selectPopupContainer]
  );
  const headerFieldSelectOptions = useMemo(
    () =>
      headerImportableFields.map((field) => ({
        label: field.labels.fa,
        value: field.key,
      })),
    [headerImportableFields]
  );
  const itemFieldSelectOptions = useMemo(
    () =>
      itemImportableFields.map((field) => ({
        label: field.labels.fa,
        value: field.key,
      })),
    [itemImportableFields]
  );
  const duplicateFieldSelectOptions = useMemo(
    () =>
      headerImportableFields.map((field) => ({
        label: field.labels.fa,
        value: field.key,
      })),
    [headerImportableFields]
  );
  const filteredDuplicateFieldOptions = useMemo(() => {
    const normalizedSearch = normalizeText(duplicateFieldSearch);
    if (!normalizedSearch) return duplicateFieldSelectOptions;
    return duplicateFieldSelectOptions.filter((option) =>
      normalizeText(option.label).includes(normalizedSearch) || normalizeText(option.value).includes(normalizedSearch)
    );
  }, [duplicateFieldSearch, duplicateFieldSelectOptions]);
  const getMappingTargetField = useCallback(
    (row: MappingRow): ImportFieldDescriptor | null => {
      const targetFieldKey = String(row.targetFieldKey || "").trim();
      if (!targetFieldKey) return null;
      return row.targetScope === "item"
        ? itemFieldByKey.get(targetFieldKey) || null
        : headerFieldByKey.get(targetFieldKey) || null;
    },
    [headerFieldByKey, itemFieldByKey]
  );
  const serializeEditorDefaultValue = useCallback((field: ImportFieldDescriptor, value: any): string => {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean).join(", ");
    }
    if (field.type === FieldType.CHECKBOX) {
      return value ? "true" : "false";
    }
    return String(value).trim();
  }, []);
  const parseEditorDefaultValue = useCallback((field: ImportFieldDescriptor, value: string): any => {
    const raw = String(value || "").trim();
    if (!raw) return undefined;
    if (field.type === FieldType.MULTI_SELECT || field.type === FieldType.CHECKLIST || field.type === FieldType.TAGS) {
      return splitByDelimiters(raw);
    }
    if (field.type === FieldType.CHECKBOX) {
      return parseBoolean(raw) ?? false;
    }
    if (
      field.type === FieldType.NUMBER
      || field.type === FieldType.PRICE
      || field.type === FieldType.PERCENTAGE
      || field.type === FieldType.PERCENTAGE_OR_AMOUNT
      || field.type === FieldType.STOCK
    ) {
      return parseNumber(raw) ?? undefined;
    }
    return raw;
  }, []);
  const toEditorField = useCallback((field: ImportFieldDescriptor) => ({
    key: field.key,
    type: field.type === FieldType.USER ? FieldType.RELATION : field.type,
    labels: field.labels,
    options: field.options,
    dynamicOptionsCategory: field.dynamicOptionsCategory,
    relationConfig: field.type === FieldType.USER
      ? { targetModule: "profiles", targetField: "full_name" }
      : field.relationConfig,
    validation: field.validation,
    readonly: false,
    nature: field.nature,
  }), []);
  useEffect(() => {
    if (step !== 2) return;
    const selectedFields = mappingRows
      .map((row) => getMappingTargetField(row))
      .filter((field): field is ImportFieldDescriptor => Boolean(field));
    const neededDynamicCategories = Array.from(
      new Set(
        selectedFields
          .map((field) => String(field.dynamicOptionsCategory || "").trim())
          .filter(Boolean)
      )
    );
    const neededRelationFields = selectedFields.filter((field) =>
      field.key !== "assignee_id" && (field.type === FieldType.RELATION || field.type === FieldType.USER)
    );
    const needsAssigneeOptions = selectedFields.some((field) => field.key === "assignee_id");
    let cancelled = false;

    const loadEditorOptions = async () => {
      const nextDynamicEntries = await Promise.all(
        neededDynamicCategories
          .filter((category) => !defaultEditorDynamicOptions[category])
          .map(async (category) => [category, await fetchDynamicOptionsByCategory(supabase, category)] as const)
      );
      const nextRelationEntries = await Promise.all(
        neededRelationFields
          .filter((field) => !defaultEditorRelationOptions[`${field.scope}:${field.key}`])
          .map(async (field) => [
            `${field.scope}:${field.key}`,
            await fetchRelationOptionsForField(supabase, toEditorField(field) as any, { limit: 300 }),
          ] as const)
      );

      if (!cancelled && nextDynamicEntries.length > 0) {
        setDefaultEditorDynamicOptions((prev) => ({ ...prev, ...Object.fromEntries(nextDynamicEntries) }));
      }
      if (!cancelled && nextRelationEntries.length > 0) {
        setDefaultEditorRelationOptions((prev) => ({ ...prev, ...Object.fromEntries(nextRelationEntries) }));
      }
      if (!cancelled && needsAssigneeOptions && defaultEditorAssigneeOptions.length === 0) {
        const directory = await fetchAssigneeDirectory(supabase);
        setDefaultEditorAssigneeOptions([
          ...directory.users.map((user) => ({
            label: String(user.display_name || user.full_name || user.email || user.mobile_1 || user.id).trim(),
            value: `user_${String(user.id)}`,
          })),
          ...(supportsGlobalRoleAssignee(moduleId)
            ? directory.roles.map((role) => ({
                label: String(role.title || role.id).trim(),
                value: `role_${String(role.id)}`,
              }))
            : []),
        ]);
      }
    };

    void loadEditorOptions();
    return () => {
      cancelled = true;
    };
  }, [
    defaultEditorAssigneeOptions.length,
    defaultEditorDynamicOptions,
    defaultEditorRelationOptions,
    getMappingTargetField,
    mappingRows,
    moduleId,
    step,
    toEditorField,
  ]);
  const renderDefaultValueEditor = useCallback((row: MappingRow) => {
    const field = getMappingTargetField(row);
    if (!field) {
      return (
        <Input
          value={row.defaultValue}
          onChange={(event) => updateMappingRow(row.sourceColumn, { defaultValue: event.target.value })}
          placeholder="اختیاری"
        />
      );
    }

    const editorValue = parseEditorDefaultValue(field, row.defaultValue);
    const setEditorValue = (nextValue: any) => {
      updateMappingRow(row.sourceColumn, {
        defaultValue: serializeEditorDefaultValue(field, nextValue),
      });
    };

    if (field.key === "assignee_id") {
      return (
        <Select
          {...wizardSelectProps}
          value={editorValue}
          allowClear
          showSearch
          className="w-full"
          optionFilterProp="label"
          options={defaultEditorAssigneeOptions}
          placeholder="انتخاب مسئول پیش فرض"
          onChange={(nextValue) => setEditorValue(nextValue)}
        />
      );
    }

    if ((field.type === FieldType.SELECT || field.type === FieldType.STATUS) && field.dynamicOptionsCategory) {
      return (
        <DynamicSelectField
          value={editorValue}
          onChange={setEditorValue}
          options={defaultEditorDynamicOptions[String(field.dynamicOptionsCategory)] || []}
          category={String(field.dynamicOptionsCategory)}
          getPopupContainer={wizardSelectProps.getPopupContainer as any}
          popupStyle={{ zIndex: 1700 }}
        />
      );
    }

    if ((field.type === FieldType.MULTI_SELECT || field.type === FieldType.CHECKLIST) && field.dynamicOptionsCategory) {
      return (
        <DynamicSelectField
          value={Array.isArray(editorValue) ? editorValue : []}
          onChange={setEditorValue}
          options={defaultEditorDynamicOptions[String(field.dynamicOptionsCategory)] || []}
          category={String(field.dynamicOptionsCategory)}
          mode="multiple"
          getPopupContainer={wizardSelectProps.getPopupContainer as any}
          popupStyle={{ zIndex: 1700 }}
        />
      );
    }

    if (field.type === FieldType.SELECT || field.type === FieldType.STATUS) {
      return (
        <Select
          {...wizardSelectProps}
          value={editorValue}
          allowClear
          showSearch
          className="w-full"
          optionFilterProp="label"
          options={(field.options || []).map((option) => ({ label: option.label, value: option.value }))}
          placeholder="انتخاب مقدار پیش فرض"
          onChange={(nextValue) => setEditorValue(nextValue)}
        />
      );
    }

    if (field.type === FieldType.MULTI_SELECT || field.type === FieldType.CHECKLIST) {
      return (
        <Select
          {...wizardSelectProps}
          mode="multiple"
          value={Array.isArray(editorValue) ? editorValue : []}
          allowClear
          showSearch
          className="w-full"
          optionFilterProp="label"
          options={(field.options || []).map((option) => ({ label: option.label, value: option.value }))}
          placeholder="انتخاب مقدار پیش فرض"
          onChange={(nextValue) => setEditorValue(nextValue)}
        />
      );
    }

    if (field.type === FieldType.RELATION || field.type === FieldType.USER) {
      return (
        <Select
          {...wizardSelectProps}
          value={editorValue}
          allowClear
          showSearch
          className="w-full"
          optionFilterProp="label"
          options={defaultEditorRelationOptions[`${field.scope}:${field.key}`] || []}
          placeholder="انتخاب مقدار پیش فرض"
          onChange={(nextValue) => setEditorValue(nextValue)}
        />
      );
    }

    if (field.type === FieldType.CHECKBOX) {
      return <Switch checked={!!editorValue} onChange={(checked) => setEditorValue(checked)} />;
    }

    if (
      field.type === FieldType.NUMBER
      || field.type === FieldType.PRICE
      || field.type === FieldType.PERCENTAGE
      || field.type === FieldType.PERCENTAGE_OR_AMOUNT
      || field.type === FieldType.STOCK
    ) {
      return (
        <InputNumber
          value={editorValue}
          onChange={(nextValue) => setEditorValue(nextValue)}
          className="w-full"
          controls={false}
        />
      );
    }

    if (field.type === FieldType.DATE) {
      return <PersianDatePicker type="DATE" value={editorValue} onChange={setEditorValue} className="w-full" zIndex={1740} />;
    }

    if (field.type === FieldType.TIME) {
      return <PersianDatePicker type="TIME" value={editorValue} onChange={setEditorValue} className="w-full" zIndex={1740} />;
    }

    if (field.type === FieldType.DATETIME) {
      return <PersianDatePicker type="DATETIME" value={editorValue} onChange={setEditorValue} className="w-full" zIndex={1740} />;
    }

    return (
      <Input
        value={row.defaultValue}
        onChange={(event) => updateMappingRow(row.sourceColumn, { defaultValue: event.target.value })}
        placeholder="اختیاری"
      />
    );
  }, [
    defaultEditorAssigneeOptions,
    defaultEditorDynamicOptions,
    defaultEditorRelationOptions,
    getMappingTargetField,
    parseEditorDefaultValue,
    serializeEditorDefaultValue,
    updateMappingRow,
    wizardSelectProps,
  ]);
  const mappingTargetFieldOptionsBySource = useMemo(() => {
    const result: Record<string, Array<{ label: string; value: string; disabled?: boolean }>> = {};
    mappingRows.forEach((row) => {
      const currentValue = String(row.targetFieldKey || "").trim();
      const baseOptions = row.targetScope === "item" ? itemFieldSelectOptions : headerFieldSelectOptions;
      const usedFieldKeys = row.targetScope === "item" ? mappedItemFieldKeySet : mappedHeaderFieldKeySet;
      result[row.sourceColumn] = baseOptions.map((option) => ({
        ...option,
        disabled: option.value !== currentValue && usedFieldKeys.has(option.value),
      }));
    });
    return result;
  }, [
    headerFieldSelectOptions,
    itemFieldSelectOptions,
    mappedHeaderFieldKeySet,
    mappedItemFieldKeySet,
    mappingRows,
  ]);
  const mappingTableColumns = useMemo<ColumnsType<MappingRow>>(
    () => [
      {
        title: "تیتر",
        dataIndex: "sourceColumn",
        key: "sourceColumn",
        width: 280,
        render: (value: string) => <span className="font-semibold">{value}</span>,
      },
      {
        title: "ردیف اول",
        dataIndex: "sampleValue",
        key: "sampleValue",
        width: 260,
        render: (value: string) => <span className="text-gray-600">{value || "-"}</span>,
      },
      ...(importMode === "grouped_invoice"
        ? [
            {
              title: "بخش",
              dataIndex: "targetScope",
              key: "targetScope",
              width: 180,
              render: (value: MappingTargetScope, row: MappingRow) => (
                <Select
                  {...wizardSelectProps}
                  value={value}
                  className="w-full"
                  onChange={(nextScope) =>
                    updateMappingRow(row.sourceColumn, {
                      targetScope: nextScope,
                      targetFieldKey: null,
                    })
                  }
                  options={[
                    { label: "سربرگ فاکتور", value: "header" },
                    { label: "اقلام فاکتور", value: "item" },
                  ]}
                />
              ),
            },
          ]
        : []),
      {
        title: "فیلد های موجود",
        dataIndex: "targetFieldKey",
        key: "targetFieldKey",
        width: 320,
        render: (value: string | null, row: MappingRow) => (
          <Select
            {...wizardSelectProps}
            value={value}
            allowClear
            showSearch
            className="w-full"
            optionFilterProp="label"
            placeholder="انتخاب فیلد"
            onChange={(nextValue) =>
              updateMappingRow(row.sourceColumn, { targetFieldKey: nextValue || null })
            }
            options={mappingTargetFieldOptionsBySource[row.sourceColumn] || []}
          />
        ),
      },
      {
        title: "مقدار پیش فرض",
        dataIndex: "defaultValue",
        key: "defaultValue",
        width: 220,
        render: (_value: string, row: MappingRow) => renderDefaultValueEditor(row),
      },
    ],
    [importMode, mappingTargetFieldOptionsBySource, renderDefaultValueEditor, updateMappingRow]
  );

  const ensureDynamicOptionValue = useCallback(
    async (
      category: string,
      rawValue: string,
      dynamicOptionLookups: DynamicOptionLookupMap
    ): Promise<string | undefined> => {
      const value = String(rawValue ?? "").trim();
      if (!value) return undefined;

      const map = dynamicOptionLookups[category] || new Map<string, string>();
      dynamicOptionLookups[category] = map;

      const normalized = normalizeKey(value);
      const existing = map.get(normalized);
      if (existing) return existing;

      const { data: inserted, error } = await withTimeout(
        supabase
          .from("dynamic_options")
          .insert([{ category, label: value, value, is_active: true }])
          .select("label, value")
          .single(),
        20000,
        `ایجاد گزینه پویا (${category})`
      );

      if (error) {
        if (!isProbablyDuplicateInsertError(error)) throw error;
        const { data: existingRow, error: lookupError } = await withTimeout(
          supabase
            .from("dynamic_options")
            .select("label, value")
            .eq("category", category)
            .eq("value", value)
            .maybeSingle(),
          20000,
          `بررسی گزینه پویا (${category})`
        );
        if (lookupError) throw lookupError;
        const resolvedValue = String(existingRow?.value || value).trim();
        if (!resolvedValue) return undefined;
        map.set(normalized, resolvedValue);
        if (existingRow?.label) map.set(normalizeKey(existingRow.label), resolvedValue);
        return resolvedValue;
      }

      const resolvedValue = String(inserted?.value || value).trim();
      if (!resolvedValue) return undefined;
      map.set(normalized, resolvedValue);
      if (inserted?.label) map.set(normalizeKey(inserted.label), resolvedValue);
      return resolvedValue;
    },
    []
  );

  const ensureRelationValue = useCallback(
    async (
      field: ImportFieldDescriptor,
      rawValue: string,
      relationLookups: RelationLookupMap
    ): Promise<string | undefined> => {
      const value = stripLegacyReferencePrefix(rawValue);
      if (!value) return undefined;
      if (field.key === "assignee_id" && /^(user|role)_[a-z0-9-]+$/i.test(value)) {
        return value;
      }

      const lookupKey = `${field.scope}:${field.key}`;
      const map = relationLookups[lookupKey] || new Map<string, string>();
      relationLookups[lookupKey] = map;

      const exact = map.get(encodeForLookup(value));
      if (exact) return exact;

      const targetModule = String(field.relationConfig?.targetModule || "").trim();
      if (!targetModule || !RELATION_AUTOCREATE_TARGET_MODULES.has(targetModule)) {
        return undefined;
      }

      const targetField = getPreferredRelationTargetField(targetModule, field.relationConfig?.targetField);
      const lookupFields = getRelationLookupFields(targetModule, targetField);
      const selectVariants = getRelationSelectVariants(targetModule, targetField);

      let existingRow: Record<string, unknown> | undefined;
      for (const lookupField of lookupFields) {
        for (const selectExpr of selectVariants) {
          try {
            const existingResult = (await withTimeout(
              supabase
                .from(targetModule)
                .select(selectExpr)
                .eq(lookupField, value)
                .limit(1),
              20000,
              `جستجوی رابطه (${field.labels.fa})`
            )) as unknown as QueryResult<Record<string, unknown>[]>;
            if (existingResult.error) throw existingResult.error;
            existingRow = existingResult.data?.[0];
            if (existingRow?.id) break;
          } catch (error) {
            if (!isMissingColumnError(error)) throw error;
          }
        }
        if (existingRow?.id) break;
      }

      if (existingRow?.id) {
        const existingId = String(existingRow.id);
        map.set(encodeForLookup(value), existingId);
        getRelationLookupCandidates(targetModule, existingRow, targetField).forEach((candidate) =>
          map.set(encodeForLookup(candidate), existingId)
        );
        return existingId;
      }

      const payload = buildRelationAutoCreatePayload(targetModule, value);
      if (!payload) return undefined;

      let inserted: Record<string, unknown> | null = null;
      let lastInsertError: unknown = null;
      for (const selectExpr of selectVariants) {
        try {
          const insertResult = (await withTimeout(
            supabase.from(targetModule).insert(payload).select(selectExpr).single(),
            20000,
            `ایجاد رابطه (${field.labels.fa})`
          )) as unknown as QueryResult<Record<string, unknown>>;
          if (insertResult.error) throw insertResult.error;
          inserted = insertResult.data;
          if (inserted?.id) break;
        } catch (error) {
          lastInsertError = error;
          if (!isMissingColumnError(error)) break;
        }
      }
      if (!inserted?.id) {
        if (isIntegerOutOfRangeError(lastInsertError)) {
          throw new Error(
            `برای فیلد «${field.labels.fa}» مقدار «${value}» به عنوان رکورد مرتبط قابل ایجاد نیست. این مقدار شبیه کد/عدد خام است، نه عنوان رکورد رابطه.`
          );
        }
        if (lastInsertError) throw lastInsertError;
        return undefined;
      }

      const insertedId = String(inserted?.id || "").trim();
      if (!insertedId) return undefined;
      map.set(encodeForLookup(value), insertedId);
      getRelationLookupCandidates(targetModule, inserted, targetField).forEach((candidate) =>
        map.set(encodeForLookup(candidate), insertedId)
      );
      return insertedId;
    },
    []
  );

  const convertValueByType = useCallback(
    (
      field: ImportFieldDescriptor,
      rawValue: string,
      importContext: ImportRuntimeContext
    ): Promise<unknown> => {
      const value = String(rawValue ?? "").trim();
      if (!value) return Promise.resolve(undefined);

      if ((field.type === FieldType.SELECT || field.type === FieldType.STATUS) && field.options?.length) {
        const byValue = field.options.find((option) => normalizeKey(option.value) === normalizeKey(value));
        if (byValue) return Promise.resolve(byValue.value);
        const byLabel = field.options.find((option) => normalizeKey(option.label) === normalizeKey(value));
        if (byLabel) return Promise.resolve(byLabel.value);
        if (field.type === FieldType.STATUS) {
          const legacyStatus = mapLegacyInvoiceStatus(value);
          if (legacyStatus) return Promise.resolve(legacyStatus);
        }
      }

      if (field.type === FieldType.RELATION || field.type === FieldType.USER) {
        return ensureRelationValue(field, value, importContext.relationLookups);
      }

      if (field.dynamicOptionsCategory && DYNAMIC_OPTION_IMPORT_TYPES.has(field.type)) {
        if (field.type === FieldType.MULTI_SELECT || field.type === FieldType.CHECKLIST) {
          return Promise.all(
            splitByDelimiters(value).map((item) =>
              ensureDynamicOptionValue(field.dynamicOptionsCategory!, item, importContext.dynamicOptionLookups)
            )
          ).then((items) => items.filter((item): item is string => Boolean(item)));
        }
        return ensureDynamicOptionValue(field.dynamicOptionsCategory, value, importContext.dynamicOptionLookups);
      }

      switch (field.type) {
        case FieldType.NUMBER:
        case FieldType.PRICE:
        case FieldType.STOCK:
        case FieldType.PERCENTAGE_OR_AMOUNT:
        case FieldType.PERCENTAGE: {
          const numberVal = parseNumber(value);
          return Promise.resolve(numberVal ?? undefined);
        }
        case FieldType.CHECKBOX: {
          const boolVal = parseBoolean(value);
          return Promise.resolve(boolVal ?? undefined);
        }
        case FieldType.DATE: {
          return Promise.resolve(normalizeImportedDateValue(value, FieldType.DATE));
        }
        case FieldType.DATETIME: {
          return Promise.resolve(normalizeImportedDateValue(value, FieldType.DATETIME));
        }
        case FieldType.MULTI_SELECT:
        case FieldType.CHECKLIST:
        case FieldType.TAGS:
          return Promise.resolve(splitByDelimiters(value));
        case FieldType.PHONE:
          return Promise.resolve(normalizePhoneForStorage(value));
        default:
          return Promise.resolve(value);
      }
    },
    [ensureDynamicOptionValue, ensureRelationValue]
  );

  const loadRelationLookups = useCallback(async (): Promise<RelationLookupMap> => {
    const relationFields: ImportFieldDescriptor[] = [];
    const seen = new Set<string>();

    mappingRows.forEach((mapping) => {
      if (!mapping.targetFieldKey) return;
      const field =
        mapping.targetScope === "item"
          ? itemFieldByKey.get(mapping.targetFieldKey)
          : headerFieldByKey.get(mapping.targetFieldKey);
      if (!field) return;
      if (field.type !== FieldType.RELATION && field.type !== FieldType.USER) return;

      const lookupKey = `${field.scope}:${field.key}`;
      if (seen.has(lookupKey)) return;
      seen.add(lookupKey);
      relationFields.push(field);
    });

      const lookupMap: RelationLookupMap = {};
      for (const field of relationFields) {
        const lookupKey = `${field.scope}:${field.key}`;
        const map = new Map<string, string>();

      if (field.key === "assignee_id") {
        const { data: users } = await withTimeout(
          supabase.from("profiles").select("id, full_name, email"),
          20000,
          "دریافت مسئول‌ها برای تطبیق"
        );
        (users || []).forEach((item: { id: string; full_name: string | null; email?: string | null }) => {
          const encodedValue = `user_${item.id}`;
          map.set(encodeForLookup(item.id), encodedValue);
          if (item.full_name) map.set(encodeForLookup(item.full_name), encodedValue);
          if (item.email) map.set(encodeForLookup(item.email), encodedValue);
        });

        if (supportsAssigneeTypeField(moduleId)) {
          const { data: roles } = await withTimeout(
            supabase.from("org_roles").select("id, title"),
            20000,
            "دریافت نقش‌ها برای تطبیق"
          );
          (roles || []).forEach((item: { id: string; title?: string | null }) => {
            const encodedValue = `role_${item.id}`;
            map.set(encodeForLookup(item.id), encodedValue);
            if (item.title) map.set(encodeForLookup(item.title), encodedValue);
          });
        }

        lookupMap[lookupKey] = map;
        continue;
      }

      if (field.type === FieldType.USER) {
        const { data } = await withTimeout(
          supabase.from("profiles").select("id, full_name, email"),
          20000,
          "دریافت کاربران برای تطبیق"
        );
        (data || []).forEach((item: { id: string; full_name: string | null; email?: string | null }) => {
          map.set(encodeForLookup(item.id), item.id);
          if (item.full_name) map.set(encodeForLookup(item.full_name), item.id);
          if (item.email) map.set(encodeForLookup(item.email), item.id);
        });
        lookupMap[lookupKey] = map;
        continue;
      }

      if (!field.relationConfig?.targetModule) {
        lookupMap[lookupKey] = map;
        continue;
      }

      const targetModule = field.relationConfig.targetModule;
      const targetField = getPreferredRelationTargetField(targetModule, field.relationConfig.targetField);
      const selectVariants = getRelationSelectVariants(targetModule, targetField);

      let data: any[] | null = null;
      for (const selectExpr of selectVariants) {
        try {
            const result = await withTimeout(
              supabase
                .from(targetModule)
                .select(selectExpr)
                .limit(5000),
              20000,
              `دریافت داده مرجع (${field.labels.fa})`
            );
          data = (result.data || []) as any[];
          break;
        } catch (error) {
          if (!isMissingColumnError(error)) throw error;
        }
      }

      const rows = ((data || []) as unknown) as Record<string, unknown>[];
      rows.forEach((item) => {
        const id = String(item.id ?? "");
        if (!id) return;
        map.set(encodeForLookup(id), id);

        getRelationLookupCandidates(targetModule, item, targetField).forEach((candidate) =>
          map.set(encodeForLookup(candidate), id)
        );
      });

      lookupMap[lookupKey] = map;
    }

    return lookupMap;
  }, [headerFieldByKey, itemFieldByKey, mappingRows, moduleId]);

  const loadDynamicOptionLookups = useCallback(async (): Promise<DynamicOptionLookupMap> => {
    const categories = new Set<string>();

    mappingRows.forEach((mapping) => {
      if (!mapping.targetFieldKey) return;
      const field =
        mapping.targetScope === "item"
          ? itemFieldByKey.get(mapping.targetFieldKey)
          : headerFieldByKey.get(mapping.targetFieldKey);
      if (!field) return;
      if (!field.dynamicOptionsCategory) return;
      if (!DYNAMIC_OPTION_IMPORT_TYPES.has(field.type)) return;
      categories.add(field.dynamicOptionsCategory);
    });

    const lookupMap: DynamicOptionLookupMap = {};
    for (const category of categories) {
      const { data, error } = await withTimeout(
        supabase
          .from("dynamic_options")
          .select("label, value")
          .eq("category", category)
          .eq("is_active", true)
          .limit(5000),
        20000,
        `دریافت گزینه‌های پویا (${category})`
      );
      if (error) throw error;

      const map = new Map<string, string>();
      (data || []).forEach((item: { label?: string | null; value?: string | null }) => {
        const resolvedValue = String(item.value || "").trim();
        if (!resolvedValue) return;
        map.set(normalizeKey(resolvedValue), resolvedValue);
        if (item.label) map.set(normalizeKey(item.label), resolvedValue);
      });
      lookupMap[category] = map;
    }

    return lookupMap;
  }, [headerFieldByKey, itemFieldByKey, mappingRows]);

  const loadImportRuntimeContext = useCallback(async (): Promise<ImportRuntimeContext> => {
    const [relationLookups, dynamicOptionLookups] = await Promise.all([
      loadRelationLookups(),
      loadDynamicOptionLookups(),
    ]);
    return {
      relationLookups,
      dynamicOptionLookups,
    };
  }, [loadDynamicOptionLookups, loadRelationLookups]);

  const buildPayloadFromMappings = useCallback(
    async (
      row: Record<string, string>,
      mappings: MappingRow[],
      fieldByKey: Map<string, ImportFieldDescriptor>,
      availableFields: ImportFieldDescriptor[],
      importContext: ImportRuntimeContext
    ): Promise<Record<string, unknown>> => {
      const payload: Record<string, unknown> = {};

      for (const mapping of mappings) {
        if (!mapping.targetFieldKey) continue;
        const field = fieldByKey.get(mapping.targetFieldKey);
        if (!field) continue;

        const rawValue = row[mapping.sourceColumn] ?? "";
        const converted = await convertValueByType(field, rawValue, importContext);
        if (!isValueEmpty(converted)) {
          payload[field.key] = converted;
          continue;
        }

        if (mapping.defaultValue.trim() !== "") {
          const defaultConverted = await convertValueByType(field, mapping.defaultValue, importContext);
          if (!isValueEmpty(defaultConverted)) payload[field.key] = defaultConverted;
        }
      }

      availableFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(payload, field.key)) return;
        if (field.defaultValue === undefined || field.defaultValue === null) return;
        payload[field.key] = field.defaultValue;
      });

      return payload;
    },
    [convertValueByType]
  );

  const finalizeImportedPayload = useCallback(
    (rawPayload: Record<string, unknown>): Record<string, unknown> => {
      const payload = { ...rawPayload };
      const rawAssignee = String(payload.assignee_id || "").trim();
      const assigneeMatch = rawAssignee.match(/^(user|role)_(.+)$/);
      if (assigneeMatch) {
        const assigneeType = assigneeMatch[1];
        const assigneeId = assigneeMatch[2];
        if (assigneeType === "role" && supportsGlobalRoleAssignee(moduleId)) {
          payload.assignee_id = null;
          payload.assignee_role_id = assigneeId;
        } else {
          payload.assignee_id = assigneeId;
          if ("assignee_role_id" in payload) payload.assignee_role_id = null;
        }
        if (supportsAssigneeTypeField(moduleId)) {
          payload.assignee_type = assigneeType;
        }
      } else if (payload.assignee_id && supportsAssigneeTypeField(moduleId) && !payload.assignee_type) {
        payload.assignee_type = "user";
        if ("assignee_role_id" in payload) payload.assignee_role_id = null;
      }

      if (moduleId === "customers") {
        const nextFullName = buildAutoCustomerName(payload);
        if (nextFullName) {
          payload.full_name = nextFullName;
        }
      }

      return payload;
    },
    [moduleId]
  );

  const validateBeforeImport = useCallback((): boolean => {
    if (!selectedFile) {
      message.error("فایل را انتخاب کنید.");
      return false;
    }
    if (!parsedSheet.rows.length) {
      message.error("در فایل داده‌ای برای وارد کردن پیدا نشد.");
      return false;
    }
    if (importMode === "grouped_invoice") {
      if (!groupingColumn) {
        message.error("ستون گروه‌بندی فاکتور را انتخاب کنید.");
        return false;
      }
      if (groupedData.missingGroupSourceLines.length > 0) {
        message.error(`بعضی ردیف‌ها ستون گروه‌بندی ندارند. نمونه: ${groupedData.missingGroupSourceLines.slice(0, 3).join("، ")}`);
        return false;
      }
      if (!groupedData.records.length) {
        message.error("هیچ گروه فاکتوری برای واردسازی ساخته نشد.");
        return false;
      }
      if (mappedItemFieldKeys.length === 0) {
        message.error("حداقل یک ستون را به اقلام فاکتور وصل کنید.");
        return false;
      }
    }
    if ((duplicateStrategy === "overwrite" || duplicateStrategy === "merge") && !duplicateFields.length) {
      message.error("برای بازنویسی یا ادغام، حداقل یک فیلد تطبیق انتخاب کنید.");
      return false;
    }
    if (missingRequiredFields.length > 0) {
      message.error(
        `این فیلدهای اجباری هنوز تطبیق داده نشده‌اند: ${missingRequiredFields
          .map((field) => field.labels.fa)
          .join("، ")}`
      );
      return false;
    }
    return true;
  }, [
    duplicateFields.length,
    duplicateStrategy,
    groupedData.missingGroupSourceLines,
    groupedData.records.length,
    groupingColumn,
    importMode,
    mappedItemFieldKeys.length,
    message,
    missingRequiredFields,
    parsedSheet.rows.length,
    selectedFile,
  ]);

  const findExistingRecord = useCallback(
    async (payload: Record<string, unknown>, label: string) => {
      if (!duplicateFields.length) return null;

      const duplicateFilter = duplicateFields.reduce<Record<string, unknown>>((acc, fieldKey) => {
        const value = payload[fieldKey];
        if (!isValueEmpty(value)) acc[fieldKey] = value;
        return acc;
      }, {});

      if (Object.keys(duplicateFilter).length !== duplicateFields.length) return null;

      let query = supabase.from(moduleConfig.table).select("*").limit(1);
      Object.entries(duplicateFilter).forEach(([key, value]) => {
        query = query.eq(key, value as never);
      });
      const { data } = await withTimeout(Promise.resolve(query), 20000, label);
      return data && data[0] ? (data[0] as Record<string, unknown>) : null;
    },
    [duplicateFields, moduleConfig.table]
  );

  const handleImport = useCallback(async () => {
    if (!validateBeforeImport()) return;
    setIsImporting(true);
    setImportProgress({
      current: 0,
      total: importMode === "grouped_invoice" ? groupedData.records.length : parsedSheet.rows.length,
    });
    try {
      const importContext = await withTimeout(
        loadImportRuntimeContext(),
        30000,
        "آماده‌سازی تطبیق روابط"
      );
      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      const errors: string[] = [];
      const touchedCustomerIds = new Set<string>();

      if (importMode === "grouped_invoice") {
        const headerMappings = mappingRows.filter((row) => row.targetScope === "header");
        const itemMappings = mappingRows.filter((row) => row.targetScope === "item");

        for (let idx = 0; idx < groupedData.records.length; idx += 1) {
          const record = groupedData.records[idx];
          const sourceLine = record.sourceLines[0];
          setImportProgress({ current: idx + 1, total: groupedData.records.length });

          try {
            const headerPayloadRaw = await buildPayloadFromMappings(
              record.firstRow,
              headerMappings,
              headerFieldByKey,
              headerImportableFields,
              importContext
            );
            const headerPayload = finalizeInvoiceHeaderPayload(headerPayloadRaw);
            const itemPayloads: Record<string, unknown>[] = [];
            for (const row of record.rows) {
              const itemPayload = finalizeInvoiceItemPayload(
                await buildPayloadFromMappings(row, itemMappings, itemFieldByKey, itemImportableFields, importContext)
              );
              if (Object.keys(itemPayload).length > 0) itemPayloads.push(itemPayload);
            }

            if (!itemPayloads.length) {
              failed += 1;
              errors.push(`فاکتور ${record.key} در ردیف ${sourceLine}: هیچ قلم معتبری برای ثبت پیدا نشد.`);
              continue;
            }

            const payload = finalizeImportedPayload({
              ...headerPayload,
              invoiceItems: itemPayloads,
            });

            const missingInRow = requiredFields.filter((field) => isValueEmpty(payload[field.key]));
            if (missingInRow.length > 0) {
              failed += 1;
              errors.push(`فاکتور ${record.key} در ردیف ${sourceLine}: مقدار فیلدهای اجباری کامل نیست.`);
              continue;
            }

            const existingRecord = await findExistingRecord(payload, `بررسی تکراری بودن فاکتور ${record.key}`);
            if (existingRecord) {
              if (duplicateStrategy === "skip") {
                skipped += 1;
                continue;
              }

              const updatePayload =
                duplicateStrategy === "merge"
                  ? Object.entries(payload).reduce<Record<string, unknown>>((acc, [key, value]) => {
                      if (!isValueEmpty(value)) acc[key] = value;
                      return acc;
                    }, {})
                  : payload;

              const { error } = await withTimeout(
                supabase
                  .from(moduleConfig.table)
                  .update(updatePayload)
                  .eq("id", existingRecord.id as string),
                20000,
                `بروزرسانی فاکتور ${record.key}`
              );
              if (error) throw error;
              updated += 1;
              if (moduleId === "invoices" && payload.customer_id) {
                touchedCustomerIds.add(String(payload.customer_id));
              }
              continue;
            }

            const { error } = await withTimeout(
              supabase.from(moduleConfig.table).insert(payload),
              20000,
              `ثبت فاکتور ${record.key}`
            );
            if (error) throw error;
            inserted += 1;
            if (moduleId === "invoices" && payload.customer_id) {
              touchedCustomerIds.add(String(payload.customer_id));
            }
          } catch (rowError) {
            failed += 1;
            errors.push(
              `فاکتور ${record.key} در ردیف ${sourceLine}: ${toFaErrorMessage(rowError as any, "خطای نامشخص")}`
            );
          }
        }
      } else {
        const headerMappings = mappingRows.filter((row) => row.targetScope === "header");

        for (let idx = 0; idx < parsedSheet.rows.length; idx += 1) {
          const row = parsedSheet.rows[idx];
          const sourceLine = hasHeader ? idx + 2 : idx + 1;
          setImportProgress({ current: idx + 1, total: parsedSheet.rows.length });

          if (!buildRowHasAnyValue(row)) continue;

          try {
            const payloadRaw = await buildPayloadFromMappings(
              row,
              headerMappings,
              headerFieldByKey,
              headerImportableFields,
              importContext
            );
            const payloadPrepared =
              moduleId === "tasks"
                ? attachTaskCompletionIfNeeded(payloadRaw as Record<string, unknown>)
                : payloadRaw;
            const payload = finalizeImportedPayload(payloadPrepared as Record<string, unknown>);

            const missingInRow = requiredFields.filter((field) => isValueEmpty(payload[field.key]));
            if (missingInRow.length > 0) {
              failed += 1;
              errors.push(`ردیف ${sourceLine}: مقدار فیلدهای اجباری کامل نیست.`);
              continue;
            }

            const existingRecord = await findExistingRecord(payload, `بررسی تکراری بودن ردیف ${sourceLine}`);

            if (existingRecord) {
              if (duplicateStrategy === "skip") {
                skipped += 1;
                continue;
              }
              const updatePayload =
                duplicateStrategy === "merge"
                  ? Object.entries(payload).reduce<Record<string, unknown>>((acc, [key, value]) => {
                      if (!isValueEmpty(value)) acc[key] = value;
                      return acc;
                    }, {})
                  : payload;

              const { error } = await withTimeout(
                supabase
                  .from(moduleConfig.table)
                  .update(updatePayload)
                  .eq("id", existingRecord.id as string),
                20000,
                `بروزرسانی ردیف ${sourceLine}`
              );
              if (error) throw error;
              updated += 1;
              if (moduleId === "invoices" && payload.customer_id) {
                touchedCustomerIds.add(String(payload.customer_id));
              }
              continue;
            }

            const { error } = await withTimeout(
              supabase.from(moduleConfig.table).insert(payload),
              20000,
              `ثبت ردیف ${sourceLine}`
            );
            if (error) throw error;
            inserted += 1;
            if (moduleId === "invoices" && payload.customer_id) {
              touchedCustomerIds.add(String(payload.customer_id));
            }
          } catch (rowError) {
            failed += 1;
            errors.push(
              `ردیف ${sourceLine}: ${toFaErrorMessage(rowError as any, "خطای نامشخص")}`
            );
          }
        }
      }

      if (moduleId === "invoices" && autoSyncCustomerStats && touchedCustomerIds.size > 0) {
        await syncCustomerLevelsByInvoiceCustomers({
          supabase: supabase as any,
          customerIds: Array.from(touchedCustomerIds),
        });
      }

      const baseMessage = `واردسازی انجام شد. جدید: ${inserted} | بروزرسانی: ${updated} | تکراری/ثبت‌نشده: ${skipped} | خطا: ${failed}`;
      if (failed > 0) {
        message.warning(baseMessage);
        if (errors.length > 0) {
          message.error(errors.slice(0, 3).join(" | "));
        }
      } else {
        message.success(baseMessage);
      }

      onImported?.();
      onClose();
    } catch (error) {
      message.error(toFaErrorMessage(error as any, "واردسازی انجام نشد"));
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  }, [
    autoSyncCustomerStats,
    buildPayloadFromMappings,
    duplicateFields,
    duplicateStrategy,
    finalizeImportedPayload,
    findExistingRecord,
    groupedData.records,
    hasHeader,
    headerFieldByKey,
    headerImportableFields,
    importMode,
    itemFieldByKey,
    itemImportableFields,
    loadImportRuntimeContext,
    mappingRows,
    message,
    moduleConfig.table,
    moduleId,
    onClose,
    onImported,
    parsedSheet.rows,
    requiredFields,
    setImportProgress,
    validateBeforeImport,
  ]);

  const handleNext = useCallback(async () => {
    if (step === 0) {
      if (!selectedFile) {
        message.error("ابتدا فایل را انتخاب کنید.");
        return;
      }
      if (!parsedSheet.rows.length) {
        message.error("داده قابل واردسازی در فایل پیدا نشد.");
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if ((duplicateStrategy === "overwrite" || duplicateStrategy === "merge") && !duplicateFields.length) {
        message.error("برای این روش، فیلد تطبیق را انتخاب کنید.");
        return;
      }
      setStep(2);
      return;
    }
    await handleImport();
  }, [
    duplicateFields.length,
    duplicateStrategy,
    handleImport,
    message,
    parsedSheet.rows.length,
    selectedFile,
    step,
  ]);

  const stepContent = useMemo(() => {
    if (step === 0) {
      return (
        <div className="space-y-3">
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 p-3">
            <Upload.Dragger
              multiple={false}
              showUploadList={false}
              accept=".xlsx,.xls,.csv"
              fileList={[]}
              beforeUpload={(file) => {
                void handleSelectFile(file);
                return false;
              }}
              className="!bg-transparent"
            >
              <div className="py-4 text-center">
                <InboxOutlined className="text-3xl text-gray-400" />
                <div className="mt-3 text-lg font-bold text-gray-600">
                  فایل خود را به این قسمت کشیده و رها کنید
                </div>
                <div className="text-gray-400 mt-1">یا</div>
                <Button
                  type="default"
                  icon={<UploadOutlined />}
                  className="mt-2 rounded-xl bg-leather-600 !text-white hover:!bg-leather-500 border-leather-600 !h-9 px-5"
                >
                  یک فایل انتخاب کنید
                </Button>
              </div>
            </Upload.Dragger>
          </div>

          {fileList.length > 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileOutlined className="text-gray-500" />
                <span className="font-medium text-gray-600 truncate text-sm">{fileList[0].name}</span>
              </div>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={handleRemoveFile}
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 px-3 py-2">
              <Checkbox checked={hasHeader} onChange={(event) => setHasHeader(event.target.checked)}>
                هدر دارد
              </Checkbox>
            </div>
            <div className="rounded-xl border border-gray-200 px-3 py-2">
              <div className="text-xs text-gray-500 mb-0.5">
                نحوه کدگذاری کاراکترها <span className="text-red-500">*</span>
              </div>
            <Select
              {...wizardSelectProps}
              value={encoding}
              onChange={(val) => setEncoding(val)}
              className="w-full"
                options={[
                  { label: "UTF-8", value: "utf-8" },
                  { label: "Windows-1256", value: "windows-1256" },
                ]}
              />
            </div>
          </div>

          {supportsGroupedInvoiceImport && (
            <div className="rounded-xl border border-gray-200 px-3 py-2 space-y-2">
              <div className="text-sm text-gray-500">حالت ورود اطلاعات</div>
               <Select
                {...wizardSelectProps}
                 value={importMode}
                 onChange={(value) => setImportMode(value)}
                 className="w-full"
                options={[
                  { label: "ردیف‌های مستقل", value: "simple" },
                  { label: "فاکتور گروه‌بندی‌شده", value: "grouped_invoice" },
                ]}
              />
            </div>
          )}

          {supportsGroupedInvoiceImport && importMode === "grouped_invoice" && parsedSheet.headers.length > 0 && (
            <div className="rounded-xl border border-gray-200 px-3 py-2 space-y-2">
              <div className="text-sm text-gray-500">
                ستون تشخیص فاکتور <span className="text-red-500">*</span>
              </div>
              <Select
                {...wizardSelectProps}
                value={groupingColumn || undefined}
                onChange={(value) => setGroupingColumn(value)}
                className="w-full"
                options={parsedSheet.headers.map((header) => ({ label: header, value: header }))}
              />
              {groupingColumn && (
                <div className="text-xs text-gray-500">
                  تعداد فاکتورهای تشخیص‌داده‌شده: {groupedData.records.length.toLocaleString("fa-IR")}
                  {groupedData.missingGroupSourceLines.length > 0 && (
                    <span className="text-red-500">
                      {" "}
                      | ردیف‌های بدون کلید: {groupedData.missingGroupSourceLines.length.toLocaleString("fa-IR")}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {isParsing && (
            <div className="flex items-center gap-2 text-gray-500">
              <Spin size="small" />
              <span>در حال خواندن فایل...</span>
            </div>
          )}
        </div>
      );
    }

    if (step === 1) {
      return (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 px-3 py-2">
            <div className="text-sm text-gray-500 mb-1">
              نحوه رسیدگی به اطلاعات تکراری <span className="text-red-500">*</span>
            </div>
            <Select
              {...wizardSelectProps}
              value={duplicateStrategy}
              onChange={(val) => setDuplicateStrategy(val)}
              options={DUPLICATE_OPTIONS.map((item) => ({ label: item.label, value: item.value }))}
              className="w-full"
            />
          </div>

          <div className="rounded-xl border border-gray-200 px-3 py-2">
            <div className="text-sm text-gray-500 mb-2">
              فیلدهای مطابق برای پیدا کردن رکوردهای تکراری <span className="text-red-500">*</span>
            </div>
            <div className="space-y-2">
              <Input
                value={duplicateFieldSearch}
                onChange={(event) => setDuplicateFieldSearch(event.target.value)}
                placeholder="جستجوی فیلد..."
                allowClear
              />
              <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                {filteredDuplicateFieldOptions.length > 0 ? (
                  <Checkbox.Group
                    value={duplicateFields}
                    onChange={(values) => setDuplicateFields((values || []).map((value) => String(value)))}
                    className="w-full"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {filteredDuplicateFieldOptions.map((option) => (
                        <Checkbox key={option.value} value={option.value} className="!ml-0">
                          {option.label}
                        </Checkbox>
                      ))}
                    </div>
                  </Checkbox.Group>
                ) : (
                  <div className="py-4 text-xs text-gray-400 text-center">فیلدی پیدا نشد.</div>
                )}
              </div>
            </div>
          </div>

          {moduleId === "invoices" && (
            <div className="rounded-xl border border-gray-200 px-3 py-2">
              <Checkbox
                checked={autoSyncCustomerStats}
                onChange={(event) => setAutoSyncCustomerStats(event.target.checked)}
              >
                بعد از ایمپورت، آمار خرید مشتری‌ها مثل تاریخ اولین خرید، تاریخ آخرین خرید و تعداد فاکتورها
                به صورت خودکار محاسبه و بروزرسانی شود
              </Checkbox>
            </div>
          )}
        </div>
      );
    }

    if (!mappingRows.length) {
      return <Empty description="ستونی برای تطبیق پیدا نشد." />;
    }

    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 flex items-center justify-between gap-3">
          <div className="text-gray-600">
            فیلدهای زیر اجباری هستند و ضروری است ستون های مرتبط به آن ها مشخص شود.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {requiredFields.map((field) => (
              <Tag
                key={field.key}
                color={mappedRequiredFieldKeys.includes(field.key) ? "blue" : "red"}
                className="!m-0 text-sm px-3 py-1 rounded-lg"
              >
                {field.labels.fa}
              </Tag>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 px-3 py-2 flex items-center justify-between gap-3">
          <div className="text-gray-700">ذخیره به عنوان معادل یابی سفارشی</div>
          <Checkbox checked={saveCustomMapping} onChange={(event) => setSaveCustomMapping(event.target.checked)} />
        </div>

        {importMode === "grouped_invoice" && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            این حالت، ستون‌های فایل را به دو بخش تقسیم می‌کند: «سربرگ فاکتور» و «اقلام فاکتور».
            تعداد فاکتورهای آماده واردسازی: {groupedData.records.length.toLocaleString("fa-IR")}
          </div>
        )}

        <Table<MappingRow>
          rowKey="sourceColumn"
          pagination={false}
          dataSource={mappingRows}
          size="middle"
          scroll={{ y: 300 }}
          columns={mappingTableColumns}
        />
      </div>
    );
  }, [
    autoSyncCustomerStats,
    duplicateFields,
    duplicateFieldSearch,
    duplicateStrategy,
    fileList,
    groupedData.missingGroupSourceLines.length,
    groupedData.records.length,
    groupingColumn,
    handleRemoveFile,
    handleSelectFile,
    headerImportableFields,
    hasHeader,
    importMode,
    itemImportableFields,
    isParsing,
    mappedHeaderFieldKeys,
    mappedItemFieldKeys,
    mappedRequiredFieldKeys,
    mappingTableColumns,
    mappingRows,
    moduleId,
    requiredFields,
    saveCustomMapping,
    step,
    supportsGroupedInvoiceImport,
    filteredDuplicateFieldOptions,
    encoding,
  ]);

  const connectorClass = (leftStepIndex: number, rightStepIndex: number): string => {
    const threshold = Math.max(leftStepIndex, rightStepIndex);
    return step >= threshold ? "bg-leather-600" : "bg-gray-200";
  };
  const contentWrapperClass =
    step === 2
      ? "pt-3 flex-1 min-h-0 overflow-y-auto custom-scrollbar"
      : "pt-3";

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="min(1040px, calc(100vw - 16px))"
      style={{ top: 8 }}
      destroyOnHidden
      closeIcon={<CloseOutlined className="text-base" />}
      title={<span className="text-xl font-black">ورود اطلاعات از فایل</span>}
      className="excel-import-wizard"
      styles={{
        body: {
          maxHeight: "calc(100vh - 34px)",
          padding: "10px 14px 14px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="border-b border-gray-200 pb-3">
          <div className="flex items-center gap-2 px-1 md:px-6" dir="ltr">
            {RENDER_STEPS.map((current, index) => {
              const status = step === current.index ? "active" : step > current.index ? "done" : "idle";
              const circleClass =
                status === "active" || status === "done"
                  ? "bg-leather-600 text-white"
                  : "bg-gray-100 text-gray-400";
              const labelClass =
                status === "active" || status === "done"
                  ? "text-leather-700"
                  : "text-gray-400";

              return (
                <React.Fragment key={current.index}>
                  <div className="flex flex-col items-center min-w-[74px]">
                    <div
                      className={`h-10 w-10 rounded-xl text-sm font-black flex items-center justify-center ${circleClass}`}
                    >
                      {(current.index + 1).toLocaleString("fa-IR")}
                    </div>
                    <div className={`mt-1.5 text-sm font-bold ${labelClass}`}>{current.title}</div>
                  </div>
                  {index < RENDER_STEPS.length - 1 && (
                    <div
                      className={`h-[3px] flex-1 rounded-full ${connectorClass(
                        current.index,
                        RENDER_STEPS[index + 1].index
                      )}`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className={contentWrapperClass}>{stepContent}</div>
      </div>

      <div className="border-t border-gray-200 pt-3 mt-3 flex items-center justify-center gap-2.5">
        {step > 0 && (
          <Button
            onClick={() => setStep((prev) => Math.max(0, prev - 1))}
            disabled={isImporting}
            className="!h-10 px-6 text-sm rounded-xl border-2 border-gray-400 text-gray-700 bg-white"
          >
            قبلی
          </Button>
        )}
        <Button
          type="primary"
          loading={isImporting}
          disabled={isParsing}
          onClick={() => {
            void handleNext();
          }}
          className="!h-10 px-6 text-sm rounded-xl bg-leather-600 hover:!bg-leather-500"
        >
          {step === 2 ? "وارد کردن اطلاعات" : "بعدی"}
        </Button>
      </div>
      {isImporting && importProgress && (
        <div className="mt-2 text-xs text-gray-500 text-center">
          در حال واردسازی ردیف {importProgress.current.toLocaleString("fa-IR")} از{" "}
          {importProgress.total.toLocaleString("fa-IR")}
        </div>
      )}
    </Modal>
  );
};

export default ExcelImportWizard;
