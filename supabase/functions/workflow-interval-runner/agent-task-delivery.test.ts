// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { summarizeAgentTaskDeliveries } from '../_shared/ai-agent-task-contract';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const branchStart = source.indexOf("  if (action.type === 'run_ai_prompt') {");
const branchEnd = source.indexOf('  // ── send_web_form_link', branchStart);
const branch = source.slice(branchStart, branchEnd);
const compile = (body: string, deps: Record<string, unknown>) => new Function(...Object.keys(deps),
  ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(...Object.values(deps));

describe('actual conversational task workflow adapter', () => {
  const start = source.indexOf("  if (action.type === 'run_agent_task') {");
  const end = source.indexOf("  if (action.type === 'send_message')", start);
  it.each(['scheduled', 'event'])('carries the approved revision and durable claim for %s runs', async mode => {
    const fetch = vi.fn(async (_url, request) => {
      const body = JSON.parse(request.body);
      expect(body).toMatchObject({ workflowId: 'workflow-1', orgId: 'org-1', revision: 3, executionKey: 'claim-1', eventRecordId: mode === 'event' ? 'record-1' : null });
      expect(body.deadlineAt).toBeGreaterThan(Date.now());
      expect(request.headers['x-kalam-internal']).toBe('workflow-interval-runner');
      return new Response('{"status":"success","message":"ارسال تأیید شد"}');
    });
    const run = compile(`return async function(action) { const config = action.config; const orgId='org-1',url='https://test.invalid',key='fake',recordId='${mode === 'event' ? 'record-1' : 'workflow-1'}'; ${source.slice(start,end)} }`, {
      fetch, actionResult: (_action: any, status: string) => ({ status }),
    });
    const config = { __workflow_id: 'workflow-1', __durable_execution_key: 'claim-1',
      ...(mode === 'scheduled' ? { workflow_id: 'workflow-1', task_revision: 3 } : { revision: 3 }) };
    expect((await run({ type: 'run_agent_task', config })).status).toBe('success');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await run({ type: 'run_agent_task', config: { ...config, __durable_execution_key: '' } })).status).toBe('failed');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

const aiDelivery = (statuses: Record<string, string>, channels: string[]) => {
  const executeAction = vi.fn(async (action: any) => ({ action_type: action.type, status: statuses[action.type], recipient_count: 1 }));
  const run = compile(`return async function(action) {
    const config = action.config; const record = { id: 'record-1' }; const recordId = record.id;
    const moduleId = 'marketing_leads', orgId = 'org-1', url = 'test://', key = 'test', actorUserId = 'user-1';
    ${branch}
  }`, { executeAction, summarizeAgentTaskDeliveries,
    renderTemplateAsync: async () => 'بررسی کن', callWorkflowAiPrompt: async () => ({ answer: 'گزارش آماده است' }),
    createWorkflowAiThread: async () => null, dbInsert: async () => null,
    actionResult: (action: any, status: string, message: string, extra: any) => ({ action_type: action.type, status, message, ...extra }),
  });
  return { executeAction, run: () => run({ type: 'run_ai_prompt', config: { output_mode: 'text', prompt: 'بررسی کن', delivery_channels: channels } }) };
};

describe('actual workflow AI delivery branch', () => {
  it('does not report successful delivery when one requested transport fails', async () => {
    const fixture = aiDelivery({ send_sms: 'success', send_email: 'failed' }, ['sms', 'email']);
    const result = await fixture.run();
    expect(result.status).toBe('failed'); expect(fixture.executeAction).toHaveBeenCalledTimes(2);
    expect(result.details.channel_results.map((item: any) => item.status)).toEqual(['success', 'failed']);
  });
  it('does not report a skipped delivery as successful', async () => {
    expect((await aiDelivery({ send_email: 'skipped' }, ['email']).run()).status).toBe('failed');
  });
  it('accepts a text-only generation and verified successful deliveries', async () => {
    expect((await aiDelivery({}, []).run()).status).toBe('success');
    expect((await aiDelivery({ send_sms: 'success', send_email: 'success' }, ['sms', 'email']).run()).status).toBe('success');
  });
});

describe('actual durable workflow job completion', () => {
  const declaration = source.slice(source.indexOf('async function processWorkflowActionJob('), source.indexOf('async function processProcessAutomationIntervalJob('));
  it.each([['success', 'succeeded'], ['failed', 'failed'], ['skipped', 'skipped']])('preserves action status %s in queue status %s', async (status, expected) => {
    const completeIntervalJob = vi.fn(async () => {});
    const run = compile(`${declaration}\nreturn processWorkflowActionJob;`, { executeDurableAction: async () => ({ status }),
      completeIntervalJob, finalizeWorkflowActionReport: async () => {}, appendWorkflowOriginExecutionKey: () => '' });
    await run('test://', 'test', { org_id: 'org-1', module_id: 'marketing_leads', action_index: 0,
      payload: { workflow: { id: 'workflow-1' }, action: { type: 'run_ai_prompt', config: {} }, record: { id: 'record-1' } } });
    expect(completeIntervalJob.mock.calls[0][3]).toBe(expected);
  });
});
