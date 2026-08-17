export const ATTENDANCE_AUTO_VOID_REASON = 'automatic_recalculation';
export const ATTENDANCE_MANUAL_VOID_REASON = 'manual_exclusion';

type AttendanceLedgerEntryLike = {
  source_type?: string | null;
  status?: string | null;
  details?: Record<string, unknown> | null;
};

export const buildAttendanceShortageDecisionSignature = (
  entries: AttendanceLedgerEntryLike[],
) => entries
  .filter((entry) => String(entry.source_type || '').trim() === 'attendance_shortage_decision')
  .map((entry) => {
    const rowKey = String(entry.details?.attendance_row_key || '').trim();
    const decision = String(entry.details?.decision || '').trim();
    const status = String(entry.status || '').trim();
    return rowKey && decision ? `${rowKey}:${decision}:${status}` : '';
  })
  .filter(Boolean)
  .sort()
  .join('|');

export const canRefreshAttendanceLedgerEntry = (entry: AttendanceLedgerEntryLike | null | undefined) => {
  const status = String(entry?.status || '').trim();
  if (status !== 'voided') return status !== 'included_in_payroll';
  return String(entry?.details?.void_reason || '').trim() === ATTENDANCE_AUTO_VOID_REASON;
};
