import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingPayrollLedgerError } from './payrollLedger';

type SeniorityAnnualRate = {
  daily_rate_rials: number;
  monthly_rate_30day_rials: number;
  monthly_rate_31day_rials: number;
};

const TEHRAN_TZ = 'Asia/Tehran';
const PERSIAN_CALENDAR_LOCALE = 'fa-IR-u-ca-persian';

const getJalaliParts = (date: Date): { year: number; month: number; day: number } => {
  const formatter = new Intl.DateTimeFormat(PERSIAN_CALENDAR_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TEHRAN_TZ,
  });
  const parts = formatter.formatToParts(date);
  return {
    year: parseInt(parts.find((p) => p.type === 'year')?.value || '0', 10),
    month: parseInt(parts.find((p) => p.type === 'month')?.value || '0', 10),
    day: parseInt(parts.find((p) => p.type === 'day')?.value || '0', 10),
  };
};

/**
 * سال شمسی یک تاریخ ISO را برمی‌گرداند (با تایم‌زون تهران).
 */
export const getPersianYear = (dateIso: string): number => {
  const date = new Date(dateIso);
  if (isNaN(date.getTime())) return 0;
  return getJalaliParts(date).year;
};

/**
 * تعداد روزهای ماه شمسی برای یک تاریخ ISO را برمی‌گرداند.
 * ماه‌های ۱-۶: ۳۱ روز | ماه‌های ۷-۱۱: ۳۰ روز | ماه ۱۲: ۲۹/۳۰ روز
 */
export const getJalaliDaysInMonth = (dateIso: string): number => {
  const date = new Date(dateIso);
  if (isNaN(date.getTime())) return 30;
  const { month } = getJalaliParts(date);
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  // ماه اسفند: بررسی کبیسه بودن سال
  const { year } = getJalaliParts(date);
  // الگوریتم ساده برای تشخیص سال کبیسه شمسی
  const leapYears = [1, 5, 9, 13, 17, 22, 26, 30];
  return leapYears.includes(year % 33) ? 30 : 29;
};

/**
 * تعداد سال‌های کامل سابقه کارمند را محاسبه می‌کند.
 * هر دو تاریخ به‌صورت ISO (میلادی) وارد می‌شوند.
 * محاسبه بر اساس تقویم شمسی با تایم‌زون تهران انجام می‌شود.
 */
export const calcYearsOfService = (hireDateIso: string, periodEndIso: string): number => {
  const hireDate = new Date(hireDateIso);
  const endDate = new Date(periodEndIso + 'T23:59:59');
  if (isNaN(hireDate.getTime()) || isNaN(endDate.getTime())) return 0;
  if (endDate <= hireDate) return 0;

  const hire = getJalaliParts(hireDate);
  const end = getJalaliParts(endDate);

  let years = end.year - hire.year;
  // اگر هنوز به سالگرد نرسیده باشیم، یک سال کم می‌کنیم
  if (end.month < hire.month || (end.month === hire.month && end.day < hire.day)) {
    years--;
  }
  return Math.max(0, years);
};

/**
 * نرخ سالانه پایه سنوات را برای یک سال شمسی مشخص از دیتابیس می‌خواند.
 */
export const fetchSeniorityAnnualRate = async (
  supabase: SupabaseClient,
  persianYear: number,
): Promise<SeniorityAnnualRate | null> => {
  const { data, error } = await supabase
    .from('seniority_annual_rates')
    .select('daily_rate_rials, monthly_rate_30day_rials, monthly_rate_31day_rials')
    .eq('persian_year', persianYear)
    .maybeSingle();
  if (error || !data) return null;
  return {
    daily_rate_rials: Number(data.daily_rate_rials || 0),
    monthly_rate_30day_rials: Number(data.monthly_rate_30day_rials || 0),
    monthly_rate_31day_rials: Number(data.monthly_rate_31day_rials || 0),
  };
};

