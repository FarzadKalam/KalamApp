import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_AUTO_VOID_REASON,
  buildAttendanceShortageDecisionSignature,
  canRefreshAttendanceLedgerEntry,
} from './payrollAttendancePreparation';

describe('payroll attendance preparation', () => {
  it('keeps the decision dependency stable when an unchanged ledger is refreshed', () => {
    const entries = [{
      source_type: 'attendance_shortage_decision',
      status: 'proposed',
      details: { attendance_row_key: 'employee:2026-01-01', decision: 'paid_leave' },
    }];

    expect(buildAttendanceShortageDecisionSignature(entries)).toBe(
      buildAttendanceShortageDecisionSignature([...entries]),
    );
  });

  it('only revives entries voided by automatic recalculation', () => {
    expect(canRefreshAttendanceLedgerEntry({ status: 'voided', details: { void_reason: ATTENDANCE_AUTO_VOID_REASON } })).toBe(true);
    expect(canRefreshAttendanceLedgerEntry({ status: 'voided', details: { void_reason: 'manual_exclusion' } })).toBe(false);
    expect(canRefreshAttendanceLedgerEntry({ status: 'included_in_payroll' })).toBe(false);
  });
});
