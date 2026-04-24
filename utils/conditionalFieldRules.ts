import { FieldType, LogicOperator, ModuleField } from '../types';
import { WorkflowCondition } from './workflowTypes';

export type ConditionalFieldRuleSource = 'system' | 'user';
export type ConditionalFieldRequiredMode = 'inherit' | 'force_required' | 'force_optional';
export type ConditionalFieldDefaultMode = 'inherit' | 'clear' | 'set_value';

export type ConditionalFieldEffect = {
  showField: boolean;
  requiredMode: ConditionalFieldRequiredMode;
  defaultMode: ConditionalFieldDefaultMode;
  defaultValue?: any;
};

export type ConditionalFieldRule = {
  id: string;
  targetFieldKey: string;
  source: ConditionalFieldRuleSource;
  locked?: boolean;
  enabled: boolean;
  priority: number;
  conditions_all?: WorkflowCondition[] | null;
  conditions_any?: WorkflowCondition[] | null;
  effect?: Partial<ConditionalFieldEffect> | null;
};

export type ConditionalFieldSettings = {
  rules: ConditionalFieldRule[];
};

export type ConditionalFieldRuntimeState = {
  hasRules: boolean;
  visible: boolean;
  required: boolean;
  defaultMode: ConditionalFieldDefaultMode;
  defaultValue?: any;
  matchedRule?: ConditionalFieldRule | null;
};

const DEFAULT_EFFECT: ConditionalFieldEffect = {
  showField: true,
  requiredMode: 'inherit',
  defaultMode: 'inherit',
};

const NUMERIC_FIELD_TYPES = new Set<FieldType>([
  FieldType.NUMBER,
  FieldType.PRICE,
  FieldType.PERCENTAGE,
  FieldType.STOCK,
  FieldType.PERCENTAGE_OR_AMOUNT,
]);

const ARRAY_FIELD_TYPES = new Set<FieldType>([
  FieldType.MULTI_SELECT,
  FieldType.TAGS,
  FieldType.CHECKLIST,
]);

const normalizeString = (value: any) => String(value ?? '').trim();

const LEGACY_OPERATOR_MAP: Record<string, string> = {
  [LogicOperator.EQUALS]: 'eq',
  [LogicOperator.NOT_EQUALS]: 'neq',
  [LogicOperator.GREATER_THAN]: 'gt',
  [LogicOperator.LESS_THAN]: 'lt',
  [LogicOperator.CONTAINS]: 'contains',
  [LogicOperator.IS_TRUE]: 'is_true',
  [LogicOperator.IS_FALSE]: 'is_false',
};

export const normalizeConditionalOperator = (operator: any) => {
  const normalized = normalizeString(operator).toLowerCase();
  return LEGACY_OPERATOR_MAP[normalized] || normalized;
};

const normalizeScalarValue = (field: ModuleField | undefined, value: any) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!field) return value;
  const scalarValue = Array.isArray(value) ? value[0] : value;

  if (ARRAY_FIELD_TYPES.has(field.type)) {
    if (Array.isArray(value)) return value.map((item) => normalizeString(item)).filter(Boolean);
    return normalizeString(value) ? [normalizeString(value)] : [];
  }

  if (NUMERIC_FIELD_TYPES.has(field.type)) {
    if (typeof scalarValue === 'number') return Number.isFinite(scalarValue) ? scalarValue : null;
    const parsed = parseFloat(String(scalarValue).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (field.type === FieldType.CHECKBOX) {
    if (typeof scalarValue === 'boolean') return scalarValue;
    const normalized = normalizeString(scalarValue).toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return !!scalarValue;
  }

  if (
    field.type === FieldType.SELECT
    || field.type === FieldType.STATUS
    || field.type === FieldType.RELATION
    || field.type === FieldType.USER
  ) {
    return normalizeString(scalarValue);
  }

  return scalarValue;
};

export const normalizeConditionalFieldValueForField = (field: ModuleField | undefined, value: any) =>
  normalizeScalarValue(field, value);

const normalizeRuleEffect = (rule: ConditionalFieldRule): ConditionalFieldEffect => ({
  ...DEFAULT_EFFECT,
  ...(rule.effect || {}),
});

const normalizeConditionValue = (field: ModuleField | undefined, value: any) => {
  const normalized = normalizeScalarValue(field, value);
  if (Array.isArray(normalized)) return normalized;
  if (
    normalized !== null
    && normalized !== undefined
    && typeof normalized !== 'boolean'
    && typeof normalized !== 'number'
  ) {
    return normalizeString(normalized);
  }
  return normalized;
};

const asArray = (value: any) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
};

