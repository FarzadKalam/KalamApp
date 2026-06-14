import { describe, expect, it } from 'vitest';
import { getNextIntervalDueAt, isIntervalDue } from './intervalSchedule';

describe('intervalSchedule', () => {
  it('does not run before first interval_at anchor when there is no last run', () => {
    const now = new Date('2026-04-15T07:30:00');
    const due = isIntervalDue({
      lastRunAt: null,
      intervalValue: 1,
      intervalUnit: 'day',
      intervalAt: '09:00',
      now,
    });
    expect(due).toBe(false);
  });

  it('runs when hourly interval from last run has passed', () => {
    const now = new Date('2026-04-15T10:20:00');
    const due = isIntervalDue({
      lastRunAt: '2026-04-15T09:00:00',
      intervalValue: 1,
      intervalUnit: 'hour',
      now,
    });
    expect(due).toBe(true);
  });

  it('aligns next monthly run with interval_at time', () => {
    const next = getNextIntervalDueAt({
      lastRunAt: '2026-04-10T08:00:00',
      intervalValue: 1,
      intervalUnit: 'month',
      intervalAt: '14:45',
      now: new Date('2026-04-20T00:00:00'),
    });
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(4);
    expect(next.getDate()).toBe(10);
    expect(next.getHours()).toBe(14);
    expect(next.getMinutes()).toBe(45);
  });

  it('keeps weekly runs anchored to seven-day intervals and the configured time', () => {
    const next = getNextIntervalDueAt({
      lastRunAt: '2026-04-10T08:00:00',
      intervalValue: 2,
      intervalUnit: 'week',
      intervalAt: '14:45',
      now: new Date('2026-04-20T00:00:00'),
    });

    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(3);
    expect(next.getDate()).toBe(24);
    expect(next.getHours()).toBe(14);
    expect(next.getMinutes()).toBe(45);
  });
});
