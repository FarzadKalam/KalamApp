import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import { buildCalendarViewFilters, buildViewDateBoundaryValue, refreshRelativeViewDateFilter } from './viewDateFilters';

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


describe('saved relative date filters', () => {
  it('uses the current Tehran day when restoring a saved view', () => {
    const field = { key: 'invoice_date', type: FieldType.DATE };
    const saved = buildCalendarViewFilters(field, 'is_today', undefined, new Date('2026-11-21T19:00:00Z'))!;
    expect(saved[0].value).toBe('2026-11-21');
    expect(saved.map((filter) => refreshRelativeViewDateFilter(filter, [field], new Date('2026-11-21T21:00:00Z')).value))
      .toEqual(['2026-11-22', '2026-11-23']);
  });
});
