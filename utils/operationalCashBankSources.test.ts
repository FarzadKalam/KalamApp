import { describe, expect, it } from 'vitest';
import {
  OPERATIONAL_CASH_BANK_SOURCE_MODULES,
  buildCashBankOperationPayloadFromPaymentRow,
  doesOperationalSourceMatchRecord,
  resolveOperationalPaymentRowKey,
  toOperationalSafeNumber,
} from './operationalCashBankSources';

describe('operationalCashBankSources', () => {
  it('reads Persian and Arabic digit amounts without dropping payment rows', () => {
    expect(toOperationalSafeNumber('۱٬۲۳۴٬۵۶۷')).toBe(1234567);
    expect(toOperationalSafeNumber('١٢٣٤٫٥')).toBe(1234.5);
  });

  it('maps payment source accounts to the correct treasury column', () => {
    const source = OPERATIONAL_CASH_BANK_SOURCE_MODULES.find((item) => item.moduleId === 'purchase_invoices');
    if (!source) throw new Error('purchase source not found');

    const accountModuleById = new Map([['cash-box-1', 'cash_boxes' as const]]);
    const { payload } = buildCashBankOperationPayloadFromPaymentRow({
      source,
      record: {
        id: 'purchase-1',
        invoice_date: '2026-04-28',
        supplier_id: 'supplier-1',
      },
      row: {
        payment_type: 'cash',
        status: 'paid',
        source_account: 'cash-box-1',
        amount: '۲۵۰٬۰۰۰',
        transfer_fee: '۱٬۵۰۰',
        date: '2026-04-28',
      },
      rowKey: 'row-1',
      accountModuleById,
    });

    expect(payload.status).toBe('received');
    expect(payload.amount).toBe(250000);
    expect(payload.transfer_fee).toBe(1500);
    expect(payload.payment_cash_box_id).toBe('cash-box-1');
    expect(payload.bank_account_id).toBeNull();
    expect(payload.cash_box_id).toBeNull();
    expect(payload.purchase_invoice_id).toBe('purchase-1');
    expect(payload.metadata?.source_row_key).toBe('row-1');
    expect(payload).not.toHaveProperty('payment_account_id');
  });

  it('uses legacy numeric key when row_key is missing', () => {
    expect(resolveOperationalPaymentRowKey({ key: 1776804382545 }, 0)).toBe('key_1776804382545');
    expect(resolveOperationalPaymentRowKey({}, 3)).toBe('legacy_3');
  });

  it('maps employee party to related_profile_id instead of assignee_id for payroll and advance sources', () => {
    const source = OPERATIONAL_CASH_BANK_SOURCE_MODULES.find((item) => item.moduleId === 'employee_advances');
    if (!source) throw new Error('employee advance source not found');

    const { payload } = buildCashBankOperationPayloadFromPaymentRow({
      source,
      record: {
        id: 'advance-1',
        request_date: '2026-05-18',
        employee_id: 'employee-1',
        employee: { related_profile_id: 'profile-employee-1' },
        assignee_id: 'profile-operator-1',
      },
      row: {
        payment_type: 'cash',
        status: 'paid',
        source_account: 'cash-box-1',
        amount: '500000',
      },
      rowKey: 'row-2',
      accountModuleById: new Map([['cash-box-1', 'cash_boxes' as const]]),
    });

    expect(payload.assignee_id).toBe('profile-operator-1');
    expect(payload.employee_id).toBe('profile-employee-1');
    expect(payload.employee_advance_id).toBe('advance-1');
  });

  it('maps return invoices through their shared storage tables with the reversed treasury direction', () => {
    const salesReturn = OPERATIONAL_CASH_BANK_SOURCE_MODULES.find((item) => item.moduleId === 'sales_return_invoices');
    const purchaseReturn = OPERATIONAL_CASH_BANK_SOURCE_MODULES.find((item) => item.moduleId === 'purchase_return_invoices');
    if (!salesReturn || !purchaseReturn) throw new Error('return invoice sources not found');

    expect(salesReturn.table).toBe('invoices');
    expect(salesReturn.operationType).toBe('payment');
    expect(purchaseReturn.table).toBe('purchase_invoices');
    expect(purchaseReturn.operationType).toBe('receipt');

    const salesReturnOperation = buildCashBankOperationPayloadFromPaymentRow({
      source: salesReturn,
      record: { id: 'sales-return-1', customer_id: 'customer-1', taxpayer_invoice_subject: '4' },
      row: { payment_type: 'cash', status: 'paid', target_account: 'cash-box-1', amount: 450000 },
      rowKey: 'return-row-1',
      accountModuleById: new Map([['cash-box-1', 'cash_boxes' as const]]),
    });
    const purchaseReturnOperation = buildCashBankOperationPayloadFromPaymentRow({
      source: purchaseReturn,
      record: { id: 'purchase-return-1', supplier_id: 'supplier-1', taxpayer_invoice_subject: '4' },
      row: { payment_type: 'cash', status: 'received', source_account: 'cash-box-1', amount: 330000 },
      rowKey: 'return-row-2',
      accountModuleById: new Map([['cash-box-1', 'cash_boxes' as const]]),
    });

    expect(salesReturnOperation.payload.operation_type).toBe('payment');
    expect(salesReturnOperation.payload.sales_invoice_id).toBe('sales-return-1');
    expect(purchaseReturnOperation.payload.operation_type).toBe('receipt');
    expect(purchaseReturnOperation.payload.purchase_invoice_id).toBe('purchase-return-1');
  });

  it('keeps normal and return records separate when their storage table is shared', () => {
    const sales = OPERATIONAL_CASH_BANK_SOURCE_MODULES.find((item) => item.moduleId === 'invoices');
    const salesReturn = OPERATIONAL_CASH_BANK_SOURCE_MODULES.find((item) => item.moduleId === 'sales_return_invoices');
    if (!sales || !salesReturn) throw new Error('sales sources not found');

    expect(doesOperationalSourceMatchRecord(sales, { taxpayer_invoice_subject: '1' })).toBe(true);
    expect(doesOperationalSourceMatchRecord(sales, { taxpayer_invoice_subject: '4' })).toBe(false);
    expect(doesOperationalSourceMatchRecord(salesReturn, { taxpayer_invoice_subject: '4' })).toBe(true);
  });
});
