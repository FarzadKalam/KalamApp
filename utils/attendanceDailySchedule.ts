import { resolveWorkScheduleDayPlan, type WorkScheduleDayPlan } from './workSchedulePlan';

export type DailyAttendanceSchedule = {
  employeeId: string;
  employeeName: string;
  shifts: WorkScheduleDayPlan;
  isScheduled: boolean;
  leave: { status: string; from: string | null; to: string | null } | null;
};

/** دادهٔ واحدِ صفحه روزانه و پیام ارسال‌شده؛ فقط کسانی را حاضر می‌داند که برای همان تاریخ شیفت دارند. */
export const buildDailyAttendanceSchedule = ({
  dateKey,
  weekdayKey,
  employees,
  schedules,
  leaves,
  isOfficialHoliday = false,
}: {
  dateKey: string;
  weekdayKey: string;
  employees: Array<{ id: string; full_name?: string | null; works_on_official_holidays?: boolean | null }>;
  schedules: Array<any>;
  leaves: Array<any>;
  /** جمعه با weekdayKey مدیریت می‌شود و نباید به‌جای تعطیل رسمی ارسال شود. */
  isOfficialHoliday?: boolean;
}): DailyAttendanceSchedule[] => employees.map((employee) => {
  const schedule = schedules.find((item) => {
    const columns = Array.isArray(item?.weekly_plan?.columns) ? item.weekly_plan.columns : [];
    return columns.some((column: any) => String(column?.employeeId || '') === String(employee.id));
  });
  const column = Array.isArray(schedule?.weekly_plan?.columns)
    ? schedule.weekly_plan.columns.find((item: any) => String(item?.employeeId || '') === String(employee.id))
    : null;
  const shifts = resolveWorkScheduleDayPlan({ monthlyPlan: column?.monthlyPlan, weeklyPlan: column?.weeklyPlan, dateKey, weekdayKey });
  const hasShift = Boolean(shifts.shift1.start || shifts.shift1.end || shifts.shift2.start || shifts.shift2.end);
  const isScheduled = hasShift && (!isOfficialHoliday || employee.works_on_official_holidays === true);
  const leaveRow = leaves.find((item) => String(item?.employee_id || '') === String(employee.id));
  return {
    employeeId: employee.id,
    employeeName: String(employee.full_name || 'بدون نام'),
    shifts,
    isScheduled,
    leave: leaveRow ? { status: String(leaveRow.status || 'pending'), from: leaveRow.start_datetime || leaveRow.date_from || null, to: leaveRow.end_datetime || leaveRow.date_to || null } : null,
  };
}).filter((item) => item.isScheduled);
