import { describe, expect, it } from 'vitest';
import {
  autoAllocateInvoiceExcess,
  buildInvoicePaymentAllocationDescription,
  buildInvoicePaymentOverflowPlan,
  getInvoicePaymentAmount,
} from './invoicePaymentAllocation';

describe('invoice payment allocation', () => {
  it('ignores pending and canceled rows', () => {
    expect(getInvoicePaymentAmount({ amount: 100, status: 'pending' })).toBe(0);
    expect(getInvoicePaymentAmount({ amount: 100, status: 'canceled' })).toBe(0);
    expect(getInvoicePaymentAmount({ amount: 100, status: 'received' })).toBe(100);
  });

  it('trims the changed row and returns its excess', () => {
    const plan = buildInvoicePaymentOverflowPlan({
      totalAmount: 1000,
      previousPayments: [{ row_key: 'a', amount: 600, status: 'received' }],
      nextPayments: [
        { row_key: 'a', amount: 600, status: 'received' },
        { row_key: 'b', amount: 700, status: 'received', payment_type: 'cash' },
      ],
      allocationGroupKey: 'group-1',
    });
    expect(plan?.excessAmount).toBe(300);
    expect(plan?.sourcePayments[1].amount).toBe(400);
    expect(plan?.segments[0].paymentRow.payment_type).toBe('cash');
    expect(plan?.segments[0].paymentRow.description).toContain('واریز مبلغ ۷۰۰');
  });

  it('describes allocated payments using the source payment details', () => {
    expect(buildInvoicePaymentAllocationDescription({
      date: '2026-07-21',
      payment_type: 'transfer',
      ref_id: 'TR-123',
    }, 700)).toBe('لحاظ شده بابت واریز مبلغ ۷۰۰ در تاریخ ۱۴۰۵/۰۴/۳۰ بصورت انتقال شبا با شماره رهگیری/پیگیری TR-123');
  });

  it('does not allocate when the total is not exceeded', () => {
    expect(buildInvoicePaymentOverflowPlan({
      totalAmount: 1000,
      previousPayments: [],
      nextPayments: [{ row_key: 'a', amount: 1000, status: 'approved' }],
      allocationGroupKey: 'group-1',
    })).toBeNull();
  });

  it('allocates oldest candidates up to their remaining amounts', () => {
    expect(autoAllocateInvoiceExcess(700, [
      { id: '1', title: 'الف', invoiceDate: null, totalAmount: 500, paidAmount: 300, remainingAmount: 200 },
      { id: '2', title: 'ب', invoiceDate: null, totalAmount: 900, paidAmount: 200, remainingAmount: 700 },
    ])).toEqual([
      { invoiceId: '1', amount: 200 },
      { invoiceId: '2', amount: 500 },
    ]);
  });
});
