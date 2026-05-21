import { describe, expect, it } from 'vitest';
import { attendanceLogsModule } from '../modules/attendanceLogsConfig';
import { cashBankOperationsConfig } from '../modules/cashBankOperationsConfig';
import { buildResolvedConditionalFieldSettings } from './conditionalFieldDefaults';
import { FieldType, type ModuleField } from '../types';
import {
  filterConditionallyVisibleFieldsForDataset,
  normalizeConditionalFieldSettings,
  resolveConditionalFieldState,
} from './conditionalFieldRules';

const getField = (key: string) => {
  const field = cashBankOperationsConfig.fields.find((entry) => entry.key === key);
  if (!field) {
    throw new Error(`Field not found: ${key}`);
  }
  return field;
};

describe('conditionalFieldRules', () => {
  it('keeps receipt account visible and required for receipts', () => {
    const settings = buildResolvedConditionalFieldSettings(cashBankOperationsConfig);
    const state = resolveConditionalFieldState(
      getField('receipt_account_id'),
      { operation_type: 'receipt', payment_type: 'cash' },
      settings,
      cashBankOperationsConfig.fields,
    );

    expect(state.visible).toBe(true);
    expect(state.required).toBe(true);
  });

  it('keeps payment account visible and required for payments and transfers', () => {
    const settings = buildResolvedConditionalFieldSettings(cashBankOperationsConfig);
    const paymentState = resolveConditionalFieldState(
      getField('payment_account_id'),
      { operation_type: 'payment', payment_type: 'cash' },
      settings,
      cashBankOperationsConfig.fields,
    );
    const transferState = resolveConditionalFieldState(
      getField('payment_account_id'),
      { operation_type: 'transfer', payment_type: 'transfer' },
      settings,
      cashBankOperationsConfig.fields,
    );
    const receiptState = resolveConditionalFieldState(
      getField('payment_account_id'),
      { operation_type: 'receipt', payment_type: 'cash' },
      settings,
      cashBankOperationsConfig.fields,
    );

    expect(paymentState.visible).toBe(true);
    expect(paymentState.required).toBe(true);
    expect(transferState.visible).toBe(true);
    expect(transferState.required).toBe(true);
    expect(receiptState.visible).toBe(false);
  });

  it('shows and requires cheque field only for cheque payments', () => {
    const settings = buildResolvedConditionalFieldSettings(cashBankOperationsConfig);
    const chequeState = resolveConditionalFieldState(
      getField('cheque_id'),
      { operation_type: 'payment', payment_type: 'cheque' },
      settings,
      cashBankOperationsConfig.fields,
    );
    const cashState = resolveConditionalFieldState(
      getField('cheque_id'),
      { operation_type: 'payment', payment_type: 'cash' },
      settings,
      cashBankOperationsConfig.fields,
    );

    expect(chequeState.visible).toBe(true);
    expect(chequeState.required).toBe(true);
    expect(cashState.visible).toBe(false);
  });

  it('shows only the matching attendance manual datetime field for the selected log type', () => {
    const settings = buildResolvedConditionalFieldSettings(attendanceLogsModule);
    const checkInField = attendanceLogsModule.fields.find((entry) => entry.key === 'manual_check_in_time');
    const checkOutField = attendanceLogsModule.fields.find((entry) => entry.key === 'manual_check_out_time');

    if (!checkInField || !checkOutField) throw new Error('Attendance manual datetime fields not found');

    const checkInState = resolveConditionalFieldState(
      checkInField,
      { log_type: 'check_in' },
      settings,
      attendanceLogsModule.fields,
    );
    const checkOutStateForCheckIn = resolveConditionalFieldState(
      checkOutField,
      { log_type: 'check_in' },
      settings,
      attendanceLogsModule.fields,
    );
    const checkInStateForCheckOut = resolveConditionalFieldState(
      checkInField,
      { log_type: 'check_out' },
      settings,
      attendanceLogsModule.fields,
    );
    const checkOutState = resolveConditionalFieldState(
      checkOutField,
      { log_type: 'check_out' },
      settings,
      attendanceLogsModule.fields,
    );

    expect(checkInState.visible).toBe(true);
    expect(checkOutStateForCheckIn.visible).toBe(false);
    expect(checkInStateForCheckOut.visible).toBe(false);
    expect(checkOutState.visible).toBe(true);
  });

  it('lets higher-priority user rules override required state', () => {
    const settings = buildResolvedConditionalFieldSettings(cashBankOperationsConfig, {
      rules: [
        {
          id: 'user:receipt-account:optional',
          targetFieldKey: 'receipt_account_id',
          source: 'user',
          enabled: true,
          priority: 999,
          conditions_all: [
            { id: 'op-receipt', field: 'operation_type', operator: 'eq', value: 'receipt' },
          ],
          conditions_any: [],
          effect: {
            showField: true,
            requiredMode: 'force_optional',
          },
        },
      ],
    });

    const state = resolveConditionalFieldState(
      getField('receipt_account_id'),
      { operation_type: 'receipt', payment_type: 'cash' },
      settings,
      cashBankOperationsConfig.fields,
    );

    expect(state.visible).toBe(true);
    expect(state.required).toBe(false);
  });

  it('normalizes legacy operators for saved conditional rules', () => {
    const settings = normalizeConditionalFieldSettings({
      rules: [
        {
          id: 'legacy-rule',
          targetFieldKey: 'cheque_id',
          source: 'user',
          enabled: true,
          priority: 1,
          conditions_all: [
            { id: 'legacy-condition', field: 'payment_type', operator: 'equals', value: 'cheque' },
          ],
          effect: { showField: true },
        },
      ],
    });

    expect(settings.rules[0]?.conditions_all?.[0]?.operator).toBe('eq');
  });

  it('keeps dataset columns only when a field is visible for at least one record', () => {
    const fields: ModuleField[] = [
      {
        key: 'mode',
        type: FieldType.SELECT,
        labels: { fa: 'حالت', en: 'Mode' },
        options: [
          { label: 'خودرو', value: 'car' },
          { label: 'پیاده', value: 'walk' },
        ],
      } as ModuleField,
      {
        key: 'plate_no',
        type: FieldType.TEXT,
        labels: { fa: 'پلاک', en: 'Plate' },
      } as ModuleField,
    ];
    const settings = normalizeConditionalFieldSettings({
      rules: [
        {
          id: 'show-plate-for-car',
          targetFieldKey: 'plate_no',
          source: 'user',
          enabled: true,
          priority: 100,
          conditions_all: [{ id: 'mode-car', field: 'mode', operator: 'eq', value: 'car' }],
          conditions_any: [],
          effect: { showField: true },
        },
      ],
    });

    const visibleInSomeRows = filterConditionallyVisibleFieldsForDataset(
      fields,
      fields,
      [
        { mode: 'walk', plate_no: '11الف111' },
        { mode: 'car', plate_no: '22ب222' },
      ],
      settings
    );
    const hiddenInAllRows = filterConditionallyVisibleFieldsForDataset(
      fields,
      fields,
      [{ mode: 'walk', plate_no: '11الف111' }],
      settings
    );

    expect(visibleInSomeRows.map((field) => field.key)).toEqual(['mode', 'plate_no']);
    expect(hiddenInAllRows.map((field) => field.key)).toEqual(['mode']);
  });

  it('evaluates multi-relation values as arrays in conditional rules', () => {
    const fields: ModuleField[] = [
      {
        key: 'meeting_employee_ids',
        type: FieldType.MULTI_RELATION,
        labels: { fa: 'کارکنان حاضر در جلسه', en: 'Meeting Employees' },
      } as ModuleField,
      {
        key: 'meeting_summary',
        type: FieldType.TEXT,
        labels: { fa: 'خلاصه جلسه', en: 'Meeting Summary' },
      } as ModuleField,
    ];
    const settings = normalizeConditionalFieldSettings({
      rules: [
        {
          id: 'show-summary-when-employee-present',
          targetFieldKey: 'meeting_summary',
          source: 'user',
          enabled: true,
          priority: 100,
          conditions_all: [
            {
              id: 'employee-present',
              field: 'meeting_employee_ids',
              operator: 'contains',
              value: '33333333-3333-4333-8333-333333333333',
            },
          ],
          conditions_any: [],
          effect: { showField: true },
        },
      ],
    });

    const visibleState = resolveConditionalFieldState(
      fields[1],
      {
        meeting_employee_ids: [
          '33333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444',
        ],
      },
      settings,
      fields,
    );
    const hiddenState = resolveConditionalFieldState(
      fields[1],
      {
        meeting_employee_ids: ['44444444-4444-4444-8444-444444444444'],
      },
      settings,
      fields,
    );

    expect(visibleState.visible).toBe(true);
    expect(hiddenState.visible).toBe(false);
  });
});
