import { describe, expect, it } from 'vitest';
import { calculateExcessPresenceMinutes, calculatePayablePresenceMinutes } from './payrollAttendanceTime';

describe('payrollAttendanceTime', () => {
  it('separates attendance above the daily schedule from overtime', () => {
    expect(calculateExcessPresenceMinutes(570, 480)).toBe(90);
  });

  it('never reduces payable ordinary attendance below zero', () => {
    expect(calculatePayablePresenceMinutes(480, 90)).toBe(390);
    expect(calculatePayablePresenceMinutes(480, 600)).toBe(0);
  });
});
