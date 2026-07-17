import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_ICON_KEY, ROLE_ICON_OPTIONS, normalizeRoleIconKey } from './roleIconCatalog';

describe('role icon catalog', () => {
  it('offers the fixed 40-icon catalog with a safe default', () => {
    expect(ROLE_ICON_OPTIONS).toHaveLength(40);
    expect(new Set(ROLE_ICON_OPTIONS.map((item) => item.key)).size).toBe(40);
    expect(normalizeRoleIconKey('not-supported')).toBe(DEFAULT_ROLE_ICON_KEY);
  });
});
