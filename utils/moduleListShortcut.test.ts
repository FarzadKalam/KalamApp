import { describe, expect, it } from 'vitest';
import { isModuleListCreateShortcut } from './moduleListShortcut';

describe('module list create shortcut', () => {
  it('uses a non-browser chord and supports the Persian keyboard layout', () => {
    expect(isModuleListCreateShortcut(new KeyboardEvent('keydown', { ctrlKey: true, key: 'n', code: 'KeyN' }))).toBe(false);
    expect(isModuleListCreateShortcut(new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true, key: 'N', code: 'KeyN' }))).toBe(false);
    expect(isModuleListCreateShortcut(new KeyboardEvent('keydown', { altKey: true, shiftKey: true, key: 'د', code: 'KeyN' }))).toBe(true);
  });
  it('does not interrupt typing, composition, or a held key', () => {
    const event = new KeyboardEvent('keydown', { altKey: true, shiftKey: true, key: 'n' });
    Object.defineProperty(event, 'target', { value: document.createElement('input') });
    expect(isModuleListCreateShortcut(event)).toBe(false);
    expect(isModuleListCreateShortcut(new KeyboardEvent('keydown', { altKey: true, shiftKey: true, key: 'n', repeat: true }))).toBe(false);
  });
});
