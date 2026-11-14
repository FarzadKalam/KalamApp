// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { appendStreamToolCalls, executeAgentToolCalls } from '../_shared/ai-tool-calls';
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const nonstream = source.slice(source.indexOf('const callChatCompletions ='), source.indexOf('const callChatCompletionsStream ='));
const stream = source.slice(source.indexOf('const callChatCompletionsStream ='), source.indexOf('const getPublicSupabaseUrl ='));
const tool = { type: 'function', function: { name: 'read_organization_data' } };
const toolCall = { id: 'call-1', type: 'function', function: { name: 'read_organization_data', arguments: '{"moduleId":"marketing_leads"}' } };
const sse = (values: any[]) => new Response(values.map(value => `data: ${JSON.stringify(value)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });

const harness = (streaming: boolean, responses: Response[]) => {
  const sent: any[] = [];
  const deps = {
    executeAgentToolCalls, appendStreamToolCalls,
    requestAvalaiWithFallback: vi.fn(async (_config: any, _path: string, options: any) => {
      sent.push(JSON.parse(options.body));
      const response = responses.shift(); if (!response) throw new Error('Unexpected provider call');
      return { response, baseUrl: 'test://' };
    }),
    applyExplicitCacheControlIfSupported: (messages: any) => messages,
    isReasoningModel: () => false, parseJsonSafe: JSON.parse,
    normalizeAiContentText: (value: any) => String(value || ''), normalizeAiContentAttachments: () => [],
    extractUsageMetadata: (value: any) => value.usage || null,
    getChatFinishReason: (value: any) => value.choices?.[0]?.finish_reason || '',
    isCompleteChatFinishReason: (reason: any) => reason === 'stop',
    mergeChatUsageMetadata: (parts: any[]) => ({ total_tokens: parts.reduce((sum, part) => sum + (part?.total_tokens || 0), 0) }),
    parseChatStreamDelta: (value: any) => ({ text: value.choices?.[0]?.delta?.content || '', finishReason: value.choices?.[0]?.finish_reason || '' }),
    shortenProviderError: (value: any) => String(value),
    CHAT_COMPLETION_CONTINUATION_LIMIT: 2, CHAT_COMPLETIONS_TIMEOUT_MS: 10000,
    STREAM_PROVIDER_INACTIVITY_TIMEOUT_MS: 10000, DEFAULT_CHAT_MAX_TOKENS: 4000, DEFAULT_REASONING_MAX_TOKENS: 4000,
  };
  const declaration = streaming ? stream : nonstream;
  if (!streaming) delete (deps as any).parseChatStreamDelta;
  const executable = ts.transpileModule(`${declaration}\nreturn ${streaming ? 'callChatCompletionsStream' : 'callChatCompletions'};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = new Function(...Object.keys(deps), executable)(...Object.values(deps));
  return { sent, run: (options: any) => run({ model: 'chosen-agent', apiKey: 'fake-test', provider: 'fake' }, [{ role: 'user', content: 'همهٔ لیدها را بررسی کن' }], options) };
};

describe('actual central agent data tool loop', () => {
  it('continues the same model after a data tool call and accounts for both requests', async () => {
    const fixture = harness(false, [
      new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [toolCall] }, finish_reason: 'tool_calls' }], usage: { total_tokens: 10 } })),
      new Response(JSON.stringify({ choices: [{ message: { content: 'گزارش همهٔ موارد آماده شد.' }, finish_reason: 'stop' }], usage: { total_tokens: 20 } })),
    ]);
    const execute = vi.fn(async () => ({ records: [], hasMore: false }));
    const result = await fixture.run({ tools: [tool], toolExecutor: execute });
    expect(result.content).toContain('گزارش همه');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(fixture.sent.map(request => request.model)).toEqual(['chosen-agent','chosen-agent']);
    expect(fixture.sent[1].messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'call-1' });
    expect(result.usageMetadata.total_tokens).toBe(30);
  });
  it('executes streamed tool arguments only after the complete tool response, then streams the answer', async () => {
    const fixture = harness(true, [sse([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'read_organization_data', arguments: '{"moduleId":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"marketing_leads"}' } }] }, finish_reason: 'tool_calls' }] },
    ]), sse([{ choices: [{ delta: { content: 'گزارش کامل' }, finish_reason: 'stop' }], usage: { total_tokens: 20 } }])]);
    const execute = vi.fn(async () => ({ records: [], hasMore: false }));
    const deltas: string[] = [];
    const result = await fixture.run({ tools: [tool], toolExecutor: execute, onDelta: (text: string) => deltas.push(text) });
    expect(execute).toHaveBeenCalledWith('read_organization_data', { moduleId: 'marketing_leads' });
    expect(result.content).toBe('گزارش کامل'); expect(deltas.join('')).toBe('گزارش کامل');
    expect(fixture.sent).toHaveLength(2);
  });
  it('stops at the declared tool budget instead of looping indefinitely', async () => {
    const response = () => new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [toolCall] }, finish_reason: 'tool_calls' }] }));
    const fixture = harness(false, [response(),response()]);
    const execute = vi.fn(async () => ({ records: [], hasMore: true }));
    await expect(fixture.run({ tools: [tool], toolExecutor: execute, maxToolRounds: 1 })).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
