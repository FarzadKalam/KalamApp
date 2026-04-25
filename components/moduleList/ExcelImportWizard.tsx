
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
  PlusOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import gregorian from "react-date-object/calendars/gregorian";
import gregorian_en from "react-date-object/locales/gregorian_en";
import { FieldNature, FieldType, LogicOperator, ModuleDefinition, ModuleField, RowCalculationType } from "../../types";
import { supabase } from "../../supabaseClient";
import { attachTaskCompletionIfNeeded } from "../../utils/taskCompletion";
import { normalizeIranMobile, normalizePhoneDigits, normalizePhoneForStorage } from "../../utils/phoneNumber";
import { toGregorianDateString } from "../../utils/persianNumberFormatter";
import { syncCustomerLevelsByInvoiceCustomers } from "../../utils/customerLeveling";
import { getAssigneeLabel } from "../../utils/assigneeLabel";
import { supportsGlobalAssignee, supportsGlobalAssigneeType, supportsGlobalRoleAssignee } from "../../utils/assigneeSupport";
import { buildClientFallbackSystemCode, supportsSystemCode } from "../../utils/systemCode";
import { getPreferredRelationTargetField, getRelationLabelFallbackFields } from "../../utils/relationTargetField";
import { toFaErrorMessage } from "../../utils/errorMessageFa";
import DynamicSelectField from "../DynamicSelectField";
import PersianDatePicker from "../PersianDatePicker";
import { fetchAssigneeDirectory, fetchDynamicOptionsByCategory } from "../../utils/referenceData";
import { fetchRelationOptionsForField } from "../../utils/relationOptions";
import { MODULES } from "../../moduleRegistry";
import { normalizeAutoNameEnabled } from "../../utils/autoName";
import { calculateRow } from "../../utils/calculations";
import { resolveConfiguredDefaultValue } from "../../utils/defaultValues";

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

type RelatedModuleLinkConfig = {
  id: string;
  sourceColumn: string;
  targetModuleId: string;
  relationFieldKey: string | null;
  matchFieldKey: string;
};

type ParsedRelatedTargetKey = {
  linkId: string;
  fieldKey: string;
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
  logic?: ModuleField["logic"];
  scope: MappingTargetScope;
};

type ImportFeedback = {
  level: "success" | "warning" | "error";
  summary: string;
  details: string[];
};

class ImportInsertError extends Error {
  originalError: unknown;
  retryError?: unknown;
  retrySystemCode?: string;

  constructor(message: string, originalError: unknown, retryError?: unknown, retrySystemCode?: string) {
    super(message);
    this.name = "ImportInsertError";
    this.originalError = originalError;
    this.retryError = retryError;
    this.retrySystemCode = retrySystemCode;
  }
}

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
const ATTENDANCE_IMPORTABLE_READONLY_FIELD_KEYS = new Set([
  "created_at",
  "updated_at",
]);
const DUPLICATE_FIELD_CANDIDATES_BY_MODULE: Record<string, string[]> = {
  attendance_logs: ["employee_id", "attendance_date", "log_type", "check_in_time", "check_out_time"],
  customers: ["legacy_contact_code", "mobile_1", "national_code", "national_id", "accounting_code", "email", "phone", "full_name"],
  suppliers: ["system_code", "accounting_code", "mobile_1", "email", "business_name"],
  invoices: ["legacy_invoice_number", "system_code", "name"],
  purchase_invoices: ["legacy_invoice_number", "system_code", "name"],
  tasks: ["system_code", "name"],
};
const GENERIC_DUPLICATE_FIELD_CANDIDATES = [
  "system_code",
  "legacy_contact_code",
  "legacy_invoice_number",
  "accounting_code",
  "email",
  "mobile_1",
  "phone",
  "national_code",
  "national_id",
  "full_name",
  "business_name",
  "name",
];
const NON_PERSISTED_IMPORT_FIELD_KEYS: Record<string, Set<string>> = {
  customers: new Set(["auto_name_enabled"]),
};
const DYNAMIC_OPTION_IMPORT_TYPES = new Set<FieldType>([
  FieldType.SELECT,
  FieldType.MULTI_SELECT,
  FieldType.CHECKLIST,
]);
const RELATED_LINK_MATCHABLE_TYPES = new Set<FieldType>([
  FieldType.TEXT,
  FieldType.LONG_TEXT,
  FieldType.SUPER_LONG_TEXT,
  FieldType.NUMBER,
  FieldType.PHONE,
  FieldType.SELECT,
  FieldType.STATUS,
  FieldType.DATE,
  FieldType.TIME,
  FieldType.DATETIME,
  FieldType.LINK,
]);
const RELATED_MODULE_IMPORTABLE_TYPES = new Set<FieldType>([
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
  FieldType.STATUS,
  FieldType.PHONE,
  FieldType.TAGS,
  FieldType.PERCENTAGE_OR_AMOUNT,
]);
const RELATION_AUTOCREATE_TARGET_MODULES = new Set(["customers", "suppliers", "employees"]);
const RELATED_TARGET_PREFIX = "related::";

const LEGACY_PREFIX_REGEX = /^(contacts|accounts|products)\s*::::\s*/i;

const toEnglishDigits = (value: string): string =>
  value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));

const normalizePersianChars = (value: string): string =>
  value
    .replace(/[‌‍‎‏‪-‮]/g, " ")
    .replace(/[ـ]+/g, "")
    .replace(/ك/g, "ک")
    .replace(/[يى]/g, "ی")
    .replace(/ۀ/g, "ه")
    .replace(/ة/g, "ه");

const normalizeText = (value: unknown): string =>
  normalizePersianChars(toEnglishDigits(String(value ?? "")))
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
  [normalizeKey("نوع تردد")]: "log_type",
  [normalizeKey("تاریخ")]: "attendance_date",
  [normalizeKey("ساعت ورود")]: "check_in_time",
  [normalizeKey("ساعت خروج")]: "check_out_time",
  [normalizeKey("مجموع حضور (دقیقه)")]: "presence_minutes",
  [normalizeKey("مجموع حضور (ساعت)")]: "presence_hours",
  [normalizeKey("تایید مدیر")]: "manager_approved",
  [normalizeKey("شماره تردد")]: "system_code",
  [normalizeKey("کارمند مرتبط")]: "related_employee_label",
  [normalizeKey("ورود مرتبط")]: "linked_check_in_label",
  [normalizeKey("جدول حقوق مرتبط")]: "payroll_reference_label",
  [normalizeKey("آخرین ویرایش انجام شده به وسیله")]: "updated_by_label",
  [normalizeKey("زمان ویرایش")]: "updated_at",
  [normalizeKey("ارجاع به")]: "reference_label",
  [normalizeKey("ایجاد کننده")]: "created_by_label",
  [normalizeKey("زمان ایجاد")]: "created_at",
  [normalizeKey("منبع")]: "source_type",
  [normalizeKey("وضعیت بسته")]: "closure_status",
};

const supportsAssigneeField = (moduleId: string): boolean => supportsGlobalAssignee(moduleId);
const supportsAssigneeTypeField = (moduleId: string): boolean => supportsGlobalAssigneeType(moduleId);
const isExplicitlyImportableReadonlyField = (moduleId: string, fieldKey: string): boolean =>
  (moduleId === "customers" && CUSTOMER_IMPORTABLE_READONLY_FIELD_KEYS.has(fieldKey))
  || (moduleId === "attendance_logs" && ATTENDANCE_IMPORTABLE_READONLY_FIELD_KEYS.has(fieldKey));
const isPersistableImportField = (moduleId: string, fieldKey: string): boolean =>
  !NON_PERSISTED_IMPORT_FIELD_KEYS[moduleId]?.has(fieldKey);

