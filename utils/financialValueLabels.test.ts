import { describe, expect, it } from 'vitest';
import { getFinancialPaymentTypeLabelFa, getFinancialStatusLabelFa } from './financialValueLabels';

describe('getFinancialStatusLabelFa', () => {
  it('translates financial status codes before they reach a table or public page', () => {
    expect(getFinancialStatusLabelFa('received')).toBe('دریافت شده');
    expect(getFinancialStatusLabelFa('in_bank')).toBe('در جریان وصول');
    expect(getFinancialStatusLabelFa('processing')).toBe('در حال پردازش');
  });

  it('does not expose an unknown technical status code to the audience', () => {
    expect(getFinancialStatusLabelFa('provider_waiting')).toBe('وضعیت تعریف‌نشده');
    expect(getFinancialStatusLabelFa('در انتظار بررسی')).toBe('در انتظار بررسی');
  });

  it('uses Persian labels for payment methods too', () => {
    expect(getFinancialPaymentTypeLabelFa('pos')).toBe('کارتخوان');
    expect(getFinancialPaymentTypeLabelFa('bank_transfer')).toBe('انتقال شبا');
    expect(getFinancialPaymentTypeLabelFa('gateway_pending')).toBe('روش پرداخت تعریف‌نشده');
  });
});
