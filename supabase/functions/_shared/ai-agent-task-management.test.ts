import { describe, expect, it, vi } from 'vitest';
import { confirmAgentTaskChange, prepareAgentTaskChange, type AgentTaskManagementPorts } from './ai-agent-task-management';
const orgId = '00000000-0000-4000-8000-000000000001', userId = '00000000-0000-4000-8000-000000000002';
const threadId = '00000000-0000-4000-8000-000000000003', workflowId = '00000000-0000-4000-8000-000000000004';
const fixture = () => {
  const access = { orgId, userId, threadId, canManage: true, agentKeys: ['sales_leads'], moduleIds: ['marketing_leads'], deliveryChannels: ['sms','chat'] };
  const draft = { operation: 'create', name: 'بررسی صبحگاهی', config: { agentKey: 'sales_leads', instruction: 'سرنخ‌های نیازمند پیگیری را پیامک کن',
    trigger: 'interval', schedule: { kind: 'daily', at: '09:00', timeZone: 'Asia/Tehran' }, sourceModuleIds: ['marketing_leads'],
    notifyWhen: 'findings', deliveries: [{ channel: 'sms', numbers: ['۰۹۱۲۱۲۳۴۵۶۷'] }, { channel: 'chat' }] } };
  const now = new Date('2026-11-14T04:00:00Z');
  const change = prepareAgentTaskChange(draft, access, null, now);
  const ports: AgentTaskManagementPorts = { load: vi.fn(async () => null), findCreated: vi.fn(async () => null),
    claim: vi.fn(async () => true), insert: vi.fn(async row => ({ ...row, id: workflowId })),
    update: vi.fn(async (_org, _user, _id, _revision, row) => ({ ...row, id: workflowId })), finish: vi.fn(async () => {}) };
  return { access, draft, change, now, ports };
};
describe('conversational task write boundary', () => {
  it('only prepares before confirmation, then stores the actual queue-ready workflow', async () => {
    const f = fixture(); expect(f.ports.insert).not.toHaveBeenCalled();
    const result = await confirmAgentTaskChange(f.ports, { access: f.access, change: f.change, now: f.now, actionId: 'approval-1' });
    expect(result.success).toBe(true);
    expect(f.ports.claim).toHaveBeenCalledWith(orgId, userId, 'approval-1', f.change);
    expect(f.ports.insert).toHaveBeenCalledWith(expect.objectContaining({ org_id: orgId, created_by: userId,
      agent_task_origin_action_id: 'approval-1', agent_task_revision: 1, agent_task_next_run_at: '2026-11-14T05:30:00.000Z',
      actions: [{ id: 'agent-task-1', type: 'run_agent_task', config: { revision: 1 } }] }));
    expect(f.change.config.threadId).toBe(threadId); expect(f.change.config.deliveries[0]).toEqual({ channel: 'sms', numbers: ['09121234567'] });
  });
  it('loses concurrent confirmation without writing twice', async () => {
    const f = fixture(); f.ports.claim = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const input = { access: f.access, change: f.change, now: f.now, actionId: 'approval-1' };
    await confirmAgentTaskChange(f.ports, input);
    await expect(confirmAgentTaskChange(f.ports, input)).rejects.toThrow('قبلاً'); expect(f.ports.insert).toHaveBeenCalledTimes(1);
  });
  it.each(['org','owner','revision','plan','module','channel'])('rejects a changed %s before claiming', async kind => {
    const f = fixture(); const existing = { id: workflowId, orgId, creatorId: userId, name: f.change.name, revision: 2, active: true, config: f.change.config };
    f.ports.load = vi.fn(async () => existing);
    const change = { ...f.change, operation: 'update' as const, workflowId, expectedRevision: 2 };
    if (kind === 'org') existing.orgId = 'other'; if (kind === 'owner') existing.creatorId = 'other';
    if (kind === 'revision') existing.revision = 3; if (kind === 'plan') f.access.canManage = false;
    if (kind === 'module') f.access.moduleIds = []; if (kind === 'channel') f.access.deliveryChannels = ['chat'];
    await expect(confirmAgentTaskChange(f.ports, { access: f.access, change, now: f.now, actionId: 'approval-2' })).rejects.toThrow();
    expect(f.ports.claim).not.toHaveBeenCalled(); expect(f.ports.insert).not.toHaveBeenCalled();
  });
  it.each(['update','pause','resume'] as const)('supports %s with an optimistic revision and invalidates old queued runs', async operation => {
    const f = fixture(); f.ports.load = vi.fn(async () => ({ id: workflowId, orgId, creatorId: userId, name: f.change.name, revision: 2, active: true, config: f.change.config }));
    await confirmAgentTaskChange(f.ports, { access: f.access, change: { ...f.change, operation, workflowId, expectedRevision: 2 }, now: f.now, actionId: 'approval-2' });
    expect(f.ports.update).toHaveBeenCalledWith(orgId, userId, workflowId, 2, expect.objectContaining({ agent_task_revision: 3,
      is_active: operation !== 'pause', agent_task_next_run_at: operation === 'pause' ? null : '2026-11-14T05:30:00.000Z' }));
  });
  it('does not report success for a lost write or replace an existing task from a similar title', async () => {
    const f = fixture(); f.ports.insert = vi.fn(async () => null);
    await expect(confirmAgentTaskChange(f.ports, { access: f.access, change: f.change, now: f.now, actionId: 'approval-1' })).rejects.toThrow();
    expect(f.ports.update).not.toHaveBeenCalled(); expect(f.ports.finish).toHaveBeenCalledWith(orgId, 'approval-1', false, expect.anything());
  });
});
