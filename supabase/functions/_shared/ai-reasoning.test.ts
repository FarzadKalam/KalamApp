// @vitest-environment node
import { describe,expect,it } from 'vitest';
import { applyReasoningParameters,reasoningOptions,resolveReasoningEffort } from './ai-reasoning';
import { prepareReasoningTransport,normalizeReasoningResponse,bridgeReasoningResponse } from './ai-reasoning-transport';
const model=(id:string,metadata?:any) => ({ id,metadata });
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
});
