import { describe, expect, it } from 'vitest';
import { buildAttendancePresenceByGroup } from './attendancePresence';

describe('buildAttendancePresenceByGroup', () => {
  it('uses manual check-in and check-out timestamps instead of stale time fields', () => {
    const presence = buildAttendancePresenceByGroup([
      {
        org_id: 'org-a',
        employee_id: 'employee-a',
        attendance_date: '2026-06-15',
        log_type: 'check_in',
        manual_check_in_time: '2026-06-15T10:12:00+03:30',
        actual_check_in_time: '2026-06-15T15:45:00+03:30',
        check_in_time: '15:45',
      },
      {
        org_id: 'org-a',
        employee_id: 'employee-a',
        attendance_date: '2026-06-15',
        log_type: 'check_out',
        manual_check_out_time: '2026-06-15T20:03:00+03:30',
        actual_check_out_time: '2026-06-15T14:30:00+03:30',
        check_in_time: '15:45',
        check_out_time: '14:30',
      },
    ]);

    expect(presence.get('org-a|employee:employee-a|2026-06-15')).toEqual({
      presence_minutes: 591,
      presence_hours: 9.85,
    });
  });
});
