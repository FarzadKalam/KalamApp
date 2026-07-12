import { describe, expect, it } from 'vitest';
import { parseTehranProviderDateTimeToUtcIso } from '../supabase/functions/_shared/tehran-datetime';

describe('Tehran provider datetime normalization', () => {
  it('treats timezone-less Gregorian provider timestamps as Tehran local time', () => {
    expect(parseTehranProviderDateTimeToUtcIso('2026-07-12 14:51:00'))
      .toBe('2026-07-12T11:21:00.000Z');
  });

  it('treats timezone-less Jalali provider timestamps as Tehran local time', () => {
    expect(parseTehranProviderDateTimeToUtcIso('1405/04/21 14:51:00'))
      .toBe('2026-07-12T11:21:00.000Z');
  });

  it('keeps timestamps that already contain an explicit timezone absolute', () => {
    expect(parseTehranProviderDateTimeToUtcIso('2026-07-12T14:51:00+03:30'))
      .toBe('2026-07-12T11:21:00.000Z');
    expect(parseTehranProviderDateTimeToUtcIso('2026-07-12T11:21:00Z'))
      .toBe('2026-07-12T11:21:00.000Z');
  });
});