const compareEquals = (left: any, right: any) => {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftValues = asArray(left).map((item) => normalizeString(item));
    const rightValues = asArray(right).map((item) => normalizeString(item));
    if (leftValues.length !== rightValues.length) return false;
    return leftValues.every((item, index) => item === rightValues[index]);
  }
  return left === right;
};

const compareContains = (left: any, right: any) => {
  if (Array.isArray(left)) {
    const normalizedLeft = left.map((item) => normalizeString(item));
    if (Array.isArray(right)) {
      return right.map((item) => normalizeString(item)).some((item) => normalizedLeft.includes(item));
    }
    return normalizedLeft.includes(normalizeString(right));
  }
  return normalizeString(left).includes(normalizeString(right));
};

const compareIn = (left: any, right: any) => {
  const normalizedRight = asArray(right).map((item) => normalizeString(item));
  if (!normalizedRight.length) return false;
  if (Array.isArray(left)) {
    return left.map((item) => normalizeString(item)).some((item) => normalizedRight.includes(item));
  }
  return normalizedRight.includes(normalizeString(left));
};

const evaluateWorkflowCondition = (
  condition: WorkflowCondition,
  values: Record<string, any>,
  fieldsByKey: Record<string, ModuleField>
) => {
  const fieldKey = normalizeString(condition?.field);
  if (!fieldKey) return true;

  const field = fieldsByKey[fieldKey];
  const currentValue = normalizeConditionValue(field, values?.[fieldKey]);
  const expectedValue = normalizeConditionValue(field, condition?.value);
  const operator = normalizeConditionalOperator(condition?.operator);

  switch (operator) {
    case 'eq':
    case LogicOperator.EQUALS:
      return compareEquals(currentValue, expectedValue);
    case 'neq':
    case LogicOperator.NOT_EQUALS:
      return !compareEquals(currentValue, expectedValue);
    case 'contains':
    case LogicOperator.CONTAINS:
      return compareContains(currentValue, expectedValue);
    case 'not_contains':
      return !compareContains(currentValue, expectedValue);
    case 'starts_with':
      return normalizeString(currentValue).startsWith(normalizeString(expectedValue));
    case 'ends_with':
      return normalizeString(currentValue).endsWith(normalizeString(expectedValue));
    case 'in':
      return compareIn(currentValue, expectedValue);
    case 'not_in':
      return !compareIn(currentValue, expectedValue);
    case 'gt':
    case LogicOperator.GREATER_THAN:
      return Number(currentValue) > Number(expectedValue);
    case 'gte':
      return Number(currentValue) >= Number(expectedValue);
    case 'lt':
    case LogicOperator.LESS_THAN:
      return Number(currentValue) < Number(expectedValue);
    case 'lte':
      return Number(currentValue) <= Number(expectedValue);
    case 'is_true':
    case LogicOperator.IS_TRUE:
      return currentValue === true;
    case 'is_false':
    case LogicOperator.IS_FALSE:
      return currentValue === false;
    case 'is_null':
      return currentValue === null || currentValue === undefined || currentValue === '' || (Array.isArray(currentValue) && currentValue.length === 0);
    case 'not_null':
      return !(currentValue === null || currentValue === undefined || currentValue === '' || (Array.isArray(currentValue) && currentValue.length === 0));
    default:
      return false;
  }
};

export const evaluateLegacyVisibilityRule = (
  logicOrRule: any,
  values: Record<string, any>
) => {
  if (!logicOrRule) return true;
  const rule = logicOrRule.visibleIf || logicOrRule;
  if (!rule || !rule.field) return true;
  return evaluateWorkflowCondition(
    {
      id: String(rule.id || `${rule.field}:${rule.operator || 'eq'}`),
      field: String(rule.field),
        operator: normalizeConditionalOperator(rule.operator || 'eq'),
        value: rule.value,
      },
    values || {},
    {}
  );
};

const normalizeWorkflowCondition = (condition: WorkflowCondition): WorkflowCondition => ({
  ...condition,
  id: normalizeString(condition?.id) || `condition_${Math.random().toString(36).slice(2, 8)}`,
  field: normalizeString(condition?.field),
  operator: normalizeConditionalOperator(condition?.operator || 'eq'),
});

