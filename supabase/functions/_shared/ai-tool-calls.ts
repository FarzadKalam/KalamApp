export type AgentToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type AgentToolExecutor = (name: string, input: unknown) => Promise<unknown>;
type ValidatedTool = { id: string; name: string; args: Record<string, unknown> };
type ToolResult = { role: 'tool'; tool_call_id: string; content: string };
export type AgentToolBatchObserver = (calls: ValidatedTool[], run: () => Promise<ToolResult[]>) => Promise<ToolResult[]>;
export const isOrganizationDataRead = (name: string) =>
  ['read_organization_data', 'count_organization_data', 'aggregate_organization_data'].includes(name);

const TOOL_FALLBACK_VALUE_LABELS: Record<string, string> = {
  status: 'وضعیت', is_active: 'فعال', description: 'توضیح', process_name: 'نام فرآیند',
};

const presentToolFallbackValue = (value: unknown) => {
  if (typeof value === 'boolean') return value ? 'بله' : 'خیر';
  if (typeof value === 'number') return new Intl.NumberFormat('fa-IR').format(value);
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) return '';
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
};

/** Build a small answer from the last successful read before the Edge deadline. */
export const buildAgentToolResultFallback = (messages: Array<{ content?: string }> = []) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    let result: any;
    try { result = JSON.parse(String(messages[index]?.content || '')); } catch { continue; }
    const records = Array.isArray(result?.records) ? result.records : null;
    if (!records) continue;
    const rows = records.slice(0, 12).map((record: any) => {
      const fields = record?.fields && typeof record.fields === 'object' ? record.fields : record;
      if (!fields || typeof fields !== 'object') return '';
      const title = ['name','title','process_name','full_name','system_code']
        .map(key => presentToolFallbackValue(fields[key])).find(Boolean) || 'رکورد بدون عنوان';
      const details = ['status','is_active','description'].map(key => {
        const value = presentToolFallbackValue(fields[key]);
        return value ? `${TOOL_FALLBACK_VALUE_LABELS[key]}: ${value}` : '';
      }).filter(Boolean).slice(0, 2);
      return details.length ? `${title} — ${details.join('، ')}` : title;
    }).filter(Boolean);
    const label = presentToolFallbackValue(result?.label) || 'نتیجه‌های پیدا‌شده';
    if (!rows.length) return `بررسی «${label}» انجام شد و رکوردی مطابق شرط پیدا نشد.`;
    const more = result?.hasMore === true ? '\n\nاین فقط صفحهٔ اول نتیجه‌هاست؛ برای ادامه بنویسید «ادامه بده».' : '';
    return `داده‌ها با موفقیت بازیابی شدند، اما زمان پردازش نهایی مدل به سقف امن رسید. نتیجهٔ قابل بازیابی:\n\n${label}:\n${rows.map((row: string, rowIndex: number) => `${rowIndex + 1}. ${row}`).join('\n')}${more}`;
  }
  return '';
};

/** One validator for streaming and non-streaming function calls. */
export const executeAgentToolCalls = async (calls: AgentToolCall[], tools: any[], execute: AgentToolExecutor, observe?: AgentToolBatchObserver) => {
  if (!Array.isArray(calls) || calls.length > 8) throw new Error('تعداد فراخوانی ابزار در این مرحله معتبر نیست.');
  const allowed = new Set(tools.filter(tool => tool?.type === 'function').map(tool => tool.function?.name));
  const seen = new Set<string>();
  const validated: ValidatedTool[] = [];
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
    validated.push({ id: call.id, name: call.function.name, args: args as Record<string, unknown> });
  }
  const runOne = async (call: ValidatedTool): Promise<ToolResult> => {
    let result: unknown;
    try {
      result = await execute(call.name, call.args);
    } catch {
      // A rejected read is feedback for the model, never an empty result or a
      // reason to bypass authorization. Do not expose raw transport errors.
      if (!/^(read_|lookup_|describe_|get_organization_|count_organization_|aggregate_organization_)/.test(call.name)) throw new Error('اجرای ابزار عملیاتی تأیید نشد.');
      result = { success: false, code: 'read_request_rejected',
        message: 'درخواست خواندن تأیید نشد؛ این نتیجه به معنی نبود داده یا نداشتن مجوز کاربر نیست. نام ماژول و فیلد را با describe_organization_data بررسی کن، شرط‌ها را اصلاح کن و دوباره بخوان. برای ارتباط‌ها نام فیلد متعلق به رکورد مبدأ را بده. محدودیت واقعی دسترسی را دور نزن.' };
    }
    const content = JSON.stringify(result);
    if (!content || content.length > 64000) throw new Error('پاسخ ابزار بیش از اندازه است؛ درخواست کوچک‌تر یا صفحهٔ بعد را بررسی کنید.');
    return { role: 'tool', tool_call_id: call.id, content };
  };
  const groups: ValidatedTool[][] = [];
  for (const call of validated) {
    const previous = groups.at(-1);
    if (observe && isOrganizationDataRead(call.name) && previous && isOrganizationDataRead(previous[0].name)) previous.push(call);
    else groups.push([call]);
  }
  const messages: ToolResult[] = [];
  for (const group of groups) {
    const run = async () => {
      const results: ToolResult[] = [];
      for (const call of group) results.push(await runOne(call));
      return results;
    };
    messages.push(...await (observe ? observe(group, run) : run()));
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
