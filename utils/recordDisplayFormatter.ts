import { MODULES } from '../moduleRegistry';
import { FieldType } from '../types';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from './persianNumberFormatter';
import { getRelationDisplayFields } from './relationDisplay';
import { getRecordDisplayLabel } from './recordLabel';
import { getPreferredRelationTargetField } from './relationTargetField';
import { supportsSystemCode } from './systemCode';

export type RelationValueMap = Record<string, Record<string, string>>;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeFieldType = (field?: any) => String(field?.type || '').trim().toLowerCase();

const isRelationLikeField = (field?: any) => {
  const fieldType = normalizeFieldType(field);
  return (
    fieldType === String(FieldType.RELATION).toLowerCase()
    || fieldType === String(FieldType.USER).toLowerCase()
  );
};

const normalizeValueKey = (value: any) => String(value ?? '').trim();

const mergeRelationMaps = (...maps: RelationValueMap[]): RelationValueMap => {
  const next: RelationValueMap = {};
  maps.forEach((map) => {
    Object.entries(map || {}).forEach(([fieldKey, entries]) => {
      next[fieldKey] = {
        ...(next[fieldKey] || {}),
        ...(entries || {}),
      };
    });
  });
  return next;
};

const collectRelationIds = (value: any): string[] => {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) {
    return Array.from(new Set(value.flatMap((item) => collectRelationIds(item))));
  }
  if (typeof value === 'object') {
    if (value?.id) return collectRelationIds(value.id);
    if (value?.value) return collectRelationIds(value.value);
    return [];
  }
  return [normalizeValueKey(value)].filter(Boolean);
};

export const parseMaybeJsonValue = (value: any) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
};

export const resolveOptionLabel = (value: any, field?: any) => {
  if (!field?.options?.length) return null;
  const matched = field.options.find((option: any) => String(option?.value) === String(value));
  return matched?.label || null;
};

export const resolveRelationFieldFallbackLabel = (row: any, field?: any) => {
  const fieldKey = String(field?.key || '').trim();
  if (!fieldKey || !row || typeof row !== 'object') return null;
  const candidates = [
    row?.[`${fieldKey}_label`],
    row?.[`${fieldKey}_name`],
    row?.[`${fieldKey}_title`],
  ];
  const found = candidates.find((entry) => entry !== undefined && entry !== null && String(entry).trim() !== '');
  return found ? String(found).trim() : null;
};

export const buildRelationValueMap = async (
  supabase: any,
  fields: any[],
  rows: any[],
): Promise<RelationValueMap> => {
  if (!fields?.length || !rows?.length) return {};

  const relationFields = fields.filter((field) => isRelationLikeField(field) && field?.key);
  if (!relationFields.length) return {};

  const entries = await Promise.all(
    relationFields.map(async (field) => {
      const fieldKey = String(field.key);
      const ids = Array.from(new Set(
        rows.flatMap((row) => collectRelationIds(row?.[fieldKey])),
      )).filter(Boolean);

      if (!ids.length) return [fieldKey, {}] as const;

      const isUserField = normalizeFieldType(field) === String(FieldType.USER).toLowerCase();
      const targetModule = isUserField
        ? 'profiles'
        : String(field?.relationConfig?.targetModule || '').trim();
      if (!targetModule) return [fieldKey, {}] as const;

      const targetField = getPreferredRelationTargetField(
        targetModule,
        isUserField ? 'full_name' : String(field?.relationConfig?.targetField || ''),
      );
      const targetModuleConfig = MODULES[targetModule];
      const targetTable = targetModuleConfig?.table || targetModule;
      const selectFields = getRelationDisplayFields(targetModule, targetField);

      const relationRowsQuery = await supabase
        .from(targetTable)
        .select(selectFields.join(', '))
        .in('id', ids);

      if (relationRowsQuery.error) {
        const fallbackFields = Array.from(new Set([
          'id',
          targetField,
          ...(supportsSystemCode(targetModule) ? ['system_code'] : []),
        ]));
        const fallbackQuery = await supabase
          .from(targetTable)
          .select(fallbackFields.join(', '))
          .in('id', ids);
        if (fallbackQuery.error) {
          return [fieldKey, {}] as const;
        }
        const fallbackMap: Record<string, string> = {};
        for (const row of (fallbackQuery.data || []) as any[]) {
          const label = getRecordDisplayLabel(row, targetModule, { fallback: '' });
          if (label) fallbackMap[String(row.id)] = label;
        }
        return [fieldKey, fallbackMap] as const;
      }

      const nextMap: Record<string, string> = {};
      for (const row of (relationRowsQuery.data || []) as any[]) {
        const label = getRecordDisplayLabel(row, targetModule, { fallback: '' });
        if (label) nextMap[String(row.id)] = label;
      }

      return [fieldKey, nextMap] as const;
    }),
  );

  return Object.fromEntries(entries);
};

