import { describe, expect, it } from 'vitest';
import {
  deriveProjectStatusFromProcessState,
  filterProjectDraftStagesForRuntimeSummary,
  reconcileProjectProcessStatusCarriers,
} from './projectProcessStatus';

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

  it('does not let a stale run-stage status override its completed real task', () => {
    expect(deriveProjectStatusFromProcessState([], [
      { id: 'task-1', status: 'completed', process_run_stage_id: 'stage-1' },
      { id: 'task-2', status: 'done', process_run_stage_id: 'stage-2' },
    ], [
      { id: 'stage-1', task_id: 'task-1', status: 'in_progress' },
      { id: 'stage-2', task_id: 'task-2', status: 'todo' },
    ])).toBe('completed');
  });

  it('does not let a stale activity from a completed process run reopen the project', () => {
    expect(deriveProjectStatusFromProcessState([], [
      { id: 'task-1', status: 'in_progress', process_run_id: 'run-1' },
    ], [
      { id: 'stage-1', status: 'in_progress', process_run_id: 'run-1' },
    ], [
      { id: 'run-1', status: 'completed' },
    ])).toBe('completed');
  });

  it('does not count accidentally persisted runtime context as a draft stage', () => {
    expect(deriveProjectStatusFromProcessState([
      { id: 'runtime-copy', process_run_id: 'run-1', task_id: 'task-1', status: 'in_progress' },
    ], [
      { id: 'task-1', status: 'completed' },
    ])).toBe('completed');
  });

  it('keeps an explicit draft stage in mixed completed state', () => {
    expect(deriveProjectStatusFromProcessState([
      { id: 'draft-1', process_run_id: 'run-1', is_draft: true, status: 'draft' },
    ], [
      { id: 'task-1', status: 'completed' },
    ])).toBe('in_progress');
  });

  it('keeps only run stages that do not already have a real task carrier', () => {
    expect(reconcileProjectProcessStatusCarriers(
      [{ id: 'task-1', status: 'done', process_run_stage_id: 'stage-1' }],
      [
        { id: 'stage-1', task_id: 'task-1', status: 'in_progress' },
        { id: 'stage-2', status: 'todo' },
      ],
    ).map((row) => row.id)).toEqual(['task-1', 'stage-2']);
  });

  it('does not let a V2-deleted activity or draft reopen a completed project', () => {
    expect(deriveProjectStatusFromProcessState([
      { id: 'stale-draft', is_draft: true, status: 'draft', metadata: { process_v2_deleted: true } },
    ], [
      { id: 'stale-task', status: 'in_progress', metadata: { deleted_from_process_v2: true } },
    ], [], [
      { id: 'run-1', status: 'completed' },
    ])).toBe('completed');
  });

  it('excludes persisted runtime drafts whose stage was deleted from the current process run', () => {
    expect(filterProjectDraftStagesForRuntimeSummary([
      { id: 'stale-draft', is_draft: true, process_run_id: 'run-1', process_run_stage_id: 'stage-deleted' },
      { id: 'current-draft', is_draft: true, process_run_id: 'run-1', process_run_stage_id: 'stage-current' },
    ], {
      processRuns: [{ id: 'run-1', status: 'completed' }],
      runStages: [{ id: 'stage-current', process_run_id: 'run-1', status: 'todo' }],
    })).toEqual([
      { id: 'current-draft', is_draft: true, process_run_id: 'run-1', process_run_stage_id: 'stage-current' },
    ]);
  });
});
