import { applyReasoningParameters,getReasoningProfile } from './ai-reasoning.ts';

const parts = (content: any) => typeof content==='string' ? [{ type: 'text',text: content }] : Array.isArray(content) ? content : [];
const json = (value: string) => { try { return JSON.parse(value); } catch { throw new Error('پارامتر ابزار معتبر نیست.'); } };
const responseParts = (content: any,role: string) => parts(content).map(part => {
  if (part.type==='text') return { type: role==='assistant' ? 'output_text' : 'input_text',text: part.text };
  if (part.type==='image_url') return { type: 'input_image',image_url: part.image_url?.url || part.image_url,...(part.image_url?.detail ? { detail: part.image_url.detail } : {}) };
  if (part.type==='file') return { type: 'input_file',...part.file };
  throw new Error('این نوع ورودی در مسیر تفکر مدل پشتیبانی نمی‌شود.');
});
const nativeParts = (content: any) => parts(content).map(part => {
  if (part.type==='text') return { type: 'text',text: part.text,...(part.cache_control ? { cache_control: part.cache_control } : {}) };
  if (part.type==='image_url') {
    const url=part.image_url?.url || part.image_url;
    const data=String(url).match(/^data:([^;]+);base64,(.*)$/s);
    return { type: 'image',source: data ? { type: 'base64',media_type: data[1],data: data[2] } : { type: 'url',url } };
  }
  if (part.type==='file') {
    const file=part.file || {},data=String(file.file_data || '').match(/^data:([^;]+);base64,(.*)$/s);
    if (data) return { type: 'document',source: { type: 'base64',media_type: data[1],data: data[2] } };
    if (file.file_id) return { type: 'document',source: { type: 'file',file_id: file.file_id } };
  }
  throw new Error('این نوع پیوست در مسیر تفکر مدل پشتیبانی نمی‌شود.');
});
export const prepareReasoningTransport = (model: any,original: Record<string,any>,effort?: string | null) => {
  const body=applyReasoningParameters({ ...original },model,effort);
  const route=getReasoningProfile(model).route;
  if (!route) return { path: '/chat/completions',body,route: 'chat' as const };
  if (route==='responses') {
    const input:any[]=[];
    for (const message of body.messages || []) {
      if (message.role==='tool') input.push({ type: 'function_call_output',call_id: message.tool_call_id,output: message.content });
      else if (message.response_items?.length) input.push(...message.response_items);
      else {
        const content=responseParts(message.content,message.role);
        if (content.length) input.push({ role: message.role,content });
        for (const call of message.tool_calls || []) input.push({ type: 'function_call',call_id: call.id,name: call.function.name,arguments: call.function.arguments });
      }
    }
    return { path: '/responses',route,body: {
      model: body.model,input,stream: body.stream===true,store: false,include: ['reasoning.encrypted_content'],
      max_output_tokens: body.max_completion_tokens || body.max_tokens,
      ...(body.reasoning_effort ? { reasoning: { effort: body.reasoning_effort } } : {}),
      ...(body.tools?.length ? { tools: body.tools.map((tool: any) => tool.type==='function' ? { type: 'function',...tool.function } : tool) } : {}),
      ...(body.response_format ? { text: { format: body.response_format.type==='json_schema' ? { type: 'json_schema',...body.response_format.json_schema } : body.response_format } } : {}),
      ...(body.prompt_cache_key ? { prompt_cache_key: body.prompt_cache_key } : {}),
      ...(body.safety_identifier ? { safety_identifier: body.safety_identifier } : {}),
      ...(body.service_tier ? { service_tier: body.service_tier } : {}),
    } };
  }
  const messages:any[]=[];
  const append=(role:string,content:any[]) => {
    if (!content.length) return;
    const last=messages.at(-1);
    if (last?.role===role) last.content.push(...content); else messages.push({ role,content });
  };
  const system:any[]=[];
  for (const message of body.messages || []) {
    if (message.role==='system' || message.role==='developer') system.push(...nativeParts(message.content));
    else if (message.role==='tool') append('user',[{ type: 'tool_result',tool_use_id: message.tool_call_id,content: message.content }]);
    else if (message.native_items?.length) append('assistant',message.native_items);
    else append(message.role,[...nativeParts(message.content),...(message.tool_calls || []).map((call:any) => ({ type: 'tool_use',id: call.id,name: call.function.name,input: json(call.function.arguments) }))]);
  }
  return { path: '/messages',route,body: {
    model: body.model,messages,system,max_tokens: body.max_completion_tokens || body.max_tokens,stream: body.stream===true,
    ...(body.output_config ? { output_config: body.output_config } : {}),
    ...(body.thinking ? { thinking: body.thinking } : {}),
    ...(body.tools?.length ? { tools: body.tools.map((tool:any) => {
      if (tool.type!=='function') throw new Error('ابزار انتخاب‌شده در مسیر این مدل پشتیبانی نمی‌شود.');
      return { name: tool.function.name,description: tool.function.description,input_schema: tool.function.parameters };
    }) } : {}),
    ...(body.response_format ? { output_config: { ...(body.output_config || {}),format: body.response_format.type==='json_schema'
      ? { type: 'json_schema',schema: body.response_format.json_schema.schema } : { type: 'json_schema',schema: { type: 'object' } } } } : {}),
  } };
};

