import { describe, expect, it } from 'vitest';
import { resolveChequeStatusForPayment, shouldMarkChequeAsSpent } from './chequePaymentStatus';

describe('cheque payment status', () => {
  it('marks an issued or received cheque as spent for a completed payment', () => {
    expect(shouldMarkChequeAsSpent({ operationType: 'payment', paymentStatus: 'received' })).toBe(true);
    expect(resolveChequeStatusForPayment({
      operationType: 'payment',
      paymentStatus: 'approved',
      currentChequeStatus: 'new',
    })).toBe('paid');
  });

  it('keeps a cheque available while the payment is pending', () => {
    expect(shouldMarkChequeAsSpent({ operationType: 'payment', paymentStatus: 'pending' })).toBe(false);
    expect(resolveChequeStatusForPayment({
      operationType: 'payment',
      paymentStatus: 'pending',
      currentChequeStatus: 'new',
    })).toBe('new');
  });

  it('does not mark a received cheque as spent for a receipt', () => {
    expect(resolveChequeStatusForPayment({
      operationType: 'receipt',
      paymentStatus: 'received',
      currentChequeStatus: 'new',
    })).toBe('new');
  });
});
