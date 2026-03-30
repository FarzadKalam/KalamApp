import { MODULES } from '../moduleRegistry';
import { FieldType } from '../types';
import { formatPhoneForDisplay } from './phoneNumber';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from './persianNumberFormatter';

const TEMPLATE_TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

const cleanText = (value: unknown) => String(value ?? '').trim();

const dedupeSegments = (segments: string[]) => {
  const seen = new Set<string>();
  return segments.filter((segment) => {
    const key = cleanText(segment).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getRelationDisplayConfig = (moduleId: string) => MODULES[String(moduleId || '').trim()]?.relationDisplay;

export const getRelationDisplayFields = (moduleId: string, targetField: string) => {
  const moduleConfig = MODULES[String(moduleId || '').trim()];
  const displayConfig = moduleConfig?.relationDisplay;
  const moduleFieldKeys = new Set((moduleConfig?.fields || []).map((field) => String(field?.key || '').trim()).filter(Boolean));
  const templateKeys = Array.from(
    new Set(
      Array.from(displayConfig?.labelTemplate?.matchAll(TEMPLATE_TOKEN_REGEX) || []).map((match) => String(match?.[1] || '').trim()).filter(Boolean)
    )
  );

  return Array.from(
    new Set(
      [
        String(targetField || '').trim(),
        ...templateKeys,
        ...(moduleFieldKeys.has('system_code') ? ['system_code'] : []),
      ].filter(Boolean)
    )
  );
};

export const getRelationSearchFields = (moduleId: string, targetField: string) => {
  const moduleConfig = MODULES[String(moduleId || '').trim()];
  const searchableTextFieldTypes = new Set([
    FieldType.TEXT,
    FieldType.LONG_TEXT,
    FieldType.SUPER_LONG_TEXT,
    FieldType.SELECT,
    FieldType.MULTI_SELECT,
    FieldType.STATUS,
    FieldType.PHONE,
    FieldType.LINK,
    FieldType.TAGS,
  ]);
  const searchableFieldKeys = new Set(
    (moduleConfig?.fields || [])
      .filter((field) => searchableTextFieldTypes.has(field?.type as FieldType) || String(field?.key || '').trim() === 'system_code')
      .map((field) => String(field?.key || '').trim())
      .filter(Boolean)
  );
  const displayConfig = moduleConfig?.relationDisplay;
  const configuredSearchFields = Array.isArray(displayConfig?.searchFields)
    ? displayConfig.searchFields.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  const fallbackSearchFields = [
    String(targetField || '').trim(),
    'name',
    'title',
    'full_name',
    'business_name',
    'legal_name',
    'system_code',
  ].filter(Boolean);

  const sourceFields = configuredSearchFields.length > 0 ? configuredSearchFields : fallbackSearchFields;

  return Array.from(
    new Set(
      sourceFields.filter((fieldKey) => searchableFieldKeys.has(fieldKey))
    )
  );
};

const formatValueByFieldType = (moduleId: string, fieldKey: string, rawValue: any) => {
  const moduleConfig = MODULES[String(moduleId || '').trim()];
  const field = moduleConfig?.fields?.find((item) => String(item?.key || '') === String(fieldKey || ''));
  const value = rawValue;

  if (value === null || value === undefined || value === '') return '';

  switch (field?.type) {
    case FieldType.PRICE:
    case FieldType.PERCENTAGE_OR_AMOUNT: {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? formatPersianPrice(parsed) : cleanText(value);
    }
    case FieldType.NUMBER:
    case FieldType.STOCK:
    case FieldType.PERCENTAGE:
      return toPersianNumber(String(value));
    case FieldType.DATE:
      return toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD') || String(value));
    case FieldType.DATETIME:
      return toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || String(value));
    case FieldType.PHONE: {
      const formatted = formatPhoneForDisplay(value);
      return toPersianNumber(formatted || String(value));
    }
    default:
      return cleanText(value);
  }
};

const renderTemplateSegment = (moduleId: string, row: any, segment: string) => {
  const tokens = Array.from(segment.matchAll(TEMPLATE_TOKEN_REGEX)).map((match) => String(match?.[1] || '').trim()).filter(Boolean);
  if (tokens.length === 0) return cleanText(segment);
  if (tokens.every((token) => !cleanText(row?.[token]))) return '';

  let output = segment;
  tokens.forEach((token) => {
    const formattedValue = formatValueByFieldType(moduleId, token, row?.[token]);
    output = output.replace(new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, 'g'), formattedValue);
  });
  return cleanText(output);
};

const buildTemplateLabel = (moduleId: string, row: any, template: string) => {
  const hasDashSegments = template.includes(' - ');
  if (!hasDashSegments) {
    return renderTemplateSegment(moduleId, row, template);
  }

  const parts = template.split(/\s-\s/g).map((segment) => renderTemplateSegment(moduleId, row, segment)).filter(Boolean);
  return dedupeSegments(parts).join(' - ');
};

export const buildRelationDisplayLabel = (moduleId: string, row: any, targetField: string) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const displayConfig = getRelationDisplayConfig(normalizedModuleId);
  const template = String(displayConfig?.labelTemplate || '').trim();

  if (template) {
    const rendered = buildTemplateLabel(normalizedModuleId, row, template);
    if (rendered) return rendered;
  }

  const baseValue = cleanText(
    row?.[targetField] ||
    row?.name ||
    row?.title ||
    row?.full_name ||
    row?.business_name ||
    row?.legal_name ||
    row?.system_code ||
    row?.id
  );
  const systemCode = cleanText(row?.system_code);
  if (!baseValue) return 'بدون عنوان';
  if (systemCode && systemCode !== baseValue) {
    return `${baseValue} - ${systemCode}`;
  }
  return baseValue;
};

export const buildRelationDisplaySearchText = (moduleId: string, row: any, targetField: string) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const searchFields = getRelationSearchFields(normalizedModuleId, targetField);

  return Array.from(new Set(searchFields))
    .map((fieldKey) => cleanText(row?.[fieldKey]).toLowerCase())
    .filter(Boolean)
    .join(' ');
};
