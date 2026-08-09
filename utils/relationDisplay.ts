import { MODULES } from '../moduleRegistry';
import { FieldType } from '../types';
import { BOT_VIRTUAL_FIELD_KEYS, isBotTargetModuleId } from './botPlatform';
import { formatPhoneForDisplay } from './phoneNumber';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from './persianNumberFormatter';
import {
  getPreferredRelationTargetField,
  getRelationSelectableFields,
  normalizeRelationFieldAlias,
} from './relationTargetField';

const TEMPLATE_TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

const cleanText = (value: unknown) => String(value ?? '').trim();
const isStoredRelationFieldKey = (moduleId: string, fieldKey: string) =>
  !(isBotTargetModuleId(moduleId) && BOT_VIRTUAL_FIELD_KEYS.has(String(fieldKey || '').trim()));

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

const normalizeConfiguredRelationField = (moduleId: string, fieldKey: string) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedFieldKey = normalizeRelationFieldAlias(normalizedModuleId, fieldKey);
  if (!normalizedFieldKey) return '';
  const safeSelectableFields = getRelationSelectableFields(normalizedModuleId);
  if (safeSelectableFields.length > 0 && !safeSelectableFields.includes(normalizedFieldKey)) {
    return '';
  }
  return normalizedFieldKey;
};

export const getRelationDisplayFields = (moduleId: string, targetField: string) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const moduleConfig = MODULES[normalizedModuleId];
  const resolvedTargetField = normalizeConfiguredRelationField(
    normalizedModuleId,
    getPreferredRelationTargetField(normalizedModuleId, targetField)
  );
  const displayConfig = moduleConfig?.relationDisplay;
  const moduleFieldKeys = new Set((moduleConfig?.fields || []).map((field) => String(field?.key || '').trim()).filter(Boolean));
  const templateKeys = Array.from(
    new Set(
      Array.from(displayConfig?.labelTemplate?.matchAll(TEMPLATE_TOKEN_REGEX) || [])
        .map((match) => normalizeConfiguredRelationField(normalizedModuleId, String(match?.[1] || '').trim()))
        .filter(Boolean)
    )
  );

  return Array.from(
    new Set(
      [
        String(resolvedTargetField || '').trim(),
        ...templateKeys,
        ...(normalizedModuleId === 'customers' && moduleFieldKeys.has('auto_name_enabled') ? ['auto_name_enabled'] : []),
        ...(moduleFieldKeys.has('system_code') ? ['system_code'] : []),
      ].filter((fieldKey) => Boolean(fieldKey) && isStoredRelationFieldKey(normalizedModuleId, fieldKey))
    )
  );
};

export const getRelationSearchFields = (moduleId: string, targetField: string) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const moduleConfig = MODULES[normalizedModuleId];
  const resolvedTargetField = normalizeConfiguredRelationField(
    normalizedModuleId,
    getPreferredRelationTargetField(normalizedModuleId, targetField)
  );
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
    ? displayConfig.searchFields
        .map((item) => normalizeConfiguredRelationField(normalizedModuleId, String(item || '').trim()))
        .filter(Boolean)
    : [];

  const fallbackSearchFields = [
    resolvedTargetField,
    normalizeConfiguredRelationField(normalizedModuleId, 'name'),
    normalizeConfiguredRelationField(normalizedModuleId, 'title'),
    normalizeConfiguredRelationField(normalizedModuleId, 'full_name'),
    normalizeConfiguredRelationField(normalizedModuleId, 'email'),
    normalizeConfiguredRelationField(normalizedModuleId, 'mobile'),
    normalizeConfiguredRelationField(normalizedModuleId, 'phone'),
    normalizeConfiguredRelationField(normalizedModuleId, 'business_name'),
    normalizeConfiguredRelationField(normalizedModuleId, 'legal_name'),
    normalizeConfiguredRelationField(normalizedModuleId, 'system_code'),
  ].filter(Boolean);

  const sourceFields = configuredSearchFields.length > 0 ? configuredSearchFields : fallbackSearchFields;

  return Array.from(
    new Set(
      sourceFields.filter((fieldKey) => searchableFieldKeys.has(fieldKey) && isStoredRelationFieldKey(normalizedModuleId, fieldKey))
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
  const normalizedTokens = new Map(
    tokens.map((token) => [token, normalizeConfiguredRelationField(moduleId, token)])
  );
  if (tokens.every((token) => !cleanText(row?.[normalizedTokens.get(token) || token]))) return '';

  let output = segment;
  tokens.forEach((token) => {
    const normalizedToken = normalizedTokens.get(token) || token;
    const formattedValue = formatValueByFieldType(moduleId, normalizedToken, row?.[normalizedToken]);
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
  const resolvedTargetField = getPreferredRelationTargetField(normalizedModuleId, targetField);
  const displayConfig = getRelationDisplayConfig(normalizedModuleId);
  const template = String(displayConfig?.labelTemplate || '').trim();

  if (normalizedModuleId === 'customers' && row?.auto_name_enabled === true) {
    const autoName = cleanText(row?.full_name);
    if (autoName) return autoName;
  }

  if (template) {
    const rendered = buildTemplateLabel(normalizedModuleId, row, template);
    if (rendered) return rendered;
  }

  const baseValue = cleanText(
    row?.[resolvedTargetField] ||
    row?.name ||
    row?.title ||
    row?.full_name ||
    row?.email ||
    row?.mobile ||
    row?.phone ||
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
