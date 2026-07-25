const parseTimestamp = (value: unknown): Date | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getAttendanceLogType = (row: any): string =>
  String(row?.log_type || '').trim().toLowerCase();

export const getAttendanceDateValue = (row: any): string => {
  const direct = String(row?.attendance_date || '').trim();
  if (direct) return direct.slice(0, 10);
  const source = row?.manual_check_in_time
    || row?.manual_check_out_time
    || row?.actual_check_in_time
    || row?.actual_check_out_time
    || row?.occurred_at;
  const parsed = parseTimestamp(source);
  return parsed ? parsed.toISOString().slice(0, 10) : '';
};

const combineAttendanceDateTime = (row: any, timeValue: unknown): string | null => {
  const date = getAttendanceDateValue(row);
  const time = String(timeValue ?? '').trim();
  if (!date || !time) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return `${date}T${String(match[1]).padStart(2, '0')}:${match[2]}:${match[3] || '00'}`;
};

const getAttendancePersonKey = (row: any): string => {
  const employeeId = String(row?.employee_id ?? '').trim();
  if (employeeId) return `employee:${employeeId}`;
  const profileId = String(row?.related_profile_id ?? '').trim();
  if (profileId) return `profile:${profileId}`;
  const assigneeId = String(row?.assignee_id ?? '').trim();
  if (assigneeId) return `assignee:${assigneeId}`;
  const label = String(row?.employee_label || row?.related_employee_label || row?.employee_name || '').trim();
  return label ? `label:${label}` : 'unknown';
};

const getAttendanceGroupKey = (row: any): string => {
  const orgId = String(row?.org_id ?? '').trim() || 'no-org';
  const personKey = getAttendancePersonKey(row);
  const dateKey = getAttendanceDateValue(row);
  return dateKey ? `${orgId}|${personKey}|${dateKey}` : '';
};

export const getAttendanceCheckInAt = (row: any): string | null => {
  const logType = getAttendanceLogType(row);
  if (logType === 'check_out') return null;
  return String(row?.manual_check_in_time || '').trim()
    || String(row?.actual_check_in_time || '').trim()
    || combineAttendanceDateTime(row, row?.check_in_time)
    || (logType === 'check_in' ? String(row?.occurred_at || '').trim() || null : null);
};

export const getAttendanceCheckOutAt = (row: any): string | null => {
  const logType = getAttendanceLogType(row);
  if (logType === 'check_in') return null;
  return String(row?.manual_check_out_time || '').trim()
    || String(row?.actual_check_out_time || '').trim()
    || combineAttendanceDateTime(row, row?.check_out_time)
    || (logType === 'check_out' ? String(row?.occurred_at || '').trim() || null : null);
};

export const buildAttendancePresenceByGroup = (rows: any[] = []) => {
  const grouped = new Map<string, { checkIns: Date[]; checkOuts: Date[] }>();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const groupKey = getAttendanceGroupKey(row);
    if (!groupKey) return;
    const checkInAt = parseTimestamp(getAttendanceCheckInAt(row));
    const checkOutAt = parseTimestamp(getAttendanceCheckOutAt(row));
    if (!checkInAt && !checkOutAt) return;
    const group = grouped.get(groupKey) || { checkIns: [], checkOuts: [] };
    if (checkInAt) group.checkIns.push(checkInAt);
    if (checkOutAt) group.checkOuts.push(checkOutAt);
    grouped.set(groupKey, group);
  });

  const result = new Map<string, { presence_minutes: number; presence_hours: number }>();
  grouped.forEach((group, groupKey) => {
    if (!group.checkIns.length || !group.checkOuts.length) return;
    const firstCheckIn = new Date(Math.min(...group.checkIns.map((item) => item.getTime())));
    const lastCheckOut = new Date(Math.max(...group.checkOuts.map((item) => item.getTime())));
    const diffMs = lastCheckOut.getTime() - firstCheckIn.getTime();
    if (diffMs < 0 || diffMs >= 24 * 60 * 60 * 1000) return;
    const presenceMinutes = Math.floor(diffMs / 60000);
    result.set(groupKey, {
      presence_minutes: presenceMinutes,
      presence_hours: Number((presenceMinutes / 60).toFixed(2)),
    });
  });
  return result;
};

export const enrichAttendancePresenceRows = (rows: any[] = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const presenceByGroup = buildAttendancePresenceByGroup(rows);
  if (presenceByGroup.size === 0) return rows;

  return rows.map((row) => {
    if (String(row?.log_type || '').trim() !== 'check_out') {
      return {
        ...row,
        presence_minutes: null,
        presence_hours: null,
      };
    }
    const groupKey = getAttendanceGroupKey(row);
    const presence = groupKey ? presenceByGroup.get(groupKey) : null;
    if (!presence) return row;
    return {
      ...row,
      presence_minutes: row?.presence_minutes ?? presence.presence_minutes,
      presence_hours: row?.presence_hours ?? presence.presence_hours,
    };
  });
};
