import { BASE_MODULES, MODULES } from '../moduleRegistry';
import { FieldType } from '../types';
import { parseProcessLinkedFieldKey } from './processTargets';
import { parseWorkflowRelatedFieldKey, WORKFLOW_ASSIGNEE_FIELD_KEY } from './workflowTypes';
import { formatPersianPrice, formatPersianTime, safeJalaliFormat, toPersianNumber } from './persianNumberFormatter';
import { readCurrencyConfig } from './currency';
import { fetchDynamicOptionsMap } from './referenceData';
import { fetchRelationOptionsForField } from './relationOptions';

type RenderTemplateOptions = {
  moduleId?: string | null;
  bold?: boolean;
  assigneeDirectory?: AssigneeDirectory | null;
  optionLabelMaps?: TemplateOptionLabelMaps | null;
};

type FormatTemplateValueOptions = {
  value: unknown;
  moduleId?: string | null;
  fieldKey?: string | null;
  sourceRecord?: Record<string, any> | null;
  assigneeDirectory?: AssigneeDirectory | null;
  optionLabelMaps?: TemplateOptionLabelMaps | null;
};

type AssigneeDirectory = {
  users?: Array<{ id: string; display_name?: string | null; full_name?: string | null; email?: string | null; mobile_1?: string | null }>;
  roles?: Array<{ id: string; title?: string | null; name?: string | null }>;
};

export type TemplateFieldConfig = {
  key?: string | null;
  type?: unknown;
  dynamicOptionsCategory?: string | null;
  relationConfig?: Record<string, any> | null;
  options?: Array<{ label?: unknown; value?: unknown }>;
};

export type TemplateOptionRow = { label?: unknown; value?: unknown };
export type TemplateOptionLabelMaps = Record<string, TemplateOptionRow[] | undefined>;

type TemplateFieldContext = {
  moduleId: string | null;
  key: string;
  fieldType: string | null;
  fieldConfig: TemplateFieldConfig | null;
  tokenKey: string;
};

const DATE_ONLY_REGEX = /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/;
const DATE_TIME_REGEX =
  /^\d{4}[/-]\d{1,2}[/-]\d{1,2}[ tT]\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:[zZ]|[+-]\d{2}:?\d{2})?$/;
const TIME_ONLY_REGEX = /^\d{1,2}:\d{2}(?::\d{2})?(?:[zZ]|[+-]\d{2}:?\d{2})?$/;
const ASSIGNEE_FIELD_KEYS = new Set([
  'assignee_id',
  'assignee_role_id',
  'assignee_user_id',
  'default_assignee_id',
  'default_assignee_role_id',
  WORKFLOW_ASSIGNEE_FIELD_KEY,
]);
const TASK_AUTOMATION_FIELD_PREFIX = '__task__';
const PREVIOUS_STAGE_TASK_AUTOMATION_FIELD_PREFIX = 'previous_stage__';
const TASK_TEMPLATE_ALIAS_KEYS: Record<string, string> = {
  task_name: 'name',
  task_type: 'task_type',
  task_status: 'status',
  task_priority: 'priority',
  task_due_date: 'due_date',
  task_image_url: 'image_url',
};

const normalizeFieldType = (value: unknown) => String(value || '').trim().toLowerCase();

const mergeTemplateFieldConfig = (
  primary?: TemplateFieldConfig | null,
  fallback?: TemplateFieldConfig | null
): TemplateFieldConfig | null => {
  if (!primary && !fallback) return null;
  return {
    ...(fallback || {}),
    ...(primary || {}),
    options: Array.isArray(primary?.options) && primary.options.length > 0
      ? primary.options
      : fallback?.options,
    dynamicOptionsCategory: primary?.dynamicOptionsCategory || fallback?.dynamicOptionsCategory,
    relationConfig: primary?.relationConfig || fallback?.relationConfig,
  };
};

