export type AgentToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type AgentToolExecutor = (name: string, input: unknown) => Promise<unknown>;

/** One validator for streaming and non-streaming function calls. */
export const executeAgentToolCalls = async (calls: AgentToolCall[], tools: any[], execute: AgentToolExecutor) => {
  if (!Array.isArray(calls) || calls.length > 8) throw new Error('تعداد فراخوانی ابزار در این مرحله معتبر نیست.');
  const allowed = new Set(tools.filter(tool => tool?.type === 'function').map(tool => tool.function?.name));
  const seen = new Set<string>();
  const messages: Array<{ role: 'tool'; tool_call_id: string; content: string }> = [];
  for (const call of calls) {
    if (!call?.id || seen.has(call.id) || call.type !== 'function' || !allowed.has(call.function?.name)) {
      throw new Error('مدل ابزار ناشناخته یا فراخوانی نامعتبر پیشنهاد داد.');
    }
    seen.add(call.id);
    const raw = call.function.arguments;
    if (typeof raw !== 'string' || raw.length > 24000) throw new Error('ورودی ابزار بیش از اندازه یا نامعتبر است.');
    let args: unknown;
    try { args = JSON.parse(raw); } catch { throw new Error('ورودی ساختاریافتهٔ ابزار معتبر نیست.'); }
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('ورودی ابزار باید یک درخواست ساختاریافته باشد.');
    const result = await execute(call.function.name, args);
    const content = JSON.stringify(result);
    if (!content || content.length > 64000) throw new Error('پاسخ ابزار بیش از اندازه است؛ درخواست کوچک‌تر یا صفحهٔ بعد را بررسی کنید.');
    messages.push({ role: 'tool', tool_call_id: call.id, content });
  }
  return messages;
};

export const appendStreamToolCalls = (pending: Map<number, AgentToolCall>, deltas: any[]) => {
  if (!Array.isArray(deltas)) return;
  for (const delta of deltas) {
    const index = delta?.index;
    if (!Number.isInteger(index) || index < 0 || index > 7) throw new Error('تعداد ابزارهای پاسخ معتبر نیست.');
    const call = pending.get(index) || { id: '', type: 'function' as const, function: { name: '', arguments: '' } };
    if (delta.id) call.id = String(delta.id);
    if (delta.type && delta.type !== 'function') throw new Error('نوع ابزار پاسخ پشتیبانی نمی‌شود.');
    if (delta.function?.name) call.function.name += String(delta.function.name);
    if (delta.function?.arguments) call.function.arguments += String(delta.function.arguments);
    if (call.function.arguments.length > 24000) throw new Error('ورودی ابزار بیش از اندازه است.');
    pending.set(index, call);
  }
};
