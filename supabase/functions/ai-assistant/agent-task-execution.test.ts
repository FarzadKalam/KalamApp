// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { executeAgentTask } from '../_shared/ai-agent-task-runtime';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const declaration = source.slice(source.indexOf('const handleRunAgentTask ='), source.indexOf('const handleRunBackgroundAgents ='));
const executable = ts.transpileModule(`${declaration}\nreturn handleRunAgentTask;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const orgId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const workflowId = '00000000-0000-4000-8000-000000000003';

const harness = (sentSuccessfully = true) => {
  const workflow = { id: workflowId, org_id: orgId, name: 'پیگیری روزانه', created_by: userId, is_active: true, agent_task_revision: 1,
    agent_task_config: { version: 1, agentKey: 'sales_leads', instruction: 'سرنخ‌های نیازمند پیگیری را بررسی کن',
      trigger: 'interval', schedule: { kind: 'daily', at: '09:00', timeZone: 'Asia/Tehran' },
      sourceModuleIds: ['marketing_leads'], sourceLimit: 100, notifyWhen: 'findings', deliveries: [{ channel: 'sms', numbers: ['09121234567'] }] } };
  const actor = { orgId, userId, profile: { is_active: true }, permissions: { workflows: { view: true, edit: true } } };
  const fetch = vi.fn(async () => new Response(JSON.stringify({ success: sentSuccessfully, sent: sentSuccessfully ? 1 : 0 })));
  const deps = {
    executeAgentTask, normalizeId: (value: any) => String(value || ''), isUuid: (value: string) => /^[\da-f-]{36}$/i.test(value),
    loadUserContext: async () => actor, loadTenantAiPlanContext: async () => ({ features: { ai_background_agents: true, ai_chat: true } }),
    loadCentralAiGrounding: async () => ({ agentStates: { sales_leads: { canUse: true, canView: true, canChat: true, agentKey: 'sales_leads' } }, agentConfigs: [{ agent_key: 'sales_leads', model_override: 'chosen-sales-model' }] }),
    AI_RECORD_SCHEMAS: { marketing_leads: {} }, canViewModuleWithPlan: () => true,
    isPlanFeatureEnabled: (plan: any, key: string) => plan.features[key] === true, isAiCapabilityPlanAvailable: () => true,
    restSelect: vi.fn(async (_url: string, _key: string, table: string, filters: any) => {
      expect(table).toBe('workflows'); expect(filters.org_id).toBe(`eq.${orgId}`); return [workflow];
    }),
    restInsert: vi.fn(async (_url: string, _key: string, table: string, rows: any[]) => {
      expect(table).toBe('ai_agent_runs'); expect(rows[0].org_id).toBe(orgId); return [{ id: 'run-1' }];
    }),
    restPatch: vi.fn(async () => []), buildAgentDataToolRuntime: async () => ({ access: {}, tools: [], execute: vi.fn(), systemMessage: { role: 'system', content: 'محدودهٔ مجاز' } }),
    readAgentDataPage: async () => ({ records: [{ fields: { name: 'سرنخ نمونه' } }], hasMore: false, nextAfterId: null }),
    resolveProviderConfig: vi.fn(async () => ({ orgAiSettings: {}, model: 'chosen-sales-model' })),
    assertAiCapabilityEnabled: async () => {}, assertAiUsageAllowed: async () => {},
    callChatCompletions: vi.fn(async () => ({ content: '{"answer":"یک سرنخ نیازمند پیگیری است.","hasFindings":true}', requestId: 'request-1', model: 'chosen-sales-model' })),
    recordAiUsageLedger: vi.fn(async () => ({})), getAgentTitleFa: () => 'ایجنت فروش', extractJsonObjectFromText: JSON.parse,
    fetch, getServiceHeaders: () => ({ Authorization: 'Bearer fake-service-test-key' }), sha256Hex: async () => 'a'.repeat(64),
    json: (status: number, payload: any) => ({ status, payload }),
  };
  const run = new Function(...Object.keys(deps), executable)(...Object.values(deps));
  return { deps, workflow, actor, run: (revision = 1) => run('https://test.invalid', 'fake-service-test-key', { orgId, workflowId, revision, executionKey: 'interval-job:1' }) };
};

describe('actual internal agent task execution adapter', () => {
  it('checks current owner access, generates with the owning agent and sends a single scoped SMS', async () => {
    const fixture = harness(); const result = await fixture.run();
    expect(result.payload.status).toBe('success'); expect(fixture.deps.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fixture.deps.fetch.mock.calls[0] as any;
    expect(url).toContain('/functions/v1/send-sms');
    expect(request.headers['x-kalam-internal']).toBe('workflow-interval-runner');
    expect(JSON.parse(request.body)).toMatchObject({ org_id: orgId, to: ['09121234567'] });
    expect(fixture.deps.resolveProviderConfig.mock.calls[0][4].agentConfig.model_override).toBe('chosen-sales-model');
    expect(fixture.deps.recordAiUsageLedger).toHaveBeenCalledTimes(1);
  });
  it('preserves a transport failure and does not retry the SMS', async () => {
    const fixture = harness(false); const result = await fixture.run();
    expect(result.payload.status).toBe('failed'); expect(result.payload.success).toBe(false);
    expect(fixture.deps.fetch).toHaveBeenCalledTimes(1);
    expect(fixture.deps.restPatch.mock.calls.at(-1)?.[4]).toMatchObject({ status: 'failed' });
  });
  it('does not generate or send for a stale revision or disabled owner', async () => {
    const stale = harness(); expect((await stale.run(2)).payload.status).toBe('skipped');
    expect(stale.deps.callChatCompletions).not.toHaveBeenCalled();
    const disabled = harness(); disabled.actor.profile.is_active = false;
    await expect(disabled.run()).rejects.toThrow(); expect(disabled.deps.fetch).not.toHaveBeenCalled();
  });
});
