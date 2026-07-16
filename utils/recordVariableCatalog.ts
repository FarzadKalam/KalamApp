import { MODULES } from '../moduleRegistry';
import { FieldNature, FieldType, type ModuleField } from '../types';
import { dedupeRuntimeVariables, type RuntimeVariableDescriptor } from '../shared/recordRuntime';
import { getFieldLabelFa } from './fieldLabel';

const HIDDEN_CATALOG_KEYS = new Set(['id', 'org_id']);

const SYSTEM_FIELDS: ModuleField[] = [
  { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'System Code' }, type: FieldType.TEXT, readonly: true, nature: FieldNature.SYSTEM },
  { key: 'created_at', labels: { fa: 'زمان ایجاد', en: 'Created At' }, type: FieldType.DATETIME, readonly: true, nature: FieldNature.SYSTEM },
  { key: 'created_by', labels: { fa: 'ایجادکننده', en: 'Created By' }, type: FieldType.USER, readonly: true, nature: FieldNature.SYSTEM },
  { key: 'updated_at', labels: { fa: 'زمان ویرایش', en: 'Updated At' }, type: FieldType.DATETIME, readonly: true, nature: FieldNature.SYSTEM },
  { key: 'updated_by', labels: { fa: 'آخرین ویرایشگر', en: 'Updated By' }, type: FieldType.USER, readonly: true, nature: FieldNature.SYSTEM },
];

export const getCanonicalModuleFields = (
  moduleId: string,
  options: { includeSystem?: boolean } = {}
): ModuleField[] => {
  const fields = [...(MODULES[moduleId]?.fields || [])];
  if (options.includeSystem !== false) fields.push(...SYSTEM_FIELDS);
  return Array.from(new Map(
    fields
      .filter((field) => !!String(field?.key || '').trim() && !HIDDEN_CATALOG_KEYS.has(String(field.key).trim()))
      .map((field) => [String(field.key).trim(), field] as const)
  ).values());
};

export const buildRelatedVariableLabel = (
  sourceModuleId: string,
  relationField: ModuleField,
  targetModuleId: string,
  targetField: ModuleField
) => {
  const relationLabel = getFieldLabelFa(relationField, { moduleId: sourceModuleId, fallback: relationField.key });
  const targetLabel = getFieldLabelFa(targetField, { moduleId: targetModuleId, fallback: targetField.key });
  return `${relationLabel} (${targetLabel})`;
};

export const buildModuleVariableDescriptors = (moduleId: string): RuntimeVariableDescriptor[] =>
  dedupeRuntimeVariables(getCanonicalModuleFields(moduleId).map((field) => ({
    key: String(field.key),
    labelFa: getFieldLabelFa(field, { moduleId, fallback: field.key }),
    moduleId,
    fieldKey: String(field.key),
    scope: String(field.nature || '') === String(FieldNature.SYSTEM) ? 'system' : 'record',
    neverExposeRawId: field.type === FieldType.RELATION || field.type === FieldType.MULTI_RELATION || field.type === FieldType.USER,
  })));

export const dedupeModuleFields = (fields: ModuleField[]): ModuleField[] =>
  Array.from(new Map(
    fields
      .filter((field) => !!String(field?.key || '').trim())
      .map((field) => [String(field.key).trim(), field] as const)
  ).values());
