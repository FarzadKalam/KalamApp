import type { CrudFilter } from '@refinedev/core';
import { FieldNature, FieldType, type ModuleDefinition } from '../types';

const MODULE_LIST_SEARCHABLE_FIELD_TYPES = new Set<FieldType>([
  FieldType.TEXT,
  FieldType.LONG_TEXT,
  FieldType.SUPER_LONG_TEXT,
  FieldType.PHONE,
  FieldType.LINK,
  FieldType.STATUS,
  FieldType.SELECT,
]);

// Max fields in OR clause — prevents URL from exceeding server limits (502/CORS)
const MAX_SEARCH_FIELDS = 12;

// Key name fragments that indicate high-priority search fields
const HIGH_PRIORITY_KEY_FRAGMENTS = ['name', 'title', 'code', 'email', 'mobile', 'phone', 'number', 'id_code', 'national'];

type ModuleListSearchFilter = CrudFilter & {
  _isModuleListSearchFilter?: boolean;
};

const isSelectableSearchFieldKey = (value: unknown): boolean => {
  const key = String(value || '').trim();
  return Boolean(key && !key.startsWith('__') && !key.includes('.') && !key.includes('(') && !key.includes(')'));
};

// SYSTEM fields ending in _id are likely UUID foreign keys in the DB (not VARCHAR),
// so ILIKE on them would throw "operator does not exist: uuid ~~* unknown".
const isLikelyUuidSystemField = (field: ModuleDefinition['fields'][number]): boolean =>
  field.nature === FieldNature.SYSTEM && String(field.key || '').endsWith('_id');

const getSearchFieldPriority = (field: ModuleDefinition['fields'][number]): number => {
  if (field.isKey) return 0;
  if (field.type === FieldType.PHONE) return 1;
  const key = field.key.toLowerCase();
  if (HIGH_PRIORITY_KEY_FRAGMENTS.some((frag) => key.includes(frag))) return 2;
  return 3;
};

export const buildModuleListSearchFieldKeys = (
  moduleConfig: ModuleDefinition | null | undefined,
  fieldPermissions?: Record<string, any> | null
): string[] => {
  if (!moduleConfig) return [];

  const seen = new Set<string>();
  return (moduleConfig.fields || [])
    .filter((field) => MODULE_LIST_SEARCHABLE_FIELD_TYPES.has(field.type) && !isLikelyUuidSystemField(field))
    .filter((field) => {
      const key = String(field.key || '').trim();
      return isSelectableSearchFieldKey(key) && fieldPermissions?.[key] !== false;
    })
    .sort((a, b) => getSearchFieldPriority(a) - getSearchFieldPriority(b))
    .map((field) => String(field.key || '').trim())
    .filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SEARCH_FIELDS);
};

export const buildModuleListSearchFilter = (
  searchTerm: unknown,
  fieldKeys: string[]
): CrudFilter | null => {
  const value = String(searchTerm || '').trim();
  const safeKeys = Array.from(new Set((fieldKeys || []).map((key) => String(key || '').trim()).filter(isSelectableSearchFieldKey)));
  if (!value || safeKeys.length === 0) return null;

  return {
    operator: 'or',
    value: safeKeys.map((field) => ({ field, operator: 'contains', value })),
    _isModuleListSearchFilter: true,
  } as ModuleListSearchFilter;
};

export const isModuleListSearchFilter = (filter: unknown): boolean =>
  Boolean((filter as ModuleListSearchFilter | null | undefined)?._isModuleListSearchFilter);
