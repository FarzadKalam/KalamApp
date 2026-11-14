import { describe, expect, it, vi } from 'vitest';
import { appendStreamToolCalls, executeAgentToolCalls, type AgentToolCall } from './ai-tool-calls';
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
});
