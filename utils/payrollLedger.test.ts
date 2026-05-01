import { describe, expect, it } from 'vitest';
import { mapPayrollLedgerEntriesToLines, sumPayrollLedgerEntries, type PayrollLedgerEntry } from './payrollLedger';

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
        description: 'منبع: goal',
        source_entry_id: 'bonus-1',
      },
      {
        line_type: 'deduction',
        title: 'برداشت کالا',
        amount: 250000,
        description: 'منبع: expense',
        source_entry_id: 'deduction-1',
      },
    ]);
  });
});
