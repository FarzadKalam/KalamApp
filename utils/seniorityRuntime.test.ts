import { describe, expect, it } from 'vitest';
import {
  calculateSeniorityAmountFromRates,
  calcYearsOfService,
  getEligibleSeniorityDays,
  getSeniorityPayableDays,
} from './seniorityRuntime';

const SERVICE_RATES_1405 = [
  { persianYear: 1405, completedServiceYears: 1, dailyRateRials: 166_667 },
  { persianYear: 1405, completedServiceYears: 2, dailyRateRials: 302_967 },
  { persianYear: 1405, completedServiceYears: 3, dailyRateRials: 436_947 },
  { persianYear: 1405, completedServiceYears: 4, dailyRateRials: 600_403 },
];

describe('seniorityRuntime', () => {
  it('requires one completed year of service', () => {
    expect(calcYearsOfService('2024-03-20', '2025-03-22')).toBeGreaterThanOrEqual(1);
    expect(calcYearsOfService('2025-03-21', '2026-03-20')).toBe(0);
  });

  it('prorates the month in which the employee completes one year of service', () => {
    const eligibleDays = getEligibleSeniorityDays('2025-03-21', '2026-03-01', '2026-03-31');
    expect(eligibleDays).toHaveLength(11);
    expect(eligibleDays[0]).toBe('2026-03-21');
  });

  it('uses the cumulative statutory daily rate for completed service years', () => {
    const twoYearDays = getSeniorityPayableDays('2024-03-20', '2026-03-21', '2026-04-20');
    const fourYearDays = getSeniorityPayableDays('2022-03-21', '2026-03-21', '2026-04-20');

    expect(new Set(twoYearDays.map((day) => day.completedServiceYears))).toEqual(new Set([2]));
    expect(new Set(fourYearDays.map((day) => day.completedServiceYears))).toEqual(new Set([4]));
    expect(calculateSeniorityAmountFromRates(twoYearDays, SERVICE_RATES_1405)).toBe(302_967 * 31);
    expect(calculateSeniorityAmountFromRates(fourYearDays, SERVICE_RATES_1405)).toBe(600_403 * 31);
  });

  it('does not let excess presence on one day cover absence on another day', () => {
    const payableDays = getSeniorityPayableDays('2024-03-20', '2026-03-21', '2026-04-20', [
      { date: '2026-03-25', scheduledMinutes: 480, presenceMinutes: 0 },
      { date: '2026-03-26', scheduledMinutes: 480, presenceMinutes: 720 },
    ]);

    expect(payableDays.reduce((sum, day) => sum + day.payableWeight, 0)).toBe(30);
    expect(calculateSeniorityAmountFromRates(payableDays, SERVICE_RATES_1405)).toBe(302_967 * 30);
  });

  it('counts approved paid leave as payable attendance', () => {
    const payableDays = getSeniorityPayableDays('2024-03-20', '2026-03-21', '2026-04-20', [
      { date: '2026-03-25', scheduledMinutes: 480, presenceMinutes: 0, paidLeaveMinutes: 480 },
    ]);

    expect(payableDays.reduce((sum, day) => sum + day.payableWeight, 0)).toBe(31);
  });
});
