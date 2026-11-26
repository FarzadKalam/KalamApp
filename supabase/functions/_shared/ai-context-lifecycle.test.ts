// @vitest-environment node
import { describe,expect,it,vi } from 'vitest';
import { createContextBudgetController,contextMessageGroups,contextRequestTokens,summarizeContextMessages,appendContinuationText,createContinuationDeltaBuffer,buildDeterministicContextSummary } from './ai-context-lifecycle';
import { getModelContextWindowTokens,getModelMaxOutputTokens,parseProviderContextLimitFromError } from './ai-context-policy';
import { shouldAutoCompactContext,mergeWorkingStateFromMessages } from './ai-context-compressor';

describe('shared context lifecycle for every agent',() => {
  it('compacts a few large messages, preserves the current request and stable system prefix',async () => {
    const system={ role: 'system',content: 'قانون ثابت' },current={ role: 'user',content: 'درخواست جاری را ادامه بده' };
    const messages=[system,{ role: 'user',content: 'هدف قبلی' },{ role: 'assistant',content: 'الف'.repeat(20000) },current];
    const compress=vi.fn(async () => 'هدف و محدودیت‌ها و نقطه ادامه');
    const next=await createContextBudgetController({ initialMessages: messages,modelCatalog: { metadata: { context_window: 4096 } },outputTokens: 1024,compress }).prepare(messages);
    expect(next[0]).toBe(system); expect(next.at(-1)).toBe(current);
    expect(contextRequestTokens(next)).toBeLessThan(3000); expect(compress).toHaveBeenCalled();
    expect(shouldAutoCompactContext({ promptMessages: [{ role: 'user',content: 'x'.repeat(20000) }],rawMessageCount: 1,modelCatalog: { id: 'small',metadata: { context_window: 4096 } } }).shouldCompact).toBe(true);
  });

  it('keeps tool-call groups valid and exact cursor/aggregation progress without replay',async () => {
    const messages:any[]=[{ role: 'system',content: 'policy' },{ role: 'user',content: 'همه موارد را جمع کن' }];
    for (let i=0;i<4;i++) messages.push({ role: 'assistant',content: null,tool_calls: [{ id: `c${i}`,function: { name: 'aggregate_organization_data',arguments: JSON.stringify({ afterId: `cursor-${i}` }) } }] },
      { role: 'tool',tool_call_id: `c${i}`,content: JSON.stringify({ coverage: 'partial',sum: '123456789.001',nextAfterId: `cursor-${i+1}`,nextSource: 'links',hasMore: true,records: 'x'.repeat(3000) }) });
    const next=await createContextBudgetController({ initialMessages: messages,modelCatalog: { metadata: { context_window: 4096 } },outputTokens: 1024,compress: async () => 'بررسی ادامه دارد' }).prepare(messages,true);
    expect(() => contextMessageGroups(next)).not.toThrow();
    expect(JSON.stringify(next)).toContain('123456789.001'); expect(JSON.stringify(next)).toContain('cursor-4');
    expect(next.map(message => String(message.content || '')).join('\n')).toContain('"nextSource":"links"');
    expect(next.some(message => message.role === 'user' && message.content === 'همه موارد را جمع کن')).toBe(true);
  });

  it('summarizes the entire text including the tail rather than clipping each message',async () => {
    const compress=vi.fn(async () => 'حافظه');
    await summarizeContextMessages([{ role: 'assistant',content: 'x'.repeat(40000)+'IMPORTANT_TAIL' }],compress);
    expect(compress.mock.calls.length).toBeGreaterThan(1);
    expect(JSON.stringify(compress.mock.calls)).toContain('IMPORTANT_TAIL');
  });

  it('includes the latest old answer in the summary when pinned context leaves little space',async () => {
    const system={ role: 'system',content: 'z'.repeat(6600) },current={ role: 'user',content: 'درخواست جاری' };
    const latest={ role: 'assistant',content: 'نقطهٔ ادامه '+ 'x'.repeat(1550) };
    const messages=[system,{ role: 'user',content: 'هدف اولیه' },latest,current];
    const compress=vi.fn(async () => 'هدف اولیه و نقطهٔ ادامه');
    const next=await createContextBudgetController({ initialMessages: messages,modelCatalog: { metadata: { context_window: 4096 } },outputTokens: 1024,compress }).prepare(messages,true);
    expect(next[0]).toBe(system);
    expect(next.at(-1)).toBe(current);
    expect(next).not.toContain(latest);
    expect(JSON.stringify(compress.mock.calls)).toContain('نقطهٔ ادامه');
  });

  it('keeps file references and processed/pending identities outside the lossy summary',() => {
    const state=mergeWorkingStateFromMessages(null,[{ id: 'message',role: 'user',metadata: { attachments: [{ name: 'تصویر',url: 'https://files.test/image',assetId: 'asset',mimeType: 'image/jpeg',data: 'DO_NOT_STORE' }] } },
      { role: 'assistant',metadata: { action_log_id: 'action',requires_confirmation: true } }]);
    expect(state.attachment_refs?.[0].asset_id).toBe('asset'); expect(state.pending_action_refs?.[0].status).toBe('pending');
    expect(state.active_intake_attachments?.[0].url).toBe('https://files.test/image'); expect(JSON.stringify(state)).not.toContain('DO_NOT_STORE');
    const completed=mergeWorkingStateFromMessages(state,[{ role: 'assistant',metadata: { created_records: [{ module_id: 'projects',id: 'project',title: 'پروژه' }] } }]);
    expect(completed.active_intake_attachments).toEqual([]); expect(completed.attachment_refs).toHaveLength(1);
  });

  it('does not mutate or discard original messages when the summarizer fails',async () => {
    const messages=[{ role: 'system',content: 'rules' },{ role: 'assistant',content: 'x'.repeat(20000) },{ role: 'user',content: 'ادامه' }];
    const snapshot=JSON.stringify(messages);
    await expect(createContextBudgetController({ initialMessages: messages,outputTokens: 1024,modelCatalog: { metadata: { context_window: 4096 } },compress: async () => { throw new Error('temporary'); } }).prepare(messages)).rejects.toThrow('temporary');
    expect(JSON.stringify(messages)).toBe(snapshot);
  });

  it('joins output continuations without repeating the emitted prefix, including streaming pieces',() => {
    const previous='متن قبلی '+ 'a'.repeat(100),next='a'.repeat(100)+' ادامه تازه';
    expect(appendContinuationText(previous,next)).toBe(previous+' ادامه تازه');
    const push=createContinuationDeltaBuffer(previous);
    expect(push('a'.repeat(30))).toBe('');
    expect(push('a'.repeat(70))).toBe('');
    expect(push(' ادامه تازه',true)).toBe(' ادامه تازه');
    expect(appendContinuationText('{"name":"بخ','ش"}')).toBe('{"name":"بخش"}');
  });

  it('infers family context/output limits when metadata is absent and parses provider limit errors',() => {
    expect(getModelContextWindowTokens({ id: 'claude-sonnet-5-5',metadata: {} })).toBe(200_000);
    expect(getModelContextWindowTokens({ id: 'claude-sonnet-5-5',metadata: { context_window: 128_000 } })).toBe(128_000);
    expect(getModelMaxOutputTokens({ id: 'claude-sonnet-5-5',metadata: {} })).toBe(32_768);
    expect(getModelMaxOutputTokens({ id: 'custom-model',metadata: { max_output_tokens: 24_000 } })).toBe(24_000);
    expect(parseProviderContextLimitFromError('This model maximum context length is 131072 tokens')).toBe(131072);
    expect(parseProviderContextLimitFromError('prompt is too long: 205000 tokens > 200000 maximum')).toBe(200000);
  });

  it('gracefully trims oversized turn-1 context instead of throwing a hard context error',async () => {
    const system={ role: 'system',content: 'سیاست ثابت' };
    const extraSystem={ role: 'system',content: 'فهرست بزرگ '.repeat(3000) };
    const current={ role: 'user',content: 'درخواست جدید' };
    const next=await createContextBudgetController({
      initialMessages: [system,extraSystem,current],
      modelCatalog: { id: 'small-model',metadata: { context_window: 4096 } },
      outputTokens: 1024,
      compress: async () => buildDeterministicContextSummary([current]),
    }).prepare([system,extraSystem,current]);
    expect(next[0]).toBe(system);
    expect(next.at(-1)).toBe(current);
    expect(contextRequestTokens(next)).toBeLessThan(4096 - 1024);
  });
});
