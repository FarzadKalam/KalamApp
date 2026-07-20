import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import { buildViewDateBoundaryValue } from './viewDateFilters';

describe('viewDateFilters', () => {
  it('keeps DATE view filters on the local calendar day', () => {
    const date = new Date(2026, 6, 20, 14, 30, 0);
    const field = { type: FieldType.DATE };

    expect(buildViewDateBoundaryValue(field, date, 'start')).toBe('2026-07-20');
    expect(buildViewDateBoundaryValue(field, date, 'end')).toBe('2026-07-20');
  });

  it('keeps DATETIME view filter boundaries as precise UTC instants', () => {
    const date = new Date(2026, 6, 20, 14, 30, 0);
    const field = { type: FieldType.DATETIME };
    const localStart = new Date(2026, 6, 20, 0, 0, 0, 0);
    const localEnd = new Date(2026, 6, 20, 23, 59, 59, 999);

    expect(buildViewDateBoundaryValue(field, date, 'start')).toBe(localStart.toISOString());
    expect(buildViewDateBoundaryValue(field, date, 'end')).toBe(localEnd.toISOString());
  });
});
