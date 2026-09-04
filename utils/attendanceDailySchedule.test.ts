import { describe, expect, it } from 'vitest';
import { buildDailyAttendanceSchedule } from './attendanceDailySchedule';

const schedule = [{
  weekly_plan: {
    columns: [{
      employeeId: 'employee-1',
      weeklyPlan: {
        fri: {
          shift1: { start: '08:00', end: '16:00' },
          shift2: { start: null, end: null },
        },
      },
    }],
  },
}];

describe('buildDailyAttendanceSchedule', () => {
  it('does not turn Friday into a statutory holiday', () => {
    const rows = buildDailyAttendanceSchedule({
      dateKey: '2026-03-27',
      weekdayKey: 'fri',
      employees: [{ id: 'employee-1', full_name: 'کارمند نمونه', works_on_official_holidays: false }],
      schedules: schedule,
      leaves: [],
      isOfficialHoliday: false,
    });

    expect(rows).toHaveLength(1);
  });

  it('excludes employees without holiday-work permission only on statutory holidays', () => {
    const common = {
      dateKey: '2026-03-27',
      weekdayKey: 'fri',
      schedules: schedule,
      leaves: [],
      isOfficialHoliday: true,
    };

    expect(buildDailyAttendanceSchedule({
      ...common,
      employees: [{ id: 'employee-1', full_name: 'کارمند نمونه', works_on_official_holidays: false }],
    })).toEqual([]);

    expect(buildDailyAttendanceSchedule({
      ...common,
      employees: [{ id: 'employee-1', full_name: 'کارمند نمونه', works_on_official_holidays: true }],
    })).toHaveLength(1);
  });
});