const buildAutoCustomerName = (values: Record<string, unknown>) => {
  const normalize = (value: unknown) => sanitizeImportedTextValue(value);
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

const buildAutoEmployeeName = (values: Record<string, unknown>) => {
  const normalize = (value: unknown) => sanitizeImportedTextValue(value);
  return [values?.prefix, values?.first_name, values?.last_name]
    .map((part) => normalize(part))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

const stripLegacyReferencePrefix = (value: unknown): string =>
  String(value ?? "").trim().replace(LEGACY_PREFIX_REGEX, "").trim();

const sanitizeImportedTextValue = (value: unknown): string =>
  stripLegacyReferencePrefix(value).replace(/\s+/g, " ").trim();

const resolveImportFieldDefaultValue = (field: Pick<ImportFieldDescriptor, "defaultValue">): unknown => {
  try {
    return resolveConfiguredDefaultValue(field.defaultValue);
  } catch {
    return undefined;
  }
};

const isLogicVisibleForPayload = (logicOrRule: ModuleField["logic"], payload: Record<string, unknown>): boolean => {
  if (!logicOrRule) return true;
  const rule = (logicOrRule as { visibleIf?: any })?.visibleIf || logicOrRule;
  if (!rule || !rule.field) return true;

  const fieldValue = payload?.[rule.field];
  if (fieldValue === undefined || fieldValue === null) {
    if (rule.operator === LogicOperator.NOT_EQUALS) return false;
  }

  switch (rule.operator) {
    case LogicOperator.EQUALS:
      return fieldValue === rule.value;
    case LogicOperator.NOT_EQUALS:
      return fieldValue !== rule.value;
    case LogicOperator.CONTAINS:
      return Array.isArray(fieldValue) ? fieldValue.includes(rule.value) : false;
    case LogicOperator.IS_TRUE:
      return fieldValue === true;
    case LogicOperator.IS_FALSE:
      return fieldValue === false;
    case LogicOperator.GREATER_THAN:
      return Number(fieldValue) > Number(rule.value);
    case LogicOperator.LESS_THAN:
      return Number(fieldValue) < Number(rule.value);
    default:
      return true;
  }
};

const isSystemicImportError = (error: unknown): boolean => {
  if (error instanceof ImportInsertError) {
    return isSystemicImportError(error.retryError || error.originalError);
  }
  const code = String((error as any)?.code || "").toUpperCase();
  const status = Number((error as any)?.status ?? (error as any)?.statusCode ?? 0);
  const message = String((error as any)?.message || (error as any)?.details || "").toLowerCase();
  if (code === "57014") return true;
  if (status >= 500) return true;
  if (isMissingColumnError(error)) return true;
  return (
    message.includes("statement timeout") ||
    message.includes("canceling statement due to statement timeout") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("internal server error") ||
    message.includes("timeout")
  );
};

const isStatementTimeoutError = (error: unknown): boolean => {
  if (error instanceof ImportInsertError) {
    return isStatementTimeoutError(error.retryError || error.originalError);
  }
  const code = String((error as any)?.code || "").toUpperCase();
  const message = String((error as any)?.message || (error as any)?.details || "").toLowerCase();
  return code === "57014" || message.includes("statement timeout") || message.includes("canceling statement due to statement timeout");
};

const getImportErrorParts = (error: unknown): string[] => {
  if (error instanceof ImportInsertError) {
    const parts = [`message=${error.message}`];
    const originalParts = getImportErrorParts(error.originalError);
    const retryParts = error.retryError ? getImportErrorParts(error.retryError) : [];
    if (error.retrySystemCode) parts.push(`retry_system_code=${error.retrySystemCode}`);
    if (originalParts.length > 0) parts.push(`first_attempt=(${originalParts.join(" | ")})`);
    if (retryParts.length > 0) parts.push(`retry_attempt=(${retryParts.join(" | ")})`);
    return parts;
  }
  const err = error as any;
  const parts = [
    err?.code ? `code=${String(err.code)}` : "",
    err?.status || err?.statusCode ? `status=${String(err.status || err.statusCode)}` : "",
    err?.message ? `message=${String(err.message)}` : "",
    err?.details ? `details=${String(err.details)}` : "",
    err?.hint ? `hint=${String(err.hint)}` : "",
  ].filter(Boolean);
  if (parts.length > 0) return parts;
  if (typeof error === "string" && error.trim()) return [error.trim()];
  return [];
};

const formatImportErrorMessage = (error: unknown, fallback = "خطای نامشخص"): string => {
  if (error instanceof ImportInsertError) {
    if (error.retryError) {
      return `ثبت رکورد در تلاش اول و تلاش مجدد با کد سیستمی ${error.retrySystemCode || ""} ناموفق بود. ${formatImportErrorMessage(error.retryError, fallback)}`.trim();
    }
    return formatImportErrorMessage(error.originalError, fallback);
  }
  const err = error as any;
  const rawMessage = String(err?.message || err?.error_description || "").trim();
  const code = String(err?.code || "").trim();
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  const normalized = rawMessage.toLowerCase();

  if (code === "57014" || normalized.includes("statement timeout")) {
    return "زمان اجرای عملیات در دیتابیس تمام شد. احتمالاً trigger یا تولید کد سیستمی سمت دیتابیس کند/قفل شده است.";
  }
  if (status >= 500 || normalized.includes("internal server error")) {
    return "خطای داخلی سرور هنگام ثبت رکورد. جزئیات دقیق‌تر را از Network/Server logs بررسی کنید.";
  }

  const translated = toFaErrorMessage(error as any, "");
  if (translated) return translated;
  const parts = getImportErrorParts(error);
  return parts.length > 0 ? parts.join(" | ") : fallback;
};

const getImportFieldDefaultValueForPayload = (
  field: ImportFieldDescriptor,
  payload: Record<string, unknown>
): unknown => {
  if (field.defaultValue === undefined) return undefined;
  if (!isLogicVisibleForPayload(field.logic, payload)) return undefined;
  const resolvedDefaultValue = resolveImportFieldDefaultValue(field);
  return isValueEmpty(resolvedDefaultValue) ? undefined : resolvedDefaultValue;
};

const buildRelatedTargetKey = (linkId: string, fieldKey: string): string =>
  `${RELATED_TARGET_PREFIX}${String(linkId || "").trim()}::${String(fieldKey || "").trim()}`;

const parseRelatedTargetKey = (value: unknown): ParsedRelatedTargetKey | null => {
  const raw = String(value || "").trim();
  if (!raw.startsWith(RELATED_TARGET_PREFIX)) return null;
  const payload = raw.slice(RELATED_TARGET_PREFIX.length);
  const [linkId, fieldKey] = payload.split("::");
  if (!linkId || !fieldKey) return null;
  return { linkId, fieldKey };
};

const createRelatedLinkId = (): string =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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
  [normalizeKey("پیش فرض فروش")]: { scope: "item", key: "is_default_sell_price" },
  [normalizeKey("پیش‌فرض فروش")]: { scope: "item", key: "is_default_sell_price" },
  [normalizeKey("قیمت خرید")]: { scope: "item", key: "buy_price" },
  [normalizeKey("درصد سود")]: { scope: "item", key: "profit_percentage" },
  [normalizeKey("قیمت خالص")]: { scope: "item", key: "total_price" },
  [normalizeKey("مالیات بر ارزش افزوده")]: { scope: "item", key: "vat" },
  [normalizeKey("میزان تخفیف آیتم")]: { scope: "item", key: "discount" },
  [normalizeKey("یادداشت آیتم")]: { scope: "item", key: "description" },
};

const splitByDelimiters = (value: string): string[] =>
  value
    .split(/[,،;|\n\r]+/g)
    .map((item) => sanitizeImportedTextValue(item))
    .filter(Boolean);

const splitDynamicOptionValues = (value: string): string[] => {
  const normalized = String(value || "")
    .replace(/\|\s*##\s*\|/g, "\n")
    .replace(/\s+-\s+/g, "\n");
  return Array.from(new Set(splitByDelimiters(normalized)));
};

const countDelimiterOutsideQuotes = (line: string, delimiter: string): number => {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }
  return count;
};

const detectCsvDelimiter = (text: string): string => {
  const sampleLines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  const candidates = [",", ";", "\t"];
  let bestDelimiter = ",";
  let bestScore = -1;

  candidates.forEach((delimiter) => {
    const counts = sampleLines.map((line) => countDelimiterOutsideQuotes(line, delimiter));
    const positiveCounts = counts.filter((count) => count > 0);
    if (!positiveCounts.length) return;
    const firstPositiveCount = positiveCounts[0];
    const consistency = positiveCounts.filter((count) => count === firstPositiveCount).length;
    const score = consistency * 100 + firstPositiveCount;
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  });

  return bestDelimiter;
};

const parseCsvText = (text: string): string[][] => {
  const delimiter = detectCsvDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  const pushRow = () => {
    const cells = [...row, current].map((item) => item.trim());
    if (cells.some((cell) => cell.trim() !== "")) {
      rows.push(cells);
    }
    row = [];
    current = "";
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      row.push(current);
      current = "";
      continue;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      pushRow();
      continue;
    }
    current += char;
  }

  if (row.length > 0 || current.trim() !== "") {
    pushRow();
  }

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

const tryConvertStructuredDateWithDateObject = (
  value: string,
  fieldType: FieldType.DATE | FieldType.DATETIME
): string | null => {
  const normalized = toEnglishDigits(String(value || "").trim())
    .replace(/\./g, "/")
    .replace(/T/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const match = normalized.match(
    /^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );
  if (!match) return null;

  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = Number(match[3]);
  const firstLen = String(match[1]).length;
  const thirdLen = String(match[3]).length;
  const hasTime = Boolean(match[4]);

  let year = 0;
  let month = 0;
  let day = 0;

  if (firstLen === 4) {
    year = first;
    month = second;
    day = third;
  } else if (thirdLen === 4) {
    year = third;
    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else {
      month = first;
      day = second;
    }
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const hh = String(match[4] || "00").padStart(2, "0");
  const mm = String(match[5] || "00").padStart(2, "0");
  const ss = String(match[6] || "00").padStart(2, "0");
  const dateText = `${String(year).padStart(4, "0")}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
  const dateTimeText = hasTime ? `${dateText} ${hh}:${mm}:${ss}` : dateText;
  const format = hasTime ? "YYYY/MM/DD HH:mm:ss" : "YYYY/MM/DD";
  const isJalaliYear = year >= 1300 && year <= 1599;

  try {
    const dateObject = new DateObject({
      date: dateTimeText,
      format,
      calendar: isJalaliYear ? persian : gregorian,
      locale: isJalaliYear ? persian_fa : gregorian_en,
    });
    if (!dateObject.isValid) return null;
    const gregorianDate = isJalaliYear ? dateObject.convert(gregorian, gregorian_en) : dateObject;
    if (fieldType === FieldType.DATE) {
      return gregorianDate.format("YYYY-MM-DD");
    }
    return gregorianDate.toDate().toISOString();
  } catch {
    return null;
  }
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
    const fallbackFormatted = tryConvertStructuredDateWithDateObject(candidate, fieldType);
    if (fallbackFormatted) return fallbackFormatted;
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

const PHONE_FIELD_KEY_REGEX = /(^|_)(mobile|phone)(_|$)/i;

const isPhoneFieldKey = (value: unknown): boolean => PHONE_FIELD_KEY_REGEX.test(String(value ?? "").trim());

const isLikelyPhoneValue = (value: unknown): boolean => {
  const raw = stripLegacyReferencePrefix(value);
  if (!raw) return false;
  const digits = normalizePhoneDigits(raw);
  if (!digits) return false;
  if (normalizeIranMobile(raw)) return true;
  return raw.startsWith("+") || raw.startsWith("00") || (digits.length >= 10 && digits.length <= 15);
};

const buildPhoneLookupVariants = (value: unknown): string[] => {
  const raw = stripLegacyReferencePrefix(value);
  if (!isLikelyPhoneValue(raw)) return [];

  const result = new Set<string>();
  const push = (item: unknown) => {
    const normalized = String(item ?? "").trim();
    if (normalized) result.add(normalized);
  };

  const digits = normalizePhoneDigits(raw);
  const normalizedStorage = normalizePhoneForStorage(raw);
  const normalizedIran = normalizeIranMobile(raw);

  push(raw);
  push(digits);
  push(normalizedStorage);
  if (normalizedStorage.startsWith("+")) {
    push(normalizedStorage.slice(1));
  }
  if (normalizedIran) {
    const national = normalizedIran.replace(/^\+98/, "");
    push(normalizedIran);
    push(national);
    push(`98${national}`);
    push(`0${national}`);
  }

  return Array.from(result);
};

const buildLookupKeys = (value: unknown): string[] => {
  const result = new Set<string>();
  const push = (item: unknown) => {
    const encoded = normalizeKey(item);
    if (encoded) result.add(encoded);
  };

  push(stripLegacyReferencePrefix(value));
  buildPhoneLookupVariants(value).forEach(push);
  return Array.from(result);
};

const setLookupValue = (map: Map<string, string>, source: unknown, resolvedValue: string) => {
  buildLookupKeys(source).forEach((key) => map.set(key, resolvedValue));
};

const getLookupValue = (map: Map<string, string>, source: unknown): string | undefined => {
  for (const key of buildLookupKeys(source)) {
    const matched = map.get(key);
    if (matched) return matched;
  }
  return undefined;
};

const buildFieldMatchValues = (fieldKey: string, value: unknown, fieldType?: FieldType): string[] => {
  const raw = stripLegacyReferencePrefix(value);
  if (!raw) return [];
  if (fieldType !== FieldType.PHONE && !isPhoneFieldKey(fieldKey)) {
    return [raw];
  }
  const variants = buildPhoneLookupVariants(raw);
  return variants.length > 0 ? variants : [raw];
};

const isProbablyDuplicateInsertError = (error: unknown): boolean => {
  const code = String((error as any)?.code || "").toUpperCase();
  const message = String((error as any)?.message || (error as any)?.details || "").toLowerCase();
  return code === "23505" || message.includes("duplicate key") || message.includes("unique constraint");
};

const isSystemCodeDuplicateError = (error: unknown): boolean => {
  const code = String((error as any)?.code || "").toUpperCase();
  const message = String((error as any)?.message || (error as any)?.details || "").toLowerCase();
  return code === "23505" && (message.includes("system_code") || message.includes("org_system_code"));
};

const isMissingColumnError = (error: unknown): boolean => {
  const code = String((error as any)?.code || "").toUpperCase();
  const text = String((error as any)?.message || (error as any)?.details || "").toLowerCase();
  return code === "42703" || code === "PGRST204" || text.includes("column");
};

const extractMissingColumnNames = (error: unknown): string[] => {
  const text = String((error as any)?.message || (error as any)?.details || (error as any)?.hint || "").toLowerCase();
  if (!text) return [];

  const patterns = [
    /column\s+"([^"]+)"/gi,
    /column\s+'([^']+)'/gi,
    /could not find the\s+'([^']+)'\s+column/gi,
    /([a-z0-9_]+)\s+does not exist/gi,
  ];

  return Array.from(
    new Set(
      patterns.flatMap((pattern) =>
        Array.from(text.matchAll(pattern))
          .map((match) => String(match?.[1] || "").trim().toLowerCase())
          .filter(Boolean)
      )
    )
  );
};

const omitColumns = (payload: Record<string, unknown>, columns: string[]) => {
  if (!columns.length) return payload;
  const nextPayload = { ...payload };
  columns.forEach((column) => {
    delete nextPayload[column];
  });
  return nextPayload;
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
  if (targetModule === "billboards") {
    ["name", "manual_code"].forEach((column) => columns.add(column));
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
  if (targetModule === "billboards") {
    return [
      row[targetField],
      row.name,
      row.system_code,
      row.manual_code,
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
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
    const parts = value.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return { full_name: value, first_name: value };
    return {
      full_name: value,
      first_name: parts.slice(0, -1).join(" "),
      last_name: parts[parts.length - 1],
    };
  }
  return null;
};

const findRelationRecordByValue = async (
  targetModule: string,
  targetField: string,
  rawValue: string,
  label: string
): Promise<Record<string, unknown> | undefined> => {
  const value = stripLegacyReferencePrefix(rawValue);
  if (!value) return undefined;

  const lookupFields = getRelationLookupFields(targetModule, targetField);
  const selectVariants = getRelationSelectVariants(targetModule, targetField);

  for (const lookupField of lookupFields) {
    for (const selectExpr of selectVariants) {
      try {
        const matchValues = buildFieldMatchValues(lookupField, value);
        if (matchValues.length === 0) continue;
        const existingResult = (await withTimeout(
          (matchValues.length > 1
            ? supabase.from(targetModule).select(selectExpr).in(lookupField, matchValues).limit(2)
            : supabase.from(targetModule).select(selectExpr).eq(lookupField, matchValues[0]).limit(2)),
          20000,
          label
        )) as unknown as QueryResult<Record<string, unknown>[]>;
        if (existingResult.error) throw existingResult.error;
        if ((existingResult.data || []).length > 1) {
          throw new Error(
            `در ماژول «${targetModule}» بیش از یک رکورد با مقدار «${value}» پیدا شد. مقدار تطبیق را دقیق‌تر کنید.`
          );
        }
        const matched = existingResult.data?.[0];
        if (matched?.id) return matched;
      } catch (error) {
        if (!isMissingColumnError(error)) throw error;
      }
    }
  }

  return undefined;
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
  logic: field.logic,
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

const mapLegacyMarketingLeadStatus = (value: unknown): string | null => {
  const normalized = normalizeKey(value);
  if (!normalized) return null;

  if ([
    "new",
    normalizeKey("جدید"),
  ].includes(normalized)) return "new";
  if ([
    "contacted",
    "qualified",
    normalizeKey("در حال پیگیری"),
    normalizeKey("پیگیری"),
    normalizeKey("تماس گرفته شده"),
    normalizeKey("واجد شرایط"),
  ].includes(normalized)) return "in_follow_up";
  if ([
    "overdue_follow_up",
    normalizeKey("پیگیری معوق"),
    normalizeKey("معوق"),
  ].includes(normalized)) return "overdue_follow_up";
  if ([
    "proposal",
    "future_follow_up",
    normalizeKey("پیگیری در آینده"),
    normalizeKey("آینده"),
    normalizeKey("پیشنهاد"),
  ].includes(normalized)) return "future_follow_up";
  if ([
    "won",
    normalizeKey("برنده"),
  ].includes(normalized)) return "won";
  if ([
    "lost",
    "archived",
    normalizeKey("از دست رفته"),
    normalizeKey("بایگانی"),
    normalizeKey("آرشیو"),
  ].includes(normalized)) return "lost";

  return null;
};

const MARKETING_LEAD_ALLOWED_STATUS_VALUES = new Set([
  "new",
  "in_follow_up",
  "overdue_follow_up",
  "future_follow_up",
  "won",
  "lost",
]);
const MARKETING_LEAD_ALLOWED_TYPE_VALUES = new Set([
  "new_lead",
  "existing_customer",
]);

const normalizeMarketingLeadStatusForImport = (value: unknown): string | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const mapped = mapLegacyMarketingLeadStatus(raw);
  if (mapped) return mapped;

  const normalizedValue = raw.toLowerCase();
  if (MARKETING_LEAD_ALLOWED_STATUS_VALUES.has(normalizedValue)) {
    return normalizedValue;
  }

  const normalizedText = normalizeText(raw);
  if (!normalizedText) return "new";

  if (normalizedText.includes("overdue") || normalizedText.includes("معوق")) {
    return "overdue_follow_up";
  }
  if (normalizedText.includes("future") || normalizedText.includes("اینده") || normalizedText.includes("آینده")) {
    return "future_follow_up";
  }
  if (normalizedText.includes("follow") || normalizedText.includes("پیگیری")) {
    return "in_follow_up";
  }
  if (normalizedText.includes("won") || normalizedText.includes("برنده")) {
    return "won";
  }
  if (
    normalizedText.includes("lost")
    || normalizedText.includes("archiv")
    || normalizedText.includes("ازدست")
    || normalizedText.includes("از دست")
    || normalizedText.includes("بایگان")
    || normalizedText.includes("آرشیو")
  ) {
    return "lost";
  }

  // Safety fallback: avoid DB check-constraint failure for unknown legacy statuses.
  return "new";
};

const normalizeMarketingLeadTypeForImport = (value: unknown): string | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalizedValue = raw.toLowerCase();
  if (MARKETING_LEAD_ALLOWED_TYPE_VALUES.has(normalizedValue)) {
    return normalizedValue;
  }

  const normalizedKey = normalizeKey(raw);
  if (
    normalizedKey === "0"
    || normalizedKey === normalizeKey("لید جدید")
    || normalizedKey === normalizeKey("جدید")
    || normalizedKey === "newlead"
    || normalizedKey === "new_lead"
  ) {
    return "new_lead";
  }
  if (
    normalizedKey === "1"
    || normalizedKey === normalizeKey("مشتری قبلی")
    || normalizedKey === normalizeKey("مشتری قدیمی")
    || normalizedKey === "existingcustomer"
    || normalizedKey === "existing_customer"
  ) {
    return "existing_customer";
  }
  if (normalizedKey.includes(normalizeKey("مشتری")) || normalizedKey.includes("existing") || normalizedKey.includes("customer")) {
    return "existing_customer";
  }
  return "new_lead";
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
  if (isValueEmpty(payload.total_price)) {
    const calculatedTotal = calculateRow(payload, RowCalculationType.INVOICE_ROW);
    if (Number.isFinite(calculatedTotal) && calculatedTotal > 0) {
      payload.total_price = calculatedTotal;
    }
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
  const [relatedModuleLinks, setRelatedModuleLinks] = useState<RelatedModuleLinkConfig[]>([]);
  const [saveCustomMapping, setSaveCustomMapping] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(null);
  const [autoSyncCustomerStats, setAutoSyncCustomerStats] = useState<boolean>(moduleId === "invoices");
  const [defaultEditorRelationOptions, setDefaultEditorRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [defaultEditorDynamicOptions, setDefaultEditorDynamicOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [defaultEditorAssigneeOptions, setDefaultEditorAssigneeOptions] = useState<Array<{ label: string; value: string }>>([]);
  const parsedSheet = useMemo(() => matrixToSheetData(rawMatrix, hasHeader), [rawMatrix, hasHeader]);

  const headerImportableFields = useMemo(() => {
    const fields = [...moduleConfig.fields]
      .filter((field) => {
        if (!IMPORTABLE_TYPES.has(field.type)) return false;
        if (!isPersistableImportField(moduleId, field.key)) return false;
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
  const supportsAssigneeRoleField = useMemo(
    () => headerImportableFields.some((field) => field.key === "assignee_role_id"),
    [headerImportableFields]
  );

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
      .map((row) => {
        const targetFieldKey = String(row.targetFieldKey || "").trim();
        return parseRelatedTargetKey(targetFieldKey) ? null : targetFieldKey;
      })
      .filter((key): key is string => Boolean(key));
  }, [mappingRows]);

  const mappedItemFieldKeys = useMemo(() => {
    return mappingRows
      .filter((row) => row.targetScope === "item")
      .map((row) => {
        const targetFieldKey = String(row.targetFieldKey || "").trim();
        return parseRelatedTargetKey(targetFieldKey) ? null : targetFieldKey;
      })
      .filter((key): key is string => Boolean(key));
  }, [mappingRows]);

  const mappedRequiredFieldKeys = useMemo(() => {
    const set = new Set(mappedHeaderFieldKeys);
    if (set.has("legacy_status")) set.add("status");
    return requiredFields
      .filter((field) => set.has(field.key) || !isValueEmpty(resolveImportFieldDefaultValue(field)))
      .map((field) => field.key);
  }, [mappedHeaderFieldKeys, requiredFields]);

  const missingRequiredFields = useMemo(() => {
    const set = new Set(mappedRequiredFieldKeys);
    return requiredFields.filter((field) => !set.has(field.key));
  }, [mappedRequiredFieldKeys, requiredFields]);
  const suggestedDuplicateFields = useMemo(() => {
    const mappedFieldKeySet = new Set(mappedHeaderFieldKeys);
    const orderedCandidates = [
      ...(DUPLICATE_FIELD_CANDIDATES_BY_MODULE[moduleId] || []),
      ...GENERIC_DUPLICATE_FIELD_CANDIDATES,
    ];
    const firstMatched = orderedCandidates.find(
      (fieldKey) => mappedFieldKeySet.has(fieldKey) && headerFieldByKey.has(fieldKey)
    );
    return firstMatched ? [firstMatched] : [];
  }, [headerFieldByKey, mappedHeaderFieldKeys, moduleId]);
  const effectiveDuplicateFields = useMemo(
    () => (duplicateFields.length > 0 ? duplicateFields : suggestedDuplicateFields),
    [duplicateFields, suggestedDuplicateFields]
  );

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
    setRelatedModuleLinks([]);
    setSaveCustomMapping(false);
    setImportFeedback(null);
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
  const formatFieldOptionLabel = useCallback((field: Pick<ImportFieldDescriptor, "labels" | "type" | "dynamicOptionsCategory">): string => {
    const suffixes: string[] = [];
    if (field.type === FieldType.RELATION || field.type === FieldType.USER) {
      suffixes.push("رابطه");
    } else if (field.dynamicOptionsCategory) {
      suffixes.push("لیست پویا");
    } else if (
      field.type === FieldType.SELECT ||
      field.type === FieldType.STATUS ||
      field.type === FieldType.MULTI_SELECT ||
      field.type === FieldType.CHECKLIST
    ) {
      suffixes.push("انتخابی");
    }
    return suffixes.length > 0 ? `${field.labels.fa} [${suffixes.join(" | ")}]` : field.labels.fa;
  }, []);
  const headerFieldSelectOptions = useMemo(
    () =>
      headerImportableFields.map((field) => ({
        label: formatFieldOptionLabel(field),
        value: field.key,
        searchLabel: `${field.labels.fa} ${field.key}`,
      })),
    [formatFieldOptionLabel, headerImportableFields]
  );
  const itemFieldSelectOptions = useMemo(
    () =>
      itemImportableFields.map((field) => ({
        label: formatFieldOptionLabel(field),
        value: field.key,
        searchLabel: `${field.labels.fa} ${field.key}`,
      })),
    [formatFieldOptionLabel, itemImportableFields]
  );
  const duplicateFieldSelectOptions = useMemo(
    () =>
      headerImportableFields.map((field) => ({
        label: formatFieldOptionLabel(field),
        value: field.key,
        searchLabel: `${field.labels.fa} ${field.key}`,
      })),
    [formatFieldOptionLabel, headerImportableFields]
  );
  const linkableRelationFieldOptions = useMemo(() => {
    return headerImportableFields
      .filter((field) => field.type === FieldType.RELATION && !!field.relationConfig?.targetModule)
      .map((field) => ({
        key: field.key,
        label: field.labels.fa,
        targetModuleId: String(field.relationConfig?.targetModule || "").trim(),
      }));
  }, [headerImportableFields]);
  const relatedModuleOptions = useMemo(
    () =>
      Object.entries(MODULES)
        .filter(([, config]) => Array.isArray(config?.fields) && config.fields.length > 0)
        .map(([id, config]) => ({
          value: id,
          label: config.titles?.fa || config.titles?.faSingular || id,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "fa")),
    []
  );
  const getRelatedMatchFieldOptions = useCallback((moduleIdValue: string) => {
    const targetModule = MODULES[String(moduleIdValue || "").trim()];
    if (!targetModule) return [] as Array<{ value: string; label: string }>;
    const fields = (targetModule.fields || []).filter((field) => {
      if (!RELATED_LINK_MATCHABLE_TYPES.has(field.type)) return false;
      if (field.nature === FieldNature.SYSTEM) return false;
      return true;
    });
    const ordered = [...fields].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    return ordered.map((field) => ({
      value: field.key,
      label: field.labels?.fa || field.key,
    }));
  }, []);
  const relatedImportableFieldsByLinkId = useMemo(() => {
    const result: Record<string, Map<string, ImportFieldDescriptor>> = {};
    relatedModuleLinks.forEach((link) => {
      const moduleConfig = MODULES[String(link.targetModuleId || "").trim()];
      if (!moduleConfig) return;
      const fields = (moduleConfig.fields || [])
        .filter((field) => {
          if (!RELATED_MODULE_IMPORTABLE_TYPES.has(field.type)) return false;
          if (field.nature === FieldNature.SYSTEM) return false;
          if (field.readonly) return false;
          return true;
        })
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
        .map((field) => toImportField(field, "header"));
      result[link.id] = new Map(fields.map((field) => [field.key, field] as const));
    });
    return result;
  }, [relatedModuleLinks]);
  const relatedFieldSelectOptions = useMemo(() => {
    const options: Array<{ value: string; label: string; searchLabel: string }> = [];
    relatedModuleLinks.forEach((link) => {
      const moduleConfig = MODULES[String(link.targetModuleId || "").trim()];
      if (!moduleConfig) return;
      const moduleLabel = moduleConfig.titles?.fa || moduleConfig.titles?.faSingular || link.targetModuleId;
      const fieldMap = relatedImportableFieldsByLinkId[link.id];
      if (!fieldMap) return;
      fieldMap.forEach((field) => {
        options.push({
          value: buildRelatedTargetKey(link.id, field.key),
          label: `${formatFieldOptionLabel(field)} (${moduleLabel}) [فیلد مرتبط]`,
          searchLabel: `${field.labels.fa} ${moduleLabel} ${field.key}`,
        });
      });
    });
    return options;
  }, [formatFieldOptionLabel, relatedImportableFieldsByLinkId, relatedModuleLinks]);
  const addRelatedModuleLink = useCallback(() => {
    const firstColumn = parsedSheet.headers[0] || "";
    const firstLinkable = linkableRelationFieldOptions[0];
    const targetModuleId = firstLinkable?.targetModuleId || relatedModuleOptions[0]?.value || "";
    const matchOptions = getRelatedMatchFieldOptions(targetModuleId);
    const next: RelatedModuleLinkConfig = {
      id: createRelatedLinkId(),
      sourceColumn: firstColumn,
      targetModuleId,
      relationFieldKey: firstLinkable?.key || null,
      matchFieldKey: matchOptions[0]?.value || "id",
    };
    setRelatedModuleLinks((prev) => [...prev, next]);
  }, [getRelatedMatchFieldOptions, linkableRelationFieldOptions, parsedSheet.headers, relatedModuleOptions]);
  const updateRelatedModuleLink = useCallback((id: string, patch: Partial<RelatedModuleLinkConfig>) => {
    setRelatedModuleLinks((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const merged = { ...item, ...patch };
        const nextModuleId = String(merged.targetModuleId || "").trim();
        const nextMatchOptions = getRelatedMatchFieldOptions(nextModuleId);
        const safeMatchField =
          nextMatchOptions.some((option) => option.value === merged.matchFieldKey)
            ? merged.matchFieldKey
            : nextMatchOptions[0]?.value || "id";
        const relationCandidates = linkableRelationFieldOptions.filter((option) => option.targetModuleId === nextModuleId);
        const safeRelationField =
          relationCandidates.some((option) => option.key === merged.relationFieldKey)
            ? merged.relationFieldKey
            : relationCandidates[0]?.key || null;
        const safeSourceColumn = parsedSheet.headers.includes(merged.sourceColumn)
          ? merged.sourceColumn
          : parsedSheet.headers[0] || "";
        return {
          ...merged,
          sourceColumn: safeSourceColumn,
          relationFieldKey: safeRelationField,
          matchFieldKey: safeMatchField,
        };
      })
    );
  }, [getRelatedMatchFieldOptions, linkableRelationFieldOptions, parsedSheet.headers]);
  const removeRelatedModuleLink = useCallback((id: string) => {
    setRelatedModuleLinks((prev) => prev.filter((item) => item.id !== id));
  }, []);
  useEffect(() => {
    if (parsedSheet.headers.length === 0) {
      setRelatedModuleLinks([]);
      return;
    }
    setRelatedModuleLinks((prev) =>
      prev.map((item) => {
        const nextModuleId = String(item.targetModuleId || "").trim();
        const matchOptions = getRelatedMatchFieldOptions(nextModuleId);
        const relationCandidates = linkableRelationFieldOptions.filter((option) => option.targetModuleId === nextModuleId);
        return {
          ...item,
          sourceColumn: parsedSheet.headers.includes(item.sourceColumn) ? item.sourceColumn : parsedSheet.headers[0],
          relationFieldKey: relationCandidates.some((option) => option.key === item.relationFieldKey)
            ? item.relationFieldKey
            : relationCandidates[0]?.key || null,
          matchFieldKey: matchOptions.some((option) => option.value === item.matchFieldKey)
            ? item.matchFieldKey
            : matchOptions[0]?.value || "id",
        };
      })
    );
  }, [getRelatedMatchFieldOptions, linkableRelationFieldOptions, parsedSheet.headers]);
  const getMappingTargetField = useCallback(
    (row: MappingRow): ImportFieldDescriptor | null => {
      const targetFieldKey = String(row.targetFieldKey || "").trim();
      if (!targetFieldKey) return null;
      const relatedTarget = parseRelatedTargetKey(targetFieldKey);
      if (relatedTarget) {
        return relatedImportableFieldsByLinkId[relatedTarget.linkId]?.get(relatedTarget.fieldKey) || null;
      }
      return row.targetScope === "item"
        ? itemFieldByKey.get(targetFieldKey) || null
        : headerFieldByKey.get(targetFieldKey) || null;
    },
    [headerFieldByKey, itemFieldByKey, relatedImportableFieldsByLinkId]
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
    const result: Record<string, Array<{ label: string; value: string; searchLabel?: string; disabled?: boolean }>> = {};
    const usedHeaderTargets = new Set(
      mappingRows
        .filter((item) => item.targetScope === "header")
        .map((item) => String(item.targetFieldKey || "").trim())
        .filter(Boolean)
    );
    const usedItemTargets = new Set(
      mappingRows
        .filter((item) => item.targetScope === "item")
        .map((item) => String(item.targetFieldKey || "").trim())
        .filter(Boolean)
    );
    mappingRows.forEach((row) => {
      const currentValue = String(row.targetFieldKey || "").trim();
      const baseOptions =
        row.targetScope === "item"
          ? itemFieldSelectOptions
          : [...headerFieldSelectOptions, ...relatedFieldSelectOptions];
      const usedFieldKeys = row.targetScope === "item" ? usedItemTargets : usedHeaderTargets;
      result[row.sourceColumn] = baseOptions.map((option) => ({
        ...option,
        disabled: option.value !== currentValue && usedFieldKeys.has(option.value),
      }));
    });
    return result;
  }, [
    headerFieldSelectOptions,
    itemFieldSelectOptions,
    mappingRows,
    relatedFieldSelectOptions,
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
            optionFilterProp="searchLabel"
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

  const insertMainRecord = useCallback(
    async (
      payload: Record<string, unknown>,
      label: string
    ): Promise<{ error: unknown | null; payload: Record<string, unknown>; retriedWithSystemCode: boolean }> => {
      const insertOnce = (nextPayload: Record<string, unknown>, nextLabel: string) =>
        withTimeout(
          supabase.from(moduleConfig.table).insert(nextPayload),
          20000,
          nextLabel
        );

      let nextPayload = { ...payload };
      let generatedSystemCode = false;
      if (supportsSystemCode(moduleId) && isValueEmpty(nextPayload.system_code)) {
        nextPayload.system_code = await buildClientFallbackSystemCode(supabase, moduleId, moduleConfig.table);
        generatedSystemCode = !isValueEmpty(nextPayload.system_code);
      }

      let firstError: unknown = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const result = await insertOnce(nextPayload, attempt === 0 ? label : `${label} با کد سیستمی جدید`);
        if (!result.error) {
          return { error: null, payload: nextPayload, retriedWithSystemCode: generatedSystemCode && attempt > 0 };
        }
        if (!firstError) firstError = result.error;
        if (isMissingColumnError(result.error)) {
          const removableColumns = extractMissingColumnNames(result.error)
            .filter((column) => Object.prototype.hasOwnProperty.call(nextPayload, column));
          if (removableColumns.length > 0) {
            nextPayload = omitColumns(nextPayload, removableColumns);
            continue;
          }
        }
        if (!generatedSystemCode || !isSystemCodeDuplicateError(result.error)) {
          return {
            error:
              attempt > 0
                ? new ImportInsertError(
                    "ثبت رکورد بعد از تولید کد سیستمی هم ناموفق بود.",
                    firstError,
                    result.error,
                    String(nextPayload.system_code || "")
                  )
                : result.error,
            payload: nextPayload,
            retriedWithSystemCode: attempt > 0,
          };
        }
        nextPayload = {
          ...nextPayload,
          system_code: await buildClientFallbackSystemCode(supabase, moduleId, moduleConfig.table),
        };
      }

      return {
        error: new ImportInsertError(
          "ثبت رکورد بعد از چند بار تولید کد سیستمی به خطای تکراری خورد.",
          firstError,
          firstError,
          String(nextPayload.system_code || "")
        ),
        payload: nextPayload,
        retriedWithSystemCode: true,
      };
    },
    [moduleConfig.table, moduleId]
  );

  const insertRelatedRecord = useCallback(
    async (
      targetModule: string,
      payload: Record<string, unknown>,
      selectExpr: string,
      label: string
    ): Promise<QueryResult<Record<string, unknown>> & { retriedWithSystemCode?: boolean }> => {
      const insertOnce = (nextPayload: Record<string, unknown>, nextLabel: string) =>
        withTimeout(
          supabase.from(targetModule).insert(nextPayload).select(selectExpr).single(),
          20000,
          nextLabel
        ) as Promise<QueryResult<Record<string, unknown>>>;

      let nextPayload = { ...payload };
      let generatedSystemCode = false;
      if (supportsSystemCode(targetModule) && isValueEmpty(nextPayload.system_code)) {
        nextPayload.system_code = await buildClientFallbackSystemCode(supabase, targetModule, targetModule);
        generatedSystemCode = !isValueEmpty(nextPayload.system_code);
      }

      let firstError: unknown = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const result = await insertOnce(nextPayload, attempt === 0 ? label : `${label} با کد سیستمی جدید`);
        if (!result.error) return { ...result, retriedWithSystemCode: generatedSystemCode && attempt > 0 };
        if (!firstError) firstError = result.error;
        if (isMissingColumnError(result.error)) {
          const removableColumns = extractMissingColumnNames(result.error)
            .filter((column) => Object.prototype.hasOwnProperty.call(nextPayload, column));
          if (removableColumns.length > 0) {
            nextPayload = omitColumns(nextPayload, removableColumns);
            continue;
          }
        }
        if (!generatedSystemCode || !isSystemCodeDuplicateError(result.error)) {
          return {
            ...result,
            error:
              attempt > 0
                ? new ImportInsertError(
                    "ثبت رکورد مرتبط بعد از تولید کد سیستمی هم ناموفق بود.",
                    firstError,
                    result.error,
                    String(nextPayload.system_code || "")
                  )
                : result.error,
            retriedWithSystemCode: attempt > 0,
          };
        }
        nextPayload = {
          ...nextPayload,
          system_code: await buildClientFallbackSystemCode(supabase, targetModule, targetModule),
        };
      }

      return {
        data: null,
        error: new ImportInsertError(
          "ثبت رکورد مرتبط بعد از چند بار تولید کد سیستمی به خطای تکراری خورد.",
          firstError,
          firstError,
          String(nextPayload.system_code || "")
        ),
        retriedWithSystemCode: true,
      };
    },
    []
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

      const exact = getLookupValue(map, value);
      if (exact) return exact;

      const targetModule = String(field.relationConfig?.targetModule || "").trim();
      if (!targetModule) {
        return undefined;
      }

      const targetField = getPreferredRelationTargetField(targetModule, field.relationConfig?.targetField);
      const selectVariants = getRelationSelectVariants(targetModule, targetField);
      const existingRow = await findRelationRecordByValue(
        targetModule,
        targetField,
        value,
        `جستجوی رابطه (${field.labels.fa})`
      );

      if (existingRow?.id) {
        const existingId = String(existingRow.id);
        setLookupValue(map, value, existingId);
        getRelationLookupCandidates(targetModule, existingRow, targetField).forEach((candidate) =>
          setLookupValue(map, candidate, existingId)
        );
        return existingId;
      }

      if (!RELATION_AUTOCREATE_TARGET_MODULES.has(targetModule)) {
        return undefined;
      }

      const payload = buildRelationAutoCreatePayload(targetModule, value);
      if (!payload) return undefined;

      let inserted: Record<string, unknown> | null = null;
      let lastInsertError: unknown = null;
      for (const selectExpr of selectVariants) {
        try {
          const insertResult = await insertRelatedRecord(
            targetModule,
            payload,
            selectExpr,
            `ایجاد رابطه (${field.labels.fa})`
          );
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
      setLookupValue(map, value, insertedId);
      getRelationLookupCandidates(targetModule, inserted, targetField).forEach((candidate) =>
        setLookupValue(map, candidate, insertedId)
      );
      return insertedId;
    },
    [insertRelatedRecord]
  );

  const convertValueByType = useCallback(
    (
      field: ImportFieldDescriptor,
      rawValue: string,
      importContext: ImportRuntimeContext
    ): Promise<unknown> => {
      const value = sanitizeImportedTextValue(rawValue);
      if (!value) return Promise.resolve(undefined);

      if ((field.type === FieldType.SELECT || field.type === FieldType.STATUS) && field.options?.length) {
        const byValue = field.options.find((option) => normalizeKey(option.value) === normalizeKey(value));
        if (byValue) {
          if (moduleId === "marketing_leads" && field.key === "status") {
            return Promise.resolve(normalizeMarketingLeadStatusForImport(byValue.value));
          }
          if (moduleId === "marketing_leads" && field.key === "lead_type") {
            return Promise.resolve(normalizeMarketingLeadTypeForImport(byValue.value));
          }
          return Promise.resolve(byValue.value);
        }
        const byLabel = field.options.find((option) => normalizeKey(option.label) === normalizeKey(value));
        if (byLabel) {
          if (moduleId === "marketing_leads" && field.key === "status") {
            return Promise.resolve(normalizeMarketingLeadStatusForImport(byLabel.value));
          }
          if (moduleId === "marketing_leads" && field.key === "lead_type") {
            return Promise.resolve(normalizeMarketingLeadTypeForImport(byLabel.value));
          }
          return Promise.resolve(byLabel.value);
        }
        if (field.type === FieldType.STATUS) {
          if (moduleId === "marketing_leads" && field.key === "status") {
            const mappedLeadStatus = normalizeMarketingLeadStatusForImport(value);
            if (mappedLeadStatus) return Promise.resolve(mappedLeadStatus);
          }
          const legacyStatus = mapLegacyInvoiceStatus(value);
          if (legacyStatus) return Promise.resolve(legacyStatus);
        }
      }

      if (moduleId === "marketing_leads" && field.key === "lead_type") {
        const mappedLeadType = normalizeMarketingLeadTypeForImport(value);
        if (mappedLeadType) return Promise.resolve(mappedLeadType);
      }

      if (field.type === FieldType.RELATION || field.type === FieldType.USER) {
        return ensureRelationValue(field, value, importContext.relationLookups);
      }

      if (field.dynamicOptionsCategory && DYNAMIC_OPTION_IMPORT_TYPES.has(field.type)) {
        if (field.type === FieldType.MULTI_SELECT || field.type === FieldType.CHECKLIST) {
          return Promise.all(
            splitDynamicOptionValues(value).map((item) =>
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
          return Promise.resolve(sanitizeImportedTextValue(value));
      }
    },
    [ensureDynamicOptionValue, ensureRelationValue, moduleId]
  );

  const loadRelationLookups = useCallback(async (): Promise<RelationLookupMap> => {
    const relationFields: ImportFieldDescriptor[] = [];
    const seen = new Set<string>();

    mappingRows.forEach((mapping) => {
      if (!mapping.targetFieldKey) return;
      if (parseRelatedTargetKey(mapping.targetFieldKey)) return;
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
          setLookupValue(map, item.id, encodedValue);
          if (item.full_name) setLookupValue(map, item.full_name, encodedValue);
          if (item.email) setLookupValue(map, item.email, encodedValue);
        });

        if (supportsAssigneeTypeField(moduleId)) {
          const { data: roles } = await withTimeout(
            supabase.from("org_roles").select("id, title"),
            20000,
            "دریافت نقش‌ها برای تطبیق"
          );
          (roles || []).forEach((item: { id: string; title?: string | null }) => {
            const encodedValue = `role_${item.id}`;
            setLookupValue(map, item.id, encodedValue);
            if (item.title) setLookupValue(map, item.title, encodedValue);
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
          setLookupValue(map, item.id, item.id);
          if (item.full_name) setLookupValue(map, item.full_name, item.id);
          if (item.email) setLookupValue(map, item.email, item.id);
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
        setLookupValue(map, id, id);

        getRelationLookupCandidates(targetModule, item, targetField).forEach((candidate) =>
          setLookupValue(map, candidate, id)
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
      if (parseRelatedTargetKey(mapping.targetFieldKey)) return;
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
        if (parseRelatedTargetKey(mapping.targetFieldKey)) continue;
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
        const resolvedDefaultValue = getImportFieldDefaultValueForPayload(field, payload);
        if (resolvedDefaultValue === undefined) return;
        payload[field.key] = resolvedDefaultValue;
      });
      return payload;
    },
    [convertValueByType]
  );
  const buildRelatedPayloadFromMappings = useCallback(
    async (
      row: Record<string, string>,
      link: RelatedModuleLinkConfig,
      importContext: ImportRuntimeContext
    ): Promise<Record<string, unknown>> => {
      const payload: Record<string, unknown> = {};
      const fieldMap = relatedImportableFieldsByLinkId[link.id];
      if (!fieldMap) return payload;

      for (const mapping of mappingRows) {
        if (!mapping.targetFieldKey) continue;
        const relatedTarget = parseRelatedTargetKey(mapping.targetFieldKey);
        if (!relatedTarget || relatedTarget.linkId !== link.id) continue;
        const field = fieldMap.get(relatedTarget.fieldKey);
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
      fieldMap.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(payload, field.key)) return;
        const resolvedDefaultValue = getImportFieldDefaultValueForPayload(field, payload);
        if (resolvedDefaultValue === undefined) return;
        payload[field.key] = resolvedDefaultValue;
      });
      return payload;
    },
    [convertValueByType, mappingRows, relatedImportableFieldsByLinkId]
  );
  const resolveRelatedRecordId = useCallback(
    async (
      row: Record<string, string>,
      link: RelatedModuleLinkConfig,
      importContext: ImportRuntimeContext
    ): Promise<string | undefined> => {
      const targetModuleId = String(link.targetModuleId || "").trim();
      const matchFieldKey = String(link.matchFieldKey || "").trim();
      const sourceColumn = String(link.sourceColumn || "").trim();
      if (!targetModuleId || !matchFieldKey || !sourceColumn) return undefined;

      const sourceValueRaw = row[sourceColumn] ?? "";
      const sourceValue = stripLegacyReferencePrefix(sourceValueRaw);
      if (!sourceValue) return undefined;

      const lookupKey = `related:${link.id}`;
      const map = importContext.relationLookups[lookupKey] || new Map<string, string>();
      importContext.relationLookups[lookupKey] = map;
      const cached = getLookupValue(map, sourceValue);
      if (cached) return cached;

      const selectVariants = getRelationSelectVariants(targetModuleId, matchFieldKey);
      const lookupFields = Array.from(
        new Set([matchFieldKey, ...getRelationLabelFallbackFields(targetModuleId)].filter(Boolean))
      );

      const relatedPayload = await buildRelatedPayloadFromMappings(row, link, importContext);
      let existingRow: Record<string, unknown> | undefined;
      for (const lookupField of lookupFields) {
        for (const selectExpr of selectVariants) {
          try {
            const matchValues = buildFieldMatchValues(lookupField, sourceValue);
            if (matchValues.length === 0) continue;
            const existingResult = (await withTimeout(
              (matchValues.length > 1
                ? supabase.from(targetModuleId).select(selectExpr).in(lookupField, matchValues).limit(2)
                : supabase.from(targetModuleId).select(selectExpr).eq(lookupField, matchValues[0]).limit(2)),
              20000,
              `جستجوی رکورد مرتبط (${targetModuleId})`
            )) as unknown as QueryResult<Record<string, unknown>[]>;
            if (existingResult.error) throw existingResult.error;
            if ((existingResult.data || []).length > 1) {
              throw new Error(
                `برای اتصال «${link.relationFieldKey}» بیش از یک رکورد در ماژول «${targetModuleId}» با مقدار «${sourceValue}» پیدا شد.`
              );
            }
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
        const mergePayload = Object.entries(relatedPayload).reduce<Record<string, unknown>>((acc, [key, value]) => {
          if (!isValueEmpty(value)) acc[key] = value;
          return acc;
        }, {});
        if (Object.keys(mergePayload).length > 0) {
          const { error: updateError } = await withTimeout(
            supabase.from(targetModuleId).update(mergePayload).eq("id", existingId),
            20000,
            `بروزرسانی رکورد مرتبط (${targetModuleId})`
          );
          if (updateError) throw updateError;
        }
        setLookupValue(map, sourceValue, existingId);
        return existingId;
      }

      const createPayload = {
        ...(buildRelationAutoCreatePayload(targetModuleId, sourceValue) || {}),
        ...relatedPayload,
      };
      if (isValueEmpty(createPayload[matchFieldKey])) {
        createPayload[matchFieldKey] = sourceValue;
      }

      const { data: inserted, error: insertError } = await insertRelatedRecord(
        targetModuleId,
        createPayload,
        "id",
        `ایجاد رکورد مرتبط (${targetModuleId})`
      );
      if (insertError) throw insertError;
      const insertedId = String(inserted?.id || "").trim();
      if (!insertedId) return undefined;
      setLookupValue(map, sourceValue, insertedId);
      return insertedId;
    },
    [buildRelatedPayloadFromMappings, insertRelatedRecord]
  );
  const resolveRelatedLinksForRow = useCallback(
    async (
      row: Record<string, string>,
      importContext: ImportRuntimeContext
    ): Promise<Record<string, string>> => {
      const resolved: Record<string, string> = {};
      for (const link of relatedModuleLinks) {
        const relationFieldKey = String(link.relationFieldKey || "").trim();
        if (!relationFieldKey) continue;
        const relatedId = await resolveRelatedRecordId(row, link, importContext);
        if (relatedId) resolved[relationFieldKey] = relatedId;
      }
      return resolved;
    },
    [relatedModuleLinks, resolveRelatedRecordId]
  );
  const normalizeInvoiceItemForStorage = useCallback((rawItem: Record<string, unknown>): Record<string, unknown> => {
    const nextItem = finalizeInvoiceItemPayload({ ...rawItem });
    return Object.entries(nextItem).reduce<Record<string, unknown>>((acc, [key, value]) => {
      if (!isValueEmpty(value)) {
        acc[key] = value;
      }
      return acc;
    }, {});
  }, []);
  const buildInvoiceItemSignature = useCallback((item: Record<string, unknown>): string => {
    const signatureKeys = [
      "product_id",
      "package_id",
      "price_list_id",
      "source_shelf_id",
      "description",
      "quantity",
      "unit_price",
      "discount",
      "discount_type",
      "vat",
      "vat_type",
      "length",
      "width",
    ];
    return signatureKeys
      .map((key) => {
        const value = item[key];
        if (typeof value === "number") {
          return `${key}:${Number.isFinite(value) ? value : ""}`;
        }
        return `${key}:${normalizeKey(value)}`;
      })
      .join("|");
  }, []);
  const buildInvoiceItemLooseSignature = useCallback((item: Record<string, unknown>): string => {
    const signatureKeys = [
      "product_id",
      "package_id",
      "price_list_id",
      "source_shelf_id",
      "description",
      "length",
      "width",
    ];
    return signatureKeys
      .map((key) => `${key}:${normalizeKey(item[key])}`)
      .join("|");
  }, []);
  const hasSparseInvoiceItemValues = useCallback((item: Record<string, unknown>): boolean => {
    const sparseCandidateKeys = ["unit_price", "discount", "discount_type", "vat", "vat_type", "total_price"];
    return sparseCandidateKeys.some((key) => isValueEmpty(item[key]));
  }, []);
  const mergeInvoiceItems = useCallback(
    (existingItems: unknown[], importedItems: Record<string, unknown>[]): Record<string, unknown>[] => {
      const mergedItems = (Array.isArray(existingItems) ? existingItems : [])
        .map((item) => normalizeInvoiceItemForStorage({ ...(item as Record<string, unknown>) }));
      importedItems.forEach((item) => {
        const normalizedItem = normalizeInvoiceItemForStorage(item);
        const nextSignature = buildInvoiceItemSignature(normalizedItem);
        if (!nextSignature.replace(/[|:]/g, "")) {
          mergedItems.push(normalizedItem);
          return;
        }
        let existingIndex = mergedItems.findIndex(
          (existingItem) => buildInvoiceItemSignature(existingItem) === nextSignature
        );
        if (existingIndex === -1 && hasSparseInvoiceItemValues(normalizedItem)) {
          const looseSignature = buildInvoiceItemLooseSignature(normalizedItem);
          if (looseSignature.replace(/[|:]/g, "")) {
            existingIndex = mergedItems.findIndex(
              (existingItem) => buildInvoiceItemLooseSignature(existingItem) === looseSignature
            );
          }
        }
        if (existingIndex === -1) {
          mergedItems.push(normalizedItem);
          return;
        }
        mergedItems[existingIndex] = normalizeInvoiceItemForStorage({
          ...mergedItems[existingIndex],
          ...Object.entries(normalizedItem).reduce<Record<string, unknown>>((acc, [key, value]) => {
            if (!isValueEmpty(value)) acc[key] = value;
            return acc;
          }, {}),
        });
      });
      return mergedItems;
    },
    [
      buildInvoiceItemLooseSignature,
      buildInvoiceItemSignature,
      hasSparseInvoiceItemValues,
      normalizeInvoiceItemForStorage,
    ]
  );
  const applyInvoiceSummaryValues = useCallback(
    (rawPayload: Record<string, unknown>): Record<string, unknown> => {
      if (!supportsGroupedInvoiceImport || !Array.isArray(rawPayload.invoiceItems)) {
        return rawPayload;
      }
      const normalizedItems = rawPayload.invoiceItems
        .map((item) => normalizeInvoiceItemForStorage(item as Record<string, unknown>))
        .filter((item) => Object.keys(item).length > 0);
      const totalAmount = normalizedItems.reduce((sum, item) => {
        const nextTotal = Number(item.total_price ?? calculateRow(item, RowCalculationType.INVOICE_ROW));
        return sum + (Number.isFinite(nextTotal) ? nextTotal : 0);
      }, 0);
      const payload: Record<string, unknown> = { ...rawPayload, invoiceItems: normalizedItems };
      payload.total_invoice_amount = totalAmount;
      const parsedReceivedAmount = parseNumber(String(payload.total_received_amount ?? ""));
      const numericReceivedAmount = Number(payload.total_received_amount ?? 0);
      const receivedAmount =
        parsedReceivedAmount ?? (Number.isFinite(numericReceivedAmount) ? numericReceivedAmount : 0);
      payload.total_received_amount = receivedAmount;
      payload.remaining_balance = totalAmount - receivedAmount;
      return payload;
    },
    [normalizeInvoiceItemForStorage, supportsGroupedInvoiceImport]
  );

  const finalizeImportedPayload = useCallback(
    (rawPayload: Record<string, unknown>): Record<string, unknown> => {
      const payload = applyInvoiceSummaryValues({ ...rawPayload });
      const autoNameEnabled = normalizeAutoNameEnabled(payload.auto_name_enabled, false);
      delete payload.auto_name_enabled;

      const clearIfPresent = (key: string) => {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
          payload[key] = null;
        }
      };
      const rawAssignee = String(payload.assignee_id || "").trim();
      const assigneeMatch = rawAssignee.match(/^(user|role)_(.+)$/);
      if (assigneeMatch) {
        const assigneeType = assigneeMatch[1];
        const assigneeId = assigneeMatch[2];
        if (assigneeType === "role" && supportsGlobalRoleAssignee(moduleId)) {
          if (supportsAssigneeRoleField) {
            payload.assignee_id = null;
            payload.assignee_role_id = assigneeId;
          } else {
            payload.assignee_id = assigneeId;
            delete payload.assignee_role_id;
          }
        } else {
          payload.assignee_id = assigneeId;
          delete payload.assignee_role_id;
        }
        if (supportsAssigneeTypeField(moduleId)) {
          payload.assignee_type = assigneeType;
        }
      } else if (payload.assignee_id && supportsAssigneeTypeField(moduleId) && !payload.assignee_type) {
        payload.assignee_type = "user";
        if (supportsAssigneeRoleField) {
          clearIfPresent("assignee_role_id");
        } else {
          delete payload.assignee_role_id;
        }
      }

      if (moduleId === "customers") {
        const personTypeRaw = String(payload.person_type || "").trim().toLowerCase();
        if (Object.prototype.hasOwnProperty.call(payload, "person_type")) {
          payload.person_type = personTypeRaw === "legal" ? "legal" : "real";
        }

        const normalizedPersonType =
          personTypeRaw === "legal" || personTypeRaw === "real" ? personTypeRaw : "real";
        if (normalizedPersonType === "real") {
          clearIfPresent("legal_name");
          clearIfPresent("national_id");
          clearIfPresent("registration_number");
        } else {
          clearIfPresent("prefix");
          clearIfPresent("birth_date");
          clearIfPresent("national_code");
        }

        if (!payload.is_employee) {
          clearIfPresent("related_employee_id");
        }

        const referrerModule = String(payload.referrer_module || "").trim().toLowerCase();
        if (Object.prototype.hasOwnProperty.call(payload, "referrer_module")) {
          payload.referrer_module = referrerModule || null;
        }
        if (referrerModule !== "customers") clearIfPresent("referrer_customer_id");
        if (referrerModule !== "employees") clearIfPresent("referrer_employee_id");
        if (referrerModule !== "suppliers") clearIfPresent("referrer_supplier_id");

        const hasPortalPayload = [
          "portal_enabled",
          "portal_status",
          "telegram_chat_id",
          "bale_chat_id",
          "rubika_chat_id",
          "portal_permissions_override",
        ].some((key) => Object.prototype.hasOwnProperty.call(payload, key));
        if (hasPortalPayload && !payload.portal_enabled) {
          if (Object.prototype.hasOwnProperty.call(payload, "portal_status")) {
            payload.portal_status = String(payload.portal_status || "disabled").trim() || "disabled";
          }
          clearIfPresent("telegram_chat_id");
          clearIfPresent("bale_chat_id");
          clearIfPresent("rubika_chat_id");
          if (payload.portal_permissions_override === "") {
            delete payload.portal_permissions_override;
          }
        }
        const nextFullName = buildAutoCustomerName(payload);
        if (nextFullName && (autoNameEnabled || isValueEmpty(payload.full_name))) {
          payload.full_name = nextFullName;
        }
      }

      if (moduleId === "employees") {
        const nextFullName = buildAutoEmployeeName(payload);
        if (nextFullName && isValueEmpty(payload.full_name)) {
          payload.full_name = nextFullName;
        }
      }

      if (moduleId === "marketing_leads" && !isValueEmpty(payload.status)) {
        payload.status = normalizeMarketingLeadStatusForImport(payload.status);
      }
      if (moduleId === "marketing_leads") {
        payload.lead_type = normalizeMarketingLeadTypeForImport(payload.lead_type) || "new_lead";
      }

      return payload;
    },
    [applyInvoiceSummaryValues, moduleId, supportsAssigneeRoleField]
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
    if ((duplicateStrategy === "overwrite" || duplicateStrategy === "merge") && effectiveDuplicateFields.length === 0) {
      message.error("برای بازنویسی یا ادغام، حداقل یک فیلد تطبیق لازم است.");
      return false;
    }
    for (const link of relatedModuleLinks) {
      const sourceColumn = String(link.sourceColumn || "").trim();
      const targetModuleId = String(link.targetModuleId || "").trim();
      const matchFieldKey = String(link.matchFieldKey || "").trim();
      const relationFieldKey = String(link.relationFieldKey || "").trim();
      if (!sourceColumn || !targetModuleId || !matchFieldKey || !relationFieldKey) {
        message.error("پیکربندی فیلد مرتبط کامل نیست. لطفا ستون اکسل، ماژول، فیلد ارتباط و فیلد تطبیق را تکمیل کنید.");
        return false;
      }
      const relationField = headerFieldByKey.get(relationFieldKey);
      if (!relationField || relationField.type !== FieldType.RELATION) {
        message.error("فیلد ارتباط انتخاب‌شده معتبر نیست.");
        return false;
      }
      const relationTargetModule = String(relationField.relationConfig?.targetModule || "").trim();
      if (!relationTargetModule || relationTargetModule !== targetModuleId) {
        message.error("ماژول انتخاب‌شده با فیلد ارتباط در ماژول اصلی هم‌خوانی ندارد.");
        return false;
      }
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
    duplicateStrategy,
    effectiveDuplicateFields.length,
    groupedData.missingGroupSourceLines,
    groupedData.records.length,
    groupingColumn,
    importMode,
    mappedItemFieldKeys.length,
    headerFieldByKey,
    message,
    missingRequiredFields,
    parsedSheet.rows.length,
    selectedFile,
    relatedModuleLinks,
  ]);

  const findExistingRecord = useCallback(
    async (payload: Record<string, unknown>, label: string) => {
      if (!effectiveDuplicateFields.length) return null;

      const duplicateFilter = effectiveDuplicateFields.reduce<Record<string, unknown>>((acc, fieldKey) => {
        const value = payload[fieldKey];
        if (!isValueEmpty(value)) acc[fieldKey] = value;
        return acc;
      }, {});

      if (Object.keys(duplicateFilter).length !== effectiveDuplicateFields.length) return null;

      let activeFilter = { ...duplicateFilter };
      for (;;) {
        if (Object.keys(activeFilter).length === 0) return null;

        const selectExpr = supportsGroupedInvoiceImport && importMode === "grouped_invoice" ? "*" : "id";
        let query: any = supabase.from(moduleConfig.table).select(selectExpr).limit(2);
        Object.entries(activeFilter).forEach(([key, value]) => {
          const field = headerFieldByKey.get(key);
          const matchValues = buildFieldMatchValues(key, value, field?.type);
          if (matchValues.length > 1) {
            query = query.in(key, matchValues as never);
            return;
          }
          query = query.eq(key, (matchValues[0] ?? value) as never);
        });

        const result = await withTimeout(Promise.resolve(query), 20000, label);
        if (result?.error) {
          if (!isMissingColumnError(result.error)) throw result.error;
          const removableColumns = extractMissingColumnNames(result.error)
            .filter((column) => Object.prototype.hasOwnProperty.call(activeFilter, column));
          if (!removableColumns.length) throw result.error;
          activeFilter = omitColumns(activeFilter, removableColumns);
          continue;
        }

        const data = result?.data as Record<string, unknown>[] | null | undefined;
        if ((data || []).length > 1) {
          const duplicateLabels = Object.keys(activeFilter)
            .map((fieldKey) => headerFieldByKey.get(fieldKey)?.labels.fa || fieldKey)
          .join("، ");
          throw new Error(`بیش از یک رکورد با فیلدهای تطبیق «${duplicateLabels}» پیدا شد. تطبیق مبهم است.`);
        }
        return data && data[0] ? (data[0] as Record<string, unknown>) : null;
      }
    },
    [effectiveDuplicateFields, headerFieldByKey, importMode, moduleConfig.table, supportsGroupedInvoiceImport]
  );

  const handleImport = useCallback(async () => {
    if (!validateBeforeImport()) return;
    setIsImporting(true);
    setImportFeedback(null);
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
      let aborted = false;

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
            const linkedRelations = await resolveRelatedLinksForRow(record.firstRow, importContext);
            const headerPayload = finalizeInvoiceHeaderPayload({
              ...headerPayloadRaw,
              ...linkedRelations,
            });
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

              const nextInvoiceItems =
                duplicateStrategy === "merge"
                  ? mergeInvoiceItems(existingRecord.invoiceItems as unknown[], itemPayloads)
                  : itemPayloads;
              const nextPayload = finalizeImportedPayload({
                ...payload,
                invoiceItems: nextInvoiceItems,
              });
              const updatePayload =
                duplicateStrategy === "merge"
                  ? Object.entries(nextPayload).reduce<Record<string, unknown>>((acc, [key, value]) => {
                      if (!isValueEmpty(value)) acc[key] = value;
                      return acc;
                    }, {})
                  : nextPayload;

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

            const { error } = await insertMainRecord(payload, `ثبت فاکتور ${record.key}`);
            if (error) throw error;
            inserted += 1;
            if (moduleId === "invoices" && payload.customer_id) {
              touchedCustomerIds.add(String(payload.customer_id));
            }
          } catch (rowError) {
            failed += 1;
            const rowErrorMessage = formatImportErrorMessage(rowError, "خطای نامشخص");
            const rowErrorDetails = getImportErrorParts(rowError);
            errors.push(`فاکتور ${record.key} در ردیف ${sourceLine}: ${rowErrorMessage}`);
            if (rowErrorDetails.length > 0) {
              errors.push(`جزئیات فنی: ${rowErrorDetails.join(" | ")}`);
            }
            if (isSystemicImportError(rowError)) {
              aborted = true;
              errors.push("واردسازی به دلیل خطای سیستمی/timeout متوقف شد تا درخواست‌های ناموفق پشت‌سرهم به سرور ارسال نشود.");
              break;
            }
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
            const linkedRelations = await resolveRelatedLinksForRow(row, importContext);
            const payloadRawWithLinks = { ...payloadRaw, ...linkedRelations };
            const payloadPrepared =
              moduleId === "tasks"
                ? attachTaskCompletionIfNeeded(payloadRawWithLinks as Record<string, unknown>)
                : payloadRawWithLinks;
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

            const { error } = await insertMainRecord(payload, `ثبت ردیف ${sourceLine}`);
            if (error) throw error;
            inserted += 1;
            if (moduleId === "invoices" && payload.customer_id) {
              touchedCustomerIds.add(String(payload.customer_id));
            }
          } catch (rowError) {
            failed += 1;
            const rowErrorMessage = formatImportErrorMessage(rowError, "خطای نامشخص");
            const rowErrorDetails = getImportErrorParts(rowError);
            errors.push(`ردیف ${sourceLine}: ${rowErrorMessage}`);
            if (rowErrorDetails.length > 0) {
              errors.push(`جزئیات فنی: ${rowErrorDetails.join(" | ")}`);
            }
            if (isSystemicImportError(rowError)) {
              aborted = true;
              errors.push("واردسازی به دلیل خطای سیستمی/timeout متوقف شد تا درخواست‌های ناموفق پشت‌سرهم به سرور ارسال نشود.");
              break;
            }
          }
        }
      }

      if (!aborted && moduleId === "invoices" && autoSyncCustomerStats && touchedCustomerIds.size > 0) {
        await syncCustomerLevelsByInvoiceCustomers({
          supabase: supabase as any,
          customerIds: Array.from(touchedCustomerIds),
        });
      }

      const baseMessage = `واردسازی انجام شد. جدید: ${inserted} | بروزرسانی: ${updated} | تکراری/ثبت‌نشده: ${skipped} | خطا: ${failed}`;
      if (aborted) {
        const summary = `${baseMessage} | واردسازی متوقف شد.`;
        const details = errors.slice(0, 8);
        setImportFeedback({ level: "error", summary, details });
        message.error(details[0] || summary);
        if (inserted > 0 || updated > 0) onImported?.();
        return;
      }

      if (failed > 0) {
        const details = errors.slice(0, 8);
        setImportFeedback({ level: "warning", summary: baseMessage, details });
        message.warning(baseMessage);
        if (details.length > 0) {
          message.error(details.slice(0, 3).join(" | "));
        }
        if (inserted > 0 || updated > 0) onImported?.();
        return;
      }

      setImportFeedback(null);
      message.success(baseMessage);
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
    duplicateStrategy,
    finalizeImportedPayload,
    findExistingRecord,
    groupedData.records,
    hasHeader,
    headerFieldByKey,
    headerImportableFields,
    importMode,
    insertMainRecord,
    itemFieldByKey,
    itemImportableFields,
    loadImportRuntimeContext,
    mappingRows,
    message,
    mergeInvoiceItems,
    moduleConfig.table,
    moduleId,
    onClose,
    onImported,
    parsedSheet.rows,
    requiredFields,
    resolveRelatedLinksForRow,
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
      if ((duplicateStrategy === "overwrite" || duplicateStrategy === "merge") && effectiveDuplicateFields.length === 0) {
        message.error("برای این روش، فیلد تطبیق را انتخاب کنید.");
        return;
      }
      setStep(2);
      return;
    }
    await handleImport();
  }, [
    duplicateStrategy,
    effectiveDuplicateFields.length,
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
            <Select
              {...wizardSelectProps}
              mode="multiple"
              showSearch
              allowClear
              optionFilterProp="searchLabel"
              value={duplicateFields}
              onChange={(values) => setDuplicateFields((values || []).map((value) => String(value)))}
              options={duplicateFieldSelectOptions}
              placeholder="یک یا چند فیلد را انتخاب کنید"
              className="w-full"
            />
            {duplicateFields.length === 0 && suggestedDuplicateFields.length > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                اگر چیزی انتخاب نکنید، به صورت خودکار از این فیلدها استفاده می‌شود:
                {" "}
                {suggestedDuplicateFields
                  .map((fieldKey) => duplicateFieldSelectOptions.find((item) => item.value === fieldKey)?.label || fieldKey)
                  .join("، ")}
              </div>
            )}
            {effectiveDuplicateFields.length === 0 && (
              <div className="mt-2 text-xs text-amber-600">
                هنوز فیلد مطمئنی برای تشخیص رکورد تکراری پیدا نشده است.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 px-3 py-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-gray-500">فیلدهای مرتبط</div>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={addRelatedModuleLink}
                disabled={parsedSheet.headers.length === 0}
              >
                افزودن فیلد مرتبط
              </Button>
            </div>
            {relatedModuleLinks.length === 0 ? (
              <div className="text-xs text-gray-400">در صورت نیاز می‌توانید یک یا چند اتصال به ماژول‌های دیگر تعریف کنید.</div>
            ) : (
              <div className="space-y-2">
                {relatedModuleLinks.map((link) => {
                  const matchFieldOptions = getRelatedMatchFieldOptions(link.targetModuleId);
                  const relationFieldOptions = linkableRelationFieldOptions
                    .filter((option) => option.targetModuleId === link.targetModuleId)
                    .map((option) => ({ value: option.key, label: option.label }));
                  return (
                    <div key={link.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">ستون فایل اکسل</div>
                          <Select
                            {...wizardSelectProps}
                            value={link.sourceColumn || undefined}
                            onChange={(value) => updateRelatedModuleLink(link.id, { sourceColumn: value })}
                            options={parsedSheet.headers.map((header) => ({ value: header, label: header }))}
                            className="w-full"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">ماژول مرجع</div>
                          <Select
                            {...wizardSelectProps}
                            value={link.targetModuleId || undefined}
                            onChange={(value) => updateRelatedModuleLink(link.id, { targetModuleId: value })}
                            options={relatedModuleOptions}
                            showSearch
                            optionFilterProp="label"
                            className="w-full"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">فیلد ارتباط در ماژول اصلی</div>
                          <Select
                            {...wizardSelectProps}
                            value={link.relationFieldKey || undefined}
                            onChange={(value) => updateRelatedModuleLink(link.id, { relationFieldKey: value || null })}
                            options={relationFieldOptions}
                            allowClear
                            placeholder="انتخاب فیلد رابطه"
                            className="w-full"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">فیلد تطبیق در ماژول مرجع</div>
                          <Select
                            {...wizardSelectProps}
                            value={link.matchFieldKey || undefined}
                            onChange={(value) => updateRelatedModuleLink(link.id, { matchFieldKey: value })}
                            options={matchFieldOptions}
                            showSearch
                            optionFilterProp="label"
                            className="w-full"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeRelatedModuleLink(link.id)}>
                          حذف
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
        {importFeedback && (
          <div
            className={`rounded-xl border px-3 py-2 text-sm ${
              importFeedback.level === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : importFeedback.level === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            <div className="font-bold">{importFeedback.summary}</div>
            {importFeedback.details.length > 0 && (
              <div className="mt-1 space-y-1">
                {importFeedback.details.slice(0, 5).map((detail, index) => (
                  <div key={`${index}-${detail}`} className="leading-6">
                    {detail}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
    addRelatedModuleLink,
    autoSyncCustomerStats,
    duplicateFields,
    duplicateFieldSelectOptions,
    duplicateStrategy,
    encoding,
    fileList,
    groupedData.missingGroupSourceLines.length,
    groupedData.records.length,
    groupingColumn,
    getRelatedMatchFieldOptions,
    handleRemoveFile,
    handleSelectFile,
    hasHeader,
    importFeedback,
    importMode,
    isParsing,
    linkableRelationFieldOptions,
    mappedRequiredFieldKeys,
    mappingTableColumns,
    mappingRows,
    moduleId,
    parsedSheet.headers,
    requiredFields,
    relatedModuleLinks,
    relatedModuleOptions,
    removeRelatedModuleLink,
    saveCustomMapping,
    step,
    supportsGroupedInvoiceImport,
    updateRelatedModuleLink,
    wizardSelectProps,
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
