import { describe, expect, it } from 'vitest';
import {
  buildOperationAmountPair,
  buildOperationalFinancialEntityPrintFields,
  buildOperationalFinancialEntityPrintValues,
  isEmployeeFinancialOverviewOperation,
  OPERATIONAL_FINANCIAL_PRINT_SUMMARY_FIELDS,
  computeOperationalFinancialTotals,
  formatOperationalFinancialDescription,
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

  it('formats financial amounts inside receipt descriptions with Persian grouping and decimals', () => {
    expect(formatOperationalFinancialDescription('لحاظ شده بابت واریز مبلغ 1250000.5؛ مانده: 2500000')).toBe(
      'لحاظ شده بابت واریز مبلغ ۱٬۲۵۰٬۰۰۰٫۵؛ مانده: ۲٬۵۰۰٬۰۰۰',
    );
  });

  it('keeps only payroll and advance cash-bank operations in employee financial overview', () => {
    expect(isEmployeeFinancialOverviewOperation({
      payroll_slip_id: 'pay-1',
      operation_type: 'payment',
    })).toBe(true);

    expect(isEmployeeFinancialOverviewOperation({
      employee_advance_id: 'adv-1',
      operation_type: 'payment',
    })).toBe(true);

    expect(isEmployeeFinancialOverviewOperation({
      employee_id: 'emp-1',
      operation_type: 'payment',
    })).toBe(false);

    expect(isEmployeeFinancialOverviewOperation({
      metadata: { source_table: 'employee_advances' },
      operation_type: 'payment',
    })).toBe(true);
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

  it('adds the main record fields to financial printing without selecting them by default', () => {
    const entityFields = [
      { key: 'business_name', label: 'نام تجاری', group: 'بخش: اطلاعات پایه', printValue: 'درمانگاه عطار' },
      { key: 'mobile_1', label: 'موبایل', group: 'بخش: اطلاعات تماس', printValue: '۰۹۱۲۱۲۳۴۵۶۷' },
    ];

    expect(buildOperationalFinancialEntityPrintFields(entityFields)).toEqual([
      expect.objectContaining({ key: 'entity__business_name', label: 'نام تجاری', group: 'بخش: اطلاعات پایه', defaultSelected: false, printSection: 'context' }),
      expect.objectContaining({ key: 'entity__mobile_1', label: 'موبایل', group: 'بخش: اطلاعات تماس', defaultSelected: false, printSection: 'context' }),
    ]);

    expect(buildOperationalFinancialEntityPrintValues(entityFields)).toEqual({
      entity__business_name: 'درمانگاه عطار',
      entity__mobile_1: '۰۹۱۲۱۲۳۴۵۶۷',
    });
  });
});
