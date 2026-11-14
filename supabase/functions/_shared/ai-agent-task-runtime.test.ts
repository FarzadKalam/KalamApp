import { describe, expect, it, vi } from 'vitest';
import { executeAgentTask, type AgentTaskActor, type AgentTaskRuntimePorts, type AgentTaskWorkflow } from './ai-agent-task-runtime';

const fixture = () => {
  const workflow: AgentTaskWorkflow = { id: 'workflow-1', orgId: 'org-1', creatorId: 'user-1', revision: 2, active: true,
    config: { version: 1, agentKey: 'sales_leads', instruction: 'سرنخ‌ها را بررسی کن', sourceModuleIds: ['marketing_leads'],
      trigger: 'interval', schedule: { kind: 'daily', at: '09:00', timeZone: 'Asia/Tehran' }, sourceLimit: 100,
      deliveries: [{ channel: 'chat' }, { channel: 'sms', numbers: ['09121234567'] }], notifyWhen: 'findings' } };
  const actor: AgentTaskActor = { userId: 'user-1', orgId: 'org-1', active: true, canRunTasks: true,
    allowedAgentKeys: ['sales_leads'], allowedModuleIds: ['marketing_leads', 'invoices'], allowedDeliveryChannels: ['chat', 'sms', 'email'] };
  const ports: AgentTaskRuntimePorts = {
    loadWorkflow: vi.fn(async () => workflow), loadActor: vi.fn(async () => actor),
    readSource: vi.fn(async (_actor, moduleId) => ({ moduleId, records: [{ title: 'لید نیازمند پیگیری' }], truncated: false })),
    generate: vi.fn(async () => ({ answer: 'یک لید نیازمند پیگیری است.', hasFindings: true })),
    deliver: vi.fn(async () => ({ status: 'success', recipient_count: 1 })),
  };
  return { workflow, actor, ports, input: { orgId: 'org-1', workflowId: 'workflow-1', revision: 2, executionKey: 'interval-job:1' } };
};

describe('agent task runtime', () => {
  it('reads with the actual actor and sends one summary per approved channel', async () => {
    const { ports, actor, input } = fixture();
    const result = await executeAgentTask(ports, input);
    expect(result.status).toBe('success');
    expect(ports.readSource).toHaveBeenCalledWith(actor, 'marketing_leads', 100);
    expect(ports.generate).toHaveBeenCalledTimes(1);
    expect(ports.deliver).toHaveBeenCalledTimes(2);
    expect(result.deliveries.map(item => item.channel)).toEqual(['chat', 'sms']);
  });
  it.each(['org', 'inactive', 'revision', 'deleted'])('does not execute an unavailable job: %s', async variant => {
    const { ports, workflow, input } = fixture();
    if (variant === 'org') workflow.orgId = 'another-org';
    if (variant === 'inactive') workflow.active = false;
    if (variant === 'revision') workflow.revision++;
    if (variant === 'deleted') ports.loadWorkflow = vi.fn(async () => null);
    expect((await executeAgentTask(ports, input)).status).toBe('skipped');
    expect(ports.readSource).not.toHaveBeenCalled(); expect(ports.deliver).not.toHaveBeenCalled();
  });
  it.each(['org', 'inactive', 'plan', 'agent', 'module', 'channel'])('fails closed when current actor access changes: %s', async variant => {
    const { ports, actor, input } = fixture();
    if (variant === 'org') actor.orgId = 'another-org';
    if (variant === 'inactive') actor.active = false;
    if (variant === 'plan') actor.canRunTasks = false;
    if (variant === 'agent') actor.allowedAgentKeys = [];
    if (variant === 'module') actor.allowedModuleIds = [];
    if (variant === 'channel') actor.allowedDeliveryChannels = ['chat'];
    await expect(executeAgentTask(ports, input)).rejects.toThrow();
    expect(ports.readSource).not.toHaveBeenCalled(); expect(ports.deliver).not.toHaveBeenCalled();
  });
  it('does not deliver a task paused while the model is running', async () => {
    const { ports, workflow, input } = fixture();
    ports.generate = vi.fn(async () => { workflow.active = false; return { answer: 'گزارش', hasFindings: true }; });
    expect((await executeAgentTask(ports, input)).status).toBe('skipped');
    expect(ports.deliver).not.toHaveBeenCalled();
  });
  it('does not react to an event record outside the current actor scope', async () => {
    const { ports, input } = fixture();
    ports.canReadEvent = vi.fn(async () => false);
    expect((await executeAgentTask(ports, { ...input, eventRecordId: 'not-permitted' })).status).toBe('skipped');
    expect(ports.generate).not.toHaveBeenCalled(); expect(ports.deliver).not.toHaveBeenCalled();
  });
  it('revalidates permissions after generation before sending', async () => {
    const { ports, actor, input } = fixture();
    ports.generate = vi.fn(async () => { actor.canRunTasks = false; return { answer: 'گزارش', hasFindings: true }; });
    await expect(executeAgentTask(ports, input)).rejects.toThrow();
    expect(ports.deliver).not.toHaveBeenCalled();
  });
  it('cancels delivery when field or row access changes during generation', async () => {
    const { ports, actor, input } = fixture(); actor.accessFingerprint = 'scope-before';
    ports.generate = vi.fn(async () => { actor.accessFingerprint = 'scope-after'; return { answer: 'گزارش', hasFindings: true }; });
    await expect(executeAgentTask(ports, input)).rejects.toThrow('دسترسی'); expect(ports.deliver).not.toHaveBeenCalled();
  });
  it('does not send when the model found nothing under a findings-only policy', async () => {
    const { ports, input } = fixture();
    ports.generate = vi.fn(async () => ({ answer: 'موردی نیست.', hasFindings: false }));
    expect((await executeAgentTask(ports, input)).status).toBe('skipped');
    expect(ports.deliver).not.toHaveBeenCalled();
  });
  it('bounds the total source data and explicitly reports truncated coverage', async () => {
    const { ports, workflow, input } = fixture();
    (workflow.config as any).sourceModuleIds = ['marketing_leads', 'invoices'];
    (workflow.config as any).sourceLimit = 1;
    const result = await executeAgentTask(ports, input);
    expect(ports.readSource).toHaveBeenCalledTimes(1);
    expect(result.sourceCounts).toEqual([{ moduleId: 'marketing_leads', count: 1, truncated: false }, { moduleId: 'invoices', count: 0, truncated: true }]);
  });
  it('reports partial failure rather than full success, and never automatically resends', async () => {
    const { ports, input } = fixture();
    ports.deliver = vi.fn().mockResolvedValueOnce({ status: 'success' }).mockRejectedValueOnce(new Error('secret provider response'));
    const result = await executeAgentTask(ports, input);
    expect(result.status).toBe('failed'); expect(ports.deliver).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain('secret provider');
  });
  it('does not silently treat a skipped send as delivered', async () => {
    const { ports, input } = fixture();
    ports.deliver = vi.fn(async () => ({ status: 'skipped', message: 'تنظیمات ارسال ناقص است.' }));
    expect((await executeAgentTask(ports, input)).status).toBe('failed');
  });
});
