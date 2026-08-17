import { describe, expect, it } from 'vitest';
import { allocatePaidLeaveMinutes, calculateExcessPresenceMinutes, calculatePayablePresenceMinutes } from './payrollAttendanceTime';

describe('payrollAttendanceTime', () => {
  it('separates attendance above the daily schedule from overtime', () => {
    expect(calculateExcessPresenceMinutes(570, 480)).toBe(90);
  });

  it('never reduces payable ordinary attendance below zero', () => {
    expect(calculatePayablePresenceMinutes(480, 90)).toBe(390);
    expect(calculatePayablePresenceMinutes(480, 600)).toBe(0);
  });

  it('uses the remaining paid-leave balance before classifying the rest as unpaid', () => {
    expect(allocatePaidLeaveMinutes(180, 120)).toEqual({
      requestedMinutes: 180,
      paidMinutes: 120,
      unpaidMinutes: 60,
    });
  });
});
