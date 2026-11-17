import { describe, expect, it, vi } from 'vitest';
import { appendStreamToolCalls, buildAgentToolResultFallback, executeAgentToolCalls, type AgentToolCall } from './ai-tool-calls';
const tools = [{ type: 'function', function: { name: 'read_organization_data' } }];
const call = (): AgentToolCall => ({ id: 'call-1', type: 'function', function: { name: 'read_organization_data', arguments: '{"moduleId":"marketing_leads"}' } });
describe('shared model tool calls', () => {
  it('matches every tool response to a validated model call', async () => {
    const execute = vi.fn(async () => ({ records: [], hasMore: false }));
    expect(await executeAgentToolCalls([call()], tools, execute)).toEqual([{ role: 'tool', tool_call_id: 'call-1', content: '{"records":[],"hasMore":false}' }]);
    expect(execute).toHaveBeenCalledWith('read_organization_data', { moduleId: 'marketing_leads' });
  });
  it('rejects an undeclared write tool instead of letting the model invent one', async () => {
    const execute = vi.fn(); const bad = call(); bad.function.name = 'execute_sql';
    await expect(executeAgentToolCalls([bad], tools, execute)).rejects.toThrow(); expect(execute).not.toHaveBeenCalled();
  });
  it('returns rejected reads to the model for correction without leaking transport secrets', async () => {
    const result = await executeAgentToolCalls([call()], tools, vi.fn().mockRejectedValue(new Error('secret-token')));
    expect(JSON.parse(result[0].content)).toMatchObject({ success: false,code: 'read_request_rejected' });
    expect(result[0].content).not.toContain('secret-token');
  });
  it('does not turn a failed mutation into a recoverable read', async () => {
    const mutation = call(); mutation.function.name = 'prepare_agent_task';
    await expect(executeAgentToolCalls([mutation],[{ type: 'function',function: { name: mutation.function.name } }],
      vi.fn().mockRejectedValue(new Error('failed')))).rejects.toThrow();
  });
  it('rejects invalid arguments and duplicate calls', async () => {
    const bad = call(); bad.function.arguments = 'not-json';
    await expect(executeAgentToolCalls([bad], tools, vi.fn())).rejects.toThrow();
    await expect(executeAgentToolCalls([call(),call()], tools, vi.fn(async () => ({})))).rejects.toThrow();
  });
  it('assembles streaming argument fragments before executing the tool', async () => {
    const pending = new Map<number, AgentToolCall>();
    appendStreamToolCalls(pending, [{ index: 0, id: 'call-1', type: 'function', function: { name: 'read_organization_data', arguments: '{"moduleId":' } }]);
    appendStreamToolCalls(pending, [{ index: 0, function: { arguments: '"marketing_leads"}' } }]);
    const execute = vi.fn(async () => ({}));
    await executeAgentToolCalls([...pending.values()], tools, execute);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('presents recovered rows without exposing internal UUID values', () => {
    const content = JSON.stringify({ label: 'الگوهای فرآیند', records: [{
      reference: '11111111-1111-4111-8111-111111111111',
      fields: { name: 'استخدام نیروی فروش', status: 'active', owner_id: '22222222-2222-4222-8222-222222222222' },
    }] });
    const answer = buildAgentToolResultFallback([{ content }]);
    expect(answer).toContain('استخدام نیروی فروش');
    expect(answer).toContain('وضعیت: active');
    expect(answer).not.toContain('11111111');
    expect(answer).not.toContain('22222222');
  });
});
