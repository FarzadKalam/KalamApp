export type WorkScheduleShift = { start: string | null; end: string | null };

export type WorkScheduleDayPlan = {
  shift1: WorkScheduleShift;
  shift2: WorkScheduleShift;
};

export type WorkScheduleWeeklyPlan = Record<string, WorkScheduleDayPlan>;
export type WorkScheduleMonthlyPlan = Record<string, WorkScheduleDayPlan>;

const DAY_KEYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;

export const emptyWorkScheduleDayPlan = (): WorkScheduleDayPlan => ({
  shift1: { start: null, end: null },
  shift2: { start: null, end: null },
});

export const normalizeWorkScheduleDayPlan = (value: unknown): WorkScheduleDayPlan => {
  const raw = value as any;
  const normalizeTime = (time: unknown) => typeof time === 'string' && /^\d{2}:\d{2}$/.test(time) ? time : null;
  return {
    shift1: { start: normalizeTime(raw?.shift1?.start), end: normalizeTime(raw?.shift1?.end) },
    shift2: { start: normalizeTime(raw?.shift2?.start), end: normalizeTime(raw?.shift2?.end) },
  };
};

export const normalizeWorkScheduleWeeklyPlan = (value: unknown): WorkScheduleWeeklyPlan => (
  DAY_KEYS.reduce<WorkScheduleWeeklyPlan>((plan, dayKey) => {
    plan[dayKey] = normalizeWorkScheduleDayPlan((value as any)?.[dayKey]);
    return plan;
  }, {})
);

export const normalizeWorkScheduleMonthlyPlan = (value: unknown): WorkScheduleMonthlyPlan => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<WorkScheduleMonthlyPlan>((plan, [dateKey, dayPlan]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return plan;
    plan[dateKey] = normalizeWorkScheduleDayPlan(dayPlan);
    return plan;
  }, {});
};

/** برنامه ماهانه برای تاریخ دقیق اولویت دارد و برنامه‌های قدیمی با الگوی هفتگی همچنان معتبرند. */
export const resolveWorkScheduleDayPlan = ({
  monthlyPlan,
  weeklyPlan,
  dateKey,
  weekdayKey,
}: {
  monthlyPlan?: unknown;
  weeklyPlan?: unknown;
  dateKey: string;
  weekdayKey: string;
}): WorkScheduleDayPlan => {
  const normalizedMonthly = normalizeWorkScheduleMonthlyPlan(monthlyPlan);
  if (normalizedMonthly[dateKey]) return normalizedMonthly[dateKey];
  return normalizeWorkScheduleWeeklyPlan(weeklyPlan)[weekdayKey] || emptyWorkScheduleDayPlan();
};

export const isWorkScheduleDayPlanEmpty = (plan: WorkScheduleDayPlan) => (
  !plan.shift1.start && !plan.shift1.end && !plan.shift2.start && !plan.shift2.end
);