const usageFor = (usage:any,route:string) => route==='responses' ? {
  ...usage,prompt_tokens: usage?.input_tokens || 0,completion_tokens: usage?.output_tokens || 0,
  prompt_tokens_details: usage?.input_tokens_details,completion_tokens_details: usage?.output_tokens_details,
} : { ...usage,prompt_tokens: (usage?.input_tokens || 0)+(usage?.cache_read_input_tokens || 0)+(usage?.cache_creation_input_tokens || 0),
  completion_tokens: usage?.output_tokens || 0,total_tokens: (usage?.input_tokens || 0)+(usage?.cache_read_input_tokens || 0)+(usage?.cache_creation_input_tokens || 0)+(usage?.output_tokens || 0),
  prompt_tokens_details: { cached_tokens: usage?.cache_read_input_tokens || 0 } };
export const normalizeReasoningResponse = (data:any,route:string) => {
  if (data.error) return data;
  const items=route==='responses' ? data.output || [] : data.content || [];
  const content=route==='responses' ? items.filter((item:any) => item.type==='message').flatMap((item:any) => item.content || []).filter((part:any) => ['output_text','refusal'].includes(part.type)).map((part:any) => part.text || part.refusal || '').join('')
    : items.filter((item:any) => item.type==='text').map((item:any) => item.text).join('');
  const calls=items.filter((item:any) => item.type===(route==='responses' ? 'function_call' : 'tool_use')).map((item:any) => ({ id: item.call_id || item.id,type: 'function',function: { name: item.name,arguments: route==='responses' ? item.arguments : JSON.stringify(item.input) } }));
  const incomplete=route==='responses' ? data.status==='incomplete' : data.stop_reason==='max_tokens';
  const stop=route==='responses' ? data.status==='completed' : ['end_turn','stop_sequence','tool_use'].includes(data.stop_reason);
  return { id: data.id,model: data.model,usage: usageFor(data.usage,route),...(data.estimated_cost ? { estimated_cost: data.estimated_cost } : {}),
    choices: [{ message: { role: 'assistant',content,...(calls.length ? { tool_calls: calls } : {}),
      ...(route==='responses' ? { response_items: items } : { native_items: items }) },finish_reason: incomplete ? 'length' : calls.length ? 'tool_calls' : stop ? 'stop' : data.stop_reason || data.status || '' }] };
};

/** Stream native protocols as the shared internal Chat event contract. Opaque
 * reasoning/signatures are carried to the next tool round, never user deltas. */
