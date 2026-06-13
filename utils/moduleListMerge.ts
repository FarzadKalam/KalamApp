import { FieldType, ModuleDefinition, ModuleField } from '../types';
import { MODULES } from '../moduleRegistry';

const SYSTEM_FIELD_KEYS = new Set([
  'id',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  'deleted_at',
  'deleted_by',
]);

const UNSUPPORTED_MERGE_FIELD_TYPES = new Set<FieldType>([
  FieldType.READONLY_LOOKUP,
  FieldType.PROGRESS_STAGES,
  FieldType.TAGS,
]);

const isEmptyMergeValue = (value: any) => {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

const cloneMergeValue = (value: any) => {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Array.isArray(value) || (typeof value === 'object' && value)) {
    return JSON.parse(JSON.stringify(value));
  }
  return value;
};

export const getMergeableModuleFields = (
  moduleConfig: ModuleDefinition | null | undefined,
  canViewField?: (fieldKey: string) => boolean,
): ModuleField[] => {
  if (!moduleConfig) return [];

  return (moduleConfig.fields || [])
    .filter((field) => {
      const key = String(field?.key || '').trim();
      if (!key || SYSTEM_FIELD_KEYS.has(key)) return false;
      if (field.readonly || field.isCalculated) return false;
      if (field.hideInCreateForm && !field.isTableColumn) return false;
      if (UNSUPPORTED_MERGE_FIELD_TYPES.has(field.type)) return false;
      if (canViewField && canViewField(key) === false) return false;
      return true;
    })
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));
};

export const buildDefaultMergeSelections = (
  fields: ModuleField[],
  records: Array<Record<string, any>>,
): Record<string, string> => {
  const selections: Record<string, string> = {};
  if (!records.length) return selections;

  fields.forEach((field) => {
    const key = String(field.key || '').trim();
    const preferredRecord = records.find((record) => !isEmptyMergeValue(record?.[key])) || records[0];
    const recordId = String(preferredRecord?.id || records[0]?.id || '').trim();
    if (key && recordId) {
      selections[key] = recordId;
    }
  });

  return selections;
};

export type ModuleRelationReference = {
  table: string;
  column: string;
  isArray: boolean;
};

/**
 * تمام فیلدهای RELATION/MULTI_RELATION در همه ماژول‌ها را پیدا می‌کند که به ماژول
 * هدف اشاره دارند. خروجی برای ادغام رکوردها استفاده می‌شود تا بعد از merge،
 * ارجاع‌های duplicate ها در سراسر پروژه به survivor تغییر کنند.
 */
export const findModuleRelationReferences = (
  targetModuleId: string,
): ModuleRelationReference[] => {
  const target = String(targetModuleId || '').trim();
  if (!target) return [];

  const seen = new Set<string>();
  const references: ModuleRelationReference[] = [];

  Object.values(MODULES).forEach((moduleConfig) => {
    const table = String(moduleConfig?.table || '').trim();
    if (!table) return;

    (moduleConfig.fields || []).forEach((field) => {
      const column = String(field?.key || '').trim();
      if (!column) return;

      const isMultiRelation =
        field.type === FieldType.MULTI_RELATION && field.multiRelationConfig?.targetModule === target;
      const isRelation =
        field.type === FieldType.RELATION && field.relationConfig?.targetModule === target;

      if (!isMultiRelation && !isRelation) return;

      const refKey = `${table}.${column}`;
      if (seen.has(refKey)) return;
      seen.add(refKey);
      references.push({ table, column, isArray: isMultiRelation });
    });
  });

  return references;
};

export const buildMergePayload = (
  fields: ModuleField[],
  records: Array<Record<string, any>>,
  selections: Record<string, string>,
): Record<string, any> => {
  const recordsById = new Map(records.map((record) => [String(record?.id || '').trim(), record]));
  const payload: Record<string, any> = {};

  fields.forEach((field) => {
    const key = String(field.key || '').trim();
    if (!key) return;
    const selectedRecordId = String(selections[key] || '').trim();
    const selectedRecord = recordsById.get(selectedRecordId) || records[0];
    payload[key] = cloneMergeValue(selectedRecord?.[key]);
  });

  return payload;
};

