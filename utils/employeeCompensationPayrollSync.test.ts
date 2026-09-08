import { describe, expect, it } from 'vitest';
import {
  selectCurrentPeriodCompensationEntriesBySourceKey,
  type ExistingPayrollCompensationLedgerRow,
} from './employeeCompensationPayrollSync';

const PERIOD_START = '2026-05-22';
const PERIOD_END = '2026-06-21';
const SOURCE_RECORD_ID = 'd1b9759e-9ebb-4975-afdc-1201c969aeb9';
const sourceKey = `employee_penalty:${SOURCE_RECORD_ID}`;

const row = (overrides: Partial<ExistingPayrollCompensationLedgerRow>): ExistingPayrollCompensationLedgerRow => ({
  id: 'entry-default',
  source_key: sourceKey,
  source_type: 'employee_penalty',
  source_record_id: SOURCE_RECORD_ID,
  status: 'draft',
  period_start: PERIOD_START,
  period_end: PERIOD_END,
  ...overrides,
});

describe('selectCurrentPeriodCompensationEntriesBySourceKey', () => {
  it('does not carry an entry from an older payroll period into the requested period', () => {
    const entries = selectCurrentPeriodCompensationEntriesBySourceKey('employee_penalty', [
      row({ id: 'older-draft', period_start: '2026-05-30', period_end: '2026-06-07', status: 'draft' }),
    ], PERIOD_START, PERIOD_END);

    expect(entries.has(sourceKey)).toBe(false);
  });

  it('does not select an editable row from a different payroll period', () => {
    const entries = selectCurrentPeriodCompensationEntriesBySourceKey('employee_penalty', [
      row({ id: 'older-draft', period_start: '2026-05-30', period_end: '2026-06-07', status: 'draft' }),
      row({ id: 'current-included', status: 'included_in_payroll' }),
    ], PERIOD_START, PERIOD_END);

    expect(entries.get(sourceKey)?.id).toBe('current-included');
  });

  it('keeps an included entry ahead of an editable duplicate in the same period', () => {
    const entries = selectCurrentPeriodCompensationEntriesBySourceKey('employee_penalty', [
      row({ id: 'current-included', status: 'included_in_payroll' }),
      row({ id: 'current-draft', status: 'draft' }),
    ], PERIOD_START, PERIOD_END);

    expect(entries.get(sourceKey)?.id).toBe('current-included');
  });
});
