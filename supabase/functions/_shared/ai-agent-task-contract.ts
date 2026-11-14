/** Shared, pure contract for conversational tasks and the workflow worker. */
export type AgentTaskSchedule =
  | { kind: 'once'; at: string; timeZone: string }
  | { kind: 'interval'; minutes: number; timeZone: string }
  | { kind: 'daily'; at: string; timeZone: string }
  | { kind: 'weekly'; at: string; weekdays: number[]; timeZone: string }
  | { kind: 'monthly'; at: string; day: number; timeZone: string };

export type AgentTaskDelivery =
  | { channel: 'chat' }
  | { channel: 'sms'; numbers: string[] }
  | { channel: 'email'; addresses: string[]; subject: string };

export type AgentTaskConfig = {
  version: 1;
  agentKey: string;
  instruction: string;
  trigger: 'interval' | 'on_create' | 'on_upsert';
  schedule: AgentTaskSchedule | null;
  deliveries: AgentTaskDelivery[];
  notifyWhen: 'always' | 'findings';
  sourceModuleIds: string[];
  sourceLimit: number;
  threadId: string | null;
};

const digits = (value: unknown) => String(value ?? '').trim()
  .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
const unique = (items: string[]) => [...new Set(items)];
const fail = (message: string): never => { throw new Error(message); };
const integer = (value: unknown, min: number, max: number, label: string): number => {
  const number = Number(digits(value));
  return Number.isInteger(number) && number >= min && number <= max ? number : fail(`${label} معتبر نیست.`);
};
const time = (value: unknown) => {
  const normalized = digits(value);
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(normalized)
    ? normalized.padStart(5, '0') : fail('ساعت باید مانند ۰۹:۳۰ مشخص شود.');
};
const timeZone = (value: unknown) => {
  const zone = String(value ?? '').trim();
  if (!zone) return fail('منطقهٔ زمانی مشخص نشده است.');
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return zone; }
  catch { return fail('منطقهٔ زمانی معتبر نیست.'); }
};

export const normalizeAgentTaskSchedule = (input: any): AgentTaskSchedule => {
  const zone = timeZone(input?.timeZone);
  switch (input?.kind) {
    case 'once': {
      const at = digits(input.at);
      // Never interpret an offset-free date in the worker's system timezone.
      if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(at) || !Number.isFinite(Date.parse(at))) {
        return fail('زمان اجرای یک‌باره باید تاریخ و منطقهٔ زمانی مشخص داشته باشد.');
      }
      return { kind: 'once', at: new Date(at).toISOString(), timeZone: zone };
    }
    case 'interval': return { kind: 'interval', minutes: integer(input.minutes, 5, 525600, 'فاصلهٔ اجرا'), timeZone: zone };
    case 'daily': return { kind: 'daily', at: time(input.at), timeZone: zone };
    case 'weekly': {
      const weekdays = [...new Set<number>((Array.isArray(input.weekdays) ? input.weekdays : [])
        .map((day: unknown) => integer(day, 0, 6, 'روز هفته')))].sort((a, b) => a - b);
      if (!weekdays.length) return fail('حداقل یک روز هفته را مشخص کنید.');
      return { kind: 'weekly', at: time(input.at), weekdays, timeZone: zone };
    }
    case 'monthly': return { kind: 'monthly', at: time(input.at), day: integer(input.day, 1, 31, 'روز ماه'), timeZone: zone };
    default: return fail('نوع زمان‌بندی پشتیبانی نمی‌شود.');
  }
};

