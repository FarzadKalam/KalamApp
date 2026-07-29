import { describe, expect, it } from 'vitest';
import { isPublicNightMode } from './PublicThemeBoundary';

describe('isPublicNightMode', () => {
  it('uses the existing public-page night window from 19:00 through 05:59', () => {
    expect(isPublicNightMode(new Date(2026, 6, 29, 18, 59))).toBe(false);
    expect(isPublicNightMode(new Date(2026, 6, 29, 19, 0))).toBe(true);
    expect(isPublicNightMode(new Date(2026, 6, 30, 5, 59))).toBe(true);
    expect(isPublicNightMode(new Date(2026, 6, 30, 6, 0))).toBe(false);
  });
});
