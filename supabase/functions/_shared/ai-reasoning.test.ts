// @vitest-environment node
import { describe,expect,it,vi,afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { applyReasoningParameters,reasoningOptions,resolveReasoningEffort } from './ai-reasoning';
import { prepareReasoningTransport,normalizeReasoningResponse,bridgeReasoningResponse } from './ai-reasoning-transport';
const model=(id:string,metadata?:any) => ({ id,metadata });
afterEach(() => vi.unstubAllGlobals());
describe('central model-specific thinking contract',() => {
  it('offers only verified levels, never guesses an enum from a family name',() => {
    expect(reasoningOptions(model('glm-5.3')).map(row => row.value)).toEqual(['auto','low','high','max']);
    expect(reasoningOptions(model('deepseek-v4.1-flash')).map(row => row.value)).toEqual(['auto']);
    expect(reasoningOptions(model('unknown-flash'))).toEqual([]);
    expect(() => resolveReasoningEffort(model('glm-5.3'),'medium')).toThrow();
    expect(() => resolveReasoningEffort(model('glm-5.3'),'none')).toThrow();
  });
  it('resolves explicit, organization and central defaults without carrying invalid levels',() => {
    expect(resolveReasoningEffort(model('glm-5.3'),null,'medium','low','high')).toBe('low');
    expect(resolveReasoningEffort(model('glm-5.3'),'auto','low')).toBe('auto');
    expect(resolveReasoningEffort(model('glm-5.3'),'high','low')).toBe('high');
    expect(reasoningOptions(model('future',{ reasoning_config: { levels: ['low','high'],parameter: 'reasoning_effort' } })).map(row => row.value)).toEqual(['auto','low','high']);
  });
  it('sets required/hybrid thinking correctly and omits sampling temperature when needed',() => {
    expect(applyReasoningParameters({ temperature: 0.2 },model('glm-5.3'),'low')).toEqual({ reasoning_effort: 'low',thinking: { type: 'enabled' } });
    expect(applyReasoningParameters({},model('qwen3.8-flash'),'none')).toEqual({ enable_thinking: false });
    expect(applyReasoningParameters({},model('qwen3.8-flash'),'xhigh')).toEqual({ enable_thinking: true,reasoning_effort: 'xhigh' });
    expect(applyReasoningParameters({},model('deepseek-v4.1-flash'),'auto')).toEqual({});
  });
  it('offers managed Qwen Max thinking without inventing levels and obeys the streaming requirement',async () => {
    const max=model('qwen3.8-max');
    expect(reasoningOptions(max).map(option => option.value)).toEqual(['auto','none','enabled']);
    expect(() => resolveReasoningEffort(max,'high')).toThrow();
    const request={ model: max.id,messages: [{ role: 'user',content: 'بررسی' }],tools: [{ type: 'function',function: { name: 'read' } }] };
    const prepared=prepareReasoningTransport(max,request,'enabled');
    expect(prepared).toMatchObject({ path: '/chat/completions',route: 'chat-collected',body: { model: max.id,enable_thinking: true,stream: true,stream_options: { include_usage: true },tools: request.tools } });
    expect(prepared.body).not.toHaveProperty('reasoning_effort');
    expect(prepareReasoningTransport(max,request,'none')).toMatchObject({ route: 'chat',body: { enable_thinking: false } });
    expect(prepareReasoningTransport(max,request,'auto')).toMatchObject({ route: 'chat-collected',body: { stream: true } });
    expect(prepareReasoningTransport(max,request,'auto').body).not.toHaveProperty('enable_thinking');
    expect(prepareReasoningTransport(max,{ ...request,stream: true },'enabled').route).toBe('chat');
    const chunks=[
      { id: 'r',model: max.id,choices: [{ index: 0,delta: { reasoning_content: 'private' } }] },
      { choices: [{ index: 0,delta: { content: 'سلام',tool_calls: [{ index: 0,id: 'call',function: { name: 'read',arguments: '{"page":' } }] } }] },
      { choices: [{ index: 0,delta: { content: ' دنیا',tool_calls: [{ index: 0,function: { arguments: '2}' } }] },finish_reason: 'tool_calls' }] },
      { choices: [],usage: { prompt_tokens: 10,completion_tokens: 20,total_tokens: 30 } },
    ];
    const sse=chunks.map(chunk => `data: ${JSON.stringify(chunk)}\r\n\r\n`).join('')+'data: [DONE]\r\n\r\n';
    const bytes=new TextEncoder().encode(sse);
    const source=new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close();}}),{ headers: { 'Content-Type': 'text/event-stream','x-request-id': 'r' } });
    const response=await bridgeReasoningResponse(source,prepared.route,false),result=await response.json();
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('x-request-id')).toBe('r');
    expect(result.choices[0]).toMatchObject({ finish_reason: 'tool_calls',message: { content: 'سلام دنیا',reasoning_content: 'private',tool_calls: [{ id: 'call',function: { name: 'read',arguments: '{"page":2}' } }] } });
    expect(result.usage.total_tokens).toBe(30);
    await expect(bridgeReasoningResponse(new Response(sse.replace('data: [DONE]\r\n\r\n','')),'chat-collected',false)).rejects.toThrow('قطع');
    await expect(bridgeReasoningResponse(new Response('data: {"error":{"message":"provider failed"}}\n\n'),'chat-collected',false)).rejects.toThrow('provider failed');
  });
  it('uses Responses for Luna thinking with tools and preserves opaque state without replay',() => {
    const item={ type: 'reasoning',id: 'r',encrypted_content: 'opaque' };
    const prepared=prepareReasoningTransport(model('gpt-6-luna'),{ model: 'gpt-6-luna',max_tokens: 4000,
      messages: [{ role: 'user',content: [{ type: 'text',text: 'بررسی' },{ type: 'image_url',image_url: { url: 'https://file.test/image' } }] },
        { role: 'assistant',content: null,response_items: [item,{ type: 'function_call',call_id: 'c',name: 'read',arguments: '{}' }] },
        { role: 'tool',tool_call_id: 'c',content: '{"count":5}' }],tools: [{ type: 'function',function: { name: 'read',parameters: { type: 'object' } } }] },'high');
    expect(prepared.path).toBe('/responses');expect(prepared.body.reasoning).toEqual({ effort: 'high' });
    expect(prepared.body.input[1]).toEqual(item);expect(prepared.body.input[3].type).toBe('function_call_output');
    expect(prepared.body.store).toBe(false);expect(prepared.body.tools[0].name).toBe('read');
    expect(prepared.body.input[0].content[1].type).toBe('input_image');
  });
  it('uses native Claude effort, tool results and signed thinking blocks',() => {
    const signed={ type: 'thinking',thinking: 'internal',signature: 'signed' };
    const prepared=prepareReasoningTransport(model('claude-haiku-5-5'),{ model: 'claude-haiku-5-5',max_tokens: 4096,
      messages: [{ role: 'system',content: 'policy' },{ role: 'user',content: 'request' },{ role: 'assistant',native_items: [signed,{ type: 'tool_use',id: 'c',name: 'read',input: {} }] },
        { role: 'tool',tool_call_id: 'c',content: 'result' }],tools: [{ type: 'function',function: { name: 'read',parameters: { type: 'object' } } }] },'low');
    expect(prepared.path).toBe('/messages');expect(prepared.body.output_config).toEqual({ effort: 'low' });
    expect(prepared.body.messages[1].content[0]).toEqual(signed);expect(prepared.body.messages[2].content[0].type).toBe('tool_result');
    const normalized=normalizeReasoningResponse({ content: [signed,{ type: 'text',text: 'visible' }],stop_reason: 'end_turn',usage: { input_tokens: 10,output_tokens: 20,cache_read_input_tokens: 5 } },'messages');
    expect(normalized.choices[0].message.content).toBe('visible');expect(normalized.usage.total_tokens).toBe(35);
  });
  it('bridges real streaming text and retains completion state without exposing reasoning',async () => {
    const events=[{ type: 'response.output_text.delta',delta: 'سلام' },{ type: 'response.completed',response: { status: 'completed',output: [{ type: 'reasoning',encrypted_content: 'opaque' }],usage: { input_tokens: 10,output_tokens: 5 } } }];
    const source=new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
    const result=await bridgeReasoningResponse(source,'responses',true);
    const frames=(await result.text()).split('\n\n').filter(Boolean);
    expect(JSON.parse(frames[0].slice(6)).choices[0].delta.content).toBe('سلام');
    const final=JSON.parse(frames[1].slice(6));expect(final.choices[0].delta.response_items[0].encrypted_content).toBe('opaque');
    expect(final.choices[0].finish_reason).toBe('stop');expect(frames.at(-1)).toBe('data: [DONE]');
  });
  it('rejects premature native streams and keeps token-limit finish reasons',async () => {
    const result=await bridgeReasoningResponse(new Response('data: {"type":"response.output_text.delta","delta":"partial"}\n\n'),'responses',true);
    await expect(result.text()).rejects.toThrow('قطع');
    expect(normalizeReasoningResponse({ status: 'incomplete',output: [] },'responses').choices[0].finish_reason).toBe('length');
  });
  it('keeps native streamed signatures and supplies valid empty tool arguments',async () => {
    const events=[{ type: 'message_start',message: { id: 'r',usage: { input_tokens: 2 } } },
      { type: 'content_block_start',index: 0,content_block: { type: 'thinking',thinking: '',signature: '' } },
      { type: 'content_block_delta',index: 0,delta: { type: 'thinking_delta',thinking: 'private' } },
      { type: 'content_block_delta',index: 0,delta: { type: 'signature_delta',signature: 'signed' } },
      { type: 'content_block_start',index: 1,content_block: { type: 'tool_use',id: 'c',name: 'read',input: {} } },
      { type: 'content_block_stop',index: 1 },{ type: 'message_delta',delta: { stop_reason: 'tool_use' },usage: { output_tokens: 10 } },{ type: 'message_stop' }];
    const response=await bridgeReasoningResponse(new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')),'messages',true);
    const frames=(await response.text()).split('\n\n').filter(frame => frame.startsWith('data: {')).map(frame => JSON.parse(frame.slice(6)));
    expect(frames.some(frame => frame.choices[0].delta.content==='private')).toBe(false);
    expect(frames[1].choices[0].delta.tool_calls[0].function.arguments).toBe('{}');
    expect(frames.at(-1).choices[0].delta.native_items[0].signature).toBe('signed');
    expect(frames.at(-1).choices[0].finish_reason).toBe('tool_calls');
  });
  it('routes the actual shared gateway through native thinking without changing the chosen model',async () => {
    const source=readFileSync(new URL('../ai-assistant/index.ts',import.meta.url),'utf8');
    const code=source.slice(source.indexOf('const requestAvalaiWithFallback ='),source.indexOf('const getServiceHeaders ='));
    const fetch=vi.fn(async () => new Response(JSON.stringify({ id: 'result',content: [{ type: 'text',text: 'پاسخ' }],stop_reason: 'end_turn',usage: { input_tokens: 5,output_tokens: 10 } })));
    vi.stubGlobal('fetch',fetch);
    const deps={ prepareReasoningTransport,bridgeReasoningResponse,DEFAULT_AI_BASE_URL: 'https://provider.test/v1',
      uniqueBaseUrls: (values:string[]) => values,normalizeBaseUrl: (value:string) => value,isRetryableProviderStatus: () => false,isProviderTimeoutError: () => false };
    const run=new Function(...Object.keys(deps),ts.transpileModule(code+'\nreturn requestAvalaiWithFallback;',{
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText)(...Object.values(deps));
    const result=await run({ model: 'claude-haiku-5-5',apiKey: 'test-only',reasoningModelId: 'claude-haiku-5-5',reasoningEffort: 'low' },'/chat/completions',{
      method: 'POST',headers: { Authorization: 'Bearer test-only' },body: JSON.stringify({ model: 'claude-haiku-5-5',max_tokens: 4096,messages: [{ role: 'user',content: 'سؤال' }] }),
    });
    const [url,init]=fetch.mock.calls[0] as any;
    expect(url).toBe('https://provider.test/v1/messages');expect(init.headers.get('anthropic-version')).toBe('2023-06-01');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'claude-haiku-5-5',output_config: { effort: 'low' } });
    expect((await result.response.json()).choices[0].message.content).toBe('پاسخ');
  });
});
