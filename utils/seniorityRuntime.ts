import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingPayrollLedgerError } from './payrollLedger';

type SeniorityAnnualRate = {
  daily_rate_rials: number;
  monthly_rate_30day_rials: number;
  monthly_rate_31day_rials: number;
};

type SeniorityPeriodCalculation = {
  amount: number;
  eligibleDays: number;
  yearsOfService: number;
  rateDetails: Array<{ persianYear: number; dailyRateRials: number; eligibleDays: number }>;
};

const TEHRAN_TZ = 'Asia/Tehran';
const PERSIAN_CALENDAR_LOCALE = 'fa-IR-u-ca-persian';

const parseLocaleInteger = (value: string | undefined) => {
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const normalized = String(value || '')
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)));
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getJalaliParts = (date: Date): { year: number; month: number; day: number } => {
  const formatter = new Intl.DateTimeFormat(PERSIAN_CALENDAR_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TEHRAN_TZ,
  });
  const parts = formatter.formatToParts(date);
  return {
    year: parseLocaleInteger(parts.find((p) => p.type === 'year')?.value),
    month: parseLocaleInteger(parts.find((p) => p.type === 'month')?.value),
    day: parseLocaleInteger(parts.find((p) => p.type === 'day')?.value),
  };
};

const getIsoDateOnly = (value: string) => String(value || '').trim().slice(0, 10);

const getIsoDatesInRange = (periodStart: string, periodEnd: string): string[] => {
  const start = getIsoDateOnly(periodStart);
  const end = getIsoDateOnly(periodEnd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return [];

  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00.000Z`);
  const last = new Date(`${end}T12:00:00.000Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
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
  const hireDate = new Date(`${getIsoDateOnly(hireDateIso)}T12:00:00+03:30`);
  const endDate = new Date(`${getIsoDateOnly(periodEndIso)}T23:59:59+03:30`);
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
 * روزهای واجد دریافت پایه سنوات را در بازه فیش برمی‌گرداند.
 * مبنای روزشمار، تقویم شمسی و لحظه تکمیل یک سال سابقه است؛ بنابراین
 * اگر سالگرد استخدام در میانه ماه باشد، فقط روزهای واجد شرایط محاسبه می‌شوند.
 */
export const getEligibleSeniorityDays = (
  hireDateIso: string,
  periodStart: string,
  periodEnd: string,
) => getIsoDatesInRange(periodStart, periodEnd)
  .filter((date) => calcYearsOfService(hireDateIso, date) >= 1);

/**
 * نرخ سالانه پایه سنوات را برای یک سال شمسی مشخص از دیتابیس می‌خواند.
 */
export const fetchSeniorityAnnualRate = async (
  supabase: SupabaseClient,
  persianYear: number,
): Promise<SeniorityAnnualRate | null> => {
  const { data, error } = await supabase
    .from('saas_seniority_annual_rates')
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
 *   سنوات = نرخ روزانه مصوب همان سال × تعداد روزهای ماه
 * داشتن حداقل یک سال سابقه، شرط برخورداری است؛ مبلغ پایه سنوات به تعداد سال‌های سابقه ضرب نمی‌شود.
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
  return monthlyRate;
};

const calculateSeniorityForPeriod = async (
  supabase: SupabaseClient,
  hireDate: string,
  periodStart: string,
  periodEnd: string,
): Promise<SeniorityPeriodCalculation> => {
  const eligibleDates = getEligibleSeniorityDays(hireDate, periodStart, periodEnd);
  const yearsOfService = calcYearsOfService(hireDate, periodEnd);
  if (eligibleDates.length === 0) {
    return { amount: 0, eligibleDays: 0, yearsOfService, rateDetails: [] };
  }

  const eligibleDaysByPersianYear = eligibleDates.reduce<Map<number, number>>((result, date) => {
    const persianYear = getPersianYear(date);
    result.set(persianYear, (result.get(persianYear) || 0) + 1);
    return result;
  }, new Map());
  const ratesByYear = new Map<number, SeniorityAnnualRate>();
  await Promise.all(Array.from(eligibleDaysByPersianYear.keys()).map(async (persianYear) => {
    const rate = await fetchSeniorityAnnualRate(supabase, persianYear);
    if (!rate || rate.daily_rate_rials <= 0) {
      throw new Error(`نرخ مصوب پایه سنوات سال ${persianYear} ثبت نشده است.`);
    }
    ratesByYear.set(persianYear, rate);
  }));

  const rateDetails = Array.from(eligibleDaysByPersianYear.entries()).map(([persianYear, eligibleDays]) => ({
    persianYear,
    eligibleDays,
    dailyRateRials: ratesByYear.get(persianYear)?.daily_rate_rials || 0,
  }));
  const amount = Math.round(rateDetails.reduce(
    (sum, item) => sum + (item.dailyRateRials * item.eligibleDays),
    0,
  ));
  return { amount, eligibleDays: eligibleDates.length, yearsOfService, rateDetails };
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
  const calculation = await calculateSeniorityForPeriod(supabase, hireDate, periodStart, periodEnd);
  if (calculation.eligibleDays === 0) {
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
  const amount = calculation.amount;
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
      persian_year: getPersianYear(periodEnd),
      years_of_service: calculation.yearsOfService,
      hire_date: hireDate,
      eligible_days: calculation.eligibleDays,
      rate_details: calculation.rateDetails,
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
