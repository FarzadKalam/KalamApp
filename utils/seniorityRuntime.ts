import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingPayrollLedgerError } from './payrollLedger';

type SeniorityAnnualRate = {
  daily_rate_rials: number;
  monthly_rate_30day_rials: number;
  monthly_rate_31day_rials: number;
};

export type SeniorityAttendanceDay = {
  date: string;
  scheduledMinutes: number;
  presenceMinutes: number;
  paidLeaveMinutes?: number;
};

export type SeniorityServiceRate = {
  persianYear: number;
  completedServiceYears: number;
  dailyRateRials: number;
};

export type SeniorityPayableDay = {
  date: string;
  persianYear: number;
  completedServiceYears: number;
  payableWeight: number;
};

type SeniorityPeriodCalculation = {
  amount: number;
  eligibleDays: number;
  payableDays: number;
  yearsOfService: number;
  rateDetails: Array<{
    persianYear: number;
    completedServiceYears: number;
    dailyRateRials: number;
    eligibleDays: number;
    payableDays: number;
  }>;
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

const clampUnit = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/**
 * وزن روزهای قابل پرداخت پایه سنوات را می‌سازد. روز تعطیل/استراحت در دورهٔ
 * اشتغال یک روز کامل است؛ در روز برنامه‌دار، حضور و مرخصی باحقوق تا سقف همان
 * برنامه اعتبار دارند تا اضافه‌حضور یک روز، غیبت روز دیگری را جبران نکند.
 */
export const getSeniorityPayableDays = (
  hireDateIso: string,
  periodStart: string,
  periodEnd: string,
  attendanceDays: SeniorityAttendanceDay[] = [],
): SeniorityPayableDay[] => {
  const attendanceByDate = new Map<string, SeniorityAttendanceDay>();
  attendanceDays.forEach((item) => {
    const date = getIsoDateOnly(item.date);
    if (!date) return;
    const current = attendanceByDate.get(date);
    attendanceByDate.set(date, {
      date,
      scheduledMinutes: Math.max(Number(current?.scheduledMinutes || 0), Number(item.scheduledMinutes || 0)),
      presenceMinutes: Math.max(0, Number(current?.presenceMinutes || 0)) + Math.max(0, Number(item.presenceMinutes || 0)),
      paidLeaveMinutes: Math.max(Number(current?.paidLeaveMinutes || 0), Number(item.paidLeaveMinutes || 0)),
    });
  });

  return getEligibleSeniorityDays(hireDateIso, periodStart, periodEnd).map((date) => {
    const attendance = attendanceByDate.get(date);
    const scheduledMinutes = Math.max(0, Number(attendance?.scheduledMinutes || 0));
    const creditedMinutes = Math.max(0, Number(attendance?.presenceMinutes || 0))
      + Math.max(0, Number(attendance?.paidLeaveMinutes || 0));
    return {
      date,
      persianYear: getPersianYear(date),
      completedServiceYears: calcYearsOfService(hireDateIso, date),
      payableWeight: scheduledMinutes > 0 ? clampUnit(creditedMinutes / scheduledMinutes) : 1,
    };
  });
};

export const calculateSeniorityAmountFromRates = (
  payableDays: SeniorityPayableDay[],
  serviceRates: SeniorityServiceRate[],
) => {
  const rateByKey = new Map(serviceRates.map((rate) => [
    `${rate.persianYear}:${rate.completedServiceYears}`,
    Math.max(0, Number(rate.dailyRateRials || 0)),
  ]));
  return Math.round(payableDays.reduce((sum, day) => {
    const rate = rateByKey.get(`${day.persianYear}:${day.completedServiceYears}`);
    if (rate === undefined) {
      throw new Error(`نرخ تجمیعی پایه سنوات سال ${day.persianYear} برای ${day.completedServiceYears} سال سابقه ثبت نشده است.`);
    }
    return sum + (rate * day.payableWeight);
  }, 0));
};

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
 * سازگاری با مصرف‌کننده‌های قدیمی نرخ یک‌سالۀ مصوب.
 * این helper نرخ تجمیعی سابقه را محاسبه نمی‌کند؛ محاسبهٔ جاری فیش از
 * `saas_seniority_service_rates` و روزهای قابل پرداخت استفاده می‌کند.
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
  attendanceDays: SeniorityAttendanceDay[] = [],
): Promise<SeniorityPeriodCalculation> => {
  const payableDayRows = getSeniorityPayableDays(hireDate, periodStart, periodEnd, attendanceDays);
  const yearsOfService = calcYearsOfService(hireDate, periodEnd);
  if (payableDayRows.length === 0) {
    return { amount: 0, eligibleDays: 0, payableDays: 0, yearsOfService, rateDetails: [] };
  }

  const persianYears = Array.from(new Set(payableDayRows.map((item) => item.persianYear)));
  const serviceYears = Array.from(new Set(payableDayRows.map((item) => item.completedServiceYears)));
  const { data, error } = await supabase
    .from('saas_seniority_service_rates')
    .select('persian_year, completed_service_years, daily_rate_rials')
    .in('persian_year', persianYears)
    .in('completed_service_years', serviceYears);
  if (error) throw error;

  const serviceRates: SeniorityServiceRate[] = (data || []).map((rate: any) => ({
    persianYear: Number(rate.persian_year || 0),
    completedServiceYears: Number(rate.completed_service_years || 0),
    dailyRateRials: Number(rate.daily_rate_rials || 0),
  }));
  const amount = calculateSeniorityAmountFromRates(payableDayRows, serviceRates);
  const rateByKey = new Map(serviceRates.map((rate) => [
    `${rate.persianYear}:${rate.completedServiceYears}`,
    rate.dailyRateRials,
  ]));
  const grouped = new Map<string, SeniorityPeriodCalculation['rateDetails'][number]>();
  payableDayRows.forEach((day) => {
    const key = `${day.persianYear}:${day.completedServiceYears}`;
    const current = grouped.get(key) || {
      persianYear: day.persianYear,
      completedServiceYears: day.completedServiceYears,
      dailyRateRials: rateByKey.get(key) || 0,
      eligibleDays: 0,
      payableDays: 0,
    };
    current.eligibleDays += 1;
    current.payableDays += day.payableWeight;
    grouped.set(key, current);
  });
  return {
    amount,
    eligibleDays: payableDayRows.length,
    payableDays: payableDayRows.reduce((sum, day) => sum + day.payableWeight, 0),
    yearsOfService,
    rateDetails: Array.from(grouped.values()),
  };
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
    attendanceDays = [],
  }: {
    employeeId: string;
    hireDate: string;
    periodStart: string;
    periodEnd: string;
    attendanceDays?: SeniorityAttendanceDay[];
  },
): Promise<number> => {
  const calculation = await calculateSeniorityForPeriod(
    supabase,
    hireDate,
    periodStart,
    periodEnd,
    attendanceDays,
  );
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
      payable_days: calculation.payableDays,
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
