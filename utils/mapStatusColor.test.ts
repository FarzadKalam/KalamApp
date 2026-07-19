import { describe, expect, it } from 'vitest';
import { resolveMapStatusColor } from './mapStatusColor';

describe('map status colors', () => {
  it('resolves extended Ant colors and falls back safely', () => {
    expect(resolveMapStatusColor('pink')).toBe('#db2777');
    expect(resolveMapStatusColor('gold')).toBe('#d97706');
    expect(resolveMapStatusColor('volcano')).toBe('#e34d20');
    expect(resolveMapStatusColor('unknown')).toBe('');
  });
});