const findFieldConfigInModule = (moduleConfig: any, key: string): TemplateFieldConfig | null => {
  if (!moduleConfig) return null;
  const fields = Array.isArray(moduleConfig.fields) ? moduleConfig.fields : [];
  const blocks = Array.isArray(moduleConfig.blocks) ? moduleConfig.blocks : [];
  const normalizedKey = String(key || '').trim();
  const fallbackKey = normalizedKey.includes('.') ? normalizedKey.split('.').pop() || '' : '';

  const directField = fields.find((field: any) => String(field?.key || '').trim() === normalizedKey);
  if (directField) return directField;
  if (fallbackKey) {
    const fallbackField = fields.find((field: any) => String(field?.key || '').trim() === fallbackKey);
    if (fallbackField) return fallbackField;
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
    if (column) return column;
  }

  return null;
};

const readFieldConfigFromModule = (moduleId: string | null | undefined, key: string): TemplateFieldConfig | null => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedKey = String(key || '').trim();
  if (!normalizedModuleId || !normalizedKey) return null;

  return mergeTemplateFieldConfig(
    findFieldConfigInModule(MODULES[normalizedModuleId], normalizedKey),
    findFieldConfigInModule(BASE_MODULES[normalizedModuleId], normalizedKey)
  );
};

const createFieldContext = (
  moduleId: string | null | undefined,
  key: string,
  fieldConfig?: TemplateFieldConfig | null,
  tokenKey?: string | null
): TemplateFieldContext => ({
  moduleId: String(moduleId || '').trim() || null,
  key: String(key || '').trim(),
  fieldConfig: fieldConfig || null,
  fieldType: fieldConfig?.type ? normalizeFieldType(fieldConfig.type) : null,
  tokenKey: String(tokenKey || key || '').trim(),
});

const resolveFieldContext = (moduleId: string | null | undefined, fieldKey: string | null | undefined): TemplateFieldContext => {
  const normalizedFieldKey = String(fieldKey || '').trim();
  const defaultModuleId = String(moduleId || '').trim();
  if (!normalizedFieldKey) {
    return createFieldContext(defaultModuleId || null, '', null, normalizedFieldKey);
  }

  if (normalizedFieldKey.startsWith(TASK_AUTOMATION_FIELD_PREFIX)) {
    const taskKey = normalizedFieldKey.slice(TASK_AUTOMATION_FIELD_PREFIX.length);
    return createFieldContext('tasks', taskKey, readFieldConfigFromModule('tasks', taskKey), normalizedFieldKey);
  }

  if (normalizedFieldKey.startsWith(PREVIOUS_STAGE_TASK_AUTOMATION_FIELD_PREFIX)) {
    const taskKey = normalizedFieldKey.slice(PREVIOUS_STAGE_TASK_AUTOMATION_FIELD_PREFIX.length);
    return createFieldContext('tasks', taskKey, readFieldConfigFromModule('tasks', taskKey), normalizedFieldKey);
  }

  if (TASK_TEMPLATE_ALIAS_KEYS[normalizedFieldKey]) {
    const taskKey = TASK_TEMPLATE_ALIAS_KEYS[normalizedFieldKey];
    return createFieldContext('tasks', taskKey, readFieldConfigFromModule('tasks', taskKey), normalizedFieldKey);
  }

  const linked = parseProcessLinkedFieldKey(normalizedFieldKey);
  if (linked) {
    return createFieldContext(
      linked.moduleId || null,
      linked.targetFieldKey || '',
      readFieldConfigFromModule(linked.moduleId, linked.targetFieldKey),
      normalizedFieldKey
    );
  }

  const related = parseWorkflowRelatedFieldKey(normalizedFieldKey);
  if (related) {
    return createFieldContext(
      related.targetModuleId || null,
      related.targetFieldKey || '',
      readFieldConfigFromModule(related.targetModuleId, related.targetFieldKey),
      normalizedFieldKey
    );
  }

  return createFieldContext(
    defaultModuleId || null,
    normalizedFieldKey,
    readFieldConfigFromModule(defaultModuleId || null, normalizedFieldKey),
    normalizedFieldKey
  );
};

const isAssigneeFieldKey = (key: string | null | undefined) =>
  ASSIGNEE_FIELD_KEYS.has(String(key || '').trim());

