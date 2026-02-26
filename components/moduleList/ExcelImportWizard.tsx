
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Checkbox,
  Empty,
  Input,
  Modal,
  Select,
  Spin,
  Table,
  Tag,
  Upload,
} from "antd";
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

type DuplicateStrategy = "skip" | "overwrite" | "merge";
type EncodingType = "utf-8" | "windows-1256";

type MappingRow = {
  sourceColumn: string;
  sampleValue: string;
  targetFieldKey: string | null;
  defaultValue: string;
};

type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
  firstRow: Record<string, string> | null;
};

type RelationLookupMap = Record<string, Map<string, string>>;

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
  const dateInfo = new Date(value);
  return Number.isNaN(dateInfo.getTime()) ? null : dateInfo;
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

const guessTargetField = (sourceColumn: string, fields: ModuleField[]): string | null => {
  const sourceKey = normalizeKey(sourceColumn);
  if (!sourceKey) return null;

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

const encodeForLookup = (value: unknown): string => normalizeKey(value);

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

  const [step, setStep] = useState<number>(0);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [hasHeader, setHasHeader] = useState<boolean>(true);
  const [encoding, setEncoding] = useState<EncodingType>("utf-8");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [rawMatrix, setRawMatrix] = useState<string[][]>([]);
  const [mappingRows, setMappingRows] = useState<MappingRow[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>("skip");
  const [duplicateFields, setDuplicateFields] = useState<string[]>([]);
  const [saveCustomMapping, setSaveCustomMapping] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

  const importableFields = useMemo(() => {
    return [...moduleConfig.fields]
      .filter((field) => IMPORTABLE_TYPES.has(field.type))
      .filter((field) => !field.readonly)
      .filter((field) => field.nature !== FieldNature.SYSTEM)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }, [moduleConfig.fields]);

  const fieldByKey = useMemo(() => {
    const map = new Map<string, ModuleField>();
    importableFields.forEach((field) => map.set(field.key, field));
    return map;
  }, [importableFields]);

  const requiredFields = useMemo(
    () => importableFields.filter((field) => field.validation?.required),
    [importableFields]
  );

  const parsedSheet = useMemo(() => matrixToSheetData(rawMatrix, hasHeader), [rawMatrix, hasHeader]);

  const mappedFieldKeys = useMemo(() => {
    return mappingRows
      .map((row) => row.targetFieldKey)
      .filter((key): key is string => Boolean(key));
  }, [mappingRows]);

  const mappedRequiredFieldKeys = useMemo(() => {
    const set = new Set(mappedFieldKeys);
    return requiredFields.filter((field) => set.has(field.key)).map((field) => field.key);
  }, [mappedFieldKeys, requiredFields]);

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
    setSelectedFile(null);
    setFileList([]);
    setRawMatrix([]);
    setMappingRows([]);
    setDuplicateStrategy("skip");
    setDuplicateFields([]);
    setSaveCustomMapping(false);
  }, []);

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
    if (!parsedSheet.headers.length) {
      setMappingRows([]);
      return;
    }
    const rows: MappingRow[] = parsedSheet.headers.map((header) => ({
      sourceColumn: header,
      sampleValue: parsedSheet.firstRow?.[header] ?? "",
      targetFieldKey: guessTargetField(header, importableFields),
      defaultValue: "",
    }));
    setMappingRows(rows);
  }, [importableFields, parsedSheet.firstRow, parsedSheet.headers]);

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
        message.error(`خطا در خواندن فایل: ${error instanceof Error ? error.message : "نامشخص"}`);
      }
    },
    [encoding, message, parseFile]
  );

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setFileList([]);
    setRawMatrix([]);
    setMappingRows([]);
  }, []);

  const updateMappingRow = useCallback(
    (sourceColumn: string, patch: Partial<MappingRow>) => {
      setMappingRows((prev) =>
        prev.map((row) => (row.sourceColumn === sourceColumn ? { ...row, ...patch } : row))
      );
    },
    []
  );

  const convertValueByType = useCallback(
    (
      field: ModuleField,
      rawValue: string,
      relationLookups: RelationLookupMap
    ): unknown => {
      const value = String(rawValue ?? "").trim();
      if (!value) return undefined;

      if ((field.type === FieldType.SELECT || field.type === FieldType.STATUS) && field.options?.length) {
        const byValue = field.options.find((option) => normalizeKey(option.value) === normalizeKey(value));
        if (byValue) return byValue.value;
        const byLabel = field.options.find((option) => normalizeKey(option.label) === normalizeKey(value));
        if (byLabel) return byLabel.value;
      }

      if (
        field.type === FieldType.RELATION ||
        field.type === FieldType.USER
      ) {
        const map = relationLookups[field.key];
        if (!map) return value;
        const exact = map.get(encodeForLookup(value));
        if (exact) return exact;
        return value;
      }

      switch (field.type) {
        case FieldType.NUMBER:
        case FieldType.PRICE:
        case FieldType.STOCK:
        case FieldType.PERCENTAGE: {
          const numberVal = parseNumber(value);
          return numberVal ?? undefined;
        }
        case FieldType.CHECKBOX: {
          const boolVal = parseBoolean(value);
          return boolVal ?? undefined;
        }
        case FieldType.DATE: {
          const date = resolveDate(value);
          return date ? date.toISOString().slice(0, 10) : value;
        }
        case FieldType.DATETIME: {
          const date = resolveDate(value);
          return date ? date.toISOString() : value;
        }
        case FieldType.MULTI_SELECT:
        case FieldType.CHECKLIST:
        case FieldType.TAGS:
          return splitByDelimiters(value);
        case FieldType.PHONE:
          return toEnglishDigits(value).replace(/[^\d+]/g, "");
        default:
          return value;
      }
    },
    []
  );

  const loadRelationLookups = useCallback(async (): Promise<RelationLookupMap> => {
    const mappedTargets = mappingRows
      .map((row) => row.targetFieldKey)
      .filter((key): key is string => Boolean(key));
    const uniqueKeys = Array.from(new Set(mappedTargets));
    const relationFields: ModuleField[] = [];
    uniqueKeys.forEach((key) => {
      const field = fieldByKey.get(key);
      if (!field) return;
      if (field.type === FieldType.RELATION || field.type === FieldType.USER) {
        relationFields.push(field);
      }
    });

    const lookupMap: RelationLookupMap = {};
    for (const field of relationFields) {
      const map = new Map<string, string>();
      if (field.type === FieldType.USER) {
        const { data } = await withTimeout(
          supabase.from("profiles").select("id, full_name"),
          20000,
          "دریافت کاربران برای تطبیق"
        );
        (data || []).forEach((item: { id: string; full_name: string | null }) => {
          map.set(encodeForLookup(item.id), item.id);
          if (item.full_name) map.set(encodeForLookup(item.full_name), item.id);
        });
      } else if (field.relationConfig?.targetModule) {
        const targetField = field.relationConfig.targetField || "name";
        const columns = ["id", targetField];
        if (targetField !== "system_code") columns.push("system_code");
        const { data } = await withTimeout(
          supabase
            .from(field.relationConfig.targetModule)
            .select(columns.join(", "))
            .limit(5000),
          20000,
          `دریافت داده مرجع (${field.labels.fa})`
        );
        const rows = (data || []) as unknown as Record<string, unknown>[];
        rows.forEach((item) => {
          const id = String(item.id ?? "");
          if (!id) return;
          map.set(encodeForLookup(id), id);
          const title = item[targetField];
          if (title) map.set(encodeForLookup(String(title)), id);
          const systemCode = item.system_code;
          if (systemCode) map.set(encodeForLookup(String(systemCode)), id);
          if (title && systemCode) {
            map.set(encodeForLookup(`${title} (${systemCode})`), id);
          }
        });
      }
      lookupMap[field.key] = map;
    }

    return lookupMap;
  }, [fieldByKey, mappingRows]);

  const buildPayloadFromRow = useCallback(
    (
      row: Record<string, string>,
      relationLookups: RelationLookupMap
    ): Record<string, unknown> => {
      const payload: Record<string, unknown> = {};

      mappingRows.forEach((mapping) => {
        if (!mapping.targetFieldKey) return;
        const field = fieldByKey.get(mapping.targetFieldKey);
        if (!field) return;

        const rawValue = row[mapping.sourceColumn] ?? "";
        const converted = convertValueByType(field, rawValue, relationLookups);
        if (!isValueEmpty(converted)) {
          payload[field.key] = converted;
          return;
        }

        if (mapping.defaultValue.trim() !== "") {
          const defaultConverted = convertValueByType(field, mapping.defaultValue, relationLookups);
          if (!isValueEmpty(defaultConverted)) payload[field.key] = defaultConverted;
        }
      });

      importableFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(payload, field.key)) return;
        if (field.defaultValue === undefined || field.defaultValue === null) return;
        payload[field.key] = field.defaultValue;
      });

      return payload;
    },
    [convertValueByType, fieldByKey, importableFields, mappingRows]
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
    message,
    missingRequiredFields,
    parsedSheet.rows.length,
    selectedFile,
  ]);

  const handleImport = useCallback(async () => {
    if (!validateBeforeImport()) return;
    setIsImporting(true);
    setImportProgress({ current: 0, total: parsedSheet.rows.length });
    try {
      const relationLookups = await withTimeout(
        loadRelationLookups(),
        30000,
        "آماده‌سازی تطبیق روابط"
      );
      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let idx = 0; idx < parsedSheet.rows.length; idx += 1) {
        const row = parsedSheet.rows[idx];
        const sourceLine = hasHeader ? idx + 2 : idx + 1;
        setImportProgress({ current: idx + 1, total: parsedSheet.rows.length });

        if (!buildRowHasAnyValue(row)) continue;

        const payloadRaw = buildPayloadFromRow(row, relationLookups);
        const payload =
          moduleId === "tasks"
            ? attachTaskCompletionIfNeeded(payloadRaw as Record<string, unknown>)
            : payloadRaw;

        const missingInRow = requiredFields.filter((field) => isValueEmpty(payload[field.key]));
        if (missingInRow.length > 0) {
          failed += 1;
          errors.push(`ردیف ${sourceLine}: مقدار فیلدهای اجباری کامل نیست.`);
          continue;
        }

        try {
          let existingRecord: Record<string, unknown> | null = null;

          if (duplicateFields.length > 0) {
            const duplicateFilter = duplicateFields.reduce<Record<string, unknown>>((acc, fieldKey) => {
              const value = payload[fieldKey];
              if (!isValueEmpty(value)) acc[fieldKey] = value;
              return acc;
            }, {});

            if (Object.keys(duplicateFilter).length === duplicateFields.length) {
              let query = supabase.from(moduleConfig.table).select("*").limit(1);
              Object.entries(duplicateFilter).forEach(([key, value]) => {
                query = query.eq(key, value as never);
              });
              const { data } = await withTimeout(
                Promise.resolve(query),
                20000,
                `بررسی تکراری بودن ردیف ${sourceLine}`
              );
              existingRecord = (data && data[0] ? (data[0] as Record<string, unknown>) : null);
            }
          }

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
            continue;
          }

          const { error } = await withTimeout(
            supabase.from(moduleConfig.table).insert(payload),
            20000,
            `ثبت ردیف ${sourceLine}`
          );
          if (error) throw error;
          inserted += 1;
        } catch (rowError) {
          failed += 1;
          errors.push(
            `ردیف ${sourceLine}: ${rowError instanceof Error ? rowError.message : "خطای نامشخص"}`
          );
        }
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
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  }, [
    buildPayloadFromRow,
    duplicateFields,
    duplicateStrategy,
    hasHeader,
    loadRelationLookups,
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
              mode="multiple"
              value={duplicateFields}
              onChange={(values) => setDuplicateFields(values)}
              className="w-full"
              optionFilterProp="label"
              options={importableFields.map((field) => ({
                label: field.labels.fa,
                value: field.key,
              }))}
              placeholder="انتخاب فیلدهای تطبیق"
            />
          </div>
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

        <Table<MappingRow>
          rowKey="sourceColumn"
          pagination={false}
          dataSource={mappingRows}
          size="middle"
          scroll={{ y: 300 }}
          columns={[
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
            {
              title: "فیلد های موجود",
              dataIndex: "targetFieldKey",
              key: "targetFieldKey",
              width: 320,
              render: (value: string | null, row: MappingRow) => (
                <Select
                  value={value}
                  allowClear
                  className="w-full"
                  optionFilterProp="label"
                  placeholder="انتخاب فیلد"
                  onChange={(nextValue) =>
                    updateMappingRow(row.sourceColumn, { targetFieldKey: nextValue || null })
                  }
                  options={importableFields.map((field) => ({
                    label: field.labels.fa,
                    value: field.key,
                    disabled:
                      Boolean(field.key !== value) &&
                      mappedFieldKeys.includes(field.key),
                  }))}
                />
              ),
            },
            {
              title: "مقدار پیش فرض",
              dataIndex: "defaultValue",
              key: "defaultValue",
              width: 220,
              render: (value: string, row: MappingRow) => (
                <Input
                  value={value}
                  onChange={(event) =>
                    updateMappingRow(row.sourceColumn, { defaultValue: event.target.value })
                  }
                  placeholder="اختیاری"
                />
              ),
            },
          ]}
        />
      </div>
    );
  }, [
    duplicateFields,
    duplicateStrategy,
    fileList,
    handleRemoveFile,
    handleSelectFile,
    hasHeader,
    importableFields,
    isParsing,
    mappedFieldKeys,
    mappedRequiredFieldKeys,
    mappingRows,
    requiredFields,
    saveCustomMapping,
    step,
    updateMappingRow,
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
