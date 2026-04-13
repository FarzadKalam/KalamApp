import { MODULES } from '../moduleRegistry';
import { getRecordTitle } from './recordTitle';
import { buildRelationDisplayLabel } from './relationDisplay';
import { getPreferredRelationTargetField } from './relationTargetField';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GetRecordDisplayLabelOptions = {
  fallback?: string;
};

const normalizeText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const isUuidLike = (value: unknown) => UUID_REGEX.test(normalizeText(value));

export const getRecordDisplayLabel = (
  record: any,
  moduleId?: string | null,
  options: GetRecordDisplayLabelOptions = {},
): string => {
  const fallback = normalizeText(options.fallback);
  if (!record || typeof record !== 'object') return fallback;

  const normalizedModuleId = normalizeText(moduleId || record?.module_id);
  const moduleConfig = normalizedModuleId ? MODULES[normalizedModuleId] : undefined;
  const keyField = moduleConfig?.fields?.find((field: any) => field?.isKey)?.key;
  const targetField = getPreferredRelationTargetField(normalizedModuleId, keyField || null);

  if (normalizedModuleId) {
    const relationLabel = normalizeText(buildRelationDisplayLabel(normalizedModuleId, record, targetField));
    if (relationLabel && relationLabel !== 'بدون عنوان' && !isUuidLike(relationLabel)) {
      return relationLabel;
    }
  }

  const title = normalizeText(getRecordTitle(record, moduleConfig, { fallback: '' }));
  if (title && !isUuidLike(title)) return title;

  const code = [record?.system_code, record?.manual_code, record?.code]
    .map(normalizeText)
    .find((value) => value && !isUuidLike(value));
  if (code) return code;

  const nonUuidId = normalizeText(record?.id);
  if (nonUuidId && !isUuidLike(nonUuidId)) return nonUuidId;

  return fallback;
};