export const normalizeConditionalFieldRule = (rule: ConditionalFieldRule): ConditionalFieldRule => ({
  id: normalizeString(rule.id) || `conditional_rule_${Math.random().toString(36).slice(2, 8)}`,
  targetFieldKey: normalizeString(rule.targetFieldKey),
  source: rule.source === 'system' ? 'system' : 'user',
  locked: rule.locked === true,
  enabled: rule.enabled !== false,
  priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 0,
  conditions_all: (Array.isArray(rule.conditions_all) ? rule.conditions_all : [])
    .map((condition) => normalizeWorkflowCondition(condition))
    .filter((condition) => !!condition.field),
  conditions_any: (Array.isArray(rule.conditions_any) ? rule.conditions_any : [])
    .map((condition) => normalizeWorkflowCondition(condition))
    .filter((condition) => !!condition.field),
  effect: normalizeRuleEffect(rule),
});

export const normalizeConditionalFieldSettings = (
  settings?: Partial<ConditionalFieldSettings> | null
): ConditionalFieldSettings => ({
  rules: (Array.isArray(settings?.rules) ? settings?.rules : [])
    .map((rule) => normalizeConditionalFieldRule(rule))
    .filter((rule) => !!rule.targetFieldKey)
    .sort((a, b) => b.priority - a.priority || String(a.id).localeCompare(String(b.id))),
});

export const isConditionalFieldValueEmpty = (value: any) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

export const getConditionalFieldClearValue = (field?: ModuleField) => {
  if (!field) return null;
  if (ARRAY_FIELD_TYPES.has(field.type)) return [];
  if (field.type === FieldType.CHECKBOX) return false;
  if (
    field.type === FieldType.TEXT
    || field.type === FieldType.LONG_TEXT
    || field.type === FieldType.SUPER_LONG_TEXT
    || field.type === FieldType.PHONE
    || field.type === FieldType.LINK
  ) {
    return '';
  }
  return null;
};

export const resolveConditionalFieldState = (
  field: ModuleField,
  values: Record<string, any>,
  settings?: Partial<ConditionalFieldSettings> | null,
  allFields?: ModuleField[]
): ConditionalFieldRuntimeState => {
  const normalizedSettings = normalizeConditionalFieldSettings(settings);
  const fieldsByKey: Record<string, ModuleField> = Object.fromEntries(
    (allFields || [field]).map((item) => [item.key, item])
  );
  const relevantRules = normalizedSettings.rules.filter((rule) => rule.targetFieldKey === field.key && rule.enabled !== false);
  const baselineVisible = evaluateLegacyVisibilityRule(field.logic, values || {});
  const baselineRequired = field.validation?.required === true;

  if (!relevantRules.length) {
    return {
      hasRules: false,
      visible: baselineVisible,
      required: baselineRequired,
      defaultMode: 'inherit',
      defaultValue: field.defaultValue,
      matchedRule: null,
    };
  }

  const matchedRules = relevantRules.filter((rule) => {
    const conditionsAll = Array.isArray(rule.conditions_all) ? rule.conditions_all : [];
    const conditionsAny = Array.isArray(rule.conditions_any) ? rule.conditions_any : [];
    const allMatch = conditionsAll.length === 0 || conditionsAll.every((condition) => evaluateWorkflowCondition(condition, values || {}, fieldsByKey));
    const anyMatch = conditionsAny.length === 0 || conditionsAny.some((condition) => evaluateWorkflowCondition(condition, values || {}, fieldsByKey));
    return allMatch && anyMatch;
  });

  const matchedRule = matchedRules[0] || null;
  const hasPositiveRules = relevantRules.some((rule) => normalizeRuleEffect(rule).showField !== false);
  const effect = matchedRule ? normalizeRuleEffect(matchedRule) : DEFAULT_EFFECT;

  let required = baselineRequired;
  if (effect.requiredMode === 'force_required') required = true;
  if (effect.requiredMode === 'force_optional') required = false;

  return {
    hasRules: true,
    visible: matchedRule ? effect.showField !== false : !hasPositiveRules ? baselineVisible : false,
    required,
    defaultMode: effect.defaultMode,
    defaultValue: effect.defaultValue,
    matchedRule,
  };
};

export const buildConditionalFieldStateMap = (
  fields: ModuleField[],
  values: Record<string, any>,
  settings?: Partial<ConditionalFieldSettings> | null
) => Object.fromEntries(
  (fields || []).map((field) => [field.key, resolveConditionalFieldState(field, values, settings, fields)])
) as Record<string, ConditionalFieldRuntimeState>;
