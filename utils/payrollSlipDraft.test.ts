import { describe, expect, it } from 'vitest';
import { buildPayrollSlipDraft } from './payrollSlipDraft';

describe('payrollSlipDraft', () => {
  it('keeps an advance as a related payment instead of a payroll deduction', () => {
    const draft = buildPayrollSlipDraft({
      baseSalary: 10_000_000,
      baseSalaryTitle: 'حقوق پایه',
      baseSalaryDescription: 'بازه آزمایشی',
      taskWageTotal: 1_000_000,
      taskWageDescription: '۲ فعالیت',
      ledgerEntries: [
        { id: 'goal', employee_id: 'employee', entry_type: 'bonus', source_type: 'goal_reward', title: 'پاداش هدف', amount: 500_000 },
        { id: 'late', employee_id: 'employee', entry_type: 'penalty', source_type: 'attendance_delay_absence', title: 'دیرکرد', amount: -200_000 },
      ],
      advancePayments: [{
        row_key: 'advance-1',
        employee_advance_id: 'advance-1',
        payment_type: 'credit',
        status: 'paid',
        amount: 300_000,
        description: 'تسویه با مساعده',
      }],
      insuranceSubject: true,
      employeeInsuranceRate: 7,
      employerInsuranceRate: 23,
      currencyLabel: 'تومان',
    });

    expect(draft.employeeInsuranceAmount).toBe(805_000);
    expect(draft.grossAmount).toBe(10_495_000);
    expect(draft.netAmount).toBe(10_195_000);
    expect(draft.lines.map((line) => line.title)).toEqual([
      'حقوق پایه',
      'حقوق عملکردی فعالیت‌ها',
      'تحقق هدف - پاداش هدف',
      'تاخیر / غیبت',
      'بیمه سهم کارمند',
    ]);
    expect(draft.lines.find((line) => line.key === 'base_salary')).toMatchObject({ amount: 10_000_000 });
    expect(draft.lines.find((line) => line.key === 'task_wage')).toMatchObject({ amount: 1_000_000 });
    expect(draft.lines.find((line) => line.key === 'employee_insurance')).toMatchObject({
      amount: 805_000,
      metadata: { employer_insurance_amount: 2_645_000 },
    });
    expect(draft.payments).toEqual([expect.objectContaining({ employee_advance_id: 'advance-1', amount: 300_000 })]);
  });

  it('derives ledger subtotals from the final line type, not from a signed amount alone', () => {
    const draft = buildPayrollSlipDraft({
      baseSalary: 0,
      baseSalaryTitle: 'حقوق پایه',
      baseSalaryDescription: '',
      taskWageTotal: 0,
      taskWageDescription: '',
      ledgerEntries: [
        { id: 'penalty', employee_id: 'employee', entry_type: 'penalty', source_type: 'employee_penalty', title: 'جریمه', amount: 250000 },
      ],
      advancePayments: [],
      insuranceSubject: false,
      employeeInsuranceRate: 0,
      employerInsuranceRate: 0,
      currencyLabel: 'تومان',
    });

    expect(draft.ledgerBonusTotal).toBe(0);
    expect(draft.ledgerDeductionTotal).toBe(250000);
    expect(draft.grossAmount).toBe(-250000);
  });
});
