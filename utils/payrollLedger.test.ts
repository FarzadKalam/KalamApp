import { describe, expect, it } from 'vitest';
import { groupPayrollLedgerEntriesToSlipLines, mapPayrollLedgerEntriesToLines, sumPayrollLedgerEntries, type PayrollLedgerEntry } from './payrollLedger';

describe('payrollLedger', () => {
  it('maps positive and negative ledger entries to payroll lines', () => {
    const entries: PayrollLedgerEntry[] = [
      {
        id: 'bonus-1',
        employee_id: 'employee-1',
        entry_type: 'goal_bonus',
        source_type: 'goal',
        source_key: 'goal:1',
        title: 'پاداش هدف',
        amount: 1000000,
      },
      {
        id: 'deduction-1',
        employee_id: 'employee-1',
        entry_type: 'employee_purchase',
        source_type: 'expense',
        title: 'برداشت کالا',
        amount: -250000,
      },
    ];

    expect(sumPayrollLedgerEntries(entries)).toBe(750000);
    expect(mapPayrollLedgerEntriesToLines(entries)).toEqual([
      {
        line_type: 'bonus',
        title: 'پاداش هدف',
        amount: 1000000,
        description: 'پاداش هدف',
        source_entry_id: 'bonus-1',
      },
      {
        line_type: 'deduction',
        title: 'برداشت کالا',
        amount: 250000,
        description: 'برداشت کالا',
        source_entry_id: 'deduction-1',
      },
    ]);
  });

  it('describes attendance rows with hours, rates, and the selected currency', () => {
    const entries: PayrollLedgerEntry[] = [
      {
        id: 'overtime-1',
        employee_id: 'employee-1',
        entry_type: 'attendance_overtime',
        source_type: 'attendance_overtime',
        title: 'اضافه‌کاری',
        amount: 300000,
        quantity: 2,
        rate: 150000,
        details: { attendance_date: '2026-06-10' },
      },
    ];

    expect(mapPayrollLedgerEntriesToLines(entries, 'ریال')).toEqual([
      {
        line_type: 'bonus',
        title: 'اضافه‌کاری',
        amount: 300000,
        description: 'اضافه‌کاری تردد؛ ۲ ساعت × ۱۵۰٬۰۰۰ ریال؛ تاریخ: 2026-06-10',
        source_entry_id: 'overtime-1',
      },
    ]);
  });

  it('groups payroll ledger rows by final payroll slip line policy', () => {
    const entries: PayrollLedgerEntry[] = [
      {
        id: 'activity-1',
        employee_id: 'employee-1',
        entry_type: 'activity_performance',
        source_type: 'activity_performance',
        title: 'عملکرد نصب',
        amount: 100000,
        details: { formula_id: 'formula-a', source_rule_id: 'rule-a' },
      },
      {
        id: 'activity-2',
        employee_id: 'employee-1',
        entry_type: 'activity_performance',
        source_type: 'activity_performance',
        title: 'عملکرد نصب',
        amount: 150000,
        details: { formula_id: 'formula-a', source_rule_id: 'rule-a' },
      },
      {
        id: 'bonus-1',
        employee_id: 'employee-1',
        entry_type: 'employee_bonus',
        source_type: 'employee_bonus',
        title: 'پاداش دستی',
        amount: 50000,
      },
      {
        id: 'bonus-2',
        employee_id: 'employee-1',
        entry_type: 'employee_bonus',
        source_type: 'employee_bonus',
        title: 'پاداش دستی',
        amount: 75000,
      },
      {
        id: 'penalty-1',
        employee_id: 'employee-1',
        entry_type: 'penalty',
        source_type: 'employee_penalty',
        title: 'جریمه دستی',
        amount: -25000,
      },
    ];

    expect(groupPayrollLedgerEntriesToSlipLines(entries)).toMatchObject([
      { line_type: 'bonus', title: 'عملکرد نصب', amount: 250000, source_entry_ids: ['activity-1', 'activity-2'] },
      { line_type: 'bonus', title: 'پاداش‌های دستی', amount: 125000, source_entry_ids: ['bonus-1', 'bonus-2'] },
      { line_type: 'deduction', title: 'جریمه‌ها', amount: 25000, source_entry_ids: ['penalty-1'] },
    ]);
  });
});
