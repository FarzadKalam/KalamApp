import { describe, expect, it } from 'vitest';
import {
  OPERATIONAL_CASH_BANK_SOURCE_MODULES,
  buildCashBankOperationPayloadFromPaymentRow,
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
        date: '2026-04-28',
      },
      rowKey: 'row-1',
      accountModuleById,
    });

    expect(payload.status).toBe('received');
    expect(payload.amount).toBe(250000);
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
});
