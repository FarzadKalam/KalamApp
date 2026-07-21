import { describe, expect, it } from 'vitest';
import { buildPayrollSlipDraft } from './payrollSlipDraft';

describe('payrollSlipDraft', () => {
  it('uses one set of lines and one insurance basis for preview and final slip', () => {
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
      advanceLines: [{ line_type: 'deduction', title: 'مساعده', amount: 300_000, description: '' }],
      insuranceSubject: true,
      employeeInsuranceRate: 7,
      employerInsuranceRate: 23,
      currencyLabel: 'تومان',
    });

    expect(draft.employeeInsuranceAmount).toBe(805_000);
    expect(draft.grossAmount).toBe(10_195_000);
    expect(draft.netAmount).toBe(10_195_000);
    expect(draft.lines.map((line) => line.title)).toEqual([
      'حقوق پایه',
      'حقوق عملکردی فعالیت‌ها',
      'تحقق هدف - پاداش هدف',
      'تاخیر / غیبت',
      'مساعده',
      'بیمه سهم کارمند',
    ]);
  });
});
