import { describe, expect, it } from 'vitest';
import { calculatePayrollSlipTotals, sumPayrollSlipLines, sumPayrollSlipPayments } from './payrollSlipTotals';

describe('payrollSlipTotals', () => {
  it('sums payroll lines with signed deductions', () => {
    expect(sumPayrollSlipLines([
      { line_type: 'earning', amount: 1000000 },
      { line_type: 'bonus', amount: 250000 },
      { line_type: 'deduction', amount: 150000 },
    ])).toBe(1100000);
  });

  it('counts only included payment statuses when present', () => {
    expect(sumPayrollSlipPayments([
      { status: 'received', amount: 200000 },
      { status: 'draft', amount: 150000 },
      { status: 'paid', amount: 50000 },
    ])).toBe(250000);
  });

  it('builds gross and net payable from lines and payments', () => {
    expect(calculatePayrollSlipTotals({
      lines: [
        { line_type: 'earning', amount: 1200000 },
        { line_type: 'deduction', amount: 200000 },
      ],
      payments: [
        { status: 'paid', amount: 300000 },
      ],
    })).toEqual({
      grossAmount: 1000000,
      paidAmount: 300000,
      netPayable: 700000,
    });
  });
});