export const normalizeAgentTaskConfig = (input: any, allowed: {
  agentKeys: readonly string[]; moduleIds: readonly string[];
}): AgentTaskConfig => {
  const agentKey = String(input?.agentKey ?? '').trim();
  if (!allowed.agentKeys.includes(agentKey)) return fail('ایجنت مجاز برای این کار مشخص نیست.');
  const instruction = String(input?.instruction ?? '').trim();
  if (!instruction || instruction.length > 6000) return fail('دستور کار باید روشن و حداکثر ۶۰۰۰ نویسه باشد.');
  const trigger = input?.trigger;
  if (!['interval', 'on_create', 'on_upsert'].includes(trigger)) return fail('نوع فعال‌کنندهٔ کار معتبر نیست.');
  const sources = unique((Array.isArray(input.sourceModuleIds) ? input.sourceModuleIds : [])
    .map((item: unknown) => String(item ?? '').trim()));
  if (!sources.length || sources.length > 6 || sources.some(moduleId => !allowed.moduleIds.includes(moduleId))) {
    return fail('منابع بررسی باید از ماژول‌های مجاز همان سازمان انتخاب شوند.');
  }
  const deliveries: AgentTaskDelivery[] = [];
  const requested = Array.isArray(input.deliveries) ? input.deliveries : [];
  if (!requested.length || requested.length > 3) return fail('روش دریافت نتیجه را مشخص کنید.');
  for (const delivery of requested) {
    if (deliveries.some(item => item.channel === delivery?.channel)) return fail('هر روش ارسال فقط یک بار قابل انتخاب است.');
    if (delivery?.channel === 'chat') { deliveries.push({ channel: 'chat' }); continue; }
    if (delivery?.channel === 'sms') {
      const numbers = unique((Array.isArray(delivery.numbers) ? delivery.numbers : []).map((number: unknown) => digits(number).replace(/[\s()-]/g, '')));
      if (!numbers.length || numbers.length > 20 || numbers.some(number => !/^\+?\d{8,15}$/.test(number))) return fail('شمارهٔ گیرندهٔ پیامک معتبر نیست.');
      deliveries.push({ channel: 'sms', numbers }); continue;
    }
    if (delivery?.channel === 'email') {
      const addresses = unique((Array.isArray(delivery.addresses) ? delivery.addresses : []).map((address: unknown) => String(address ?? '').trim().toLowerCase()));
      const subject = String(delivery.subject ?? '').trim();
      if (!addresses.length || addresses.length > 20 || addresses.some(address => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address))) return fail('نشانی ایمیل گیرنده معتبر نیست.');
      if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) return fail('عنوان ایمیل معتبر نیست.');
      deliveries.push({ channel: 'email', addresses, subject }); continue;
    }
    return fail('روش ارسال پشتیبانی نمی‌شود.');
  }
  if (!['always', 'findings'].includes(input.notifyWhen)) return fail('شرط اطلاع‌رسانی باید مشخص باشد.');
  const threadId = input.threadId == null ? null : String(input.threadId);
  if (threadId && !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(threadId)) return fail('گفتگوی مقصد معتبر نیست.');
  return { version: 1, agentKey, instruction, trigger,
    schedule: trigger === 'interval' ? normalizeAgentTaskSchedule(input.schedule) : null,
    deliveries, notifyWhen: input.notifyWhen, sourceModuleIds: sources,
    sourceLimit: integer(input.sourceLimit ?? 100, 1, 500, 'سقف دادهٔ هر بررسی'), threadId };
};

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number };
const localParts = (at: Date, zone: string): LocalParts => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, calendar: 'gregory',
    numberingSystem: 'latn', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
  const values = Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute };
};
const stamp = (parts: LocalParts) => Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);

/** Resolve a wall clock minute across offset changes. Missing DST minutes run
 * at the first valid minute after the gap; overlapping minutes use the first
 * occurrence. This prevents a second send during the repeated autumn hour. */
const wallClockInstant = (parts: LocalParts, zone: string): number => {
  const target = stamp(parts);
  const offsets = new Set<number>();
  for (const hours of [-24, 0, 24]) {
    const probe = target + hours * 3600000;
    offsets.add(stamp(localParts(new Date(probe), zone)) - probe);
  }
  const candidates = [...offsets].map(offset => target - offset).sort((a, b) => a - b);
  const exact = candidates.filter(candidate => stamp(localParts(new Date(candidate), zone)) === target);
  if (exact.length) return exact[0];
  // A spring gap: find the first existing local minute on the requested day.
  const start = Math.min(...candidates);
  for (let minute = 0; minute <= 180; minute++) {
    const candidate = start + minute * 60000;
    const local = localParts(new Date(candidate), zone);
    if (local.year === parts.year && local.month === parts.month && local.day === parts.day && stamp(local) >= target) return candidate;
  }
  return fail('زمان محلی اجرا در این منطقهٔ زمانی قابل تعیین نیست.');
};

/** Strictly after `after`; missed occurrences are coalesced by the worker. */
export const nextAgentTaskRunAt = (scheduleInput: AgentTaskSchedule, after: Date): string | null => {
  const schedule = normalizeAgentTaskSchedule(scheduleInput);
  if (!Number.isFinite(after.getTime())) return fail('زمان مرجع اجرا معتبر نیست.');
  if (schedule.kind === 'once') return Date.parse(schedule.at) > after.getTime() ? schedule.at : null;
  if (schedule.kind === 'interval') return new Date(after.getTime() + schedule.minutes * 60000).toISOString();
  const local = localParts(after, schedule.timeZone);
  const [hour, minute] = schedule.at.split(':').map(Number);
  for (let offset = 0; offset <= 370; offset++) {
    const day = new Date(Date.UTC(local.year, local.month - 1, local.day + offset));
    if (schedule.kind === 'weekly' && !schedule.weekdays.includes(day.getUTCDay())) continue;
    const monthEnd = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
    if (schedule.kind === 'monthly' && day.getUTCDate() !== Math.min(schedule.day, monthEnd)) continue;
    const candidate = wallClockInstant({ year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hour, minute }, schedule.timeZone);
    if (candidate > after.getTime()) return new Date(candidate).toISOString();
  }
  return fail('موعد بعدی کار پیدا نشد.');
};

export type AgentTaskDeliveryResult = { channel: string; status: 'success' | 'skipped' | 'failed'; message?: string; recipient_count?: number };
export const summarizeAgentTaskDeliveries = (results: AgentTaskDeliveryResult[]) => ({
  // A requested channel that skipped its send has not delivered the task.
  status: results.length > 0 && results.every(item => item.status === 'success') ? 'success' as const : 'failed' as const,
  deliveredChannels: results.filter(item => item.status === 'success').map(item => item.channel),
  failedChannels: results.filter(item => item.status !== 'success').map(item => item.channel),
  recipientCount: results.filter(item => item.status === 'success').reduce((sum, item) => sum + (item.recipient_count || 0), 0),
});
