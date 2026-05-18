import { describe, expect, it } from 'vitest';
import { normalizeModuleFormValues, transformModulePayloadForSave, validateModuleFormValues } from './moduleFormRuntime';

describe('moduleFormRuntime', () => {
  it('requires distinct payment and receipt accounts for transfers', () => {
    const relationOptions = {
      payment_account_id: [{ value: 'bank-1', module: 'bank_accounts' }],
      receipt_account_id: [{ value: 'bank-1', module: 'bank_accounts' }],
    };

    const error = validateModuleFormValues(
      'cash_bank_operations',
      {
        operation_type: 'transfer',
        payment_account_id: 'bank-1',
        receipt_account_id: 'bank-1',
      },
      relationOptions,
    );

    expect(error).toContain('یکسان');
  });

  it('maps synthetic transfer accounts into persisted account columns', () => {
    const payload = transformModulePayloadForSave(
      'cash_bank_operations',
      {
        operation_type: 'transfer',
        payment_account_id: 'cash-1',
        receipt_account_id: 'petty-1',
        bank_account_id: 'bank-legacy',
        cheque_id: 'cheque-1',
      },
      {
        payment_account_id: [{ value: 'cash-1', module: 'cash_boxes' }],
        receipt_account_id: [{ value: 'petty-1', module: 'petty_funds' }],
        bank_account_id: [{ value: 'bank-legacy', module: 'bank_accounts' }],
      },
    );

    expect(payload.payment_cash_box_id).toBe('cash-1');
    expect(payload.receipt_petty_fund_id).toBe('petty-1');
    expect(payload.bank_account_id).toBeNull();
    expect(payload.cheque_id).toBeNull();
    expect(payload).not.toHaveProperty('payment_account_id');
    expect(payload).not.toHaveProperty('receipt_account_id');
  });

  it('clears all non-transfer source links when transfer payload is saved', () => {
    const payload = transformModulePayloadForSave(
      'cash_bank_operations',
      {
        operation_type: 'transfer',
        payment_account_id: 'cash-1',
        receipt_account_id: 'bank-2',
        sales_invoice_id: 'inv-1',
        purchase_invoice_id: 'pinv-1',
        expense_document_id: 'exp-1',
        employee_advance_id: 'adv-1',
        payroll_slip_id: 'pay-1',
      },
      {
        payment_account_id: [{ value: 'cash-1', module: 'cash_boxes' }],
        receipt_account_id: [{ value: 'bank-2', module: 'bank_accounts' }],
      },
    );

    expect(payload.sales_invoice_id).toBeNull();
    expect(payload.purchase_invoice_id).toBeNull();
    expect(payload.expense_document_id).toBeNull();
    expect(payload.employee_advance_id).toBeNull();
    expect(payload.payroll_slip_id).toBeNull();
  });

  it('keeps legacy receipt account data visible but saves new receipts into receipt account columns', () => {
    const normalized = normalizeModuleFormValues('cash_bank_operations', {
      operation_type: 'receipt',
      bank_account_id: 'legacy-bank-1',
    });

    expect(normalized.receipt_account_id).toBe('legacy-bank-1');

    const payload = transformModulePayloadForSave(
      'cash_bank_operations',
      {
        ...normalized,
        receipt_account_id: 'legacy-bank-1',
      },
      {
        receipt_account_id: [{ value: 'legacy-bank-1', module: 'bank_accounts' }],
      },
    );

    expect(payload.receipt_bank_account_id).toBe('legacy-bank-1');
    expect(payload.bank_account_id).toBeNull();
    expect(payload.cash_box_id).toBeNull();
    expect(payload.petty_fund_id).toBeNull();
    expect(payload).not.toHaveProperty('receipt_account_id');
  });

  it('does not mirror assignee_id into employee_id for cash bank operations', () => {
    const payload = transformModulePayloadForSave(
      'cash_bank_operations',
      {
        operation_type: 'payment',
        assignee_id: 'profile-1',
      },
    );

    expect(payload.assignee_id).toBe('profile-1');
    expect(payload.employee_id).toBeNull();
  });

  it('preserves explicit employee_id when saving cash bank operations', () => {
    const payload = transformModulePayloadForSave(
      'cash_bank_operations',
      {
        operation_type: 'payment',
        assignee_id: 'profile-1',
        employee_id: 'employee-1',
      },
    );

    expect(payload.assignee_id).toBe('profile-1');
    expect(payload.employee_id).toBe('employee-1');
  });
});
