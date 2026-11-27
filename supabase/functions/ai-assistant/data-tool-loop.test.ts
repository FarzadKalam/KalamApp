// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { appendStreamToolCalls, buildAgentToolResultFallback, executeAgentToolCalls } from '../_shared/ai-tool-calls';
import { appendContinuationText,createContinuationDeltaBuffer } from '../_shared/ai-context-lifecycle';
import { createAgentSkillRuntime } from '../_shared/ai-skill-registry';
import type { SkillExecutionContext } from '../_shared/ai-skills/types';
import { buildAvalaiPromptCacheKey, isAvalaiCacheKeyRejection, orderAiRequestTools } from '../_shared/ai-gateway';
import { getReasoningProfile } from '../_shared/ai-reasoning';
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const nonstream = source.slice(source.indexOf('const buildChatPromptCacheKey ='), source.indexOf('const callChatCompletionsStream ='));
const stream = source.slice(source.indexOf('const callChatCompletionsStream ='), source.indexOf('const getPublicSupabaseUrl ='));
const tool = { type: 'function', function: { name: 'read_organization_data' } };
const toolCall = { id: 'call-1', type: 'function', function: { name: 'read_organization_data', arguments: '{"moduleId":"marketing_leads"}' } };
const sse = (values: any[]) => new Response(values.map(value => `data: ${JSON.stringify(value)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });

const harness = (streaming: boolean, responses: Response[], providerConfig: Record<string, any> = {},
  providerReply?: (signal: AbortSignal) => Promise<Response>) => {
  const sent: any[] = [];
  const deps = {
    appendContinuationText,createContinuationDeltaBuffer,
    createAiContextBudget: () => ({ outputTokens: 4000,prepare: async (messages: any[]) => messages }),
    executeAgentToolCalls, appendStreamToolCalls, buildAgentToolResultFallback,
    requestAiProvider: vi.fn(async (_config: any, _path: string, options: any) => {
      sent.push(JSON.parse(options.body));
      if (providerReply) return { response: await providerReply(options.signal), baseUrl: 'test://' };
      const response = responses.shift(); if (!response) throw new Error('Unexpected provider call');
      return { response, baseUrl: 'test://' };
    }),
    buildAvalaiPromptCacheKey, isAvalaiCacheKeyRejection, orderAiRequestTools, getReasoningProfile,
    isReasoningModel: () => false, parseJsonSafe: JSON.parse,
    normalizeAiContentText: (value: any) => String(value || ''), normalizeAiContentAttachments: () => [],
    extractUsageMetadata: (value: any) => value.usage || null,
    getChatFinishReason: (value: any) => value.choices?.[0]?.finish_reason || '',
    getRecoverablePartialAiContent: (error: any) => error?.partialContent || '',
    buildContinuationMessages: (messages: any[], partial: string) => [...messages, { role: 'assistant', content: partial }, { role: 'user', content: 'ادامه' }],
    buildIncompleteAiResponseError: (reason: string, partial: string) => Object.assign(new Error(reason), { partialContent: partial, incomplete: true }),
    isCompleteChatFinishReason: (reason: any) => reason === 'stop',
    mergeChatUsageMetadata: (parts: any[]) => ({ total_tokens: parts.reduce((sum, part) => sum + (part?.total_tokens || 0), 0) }),
    shortenProviderError: (value: any) => String(value),
    CHAT_COMPLETION_CONTINUATION_LIMIT: 2, CHAT_COMPLETIONS_TIMEOUT_MS: 10000,
    STREAM_PROVIDER_INACTIVITY_TIMEOUT_MS: 10000, DEFAULT_CHAT_MAX_TOKENS: 4000, DEFAULT_REASONING_MAX_TOKENS: 4000,
    STREAM_DEADLINE_PERSISTENCE_RESERVE_MS: 10000,
  };
  const declaration = streaming ? nonstream + stream : nonstream;
  const executable = ts.transpileModule(`${declaration}\nreturn ${streaming ? 'callChatCompletionsStream' : 'callChatCompletions'};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = new Function(...Object.keys(deps), executable)(...Object.values(deps));
  return { sent, run: (options: any, messages = [{ role: 'user', content: 'همهٔ لیدها را بررسی کن' }]) =>
    run({ model: 'chosen-agent', apiKey: 'fake-test', provider: 'avalai', ...providerConfig }, messages, options) };
};

describe('actual central agent data tool loop', () => {
  it.each([false, true])('cancels the provider request without starting a retry (stream: %s)', async streaming => {
    const stop = new AbortController();
    let providerStarted!: () => void;
    const started = new Promise<void>(resolve => { providerStarted = resolve; });
    const fixture = harness(streaming, [], {}, signal => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      providerStarted();
    }));
    const turn = fixture.run({ signal: stop.signal });
    const result = expect(turn).rejects.toMatchObject({ name: 'AbortError' });
    await started;
    stop.abort();
    await result;
    expect(fixture.sent).toHaveLength(1);
  });

  it.each([false, true])('sends only a routing key and retries a rejected hint (stream: %s)', async streaming => {
    const fallback = streaming
      ? sse([{ choices: [{ delta: { content: 'پاسخ کامل' }, finish_reason: 'stop' }] }])
      : new Response(JSON.stringify({ choices: [{ message: { content: 'پاسخ کامل' }, finish_reason: 'stop' }] }));
    const fixture = harness(streaming, [
      new Response(JSON.stringify({ error: { message: 'unsupported parameter prompt_cache_key' } }), { status: 400 }),
      fallback,
    ], { model: 'gpt-6-luna', orgId: 'tenant-id' });
    const messages = [{ role: 'system', content: 'قواعد ثابت' }, { role: 'system', content: 'زمینهٔ جاری' }, { role: 'user', content: 'درخواست' }];
    expect((await fixture.run({}, messages)).content).toBe('پاسخ کامل');
    expect(fixture.sent[0].prompt_cache_key).toMatch(/^kalam_/);
    expect(fixture.sent[1]).not.toHaveProperty('prompt_cache_key');
    for (const request of fixture.sent) {
      expect(request.messages).toEqual(messages);
      expect(JSON.stringify(request)).not.toMatch(/cache_control|prompt_cache_breakpoint|prompt_cache_options/);
    }
  });

  it.each([false, true])('loads instructions on the model decision from a continuation (stream: %s)', async streaming => {
    const userMessage = 'مثل بار قبل انجامش بده';
    const runtime = createAgentSkillRuntime({
      userMessage, selectedAgents: ['sales_leads'], grounding: { agentConfigs: [],
        agentStates: { sales_leads: { canUse: true, canView: true, canChat: true } } },
    } as unknown as SkillExecutionContext)!;
    const selection = { id: 'skill-1', type: 'function', function: {
      name: 'read_agent_skills', arguments: JSON.stringify({ skillIds: ['sales_leads:sales_invoice'] }),
    } };
    const output = 'پیش‌نویس آماده است.';
    const response = (message: any, finish_reason: string) => streaming
      ? sse([{ choices: [{ delta: message, finish_reason }] }])
      : new Response(JSON.stringify({ choices: [{ message, finish_reason }] }));
    const fixture = harness(streaming, [
      response({ tool_calls: [streaming ? { ...selection, index: 0 } : selection] }, 'tool_calls'),
      response({ content: output }, 'stop'),
    ]);
    const execute = vi.fn(async (_name: string, input: Parameters<typeof runtime.execute>[0]) => runtime.execute(input));
    const result = await fixture.run({ tools: [runtime.tool], toolExecutor: execute }, [
      { role: 'system', content: runtime.systemMessage },
      { role: 'assistant', content: 'فاکتور فروش مشتری را آماده کردم.' },
      { role: 'user', content: userMessage },
    ]);
    expect(result.content).toBe(output);
    expect(execute).toHaveBeenCalledWith('read_agent_skills', { skillIds: ['sales_leads:sales_invoice'] });
    expect(JSON.stringify(fixture.sent[0].messages)).not.toContain('واحد واقعی');
    expect(fixture.sent[1].messages.at(-1).content).toContain('واحد واقعی');
  });

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
  it('returns the recovered data before the edge deadline instead of losing the turn', async () => {
    const fixture = harness(true, [sse([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'read_organization_data', arguments: '{"moduleId":"process_templates"}' } }] }, finish_reason: 'tool_calls' }] },
    ])]);
    const execute = vi.fn(async () => ({ label: 'الگوهای فرآیند', records: [{ fields: { name: 'استخدام نیروی فروش' } }], hasMore: false }));
    const result = await fixture.run({ tools: [tool], toolExecutor: execute, deadlineAt: Date.now() + 5000 });
    expect(result.content).toContain('استخدام نیروی فروش');
    expect(result.finishReason).toBe('deadline_fallback');
    expect(fixture.sent).toHaveLength(1);
  });
  it('retries an invalid stream on the same model without asking the client to resubmit', async () => {
    const fixture = harness(true, [
      new Response(JSON.stringify({ error: { message: 'stream invalid' } }), { status: 400 }),
      new Response(JSON.stringify({ choices: [{ message: { content: 'پاسخ کامل' }, finish_reason: 'stop' }] })),
    ]);
    const result = await fixture.run({});
    expect(result.content).toBe('پاسخ کامل');
    expect(fixture.sent.map(request => [request.model, Boolean(request.stream)])).toEqual([['chosen-agent', true], ['chosen-agent', false]]);
  });
  it('keeps a finalized text answer even if the gateway closes before the DONE frame', async () => {
    const fixture = harness(true, [new Response('data: {"choices":[{"delta":{"content":"پاسخ کامل"},"finish_reason":"stop"}]}\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } })]);
    const result = await fixture.run({});
    expect(result.content).toBe('پاسخ کامل');
    expect(result.incomplete).toBe(false);
    expect(fixture.sent).toHaveLength(1);
  });
  it('stops at the declared tool budget instead of looping indefinitely', async () => {
    const response = () => new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [toolCall] }, finish_reason: 'tool_calls' }] }));
    const fixture = harness(false, [response(),response()]);
    const execute = vi.fn(async () => ({ records: [], hasMore: true }));
    await expect(fixture.run({ tools: [tool], toolExecutor: execute, maxToolRounds: 1 })).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
