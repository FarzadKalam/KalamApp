/** Shared presentation contract. Capability keys remain stable for plans, billing and saved conversations. */
export const AI_AGENTS = {
  auto_decision: { label: 'ایجنت راهبر', description: 'درخواست را بررسی می‌کند و ایجنت مناسب را انتخاب می‌کند.', activity: 'در حال بررسی درخواست' },
  text_chat: { label: 'ایجنت گفتگو', description: 'گفتگوی مستقیم با استفاده از زمینهٔ مجاز سازمان', activity: 'در حال آماده‌سازی پاسخ' },
  free_chat: { label: 'ایجنت گفتگوی آزاد', description: 'گفتگو بدون استفاده از داده‌ها و دانش سازمان', activity: 'در حال آماده‌سازی پاسخ' },
  document_analysis: { label: 'ایجنت تحلیل اسناد', description: 'بررسی و تحلیل فایل، تصویر، رسید و سند', activity: 'در حال تحلیل سند' },
  voice_input: { label: 'ایجنت شنوا', description: 'تبدیل و تحلیل پیام صوتی', activity: 'در حال تحلیل صدا' },
  voice_output: { label: 'ایجنت گوینده', description: 'تولید پاسخ صوتی از متن', activity: 'در حال تولید صدا' },
  voice_conversation: { label: 'ایجنت مکالمهٔ صوتی', description: 'گفتگوی صوتی با دستیار', activity: 'در حال آماده‌سازی پاسخ صوتی' },
  image_generation: { label: 'ایجنت تصویرساز', description: 'ساخت و اصلاح تصویر با توضیح یا تصویر مرجع', activity: 'در حال ساخت تصویر' },
  image_edit: { label: 'ایجنت تصویرساز', description: 'اصلاح تصویر با توضیح شما', activity: 'در حال اصلاح تصویر' },
  video_generation: { label: 'ایجنت ویدیوساز', description: 'ساخت ویدیو از متن یا تصویر', activity: 'در حال ساخت ویدیو' },
  document_generation: { label: 'ایجنت فایل‌ساز', description: 'ساخت فایل ورد، اکسل، پی‌دی‌اف و جدول', activity: 'در حال ساخت فایل' },
  web_search: { label: 'ایجنت پژوهش', description: 'جستجو در اینترنت برای اطلاعات به‌روز', activity: 'در حال جستجو در اینترنت' },
  deep_reasoning: { label: 'ایجنت تحلیل‌گر', description: 'بررسی عمیق پرسش‌ها و مسائل پیچیده', activity: 'در حال فکر کردن' },
  legal_assistant: { label: 'ایجنت حقوقی', description: 'بررسی حقوقی با تکیه بر منابع موجود', activity: 'در حال بررسی حقوقی' },
  record_creation: { label: 'ایجنت ثبت اطلاعات', description: 'پیشنهاد ساخت یا ویرایش رکورد با تأیید شما', activity: 'در حال آماده‌سازی پیش‌نویس' },
  process_operation: { label: 'ایجنت فرآیندها', description: 'پیشنهاد اجرای فرآیند و تغییر مرحله با تأیید شما', activity: 'در حال بررسی فرآیند' },
  organization_data: { label: 'ایجنت اطلاعات سازمان', description: 'بررسی داده‌های واقعی در محدودهٔ دسترسی کاربر', activity: 'در حال بررسی اطلاعات واقعی سازمان' },
  organization_knowledge: { label: 'ایجنت دانش سازمان', description: 'بازیابی دانش و دستورالعمل‌های مجاز سازمان', activity: 'در حال بررسی دانش سازمان' },
  customer_reply_suggestion: { label: 'ایجنت پاسخ مشتری', description: 'پیشنهاد پاسخ برای پیام‌های مشتریان', activity: 'در حال آماده‌سازی پاسخ مشتری' },
  customer_auto_reply: { label: 'ایجنت پاسخگوی مشتری', description: 'پاسخ خودکار به مشتریان بر اساس تنظیمات سازمان', activity: 'در حال آماده‌سازی پاسخ مشتری' },
  voip_auto_reply: { label: 'ایجنت پاسخگوی تماس', description: 'پاسخ صوتی خودکار به تماس‌ها', activity: 'در حال آماده‌سازی پاسخ تماس' },
  workflow_ai_prompt: { label: 'ایجنت گردش کار', description: 'اجرای دستور هوش مصنوعی در گردش کار', activity: 'در حال اجرای دستور گردش کار' },
  embedding: { label: 'ایجنت نمایه‌ساز دانش', description: 'آماده‌سازی اسناد برای بازیابی دانش', activity: 'در حال نمایه‌سازی دانش' },
} as const;

export type AiAgentId = keyof typeof AI_AGENTS;
export const AI_COMPOSER_AGENT_IDS = ['text_chat', 'document_analysis', 'voice_input', 'voice_output', 'image_generation', 'video_generation', 'document_generation', 'web_search', 'deep_reasoning', 'legal_assistant', 'record_creation', 'process_operation', 'free_chat'] as const satisfies readonly AiAgentId[];
export type AiComposerAgentId = typeof AI_COMPOSER_AGENT_IDS[number];
const ALIASES: Record<string, AiAgentId> = { auto_router: 'auto_decision', dashboard_chat: 'text_chat', record_chat: 'text_chat' };
export function resolveAiAgentId(value: unknown): AiAgentId {
  const key = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(AI_AGENTS, key) ? key as AiAgentId : ALIASES[key] || 'auto_decision';
}
export const getAiAgent = (id: unknown) => AI_AGENTS[resolveAiAgentId(id)];
export const getAiAgentLabel = (id: unknown) => getAiAgent(id).label;

export type AiAgentActivity = { agentId: AiAgentId; phase: 'started' | 'completed'; at: number };
export function parseAiAgentActivity(value: unknown): AiAgentActivity | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.agentId !== 'string' || !Object.prototype.hasOwnProperty.call(AI_AGENTS, item.agentId)) return null;
  if (item.phase !== 'started' && item.phase !== 'completed') return null;
  if (typeof item.at !== 'number' || !Number.isFinite(item.at)) return null;
  return { agentId: item.agentId as AiAgentId, phase: item.phase, at: item.at };
}

/** Only observed execution events; concurrent activities remain visible until each finishes. */
export function applyAiAgentActivity(current: AiAgentActivity[], event: AiAgentActivity): AiAgentActivity[] {
  const others = current.filter(item => item.agentId !== event.agentId);
  return event.phase === 'started' ? [...others, event] : others;
}

export type AiAgentActivityReporter = (event: AiAgentActivity) => void;
export async function withAiAgentActivity<T>(agentId: AiAgentId, work: () => Promise<T>, report?: AiAgentActivityReporter): Promise<T> {
  report?.({ agentId, phase: 'started', at: Date.now() });
  try { return await work(); }
  finally { report?.({ agentId, phase: 'completed', at: Date.now() }); }
}
