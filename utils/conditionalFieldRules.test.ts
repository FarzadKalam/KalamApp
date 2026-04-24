import { describe, expect, it } from 'vitest';
import { cashBankOperationsConfig } from '../modules/cashBankOperationsConfig';
import { buildResolvedConditionalFieldSettings } from './conditionalFieldDefaults';
import { normalizeConditionalFieldSettings, resolveConditionalFieldState } from './conditionalFieldRules';

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
});
