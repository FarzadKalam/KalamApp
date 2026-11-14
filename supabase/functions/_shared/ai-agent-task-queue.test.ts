import { describe, expect, it, vi } from 'vitest';
import { enqueueDueAgentTasks } from './ai-agent-task-queue';

describe('agent task queue producer', () => {
  it('quarantines a corrupt oldest schedule but leaves transient enqueue failures retryable', async () => {
    const invalid = { id: 'bad', org_id: 'org-1', agent_task_revision: 1, agent_task_next_run_at: '2026-11-14T05:30:00Z', agent_task_config: { schedule: { kind: 'daily' as const, at: '09:00', timeZone: '' } } };
    const valid = { ...invalid, id: 'valid', agent_task_config: { schedule: { ...invalid.agent_task_config.schedule, timeZone: 'Asia/Tehran' } } };
    const rejectInvalid = vi.fn(async () => {});
    const result = await enqueueDueAgentTasks({ loadDue: async () => [invalid, valid], rejectInvalid,
      enqueue: async () => { throw new Error('transient network failure'); } }, new Date('2026-11-14T07:00:00Z'));
    expect(result.rejected).toBe(2); expect(rejectInvalid).toHaveBeenCalledExactlyOnceWith(invalid);
  });
  it('coalesces missed occurrences into one job and advances from current time', async () => {
    const enqueue = vi.fn(async () => 'job-1');
    const result = await enqueueDueAgentTasks({ loadDue: async () => [{ id: 'workflow-1', org_id: 'org-1', agent_task_revision: 2,
      agent_task_next_run_at: '2026-11-10T05:30:00Z', agent_task_config: { schedule: { kind: 'daily', at: '09:00', timeZone: 'Asia/Tehran' } } }], enqueue }, new Date('2026-11-14T07:00:00Z'));
    expect(result.queued).toBe(1);
    expect(enqueue).toHaveBeenCalledWith({ orgId: 'org-1', workflowId: 'workflow-1', revision: 2,
      dueAt: '2026-11-10T05:30:00Z', nextRunAt: '2026-11-15T05:30:00.000Z', nowIso: '2026-11-14T07:00:00.000Z' });
  });
  it('does not claim a not-yet-due item or invent a timezone for bad schedules', async () => {
    const enqueue = vi.fn(async () => 'job-1');
    const task = { id: 'workflow-1', org_id: 'org-1', agent_task_revision: 2, agent_task_next_run_at: '2026-11-14T05:30:00Z',
      agent_task_config: { schedule: { kind: 'daily' as const, at: '09:00', timeZone: '' } } };
    const result = await enqueueDueAgentTasks({ loadDue: async () => [task, { ...task, agent_task_next_run_at: '2026-11-15T05:30:00Z' }], enqueue }, new Date('2026-11-14T07:00:00Z'));
    expect(result.rejected).toBe(2); expect(enqueue).not.toHaveBeenCalled();
  });
  it('counts an optimistic lock rejection without falsely reporting a queued run', async () => {
    const result = await enqueueDueAgentTasks({ loadDue: async () => [{ id: 'workflow-1', org_id: 'org-1', agent_task_revision: 2,
      agent_task_next_run_at: '2026-11-14T05:30:00Z', agent_task_config: { schedule: { kind: 'once', at: '2026-11-14T05:30:00Z', timeZone: 'Asia/Tehran' } } }], enqueue: async () => null }, new Date('2026-11-14T07:00:00Z'));
    expect(result.queued).toBe(0);
  });
});
