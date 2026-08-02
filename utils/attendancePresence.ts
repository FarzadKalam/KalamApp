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

type AttendanceEventType = 'check_in' | 'check_out';

type AttendanceEvent = {
  rowId: string;
  type: AttendanceEventType;
  at: Date;
  order: number;
};

type AttendancePresenceDetail = {
  presence_minutes: number;
  presence_hours: number;
  finalCheckOutRowId: string;
};

type AttendancePairing = {
  segments: Array<{
    key: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    presenceMinutes: number;
    checkOutRowId: string | null;
  }>;
  incompleteRowIds: string[];
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

/**
 * هر ورود فقط با نخستین خروجِ بعد از خودش جفت می‌شود. ورود یا خروج بدون جفت
 * در محاسبه کارکرد وارد نمی‌شود تا فاصله‌های خارج از محل کار حضور تلقی نشوند.
 */
const buildAttendancePairing = (
  events: AttendanceEvent[],
  keyPrefix: string,
): AttendancePairing => {
  const orderedEvents = [...events].sort((a, b) => (
    a.at.getTime() - b.at.getTime()
    || (a.type === b.type ? a.order - b.order : a.type === 'check_in' ? -1 : 1)
    || a.rowId.localeCompare(b.rowId)
  ));
  const segments: AttendancePairing['segments'] = [];
  const incompleteRowIds: string[] = [];
  let activeCheckIn: AttendanceEvent | null = null;

  orderedEvents.forEach((event) => {
    if (event.type === 'check_in') {
      // ثبت ورود تکراری، ورودِ باز قبلی را ناقص می‌کند و آخرین ورود مبنای خروج بعدی است.
      if (activeCheckIn) incompleteRowIds.push(activeCheckIn.rowId);
      activeCheckIn = event;
      return;
    }
    if (!activeCheckIn) {
      incompleteRowIds.push(event.rowId);
      return;
    }

    const presenceMinutes = Math.floor((event.at.getTime() - activeCheckIn.at.getTime()) / 60000);
    if (presenceMinutes > 0 && presenceMinutes < 24 * 60) {
      segments.push({
        key: `${keyPrefix}::segment::${segments.length}`,
        checkInAt: activeCheckIn.at.toISOString(),
        checkOutAt: event.at.toISOString(),
        presenceMinutes,
        checkOutRowId: event.rowId,
      });
    } else {
      incompleteRowIds.push(activeCheckIn.rowId, event.rowId);
    }
    activeCheckIn = null;
  });

  if (activeCheckIn) incompleteRowIds.push(activeCheckIn.rowId);
  return { segments, incompleteRowIds };
};

export const buildAttendanceSegments = (
  events: AttendanceEvent[],
  keyPrefix: string,
) => buildAttendancePairing(events, keyPrefix).segments;

const buildAttendanceEventsByGroup = (rows: any[] = []) => {
  const grouped = new Map<string, AttendanceEvent[]>();
  (Array.isArray(rows) ? rows : []).forEach((row, order) => {
    const groupKey = getAttendanceGroupKey(row);
    if (!groupKey) return;
    const rowId = String(row?.id || `row-${order}`);
    const checkInAt = parseTimestamp(getAttendanceCheckInAt(row));
    const checkOutAt = parseTimestamp(getAttendanceCheckOutAt(row));
    const events = grouped.get(groupKey) || [];
    if (checkInAt) events.push({ rowId, type: 'check_in', at: checkInAt, order });
    if (checkOutAt) events.push({ rowId, type: 'check_out', at: checkOutAt, order });
    if (events.length) grouped.set(groupKey, events);
  });
  return grouped;
};

const buildAttendancePresenceDetailsByGroup = (rows: any[] = []) => {
  const result = new Map<string, AttendancePresenceDetail>();
  buildAttendanceEventsByGroup(rows).forEach((events, groupKey) => {
    const segments = buildAttendancePairing(events, groupKey).segments;
    if (!segments.length) return;
    const presenceMinutes = segments.reduce((sum, segment) => sum + segment.presenceMinutes, 0);
    const finalSegment = segments[segments.length - 1];
    if (!finalSegment.checkOutRowId) return;
    result.set(groupKey, {
      presence_minutes: presenceMinutes,
      presence_hours: Number((presenceMinutes / 60).toFixed(2)),
      finalCheckOutRowId: finalSegment.checkOutRowId,
    });
  });
  return result;
};

export const getIncompleteAttendanceRowIds = (rows: any[] = []) => {
  const incompleteRowIds = new Set<string>();
  buildAttendanceEventsByGroup(rows).forEach((events, groupKey) => {
    buildAttendancePairing(events, groupKey).incompleteRowIds.forEach((rowId) => incompleteRowIds.add(rowId));
  });
  return incompleteRowIds;
};

export const buildAttendancePresenceByGroup = (rows: any[] = []) => {
  const result = new Map<string, { presence_minutes: number; presence_hours: number }>();
  buildAttendancePresenceDetailsByGroup(rows).forEach((detail, groupKey) => {
    result.set(groupKey, {
      presence_minutes: detail.presence_minutes,
      presence_hours: detail.presence_hours,
    });
  });
  return result;
};

export const enrichAttendancePresenceRows = (rows: any[] = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const presenceByGroup = buildAttendancePresenceDetailsByGroup(rows);

  return rows.map((row, order) => {
    if (String(row?.log_type || '').trim() !== 'check_out') {
      return {
        ...row,
        presence_minutes: null,
        presence_hours: null,
      };
    }
    const groupKey = getAttendanceGroupKey(row);
    const presence = groupKey ? presenceByGroup.get(groupKey) : null;
    const rowId = String(row?.id || `row-${order}`);
    if (!presence || presence.finalCheckOutRowId !== rowId) {
      return {
        ...row,
        presence_minutes: null,
        presence_hours: null,
      };
    }
    return {
      ...row,
      presence_minutes: presence.presence_minutes,
      presence_hours: presence.presence_hours,
    };
  });
};
