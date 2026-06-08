const toNumber = (value: unknown): number => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const DEFAULT_SALARY_TYPE = 'fixed_only' as const;

export const SALARY_TYPE_OPTIONS = [
  { label: 'فقط حقوق ثابت', value: 'fixed_only' },
  { label: 'فقط حقوق ساعتی', value: 'hourly_only' },
  { label: 'ثابت + عملکردی', value: 'fixed_and_performance' },
  { label: 'ساعتی + عملکردی', value: 'hourly_and_performance' },
  { label: 'ثابت + عملکردی + پورسانت', value: 'fixed_performance_commission' },
  { label: 'ساعتی + عملکردی + پورسانت', value: 'hourly_performance_commission' },
  { label: 'ثابت + درصد از سود', value: 'fixed_and_profit_share' },
  { label: 'فقط درصد از سود', value: 'profit_share_only' },
] as const;

export type SalaryTypeValue = typeof SALARY_TYPE_OPTIONS[number]['value'];

export const HOURLY_SALARY_TYPE_VALUES = [
  'hourly',
  'hourly_only',
  'hourly_and_performance',
  'hourly_performance_commission',
] as const;

export const FIXED_BASE_SALARY_TYPE_VALUES = [
  'fixed_only',
  'fixed_and_performance',
  'fixed_performance_commission',
  'fixed_and_profit_share',
  'performance',
  'commission',
  'mixed',
] as const;

export const PERFORMANCE_SALARY_TYPE_VALUES = [
  'fixed_and_performance',
  'hourly_and_performance',
  'fixed_performance_commission',
  'hourly_performance_commission',
  'performance',
  'mixed',
] as const;

export const COMMISSION_SALARY_TYPE_VALUES = [
  'fixed_performance_commission',
  'hourly_performance_commission',
  'commission',
] as const;

export const PROFIT_SHARE_SALARY_TYPE_VALUES = [
  'fixed_and_profit_share',
  'profit_share_only',
  'profit_share',
] as const;

export const normalizeSalaryType = (salaryType: unknown): string => {
  const normalized = String(salaryType || '').trim().toLowerCase();
  switch (normalized) {
    case 'performance':
    case 'mixed':
      return 'fixed_and_performance';
    case 'hourly':
      return 'hourly_only';
    case 'commission':
      return 'fixed_performance_commission';
    case 'profit_share':
      return 'profit_share_only';
    default:
      return normalized || DEFAULT_SALARY_TYPE;
  }
};

export const getSalaryTypeLabelFa = (salaryType: unknown): string => {
  const normalized = normalizeSalaryType(salaryType);
  return SALARY_TYPE_OPTIONS.find((option) => option.value === normalized)?.label || 'نوع نامشخص';
};

export const isHourlySalaryType = (salaryType: unknown): boolean => {
  return normalizeSalaryType(salaryType).startsWith('hourly');
};

export const hasFixedSalaryComponent = (salaryType: unknown): boolean => {
  const normalized = normalizeSalaryType(salaryType);
  return normalized === DEFAULT_SALARY_TYPE || normalized.startsWith('fixed');
};

type ResolvePayrollBaseCompensationInput = {
  salaryType: unknown;
  baseSalary?: unknown;
  hourlyRate?: unknown;
  presenceMinutes?: number;
  requiredMinutes?: number;
};

export type PayrollBaseCompensation = {
  amount: number;
  displayTitle: 'حقوق پایه' | 'دستمزد ساعتی';
  hasValue: boolean;
  hourlyRate: number;
  isHourly: boolean;
  normalizedSalaryType: string;
};

export const resolvePayrollBaseCompensation = ({
  salaryType,
  baseSalary,
  hourlyRate,
  presenceMinutes = 0,
  requiredMinutes = 0,
}: ResolvePayrollBaseCompensationInput): PayrollBaseCompensation => {
  const normalizedSalaryType = normalizeSalaryType(salaryType);
  const fixedBaseSalary = toNumber(baseSalary);
  const explicitHourlyRate = toNumber(hourlyRate);

  if (isHourlySalaryType(normalizedSalaryType)) {
    const requiredHours = requiredMinutes > 0 ? requiredMinutes / 60 : 0;
    const resolvedHourlyRate = explicitHourlyRate > 0
      ? explicitHourlyRate
      : requiredHours > 0
        ? fixedBaseSalary / requiredHours
        : 0;
    const amount = resolvedHourlyRate > 0 && presenceMinutes > 0
      ? Math.round((presenceMinutes / 60) * resolvedHourlyRate)
      : 0;
    return {
      amount,
      displayTitle: 'دستمزد ساعتی',
      hasValue: amount > 0,
      hourlyRate: resolvedHourlyRate,
      isHourly: true,
      normalizedSalaryType,
    };
  }

  const amount = hasFixedSalaryComponent(normalizedSalaryType) ? fixedBaseSalary : 0;
  return {
    amount,
    displayTitle: 'حقوق پایه',
    hasValue: amount > 0,
    hourlyRate: explicitHourlyRate,
    isHourly: false,
    normalizedSalaryType,
  };
};
