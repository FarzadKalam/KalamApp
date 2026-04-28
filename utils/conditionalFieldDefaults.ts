import { ModuleDefinition, ModuleField } from '../types';
import {
  ConditionalFieldRule,
  ConditionalFieldSettings,
  normalizeConditionalFieldSettings,
  normalizeConditionalOperator,
} from './conditionalFieldRules';

const legacyRuleToConditions = (logic: any) => {
  const visibleIf = logic?.visibleIf;
  if (!visibleIf?.field || !visibleIf?.operator) return { conditions_all: [], conditions_any: [] };
  return {
    conditions_all: [
      {
        id: `legacy_${String(visibleIf.field)}_${String(visibleIf.operator)}`,
        field: String(visibleIf.field),
        operator: normalizeConditionalOperator(visibleIf.operator),
        value: visibleIf.value,
      },
    ],
    conditions_any: [],
  };
};

const buildLegacyFieldRule = (moduleId: string, field: ModuleField): ConditionalFieldRule | null => {
  if (!field?.logic?.visibleIf) return null;
  const conditions = legacyRuleToConditions(field.logic);
  return {
    id: `system:${moduleId}:${field.key}:legacy_visible_if`,
    targetFieldKey: field.key,
    source: 'system',
    locked: true,
    enabled: true,
    priority: 100,
    ...conditions,
    effect: {
      showField: true,
      requiredMode: 'inherit',
      defaultMode: 'inherit',
    },
  };
};

const buildCashBankSystemRules = (): ConditionalFieldRule[] => [
  {
    id: 'system:cash_bank_operations:payment_account_id:required_payment',
    targetFieldKey: 'payment_account_id',
    source: 'system',
    locked: true,
    enabled: true,
    priority: 240,
    conditions_all: [
      { id: 'operation_payment', field: 'operation_type', operator: 'eq', value: 'payment' },
    ],
    conditions_any: [],
    effect: { showField: true, requiredMode: 'force_required' },
  },
  {
    id: 'system:cash_bank_operations:payment_account_id:required_transfer',
    targetFieldKey: 'payment_account_id',
    source: 'system',
    locked: true,
    enabled: true,
    priority: 241,
    conditions_all: [
      { id: 'operation_transfer_payment', field: 'operation_type', operator: 'eq', value: 'transfer' },
    ],
    conditions_any: [],
    effect: { showField: true, requiredMode: 'force_required' },
  },
  {
    id: 'system:cash_bank_operations:receipt_account_id:required_receipt',
    targetFieldKey: 'receipt_account_id',
    source: 'system',
    locked: true,
    enabled: true,
    priority: 240,
    conditions_all: [
      { id: 'operation_receipt', field: 'operation_type', operator: 'eq', value: 'receipt' },
    ],
    conditions_any: [],
    effect: { showField: true, requiredMode: 'force_required' },
  },
  {
    id: 'system:cash_bank_operations:receipt_account_id:required_transfer',
    targetFieldKey: 'receipt_account_id',
    source: 'system',
    locked: true,
    enabled: true,
    priority: 241,
    conditions_all: [
      { id: 'operation_transfer_receipt', field: 'operation_type', operator: 'eq', value: 'transfer' },
    ],
    conditions_any: [],
    effect: { showField: true, requiredMode: 'force_required' },
  },
  {
    id: 'system:cash_bank_operations:cheque_id:payment_type',
    targetFieldKey: 'cheque_id',
    source: 'system',
    locked: true,
    enabled: true,
    priority: 220,
    conditions_all: [
      { id: 'operation_not_transfer', field: 'operation_type', operator: 'neq', value: 'transfer' },
      { id: 'payment_type_cheque', field: 'payment_type', operator: 'eq', value: 'cheque' },
    ],
    conditions_any: [],
    effect: { showField: true, requiredMode: 'force_required' },
  },
  {
    id: 'system:cash_bank_operations:cheque_id:hide_non_cheque',
    targetFieldKey: 'cheque_id',
    source: 'system',
    locked: true,
    enabled: true,
    priority: 230,
    conditions_all: [
      { id: 'operation_not_transfer', field: 'operation_type', operator: 'neq', value: 'transfer' },
      { id: 'payment_type_not_cheque', field: 'payment_type', operator: 'neq', value: 'cheque' },
    ],
    conditions_any: [],
    effect: { showField: false },
  },
  {
    id: 'system:cash_bank_operations:barter_id:payment_type',
    targetFieldKey: 'barter_id',
    source: 'system',
    locked: true,
    enabled: true,
    priority: 220,
    conditions_all: [
      { id: 'operation_not_transfer', field: 'operation_type', operator: 'neq', value: 'transfer' },
      { id: 'payment_type_barter', field: 'payment_type', operator: 'eq', value: 'barter' },
    ],
    conditions_any: [],
    effect: { showField: true, requiredMode: 'force_required' },
  },
  {
    id: 'system:cash_bank_operations:barter_id:hide_non_barter',
    targetFieldKey: 'barter_id',
    source: 'system',
    locked: true,
    enabled: true,
    priority: 230,
    conditions_all: [
      { id: 'operation_not_transfer', field: 'operation_type', operator: 'neq', value: 'transfer' },
      { id: 'payment_type_not_barter', field: 'payment_type', operator: 'neq', value: 'barter' },
    ],
    conditions_any: [],
    effect: { showField: false },
  },
  {
    id: 'system:cash_bank_operations:cash_box_id:hidden',
    targetFieldKey: 'cash_box_id',
    source: 'system',
    locked: true,
    enabled: true,
    priority: 1000,
    conditions_all: [],
    conditions_any: [],
    effect: { showField: false },
  },
];

