import { calculatePayrollSlipTotals } from './payrollSlipTotals';
import {
  groupPayrollLedgerEntriesToSlipLines,
  type PayrollLedgerEntry,
  type PayrollSlipLine,
} from './payrollLedger';

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export type PayrollSlipDraft = {
  lines: PayrollSlipLine[];
  payments: PayrollSlipPayment[];
  grossAmount: number;
  netAmount: number;
  employeeInsuranceAmount: number;
  employerInsuranceAmount: number;
  ledgerBonusTotal: number;
  ledgerDeductionTotal: number;
};

export type PayrollSlipPayment = {
  row_key: string;
  employee_advance_id?: string;
  payment_type: string;
  status: string;
  date?: string | null;
  amount: number;
  description: string;
  is_advance_settlement?: boolean;
  _readonly?: boolean;
  _lockedFields?: string[];
};

/**
 * تنها مرجع ساخت اقلام فیش از داده‌های آمادهٔ ویزارد است.
 * پیش‌نمایش و رکورد نهایی باید دقیقاً از همین خروجی استفاده کنند.
 */
export const buildPayrollSlipDraft = ({
  baseSalary,
  baseSalaryTitle,
  baseSalaryDescription,
  taskWageTotal,
  taskWageDescription,
  ledgerEntries,
  advancePayments,
  insuranceSubject,
  employeeInsuranceRate,
  employerInsuranceRate,
  currencyLabel,
}: {
  baseSalary: unknown;
  baseSalaryTitle: string;
  baseSalaryDescription: string;
  taskWageTotal: unknown;
  taskWageDescription: string;
  ledgerEntries: PayrollLedgerEntry[];
  advancePayments: PayrollSlipPayment[];
  insuranceSubject: boolean | null | undefined;
  employeeInsuranceRate: unknown;
  employerInsuranceRate: unknown;
  currencyLabel: string;
}): PayrollSlipDraft => {
  const resolvedBaseSalary = Math.max(0, toNumber(baseSalary));
  const resolvedTaskWageTotal = Math.max(0, toNumber(taskWageTotal));
  const ledgerLines = groupPayrollLedgerEntriesToSlipLines(ledgerEntries, currencyLabel);
  const linesBeforeInsurance: PayrollSlipLine[] = [
    ...(resolvedBaseSalary > 0 ? [{
      key: 'base_salary',
      line_type: 'earning' as const,
      title: baseSalaryTitle,
      amount: resolvedBaseSalary,
      description: baseSalaryDescription,
    }] : []),
    ...(resolvedTaskWageTotal > 0 ? [{
      key: 'task_wage',
      line_type: 'earning' as const,
      title: 'حقوق عملکردی فعالیت‌ها',
      amount: resolvedTaskWageTotal,
      description: taskWageDescription,
    }] : []),
    ...ledgerLines,
  ];

  // مبنای بیمه مجموع مزایای مثبتِ همین فیش است؛ کسورات و مساعده مبنای بیمه نیستند.
  const insuranceBase = linesBeforeInsurance.reduce((sum, line) => (
    line.line_type === 'deduction' ? sum : sum + Math.abs(toNumber(line.amount))
  ), 0);
  const employeeInsuranceAmount = insuranceSubject === false
    ? 0
    : (insuranceBase * Math.max(0, toNumber(employeeInsuranceRate))) / 100;
  const employerInsuranceAmount = insuranceSubject === false
    ? 0
    : (insuranceBase * Math.max(0, toNumber(employerInsuranceRate))) / 100;
  const lines: PayrollSlipLine[] = [
    ...linesBeforeInsurance,
    ...(employeeInsuranceAmount > 0 || employerInsuranceAmount > 0 ? [{
      key: 'employee_insurance',
      line_type: 'deduction' as const,
      title: 'بیمه سهم کارمند',
      amount: employeeInsuranceAmount,
      description: 'برآورد از تنظیمات پرسنل',
      metadata: { employer_insurance_amount: employerInsuranceAmount },
    }] : []),
  ];
  const payments = advancePayments
    .filter((payment) => Math.abs(toNumber(payment?.amount)) > 0)
    .map((payment) => ({ ...payment, amount: Math.abs(toNumber(payment.amount)) }));
  const totals = calculatePayrollSlipTotals({ lines, payments });

  return {
    lines,
    payments,
    grossAmount: totals.grossAmount,
    netAmount: totals.netPayable,
    employeeInsuranceAmount,
    employerInsuranceAmount,
    ledgerBonusTotal: ledgerLines
      .filter((line) => line.line_type === 'bonus')
      .reduce((sum, line) => sum + Math.abs(toNumber(line.amount)), 0),
    ledgerDeductionTotal: ledgerLines
      .filter((line) => line.line_type === 'deduction')
      .reduce((sum, line) => sum + Math.abs(toNumber(line.amount)), 0),
  };
};
