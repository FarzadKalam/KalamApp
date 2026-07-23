import { describe, expect, it } from 'vitest';
import { calcMonthlySeniorityPay, calcYearsOfService, getEligibleSeniorityDays } from './seniorityRuntime';

const RATE_1405 = {
  daily_rate_rials: 166_667,
  monthly_rate_30day_rials: 5_000_010,
  monthly_rate_31day_rials: 5_166_677,
};

describe('seniorityRuntime', () => {
  it('requires one completed year of service', () => {
    expect(calcYearsOfService('2024-03-20', '2025-03-22')).toBeGreaterThanOrEqual(1);
    expect(calcYearsOfService('2025-03-21', '2026-03-20')).toBe(0);
  });

  it('uses the statutory monthly base rate once after eligibility, not once per year of service', () => {
    expect(calcMonthlySeniorityPay(1, RATE_1405, 30)).toBe(5_000_010);
    expect(calcMonthlySeniorityPay(8, RATE_1405, 31)).toBe(5_166_677);
    expect(calcMonthlySeniorityPay(0, RATE_1405, 31)).toBe(0);
  });

  it('prorates the month in which the employee completes one year of service', () => {
    const eligibleDays = getEligibleSeniorityDays('2025-03-21', '2026-03-01', '2026-03-31');
    expect(eligibleDays).toHaveLength(11);
    expect(eligibleDays[0]).toBe('2026-03-21');
  });

  it('calculates the statutory rate once for an employee with three full years of service', () => {
    expect(calcYearsOfService('2023-03-21', '2026-04-20')).toBe(3);
    // ماه فروردین ۱۴۰۵، ۳۱ روز دارد: ۱۶۶٬۶۶۷ × ۳۱؛ نه سه برابر این مبلغ.
    expect(calcMonthlySeniorityPay(3, RATE_1405, 31)).toBe(5_166_677);
  });
});
