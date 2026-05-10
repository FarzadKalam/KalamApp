import { describe, expect, it } from 'vitest';
import {
  buildOperationAmountPair,
  OPERATIONAL_FINANCIAL_PRINT_SUMMARY_FIELDS,
  computeOperationalFinancialTotals,
} from './operationalFinancialOverview';
import { buildListSummaryTableHtml } from './listPrintExport';

describe('operationalFinancialOverview', () => {
  it('maps operational payments by entity perspective', () => {
    expect(buildOperationAmountPair('customer', 'receipt', 500000)).toEqual({ debit: 0, credit: 500000 });
    expect(buildOperationAmountPair('customer', 'payment', 125000)).toEqual({ debit: 125000, credit: 0 });
    expect(buildOperationAmountPair('supplier', 'payment', 320000)).toEqual({ debit: 320000, credit: 0 });
    expect(buildOperationAmountPair('employee', 'receipt', 91000)).toEqual({ debit: 0, credit: 91000 });
  });

  it('computes totals and keeps the last running balance as final balance', () => {
    const totals = computeOperationalFinancialTotals([
      { debit: 800000, credit: 0, balance: 800000 },
      { debit: 0, credit: 250000, balance: 550000 },
      { debit: 0, credit: 150000, balance: 400000 },
    ]);

    expect(totals.totalDebit).toBe(800000);
    expect(totals.totalCredit).toBe(400000);
    expect(totals.finalBalance).toBe(400000);
  });

  it('renders printable summary html with shared list formatters', () => {
    const html = buildListSummaryTableHtml({
      title: 'جمع فیلتر جاری',
      fields: [...OPERATIONAL_FINANCIAL_PRINT_SUMMARY_FIELDS],
      values: {
        totalDebit: 1000,
        totalCredit: 1400,
        finalBalanceAmount: 400,
        finalBalanceSide: 'بستانکار',
      },
    });

    expect(html).toContain('جمع بدهکار');
    expect(html).toContain('جمع بستانکار');
    expect(html).toContain('ماهیت مانده');
    expect(html).toContain('۴۰۰');
    expect(html).toContain('بستانکار');
  });
});
