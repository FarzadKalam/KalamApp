import { describe, expect, it } from 'vitest';
import {
  buildGoalCurrentRangeWithinBounds,
  buildGoalExplicitRange,
  shiftGoalCurrentRangeWithinBounds,
} from './goalPeriods';

describe('goalPeriods lifetime bounds', () => {
  const lifetimeBounds = buildGoalExplicitRange({
    startDate: '2026-02-10',
    endDate: '2026-05-20',
  });

  it('clamps the current main period inside the goal lifetime', () => {
    const boundedRange = buildGoalCurrentRangeWithinBounds(
      'month',
      null,
      lifetimeBounds,
      '2026-02-15'
    );

    expect(boundedRange?.start.format('YYYY-MM-DD')).toBe('2026-02-10');
    expect(boundedRange?.end.format('YYYY-MM-DD')).toBe('2026-02-28');
  });

  it('returns null when the current period does not overlap the goal lifetime', () => {
    const boundedRange = buildGoalCurrentRangeWithinBounds(
      'month',
      null,
      lifetimeBounds,
      '2026-06-05'
    );

    expect(boundedRange).toBeNull();
  });

  it('moves between previous and next periods only while overlap exists', () => {
    const currentRange = {
      startIso: '2026-03-01T00:00:00.000Z',
      endIso: '2026-03-31T23:59:59.999Z',
    };

    const previousRange = shiftGoalCurrentRangeWithinBounds(
      'month',
      currentRange,
      -1,
      null,
      lifetimeBounds
    );
    const nextRange = shiftGoalCurrentRangeWithinBounds(
      'month',
      currentRange,
      3,
      null,
      lifetimeBounds
    );

    expect(previousRange?.start.format('YYYY-MM-DD')).toBe('2026-02-10');
    expect(previousRange?.end.format('YYYY-MM-DD')).toBe('2026-02-28');
    expect(nextRange).toBeNull();
  });
});
