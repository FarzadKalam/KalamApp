import type { ModuleField } from '../types';
import { extractTemplateTokens } from '../shared/recordRuntime';
import type { WorkflowAction } from './workflowTypes';

export type WorkflowTemplateFieldSnapshot = {
  type?: string;
  label?: string;
  options?: Array<{ label: string; value: string }>;
  dynamicOptionsCategory?: string;
  relationConfig?: Record<string, unknown>;
  multiRelationConfig?: Record<string, unknown>;
  moduleId?: string;
  fieldKey?: string;
};

const TEMPLATE_FIELD_CATALOG_KEY = '__template_field_catalog';

const collectTemplateTokens = (value: unknown, result = new Set<string>()): Set<string> => {
  if (typeof value === 'string') {
    extractTemplateTokens(value).forEach((token) => result.add(token));
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTemplateTokens(item, result));
    return result;
  }
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      if (key !== TEMPLATE_FIELD_CATALOG_KEY) collectTemplateTokens(item, result);
    });
  }
  return result;
};

const toSnapshot = (field: ModuleField, defaultModuleId: string): WorkflowTemplateFieldSnapshot => {
  const source = field as ModuleField & { workflowOptionScopeModuleId?: string };
  const options = Array.isArray(field.options)
    ? field.options.map((option: any) => ({
      label: String(option?.label ?? ''),
      value: String(option?.value ?? ''),
    }))
    : undefined;
  return {
    type: field.type,
    label: String(field.labels?.fa || field.labels?.en || field.key || '').trim(),
    ...(options?.length ? { options } : {}),
    ...(field.dynamicOptionsCategory ? { dynamicOptionsCategory: field.dynamicOptionsCategory } : {}),
    ...((field as any).relationConfig ? { relationConfig: (field as any).relationConfig } : {}),
    ...((field as any).multiRelationConfig ? { multiRelationConfig: (field as any).multiRelationConfig } : {}),
    moduleId: source.workflowOptionScopeModuleId || defaultModuleId,
    fieldKey: field.key,
  };
};

/**
 * گزینه‌ها و نوع فیلدهای استفاده‌شده در متن اقدام را کنار همان اقدام ذخیره می‌کند.
 * بنابراین workerهای فوری و زمان‌بندی‌شده بدون اتکا به تنظیمات ناقص سرور، یک خروجی دارند.
 */
export const attachWorkflowTemplateFieldCatalog = (
  actions: WorkflowAction[],
  defaultModuleId: string,
  variableFields: ModuleField[],
): WorkflowAction[] => {
  const fieldByKey = new Map(variableFields.map((field) => [String(field.key), field]));
  return actions.map((action) => {
    const config = action?.config && typeof action.config === 'object' ? action.config : {};
    const { [TEMPLATE_FIELD_CATALOG_KEY]: _previousCatalog, ...cleanConfig } = config;
    const catalog = Object.fromEntries(
      Array.from(collectTemplateTokens(cleanConfig))
        .map((token) => {
          const field = fieldByKey.get(token);
          return field ? [token, toSnapshot(field, defaultModuleId)] : null;
        })
        .filter((entry): entry is [string, WorkflowTemplateFieldSnapshot] => entry !== null),
    );
    return {
      ...action,
      config: Object.keys(catalog).length > 0
        ? { ...cleanConfig, [TEMPLATE_FIELD_CATALOG_KEY]: catalog }
        : cleanConfig,
    };
  });
};