const normalizeAssigneeValue = (
  value: unknown,
  fieldKey: string | null | undefined,
  sourceRecord?: Record<string, any> | null
) => {
  const normalizedFieldKey = String(fieldKey || '').trim();
  const rawValue = String(value || '').trim();
  const comboMatch = rawValue.match(/^(user|role)[:_](.+)$/i);
  if (comboMatch) {
    const id = String(comboMatch[2] || '').trim();
    return id ? { type: String(comboMatch[1]).toLowerCase() as 'user' | 'role', id } : null;
  }

  if (normalizedFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) return null;

  if (normalizedFieldKey === 'assignee_id' && sourceRecord) {
    const explicitType = String(sourceRecord?.assignee_type || '').trim().toLowerCase();
    const roleId = String(sourceRecord?.assignee_role_id || '').trim();
    if ((explicitType === 'role' || (!rawValue && roleId)) && roleId) {
      return { type: 'role' as const, id: roleId };
    }
  }

  if (!rawValue) return null;
  const isRoleField = normalizedFieldKey === 'assignee_role_id' || normalizedFieldKey === 'default_assignee_role_id';
  return { type: isRoleField ? 'role' as const : 'user' as const, id: rawValue };
};

const resolveAssigneeLabel = (
  value: unknown,
  fieldKey: string | null | undefined,
  sourceRecord: Record<string, any> | null | undefined,
  directory: AssigneeDirectory | null | undefined
) => {
  if (!directory || !isAssigneeFieldKey(fieldKey)) return null;
  const assignee = normalizeAssigneeValue(value, fieldKey, sourceRecord);
  if (!assignee?.id) return null;

  if (assignee.type === 'role') {
    const role = (directory.roles || []).find((item) => String(item?.id || '').trim() === assignee.id);
    const title = String(role?.title || role?.name || '').trim();
    return title || null;
  }

  const user = (directory.users || []).find((item) => String(item?.id || '').trim() === assignee.id);
  const label = String(user?.display_name || user?.full_name || user?.email || user?.mobile_1 || '').trim();
  return label || null;
};

const formatPriceWithCurrency = (value: unknown) => {
  const formatted = String(formatPersianPrice(value, true) || '').trim();
  if (!formatted) return '';
  const currencyLabel = String(readCurrencyConfig().label || '').trim();
  return currencyLabel ? `${formatted} ${currencyLabel}` : formatted;
};

const findOptionLabel = (options: TemplateOptionRow[] | null | undefined, value: unknown): string | null => {
  if (!Array.isArray(options) || options.length === 0 || value === null || value === undefined) return null;
  const normalizedValue = String(value).trim();
  const option = options.find((item) => String(item?.value ?? '').trim() === normalizedValue);
  const label = String(option?.label ?? '').trim();
  return label || null;
};

const resolveModuleLabel = (fieldContext: TemplateFieldContext, value: unknown): string | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const fieldKey = String(fieldContext.key || '').trim();
  if (!/(^|_)module(_id|s)?$/i.test(fieldKey) && !/(^|_)related_to_module$/i.test(fieldKey)) return null;
  const moduleConfig = MODULES[raw];
  return String(moduleConfig?.titles?.fa || '').trim() || null;
};

const resolveOptionLabel = (
  fieldContext: TemplateFieldContext,
  value: unknown,
  optionLabelMaps?: TemplateOptionLabelMaps | null
): string | null => {
  if (value === null || value === undefined) return null;

  const staticLabel = findOptionLabel(fieldContext.fieldConfig?.options || [], value);
  if (staticLabel) return staticLabel;

  const normalizedModuleId = String(fieldContext.moduleId || '').trim();
  const normalizedFieldKey = String(fieldContext.key || '').trim();
  const dynamicCategory = String(fieldContext.fieldConfig?.dynamicOptionsCategory || '').trim();
  const candidateKeys = [
    normalizedModuleId && normalizedFieldKey ? `field:${normalizedModuleId}:${normalizedFieldKey}` : '',
    normalizedFieldKey ? `field:${normalizedFieldKey}` : '',
    normalizedModuleId && normalizedFieldKey ? `${normalizedModuleId}.${normalizedFieldKey}` : '',
    dynamicCategory,
  ].filter(Boolean);

  for (const key of candidateKeys) {
    const label = findOptionLabel(optionLabelMaps?.[key], value);
    if (label) return label;
  }

  return resolveModuleLabel(fieldContext, value);
};

