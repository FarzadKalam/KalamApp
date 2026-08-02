import { describe, expect, it } from 'vitest';
import { buildAttendancePresenceByGroup, enrichAttendancePresenceRows, getIncompleteAttendanceRowIds } from './attendancePresence';

describe('buildAttendancePresenceByGroup', () => {
  it('sums consecutive check-in and check-out pairs without counting the gap between them', () => {
    const rows = [
      {
        id: 'in-1',
        org_id: 'org-a',
        employee_id: 'employee-a',
        attendance_date: '2026-06-15',
        log_type: 'check_in',
        occurred_at: '2026-06-15T08:00:00+03:30',
      },
      {
        id: 'out-1',
        org_id: 'org-a',
        employee_id: 'employee-a',
        attendance_date: '2026-06-15',
        log_type: 'check_out',
        occurred_at: '2026-06-15T12:00:00+03:30',
      },
      {
        id: 'in-2',
        org_id: 'org-a',
        employee_id: 'employee-a',
        attendance_date: '2026-06-15',
        log_type: 'check_in',
        occurred_at: '2026-06-15T13:00:00+03:30',
      },
      {
        id: 'out-2',
        org_id: 'org-a',
        employee_id: 'employee-a',
        attendance_date: '2026-06-15',
        log_type: 'check_out',
        occurred_at: '2026-06-15T17:00:00+03:30',
      },
    ];
    const presence = buildAttendancePresenceByGroup(rows);

    expect(presence.get('org-a|employee:employee-a|2026-06-15')).toEqual({
      presence_minutes: 480,
      presence_hours: 8,
    });
    expect(enrichAttendancePresenceRows(rows).map((row) => row.presence_minutes)).toEqual([
      null,
      null,
      null,
      480,
    ]);
  });

  it('supports any number of consecutive entry and exit pairs', () => {
    const makeRow = (id: string, log_type: 'check_in' | 'check_out', occurred_at: string) => ({
      id,
      org_id: 'org-a',
      employee_id: 'employee-a',
      attendance_date: '2026-06-16',
      log_type,
      occurred_at,
    });
    const presence = buildAttendancePresenceByGroup([
      makeRow('in-1', 'check_in', '2026-06-16T08:00:00+03:30'),
      makeRow('out-1', 'check_out', '2026-06-16T10:00:00+03:30'),
      makeRow('in-2', 'check_in', '2026-06-16T11:00:00+03:30'),
      makeRow('out-2', 'check_out', '2026-06-16T14:30:00+03:30'),
      makeRow('in-3', 'check_in', '2026-06-16T15:15:00+03:30'),
      makeRow('out-3', 'check_out', '2026-06-16T17:45:00+03:30'),
    ]);

    expect(presence.get('org-a|employee:employee-a|2026-06-16')).toEqual({
      presence_minutes: 480,
      presence_hours: 8,
    });
  });

  it('identifies every unmatched entry or exit for the attendance warning', () => {
    const makeRow = (id: string, log_type: 'check_in' | 'check_out', occurred_at: string) => ({
      id,
      org_id: 'org-a',
      employee_id: 'employee-a',
      attendance_date: '2026-06-17',
      log_type,
      occurred_at,
    });
    const incompleteIds = getIncompleteAttendanceRowIds([
      makeRow('orphan-out', 'check_out', '2026-06-17T07:30:00+03:30'),
      makeRow('in-1', 'check_in', '2026-06-17T08:00:00+03:30'),
      makeRow('out-1', 'check_out', '2026-06-17T12:00:00+03:30'),
      makeRow('in-2', 'check_in', '2026-06-17T13:00:00+03:30'),
    ]);

    expect(Array.from(incompleteIds).sort()).toEqual(['in-2', 'orphan-out']);
  });

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
