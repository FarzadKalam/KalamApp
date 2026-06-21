import { describe, expect, it } from 'vitest';
import {
  normalizeProcessActivatorTriggerModuleIds,
  normalizeProcessTargetModuleIds,
  resolveProcessActivatorTriggerModuleIds,
} from './processTargets';

describe('processTargets', () => {
  it('normalizes process target modules from arrays and fallback module', () => {
    expect(normalizeProcessTargetModuleIds(['tasks', 'tasks', ''], 'projects')).toEqual(['projects', 'tasks']);
  });

  it('keeps explicitly selected process activator trigger modules', () => {
    expect(resolveProcessActivatorTriggerModuleIds(['tasks'], ['projects', 'tasks'])).toEqual(['tasks']);
  });

  it('falls back to process target modules when activator trigger modules are empty', () => {
    expect(resolveProcessActivatorTriggerModuleIds([], ['projects', 'tasks'])).toEqual(['projects', 'tasks']);
  });

  it('keeps process activator trigger selection explicit and scoped to allowed modules', () => {
    expect(normalizeProcessActivatorTriggerModuleIds(['tasks', 'customers'], ['projects', 'tasks'])).toEqual(['tasks']);
    expect(normalizeProcessActivatorTriggerModuleIds([], ['projects', 'tasks'])).toEqual([]);
  });
});