const parseListLikeValue = (value: unknown): unknown[] | null => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (trimmed.includes(',')) {
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return null;
};

const isListFieldType = (fieldType: string) =>
  fieldType === FieldType.MULTI_SELECT || fieldType === FieldType.CHECKLIST || fieldType === FieldType.TAGS;

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
  sourceRecord,
  assigneeDirectory,
  optionLabelMaps,
}: FormatTemplateValueOptions): string => {
  const fieldContext = resolveFieldContext(moduleId, fieldKey);
  const fieldType = normalizeFieldType(fieldContext.fieldType);

  const assigneeLabel = resolveAssigneeLabel(value, fieldContext.key || fieldKey, sourceRecord, assigneeDirectory);
  if (assigneeLabel) return assigneeLabel;
  if (value === null || value === undefined) return '';
  if (fieldType === FieldType.USER && assigneeDirectory) {
    const userId = String(value || '').trim();
    const user = (assigneeDirectory.users || []).find((item) => String(item?.id || '').trim() === userId);
    const label = String(user?.display_name || user?.full_name || user?.email || user?.mobile_1 || '').trim();
    if (label) return label;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        formatTemplateValueByField({
          value: item,
          moduleId: fieldContext.moduleId,
          fieldKey: fieldContext.key,
          sourceRecord,
          assigneeDirectory,
          optionLabelMaps,
        })
      )
      .filter(Boolean)
      .join(', ');
  }

  if (isListFieldType(fieldType)) {
    const listValue = parseListLikeValue(value);
    if (listValue) {
      return listValue
        .map((item) =>
          formatTemplateValueByField({
            value: item,
            moduleId: fieldContext.moduleId,
            fieldKey: fieldContext.key,
            sourceRecord,
            assigneeDirectory,
            optionLabelMaps,
          })
        )
        .filter(Boolean)
        .join(', ');
    }
  }

  const optionLabel = resolveOptionLabel(fieldContext, value, optionLabelMaps);
  if (optionLabel) return optionLabel;

  if (fieldType === FieldType.CHECKBOX || typeof value === 'boolean') {
    return value === true || String(value).toLowerCase() === 'true' ? 'بله' : 'خیر';
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
      sourceRecord: record || null,
      assigneeDirectory: options.assigneeDirectory,
      optionLabelMaps: options.optionLabelMaps,
    }).trim();
    if (!options.bold) return rendered;
    return rendered ? `**${rendered}**` : '';
  });

export const collectTemplateDynamicOptionCategories = (
  template: string,
  moduleId?: string | null
): string[] => {
  const categories = new Set<string>();
  const rawTemplate = String(template || '');
  Array.from(rawTemplate.matchAll(/\{\{\s*([^}]+)\s*\}\}/g)).forEach((match) => {
    const fieldKey = String(match[1] || '').trim();
    if (!fieldKey) return;
    const fieldContext = resolveFieldContext(moduleId, fieldKey);
    const category = String(fieldContext.fieldConfig?.dynamicOptionsCategory || '').trim();
    if (category) categories.add(category);
  });
  return Array.from(categories);
};

