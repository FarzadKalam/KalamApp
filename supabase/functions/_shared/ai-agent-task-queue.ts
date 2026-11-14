import { nextAgentTaskRunAt, type AgentTaskSchedule } from './ai-agent-task-contract.ts';

export type DueAgentTask = { id: string; org_id: string; agent_task_revision: number;
  agent_task_next_run_at: string; agent_task_config: { schedule: AgentTaskSchedule } };

/** Produce into the workflow engine's queue; the SQL RPC atomically advances
 * the due time and inserts one job regardless of the number of source rows. */
export const enqueueDueAgentTasks = async (ports: {
  loadDue: (nowIso: string, limit: number) => Promise<DueAgentTask[]>;
  enqueue: (input: { orgId: string; workflowId: string; revision: number; dueAt: string; nextRunAt: string | null; nowIso: string }) => Promise<string | null>;
}, now = new Date(), limit = 25) => {
  const nowIso = now.toISOString();
  const tasks = await ports.loadDue(nowIso, Math.min(100, Math.max(1, limit)));
  const result = { checked: tasks.length, queued: 0, rejected: 0 };
  for (const task of tasks) {
    if (!task.org_id || !task.id || !Number.isInteger(task.agent_task_revision)
      || !Number.isFinite(Date.parse(task.agent_task_next_run_at)) || Date.parse(task.agent_task_next_run_at) > now.getTime()) {
      result.rejected++; continue;
    }
    try {
      const nextRunAt = nextAgentTaskRunAt(task.agent_task_config.schedule, now);
      const jobId = await ports.enqueue({ orgId: task.org_id, workflowId: task.id, revision: task.agent_task_revision,
        dueAt: task.agent_task_next_run_at, nextRunAt, nowIso });
      if (jobId) result.queued++;
    } catch {
      // The caller's metrics expose rejected items; a corrupt schedule cannot
      // cause a guessed delivery or prevent other due tenants from enqueueing.
      result.rejected++;
    }
  }
  return result;
};
