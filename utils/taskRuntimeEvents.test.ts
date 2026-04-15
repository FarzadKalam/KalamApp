import { describe, expect, it } from 'vitest';
import { applyTaskRuntimeUpdate } from './taskRuntimeEvents';

describe('task runtime events', () => {
  it('patches the matching task in-place without rebuilding unrelated rows', () => {
    const originalRows = [
      { id: 'task-1', status: 'todo', name: 'اول' },
      { id: 'task-2', status: 'in_progress', name: 'دوم' },
    ];

    const nextRows = applyTaskRuntimeUpdate(originalRows, {
      id: 'task-2',
      status: 'done',
      completed_at: '2026-04-15T10:00:00.000Z',
    });

    expect(nextRows).toHaveLength(2);
    expect(nextRows[0]).toBe(originalRows[0]);
    expect(nextRows[1]).not.toBe(originalRows[1]);
    expect(nextRows[1]).toMatchObject({
      id: 'task-2',
      status: 'done',
      completed_at: '2026-04-15T10:00:00.000Z',
      name: 'دوم',
    });
  });

  it('returns the same array when no matching task exists', () => {
    const originalRows = [{ id: 'task-1', status: 'todo' }];
    const nextRows = applyTaskRuntimeUpdate(originalRows, { id: 'task-404', status: 'done' });
    expect(nextRows).toBe(originalRows);
  });
});
