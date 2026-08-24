import { describe, expect, it } from 'vitest';
import {
  customerClubRuleSupportsOnlinePaymentMessage,
  isCustomerPurchaseStatus,
  normalizeCustomerClubCode,
  resolveCustomerClubAmount,
} from './customerClub';

describe('customerClub utilities', () => {
  it('calculates fixed customer club amounts with an optional cap', () => {
    expect(resolveCustomerClubAmount({
      baseAmount: 1_000_000,
      type: 'amount',
      amount: 250_000,
    })).toBe(250_000);

    expect(resolveCustomerClubAmount({
      baseAmount: 1_000_000,
      type: 'amount',
      amount: 250_000,
      maxAmount: 100_000,
    })).toBe(100_000);
  });

  it('calculates percent customer club amounts with an optional cap', () => {
    expect(resolveCustomerClubAmount({
      baseAmount: 2_000_000,
      type: 'percent',
      percent: 5,
    })).toBe(100_000);

    expect(resolveCustomerClubAmount({
      baseAmount: 2_000_000,
      type: 'percent',
      percent: 15,
      maxAmount: 120_000,
    })).toBe(120_000);
  });

  it('normalizes discount codes for stable lookup and storage', () => {
    expect(normalizeCustomerClubCode('  club-1405  ')).toBe('CLUB-1405');
  });

  it('recognizes valid purchase statuses', () => {
    expect(isCustomerPurchaseStatus('prepayment')).toBe(true);
    expect(isCustomerPurchaseStatus('approved')).toBe(true);
    expect(isCustomerPurchaseStatus('created')).toBe(false);
    expect(isCustomerPurchaseStatus('proforma')).toBe(false);
    expect(isCustomerPurchaseStatus('cancelled')).toBe(false);
  });

  it('only exposes a post-payment customer message for rewards of the paying customer', () => {
    expect(customerClubRuleSupportsOnlinePaymentMessage('cashback')).toBe(true);
    expect(customerClubRuleSupportsOnlinePaymentMessage('first_purchase')).toBe(true);
    expect(customerClubRuleSupportsOnlinePaymentMessage('referral')).toBe(false);
    expect(customerClubRuleSupportsOnlinePaymentMessage('birthday')).toBe(false);
    expect(customerClubRuleSupportsOnlinePaymentMessage('leveling')).toBe(false);
  });
});