export const bridgeReasoningResponse = async (response: Response,route: string,stream: boolean) => {
  if (route==='chat' || !response.ok) return response;
  if (!stream) return new Response(JSON.stringify(normalizeReasoningResponse(await response.json(),route)),{ status: response.status,headers: response.headers });
  if (!response.body) throw new Error('پاسخ زنده مدل خالی است.');
  const reader=response.body.getReader(),encoder=new TextEncoder(),decoder=new TextDecoder();
  let buffer='',ended=false;
  const blocks:any[]=[],callIndexes=new Map<string,number>();
  let nativeUsage:any={},nativeId='';
  const translated=new ReadableStream<Uint8Array>({
    async pull(controller) {
      const emit=(delta:any,finish:any=null,usage?:any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta,finish_reason: finish }],...(usage ? { usage } : {}) })}\n\n`));
      const consume=(event:any) => {
        if (event.type==='error' || event.type==='response.failed') throw new Error(event.error?.message || event.response?.error?.message || 'پاسخ مدل ناموفق بود.');
        if (route==='responses') {
          if (event.type==='response.output_text.delta') emit({ content: event.delta });
          if (event.type==='response.output_item.added' && event.item?.type==='function_call') {
            const index=callIndexes.size;callIndexes.set(event.item.id,index);
            emit({ tool_calls: [{ index,id: event.item.call_id,type: 'function',function: { name: event.item.name,arguments: '' } }] });
          }
          if (event.type==='response.function_call_arguments.delta') emit({ tool_calls: [{ index: callIndexes.get(event.item_id),function: { arguments: event.delta } }] });
          if (event.type==='response.completed' || event.type==='response.incomplete') {
            const result=normalizeReasoningResponse(event.response,route),choice=result.choices[0];
            emit({ response_items: choice.message.response_items },choice.finish_reason,result.usage);
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));ended=true;
          }
        } else {
          if (event.type==='message_start') { nativeUsage=event.message?.usage || {};nativeId=event.message?.id; }
          if (event.type==='content_block_start') {
            blocks[event.index]={ ...event.content_block };
            if (event.content_block?.type==='tool_use') {
              callIndexes.set(String(event.index),callIndexes.size);
              emit({ tool_calls: [{ index: callIndexes.get(String(event.index)),id: event.content_block.id,type: 'function',function: { name: event.content_block.name,arguments: '' } }] });
              blocks[event.index]._json='';
            }
          }
          if (event.type==='content_block_delta') {
            const block=blocks[event.index],delta=event.delta;
            if (delta.type==='text_delta') { block.text=(block.text || '')+delta.text;emit({ content: delta.text }); }
            if (delta.type==='thinking_delta') block.thinking=(block.thinking || '')+delta.thinking;
            if (delta.type==='signature_delta') block.signature=(block.signature || '')+delta.signature;
            if (delta.type==='input_json_delta') { block._json+=delta.partial_json;emit({ tool_calls: [{ index: callIndexes.get(String(event.index)),function: { arguments: delta.partial_json } }] }); }
          }
          if (event.type==='content_block_stop' && blocks[event.index]?._json!==undefined) {
            const block=blocks[event.index];
            if (!block._json) emit({ tool_calls: [{ index: callIndexes.get(String(event.index)),function: { arguments: JSON.stringify(block.input || {}) } }] });
            block.input=block._json ? json(block._json) : block.input;delete block._json;
          }
          if (event.type==='message_delta') {
            nativeUsage={ ...nativeUsage,...event.usage };
            const result=normalizeReasoningResponse({ id: nativeId,content: blocks,usage: nativeUsage,stop_reason: event.delta?.stop_reason },route);
            emit({ native_items: blocks },result.choices[0].finish_reason,result.usage);
          }
          if (event.type==='message_stop') { controller.enqueue(encoder.encode('data: [DONE]\n\n'));ended=true; }
        }
      };
      try {
        const { value,done }=await reader.read();
        buffer+=decoder.decode(value,{ stream: !done });
        let boundary:number;
        while ((boundary=buffer.search(/\r?\n\r?\n/))>=0) {
          const frame=buffer.slice(0,boundary),separator=buffer.slice(boundary).match(/^\r?\n\r?\n/)![0];buffer=buffer.slice(boundary+separator.length);
          const data=frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (data && data!=='[DONE]') consume(json(data));
        }
        if (ended || done) { if (!ended) throw new Error('پاسخ زنده مدل پیش از پایان قطع شد.');controller.close();await reader.cancel(); }
      } catch (error) { await reader.cancel().catch(() => {});controller.error(error); }
    },
    cancel: reason => reader.cancel(reason),
  });
  return new Response(translated,{ status: response.status,headers: response.headers });
};