export const combineRelationValueMaps = (...maps: RelationValueMap[]) => mergeRelationMaps(...maps);

export const formatRecordDisplayValue = (
  value: any,
  field?: any,
  relationValueMap: RelationValueMap = {},
  emptyLabel = '-',
): string => {
  if (value === null || value === undefined || value === '') return emptyLabel;

  if (Array.isArray(value)) {
    const items = value
      .map((item) => formatRecordDisplayValue(item, field, relationValueMap, emptyLabel))
      .filter((item) => item && item !== emptyLabel);
    return items.length ? items.join('، ') : emptyLabel;
  }

  if (typeof value === 'object') {
    if (value?.label) return String(value.label);
    if (value?.value !== undefined) return formatRecordDisplayValue(value.value, field, relationValueMap, emptyLabel);
    try {
      return toPersianNumber(JSON.stringify(value));
    } catch {
      return emptyLabel;
    }
  }

  const fieldType = normalizeFieldType(field);
  const fieldKey = String(field?.key || '').trim();
  const rawString = String(value);
  const optionLabel = resolveOptionLabel(value, field);
  if (optionLabel) return optionLabel;

  if ((fieldType === String(FieldType.RELATION).toLowerCase() || fieldType === String(FieldType.USER).toLowerCase()) && fieldKey) {
    const relatedLabel = relationValueMap?.[fieldKey]?.[normalizeValueKey(value)];
    if (relatedLabel) return relatedLabel;
    if (UUID_REGEX.test(rawString)) return 'مورد مرتبط';
  }

  if (fieldType === String(FieldType.PRICE).toLowerCase() || fieldType === String(FieldType.PERCENTAGE_OR_AMOUNT).toLowerCase()) {
    return formatPersianPrice(value);
  }
  if (
    fieldType === String(FieldType.NUMBER).toLowerCase()
    || fieldType === String(FieldType.STOCK).toLowerCase()
    || fieldType === String(FieldType.PERCENTAGE).toLowerCase()
    || fieldType === String(FieldType.TIME).toLowerCase()
  ) {
    return toPersianNumber(rawString);
  }
  if (fieldType === String(FieldType.DATE).toLowerCase()) {
    return toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD') || rawString);
  }
  if (fieldType === String(FieldType.DATETIME).toLowerCase()) {
    return toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || rawString);
  }
  if (fieldType === String(FieldType.CHECKBOX).toLowerCase()) {
    return value ? 'بله' : 'خیر';
  }

  if (typeof value === 'boolean') return value ? 'بله' : 'خیر';

  return toPersianNumber(rawString);
};

export const formatRecordFieldValue = (
  row: any,
  field?: any,
  relationValueMap: RelationValueMap = {},
  emptyLabel = '-',
): string => {
  const fieldKey = String(field?.key || '').trim();
  const value = fieldKey ? row?.[fieldKey] : undefined;
  const optionLabel = resolveOptionLabel(value, field);
  if (optionLabel) return optionLabel;

  const relationFallbackLabel = resolveRelationFieldFallbackLabel(row, field);
  if (relationFallbackLabel) return relationFallbackLabel;

  return formatRecordDisplayValue(value, field, relationValueMap, emptyLabel);
};
