import { MODULES } from '../moduleRegistry';
import { FieldType } from '../types';
import { parseProcessLinkedFieldKey } from './processTargets';
import { parseWorkflowRelatedFieldKey } from './workflowTypes';
import { formatPersianPrice, formatPersianTime, safeJalaliFormat, toPersianNumber } from './persianNumberFormatter';
import { readCurrencyConfig } from './currency';

type RenderTemplateOptions = {
  moduleId?: string | null;
  bold?: boolean;
};

type FormatTemplateValueOptions = {
  value: unknown;
  moduleId?: string | null;
  fieldKey?: string | null;
};

const DATE_ONLY_REGEX = /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/;
const DATE_TIME_REGEX =
  /^\d{4}[/-]\d{1,2}[/-]\d{1,2}[ tT]\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:[zZ]|[+-]\d{2}:?\d{2})?$/;
const TIME_ONLY_REGEX = /^\d{1,2}:\d{2}(?::\d{2})?(?:[zZ]|[+-]\d{2}:?\d{2})?$/;

const normalizeFieldType = (value: unknown) => String(value || '').trim().toLowerCase();

const readFieldTypeFromModule = (moduleId: string | null | undefined, key: string): string | null => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedKey = String(key || '').trim();
  if (!normalizedModuleId || !normalizedKey) return null;

  const moduleConfig: any = MODULES[normalizedModuleId];
  if (!moduleConfig) return null;

  const fields = Array.isArray(moduleConfig.fields) ? moduleConfig.fields : [];
  const blocks = Array.isArray(moduleConfig.blocks) ? moduleConfig.blocks : [];
  const fallbackKey = normalizedKey.includes('.') ? normalizedKey.split('.').pop() || '' : '';

  const directField = fields.find((field: any) => String(field?.key || '').trim() === normalizedKey);
  if (directField?.type) return normalizeFieldType(directField.type);
  if (fallbackKey) {
    const fallbackField = fields.find((field: any) => String(field?.key || '').trim() === fallbackKey);
    if (fallbackField?.type) return normalizeFieldType(fallbackField.type);
  }

  for (const block of blocks) {
    const blockId = String(block?.id || '').trim();
    const columns = Array.isArray(block?.tableColumns) ? block.tableColumns : [];
    const column = columns.find((col: any) => {
      const colKey = String(col?.key || '').trim();
      if (!colKey) return false;
      if (colKey === normalizedKey) return true;
      if (blockId && `${blockId}.${colKey}` === normalizedKey) return true;
      if (fallbackKey && colKey === fallbackKey) return true;
      return false;
    });
    if (column?.type) return normalizeFieldType(column.type);
  }

  return null;
};

const resolveFieldContext = (moduleId: string | null | undefined, fieldKey: string | null | undefined) => {
  const normalizedFieldKey = String(fieldKey || '').trim();
  const defaultModuleId = String(moduleId || '').trim();
  if (!normalizedFieldKey) {
    return { moduleId: defaultModuleId || null, key: '', fieldType: null as string | null };
  }

  const linked = parseProcessLinkedFieldKey(normalizedFieldKey);
  if (linked) {
    return {
      moduleId: linked.moduleId || null,
      key: linked.targetFieldKey || '',
      fieldType: readFieldTypeFromModule(linked.moduleId, linked.targetFieldKey),
    };
  }

  const related = parseWorkflowRelatedFieldKey(normalizedFieldKey);
  if (related) {
    return {
      moduleId: related.targetModuleId || null,
      key: related.targetFieldKey || '',
      fieldType: readFieldTypeFromModule(related.targetModuleId, related.targetFieldKey),
    };
  }

  return {
    moduleId: defaultModuleId || null,
    key: normalizedFieldKey,
    fieldType: readFieldTypeFromModule(defaultModuleId || null, normalizedFieldKey),
  };
};

const formatPriceWithCurrency = (value: unknown) => {
  const formatted = String(formatPersianPrice(value, true) || '').trim();
  if (!formatted) return '';
  const currencyLabel = String(readCurrencyConfig().label || '').trim();
  return currencyLabel ? `${formatted} ${currencyLabel}` : formatted;
};

const formatDateLikeValue = (value: unknown, forceDateTime = false): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const fmt = forceDateTime ? 'YYYY/MM/DD HH:mm' : 'YYYY/MM/DD HH:mm';
    const dateValue = safeJalaliFormat(value, fmt);
    return dateValue ? toPersianNumber(dateValue) : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (DATE_TIME_REGEX.test(trimmed)) {
    const out = safeJalaliFormat(trimmed, 'YYYY/MM/DD HH:mm');
    return out ? toPersianNumber(out) : null;
  }
  if (DATE_ONLY_REGEX.test(trimmed)) {
    const out = safeJalaliFormat(trimmed, 'YYYY/MM/DD');
    return out ? toPersianNumber(out) : null;
  }
  if (TIME_ONLY_REGEX.test(trimmed)) {
    const out = formatPersianTime(trimmed);
    return out ? toPersianNumber(out) : null;
  }
  return null;
};

export const formatTemplateValueByField = ({
  value,
  moduleId,
  fieldKey,
}: FormatTemplateValueOptions): string => {
  if (value === null || value === undefined) return '';

  const fieldContext = resolveFieldContext(moduleId, fieldKey);
  const fieldType = normalizeFieldType(fieldContext.fieldType);

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        formatTemplateValueByField({
          value: item,
          moduleId: fieldContext.moduleId,
          fieldKey: fieldContext.key,
        })
      )
      .filter(Boolean)
      .join(', ');
  }

  if (fieldType === FieldType.PRICE) {
    return formatPriceWithCurrency(value);
  }
  if (fieldType === FieldType.DATE) {
    const out = safeJalaliFormat(value, 'YYYY/MM/DD');
    return out ? toPersianNumber(out) : String(value);
  }
  if (fieldType === FieldType.DATETIME) {
    const out = safeJalaliFormat(value, 'YYYY/MM/DD HH:mm');
    return out ? toPersianNumber(out) : String(value);
  }
  if (fieldType === FieldType.TIME) {
    const out = formatPersianTime(value);
    return out ? toPersianNumber(out) : String(value);
  }

  if (typeof value === 'object') {
    const namedObject = value as Record<string, any>;
    const preferredKeys = ['label', 'title', 'name', 'full_name', 'business_name', 'system_code'];
    for (const key of preferredKeys) {
      const candidate = namedObject?.[key];
      if (candidate !== null && candidate !== undefined && String(candidate).trim()) {
        return String(candidate);
      }
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  const fallbackDate = formatDateLikeValue(value);
  if (fallbackDate) return fallbackDate;
  return String(value);
};

const resolveValueFromRecord = (record: Record<string, any> | null | undefined, path: string) => {
  if (!path) return null;
  const segments = String(path || '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
  let current: any = record || {};
  for (const segment of segments) {
    current = current?.[segment];
    if (current === null || current === undefined) break;
  }
  return current;
};

export const renderTemplateText = (
  template: string,
  record: Record<string, any> | null | undefined,
  options: RenderTemplateOptions = {}
) =>
  String(template || '').replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key: string) => {
    const fieldKey = String(key || '').trim();
    if (!fieldKey) return '';
    const value = resolveValueFromRecord(record || {}, fieldKey);
    const rendered = formatTemplateValueByField({
      value,
      moduleId: options.moduleId,
      fieldKey,
    }).trim();
    if (!options.bold) return rendered;
    return rendered ? `**${rendered}**` : '';
  });
