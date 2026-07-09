import { describe, expect, it } from 'vitest';
import { deriveProjectStatusFromProcessState } from './projectProcessStatus';

describe('deriveProjectStatusFromProcessState', () => {
  it('returns draft while any draft stage remains', () => {
    expect(deriveProjectStatusFromProcessState([{ id: 'stage-1' }], [])).toBe('draft');
  });

  it('does not keep the project draft after real activities are created', () => {
    expect(deriveProjectStatusFromProcessState([{ id: 'stage-1' }], [
      { id: '1', status: 'todo' },
      { id: '2', status: 'pending' },
    ])).toBe('planning');
  });

  it('returns planning when all tasks are created and still todo-like', () => {
    expect(deriveProjectStatusFromProcessState([], [
      { id: '1', status: 'todo' },
      { id: '2', status: 'pending' },
    ])).toBe('planning');
  });

  it('returns in_progress when any task has started', () => {
    expect(deriveProjectStatusFromProcessState([], [
      { id: '1', status: 'todo' },
      { id: '2', status: 'in_progress' },
    ])).toBe('in_progress');
  });

  it('returns on_hold when all tasks are canceled', () => {
    expect(deriveProjectStatusFromProcessState([], [
      { id: '1', status: 'canceled' },
      { id: '2', status: 'canceled' },
    ])).toBe('on_hold');
  });

  it('returns completed when all tasks are done', () => {
    expect(deriveProjectStatusFromProcessState([], [
      { id: '1', status: 'done' },
      { id: '2', status: 'completed' },
    ])).toBe('completed');
  });

  it('returns in_progress when a not-done activity is added after completion', () => {
    expect(deriveProjectStatusFromProcessState([], [
      { id: '1', status: 'done' },
      { id: '2', status: 'completed' },
      { id: '3', status: 'todo' },
    ])).toBe('in_progress');
  });

  it('does not mark the project completed while draft stages still remain', () => {
    expect(deriveProjectStatusFromProcessState([{ id: 'stage-1' }], [
      { id: '1', status: 'done' },
      { id: '2', status: 'completed' },
    ])).toBe('in_progress');
  });

  it('uses process run stages when tasks are not available', () => {
    expect(deriveProjectStatusFromProcessState([], [], [
      { id: 'stage-1', status: 'todo' },
      { id: 'stage-2', status: 'in_progress' },
    ])).toBe('in_progress');
  });

  it('returns null when there is no process draft and no task', () => {
    expect(deriveProjectStatusFromProcessState([], [])).toBeNull();
  });
});