const buildAttendanceLogsSystemRules = (): ConditionalFieldRule[] => [
  {
    id: 'system:attendance_logs:check_in_time:log_type',
    targetFieldKey: 'check_in_time',
    source: 'system',
    locked: true,
    enabled: true,
    priority: 220,
    conditions_all: [
      { id: 'attendance_log_type_check_in', field: 'log_type', operator: 'eq', value: 'check_in' },
    ],
    conditions_any: [],
    effect: { showField: true },
  },
  {
    id: 'system:attendance_logs:check_out_time:log_type',
    targetFieldKey: 'check_out_time',
    source: 'system',
    locked: true,
    enabled: true,
    priority: 220,
    conditions_all: [
      { id: 'attendance_log_type_check_out', field: 'log_type', operator: 'eq', value: 'check_out' },
    ],
    conditions_any: [],
    effect: { showField: true },
  },
  {
    id: 'system:attendance_logs:manual_check_in_time:log_type',
    targetFieldKey: 'manual_check_in_time',
    source: 'system',
    locked: true,
    enabled: true,
    priority: 220,
    conditions_all: [
      { id: 'attendance_log_type_manual_check_in', field: 'log_type', operator: 'eq', value: 'check_in' },
    ],
    conditions_any: [],
    effect: { showField: true },
  },
  {
    id: 'system:attendance_logs:manual_check_out_time:log_type',
    targetFieldKey: 'manual_check_out_time',
    source: 'system',
    locked: true,
    enabled: true,
    priority: 220,
    conditions_all: [
      { id: 'attendance_log_type_manual_check_out', field: 'log_type', operator: 'eq', value: 'check_out' },
    ],
    conditions_any: [],
    effect: { showField: true },
  },
];

export const getSystemConditionalFieldRules = (moduleDef?: Pick<ModuleDefinition, 'id' | 'fields'> | null) => {
  if (!moduleDef) return [] as ConditionalFieldRule[];
  const moduleId = String(moduleDef.id || '').trim();
  const fieldRules = (moduleDef.fields || [])
    .map((field) => buildLegacyFieldRule(moduleId, field))
    .filter(Boolean) as ConditionalFieldRule[];

  if (moduleId === 'cash_bank_operations') {
    return [...fieldRules, ...buildCashBankSystemRules()];
  }

  if (moduleId === 'attendance_logs') {
    return [...fieldRules, ...buildAttendanceLogsSystemRules()];
  }

  return fieldRules;
};

export const buildResolvedConditionalFieldSettings = (
  moduleDef?: Pick<ModuleDefinition, 'id' | 'fields'> | null,
  customSettings?: Partial<ConditionalFieldSettings> | null
) => normalizeConditionalFieldSettings({
  rules: [
    ...getSystemConditionalFieldRules(moduleDef),
    ...(Array.isArray(customSettings?.rules) ? customSettings.rules : []),
  ],
});
