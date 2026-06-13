import { MODULES } from '../moduleRegistry';
import { FieldType, ModuleField } from '../types';
import { getFieldLabelFa } from './fieldLabel';

export type AiRecordFieldSpec = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: Array<{ label: string; value: string | number }>;
  relationTargetModule?: string | null;
};

export type AiRecordCreationSchema = {
  moduleId: string;
  moduleLabel: string;
  table: string;
  fields: AiRecordFieldSpec[];
};

const SYSTEM_FIELD_KEYS = new Set([
  'id',
  'org_id',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  'deleted_at',
  'system_code',
]);

const UNSUPPORTED_AI_FIELD_TYPES = new Set<string>([
  FieldType.IMAGE,
  FieldType.JSON,
  FieldType.CHECKLIST,
  FieldType.PROGRESS_STAGES,
  FieldType.READONLY_LOOKUP,
  FieldType.TAGS,
]);

export const isAiWritableModuleField = (field: ModuleField | null | undefined) => {
  if (!field?.key) return false;
  if (SYSTEM_FIELD_KEYS.has(String(field.key))) return false;
  if ((field as any).nature === 'system') return false;
  if ((field as any).readonly === true) return false;
  if (UNSUPPORTED_AI_FIELD_TYPES.has(String(field.type || ''))) return false;
  return true;
};

const normalizeOptionValue = (value: any) => {
  if (value === null || value === undefined) return '';
  return typeof value === 'number' ? value : String(value);
};

export const buildAiRecordCreationSchema = (
  moduleId: string,
  allowedFieldKeys?: string[] | null,
): AiRecordCreationSchema | null => {
  const normalizedModuleId = String(moduleId || '').trim();
  const moduleConfig = MODULES[normalizedModuleId];
  if (!normalizedModuleId || !moduleConfig) return null;

  const allowed = new Set(
    (allowedFieldKeys || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  );
  const hasExplicitAllowedFields = allowed.size > 0;

  const fields = (moduleConfig.fields || [])
    .filter(isAiWritableModuleField)
    .filter((field) => !hasExplicitAllowedFields || allowed.has(String(field.key)))
    .slice(0, 80)
    .map((field) => ({
      key: String(field.key),
      label: getFieldLabelFa(field as any, { moduleId: normalizedModuleId }),
      type: String(field.type || 'text'),
      required: (field as any)?.validation?.required === true,
      options: Array.isArray((field as any).options)
        ? (field as any).options.slice(0, 80).map((option: any) => ({
            label: String(option?.label ?? option?.title ?? option?.name ?? option?.value ?? '').trim(),
            value: normalizeOptionValue(option?.value ?? option?.id ?? option?.key ?? option?.label),
          })).filter((option: any) => option.label || option.value !== '')
        : undefined,
      relationTargetModule: String((field as any)?.relationConfig?.targetModule || '').trim() || null,
    }));

  return {
    moduleId: normalizedModuleId,
    moduleLabel: moduleConfig.titles?.fa || normalizedModuleId,
    table: moduleConfig.table || normalizedModuleId,
    fields,
  };
};

export const buildAiRecordModuleOptions = () =>
  Object.entries(MODULES)
    .map(([moduleId, moduleConfig]) => ({
      label: moduleConfig.titles?.fa || moduleId,
      value: moduleId,
    }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), 'fa'));
