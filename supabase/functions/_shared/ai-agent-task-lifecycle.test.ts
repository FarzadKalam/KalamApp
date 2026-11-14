import { describe, expect, it, vi } from 'vitest';
import { confirmAgentTaskChange, prepareAgentTaskChange, type AgentTaskManagementPorts } from './ai-agent-task-management';
import { enqueueDueAgentTasks } from './ai-agent-task-queue';
import { executeAgentTask, type AgentTaskActor } from './ai-agent-task-runtime';
const orgId = '00000000-0000-4000-8000-000000000001', userId = '00000000-0000-4000-8000-000000000002';
const workflowId = '00000000-0000-4000-8000-000000000003', threadId = '00000000-0000-4000-8000-000000000004';

describe('approved task lifecycle across management, queue and runtime', () => {
  it('persists once after approval, enqueues one due run, delivers real channel results and cancels an old revision after pause', async () => {
    const now = new Date('2026-11-14T04:00:00Z');
    const access = { orgId, userId, threadId, canManage: true, agentKeys: ['sales_leads'], moduleIds: ['marketing_leads'], deliveryChannels: ['chat','sms','email'] };
    const draft = prepareAgentTaskChange({ operation: 'create', name: 'گزارش روزانهٔ سرنخ‌ها', config: {
      agentKey: 'sales_leads', instruction: 'سرنخ‌های بی‌پاسخ را بررسی و نتیجه را بفرست', trigger: 'interval',
      schedule: { kind: 'daily', at: '09:00', timeZone: 'Asia/Tehran' }, sourceModuleIds: ['marketing_leads'],
      deliveries: [{ channel: 'chat' }, { channel: 'sms', numbers: ['09121234567'] }, { channel: 'email', addresses: ['owner@example.test'], subject: 'گزارش روزانه' }], notifyWhen: 'findings',
    } }, access, null, now);
    let row: any = null;
    const managed = () => row ? { id: row.id, orgId: row.org_id, creatorId: row.created_by, name: row.name,
      revision: row.agent_task_revision, active: row.is_active, config: row.agent_task_config } : null;
    const ports: AgentTaskManagementPorts = {
      load: async () => managed(), findCreated: async () => null, claim: async () => true,
      insert: async data => (row = { ...data, id: workflowId }),
      update: async (org, user, id, revision, data) => {
        expect([org,user,id,revision]).toEqual([orgId,userId,workflowId,row.agent_task_revision]);
        return (row = { ...row, ...data });
      }, finish: vi.fn(async () => {}),
    };
    expect(row).toBeNull();
    await confirmAgentTaskChange(ports, { actionId: 'create-approval', change: draft, access, now });
    let queued: any;
    const stats = await enqueueDueAgentTasks({ loadDue: async () => [row], enqueue: async item => {
      expect(item.orgId).toBe(orgId); expect(item.nextRunAt).toBe('2026-11-15T05:30:00.000Z');
      queued = { orgId, workflowId, revision: item.revision, executionKey: 'durable-action-1' }; return 'job-1';
    } }, new Date('2026-11-14T05:30:01Z'));
    expect(stats.queued).toBe(1);
    const actor: AgentTaskActor = { orgId, userId, active: true, canRunTasks: true,
      allowedAgentKeys: access.agentKeys, allowedModuleIds: access.moduleIds, allowedDeliveryChannels: access.deliveryChannels };
    const deliver = vi.fn(async () => ({ status: 'success' as const, recipient_count: 1 }));
    const runtime = { loadWorkflow: async () => managed(), loadActor: async () => actor,
      readSource: async (_actor: any, moduleId: string) => ({ moduleId, records: [{ name: 'سرنخ نمونه' }], truncated: false }),
      generate: vi.fn(async () => ({ answer: 'یک سرنخ بی‌پاسخ است.', hasFindings: true })), deliver };
    const result = await executeAgentTask(runtime, queued);
    expect(result.status).toBe('success'); expect(deliver).toHaveBeenCalledTimes(3);
    expect(result.deliveries.map(item => item.channel)).toEqual(['chat','sms','email']);
    await confirmAgentTaskChange(ports, { actionId: 'pause-approval', access, now,
      change: { ...draft, operation: 'pause', workflowId, expectedRevision: 1 } });
    expect(row.agent_task_revision).toBe(2); expect(row.agent_task_next_run_at).toBeNull();
    expect((await executeAgentTask(runtime, queued)).status).toBe('skipped');
    expect(runtime.generate).toHaveBeenCalledTimes(1); expect(deliver).toHaveBeenCalledTimes(3);
    actor.orgId = 'another-org'; row.is_active = true;
    await expect(executeAgentTask(runtime, { ...queued, revision: 2 })).rejects.toThrow('مجوز');
    expect(deliver).toHaveBeenCalledTimes(3);
  });
});