/**
 * مبلغ پایه سنوات ماهانه را طبق قانون کار ایران محاسبه می‌کند:
 *   سنوات = (تعداد سال‌های کامل سابقه) × (نرخ ماهانه سال جاری)
 *
 * نکته: نرخ ماهانه بستگی به تعداد روزهای ماه شمسی دارد (۳۰ یا ۳۱ روز).
 */
export const calcMonthlySeniorityPay = (
  yearsOfService: number,
  rate: SeniorityAnnualRate,
  daysInMonth: number,
): number => {
  if (yearsOfService < 1) return 0;
  const monthlyRate = daysInMonth >= 31 ? rate.monthly_rate_31day_rials : rate.monthly_rate_30day_rials;
  return yearsOfService * monthlyRate;
};

/**
 * یک entry پایه سنوات در payroll_calculation_entries ایجاد یا آپدیت می‌کند.
 * اگر `seniority_mode !== 'labor_law'` یا `hire_date` خالی باشد، مقدار صفر برمی‌گردد.
 * مقدار محاسبه‌شده (ریال) را برمی‌گرداند.
 */
export const syncSeniorityPayrollEntry = async (
  supabase: SupabaseClient,
  {
    employeeId,
    hireDate,
    periodStart,
    periodEnd,
  }: {
    employeeId: string;
    hireDate: string;
    periodStart: string;
    periodEnd: string;
  },
): Promise<number> => {
  const yearsOfService = calcYearsOfService(hireDate, periodEnd);
  if (yearsOfService < 1) {
    // اگر entry قبلاً وجود دارد و سابقه کافی نیست، void می‌کنیم
    await supabase
      .from('payroll_calculation_entries')
      .update({ status: 'voided', updated_at: new Date().toISOString() })
      .eq('employee_id', employeeId)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .eq('source_type', 'seniority')
      .in('status', ['draft', 'proposed']);
    return 0;
  }

  const persianYear = getPersianYear(periodEnd);
  const rate = await fetchSeniorityAnnualRate(supabase, persianYear);
  if (!rate) return 0;

  const daysInMonth = getJalaliDaysInMonth(periodEnd);
  const amount = calcMonthlySeniorityPay(yearsOfService, rate, daysInMonth);
  if (amount <= 0) return 0;

  // بررسی entry موجود
  const { data: existing, error: existingError } = await supabase
    .from('payroll_calculation_entries')
    .select('id, status')
    .eq('employee_id', employeeId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .eq('source_type', 'seniority')
    .neq('status', 'voided')
    .maybeSingle();

  if (existingError && !isMissingPayrollLedgerError(existingError)) return 0;

  const payload = {
    employee_id: employeeId,
    period_start: periodStart,
    period_end: periodEnd,
    entry_type: 'manual_bonus',
    source_type: 'seniority',
    title: 'پایه سنوات',
    amount,
    quantity: null as null,
    rate: null as null,
    status: 'proposed',
    details: {
      persian_year: persianYear,
      years_of_service: yearsOfService,
      hire_date: hireDate,
      daily_rate_rials: rate.daily_rate_rials,
      days_in_month: daysInMonth,
      monthly_rate_rials: daysInMonth >= 31 ? rate.monthly_rate_31day_rials : rate.monthly_rate_30day_rials,
    },
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    // فقط اگر status قابل ویرایش باشد آپدیت می‌کنیم
    if (['draft', 'proposed'].includes(String(existing.status || ''))) {
      const { error } = await supabase
        .from('payroll_calculation_entries')
        .update({ amount, details: payload.details, status: 'proposed', updated_at: payload.updated_at })
        .eq('id', existing.id);
      if (error && !isMissingPayrollLedgerError(error)) console.warn('[seniorityRuntime] update error', error);
    }
  } else {
    const { error } = await supabase
      .from('payroll_calculation_entries')
      .insert(payload);
    if (error && !isMissingPayrollLedgerError(error) && String(error?.code || '').toUpperCase() !== '23505') {
      console.warn('[seniorityRuntime] insert error', error);
    }
  }

  return amount;
};