export const collectTemplateRelationFields = (
  template: string,
  moduleId?: string | null
): Array<{
  tokenKey: string;
  moduleId: string | null;
  fieldKey: string;
  fieldConfig: TemplateFieldConfig;
}> => {
  const items: Array<{
    tokenKey: string;
    moduleId: string | null;
    fieldKey: string;
    fieldConfig: TemplateFieldConfig;
  }> = [];
  const seen = new Set<string>();
  const rawTemplate = String(template || '');
  Array.from(rawTemplate.matchAll(/\{\{\s*([^}]+)\s*\}\}/g)).forEach((match) => {
    const fieldKey = String(match[1] || '').trim();
    if (!fieldKey) return;
    const fieldContext = resolveFieldContext(moduleId, fieldKey);
    if (normalizeFieldType(fieldContext.fieldType) !== FieldType.RELATION) return;
    if (!fieldContext.fieldConfig?.relationConfig) return;
    const dedupeKey = `${fieldContext.tokenKey}:${fieldContext.moduleId}:${fieldContext.key}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    items.push({
      tokenKey: fieldContext.tokenKey,
      moduleId: fieldContext.moduleId,
      fieldKey: fieldContext.key,
      fieldConfig: fieldContext.fieldConfig,
    });
  });
  return items;
};

const addOptionMap = (
  maps: TemplateOptionLabelMaps,
  keys: string[],
  options: Array<{ label?: unknown; value?: unknown }>
) => {
  const normalizedOptions = (options || [])
    .map((item) => ({
      label: String(item?.label ?? item?.value ?? '').trim(),
      value: String(item?.value ?? '').trim(),
    }))
    .filter((item) => item.label && item.value);
  if (normalizedOptions.length === 0) return;

  keys
    .map((key) => String(key || '').trim())
    .filter(Boolean)
    .forEach((key) => {
      maps[key] = [...(maps[key] || []), ...normalizedOptions];
    });
};

const buildOptionMapKeys = (
  moduleId: string | null | undefined,
  fieldKey: string | null | undefined,
  tokenKey: string | null | undefined
) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedFieldKey = String(fieldKey || '').trim();
  const normalizedTokenKey = String(tokenKey || '').trim();
  const tokenLeafKey = normalizedTokenKey.includes('.') ? normalizedTokenKey.split('.').pop() || '' : '';
  const fieldLeafKey = normalizedFieldKey.includes('.') ? normalizedFieldKey.split('.').pop() || '' : '';
  return [
    normalizedModuleId && normalizedFieldKey ? `field:${normalizedModuleId}:${normalizedFieldKey}` : '',
    normalizedFieldKey ? `field:${normalizedFieldKey}` : '',
    normalizedTokenKey ? `field:${normalizedTokenKey}` : '',
    tokenLeafKey ? `field:${tokenLeafKey}` : '',
    fieldLeafKey ? `field:${fieldLeafKey}` : '',
    normalizedModuleId && normalizedFieldKey ? `${normalizedModuleId}.${normalizedFieldKey}` : '',
    normalizedTokenKey,
    tokenLeafKey,
  ];
};

export const resolveTemplateOptionLabelMaps = async (
  supabaseClient: any,
  template: string,
  moduleId?: string | null,
  record?: Record<string, any> | null
): Promise<TemplateOptionLabelMaps> => {
  const normalizedModuleId = String(moduleId || '').trim();
  const dynamicCategories = collectTemplateDynamicOptionCategories(template, normalizedModuleId);
  const maps: TemplateOptionLabelMaps = dynamicCategories.length > 0
    ? await fetchDynamicOptionsMap(supabaseClient, dynamicCategories).catch(() => ({}))
    : {};

  const relationFields = collectTemplateRelationFields(template, normalizedModuleId);
  await Promise.allSettled(
    relationFields.map(async (fieldRef) => {
      const rawValue =
        resolveValueFromRecord(record, fieldRef.tokenKey)
        ?? resolveValueFromRecord(record, fieldRef.fieldKey);
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      const relationOptions = (
        await Promise.all(
          values
            .map((value) => String(value ?? '').trim())
            .filter(Boolean)
            .map((value) =>
              fetchRelationOptionsForField(supabaseClient, fieldRef.fieldConfig, {
                allValues: record || undefined,
                exactId: value,
                limit: 1,
              }).catch(() => [])
            )
        )
      ).flat();

      addOptionMap(
        maps,
        buildOptionMapKeys(fieldRef.moduleId, fieldRef.fieldKey, fieldRef.tokenKey),
        relationOptions
      );
    })
  );

  return maps;
};
