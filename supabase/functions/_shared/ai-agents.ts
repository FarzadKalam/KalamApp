/** Shared presentation contract. Capability keys remain stable for plans, billing and saved conversations. */
export const AI_AGENTS = {
  auto_decision: { label: 'انتخاب خودکار', description: 'درخواست را بررسی می‌کند و مهارت یا ایجنت مناسب را انتخاب می‌کند.', activity: 'در حال بررسی درخواست' },
  text_chat: { label: 'مهارت گفتگو', description: 'گفتگوی مستقیم با استفاده از زمینهٔ مجاز سازمان', activity: 'در حال آماده‌سازی پاسخ' },
  free_chat: { label: 'مهارت گفتگوی آزاد', description: 'گفتگو بدون استفاده از داده‌ها و دانش سازمان', activity: 'در حال آماده‌سازی پاسخ' },
  document_analysis: { label: 'مهارت تحلیل اسناد', description: 'بررسی و تحلیل فایل، تصویر، رسید و سند', activity: 'در حال تحلیل سند' },
  voice_input: { label: 'مهارت شنیدار و تبدیل صدا', description: 'تبدیل و تحلیل پیام صوتی', activity: 'در حال تبدیل صدا به متن' },
  voice_output: { label: 'مهارت تولید صدا', description: 'تولید پاسخ صوتی از متن', activity: 'در حال تولید صدا' },
  voice_conversation: { label: 'مهارت مکالمهٔ صوتی', description: 'گفتگوی صوتی با دستیار', activity: 'در حال آماده‌سازی پاسخ صوتی' },
  image_generation: { label: 'مهارت تصویرسازی', description: 'ساخت و اصلاح تصویر با توضیح یا تصویر مرجع', activity: 'در حال ساخت تصویر' },
  image_edit: { label: 'مهارت ویرایش تصویر', description: 'اصلاح تصویر با توضیح شما', activity: 'در حال اصلاح تصویر' },
  video_generation: { label: 'مهارت ویدیوسازی', description: 'ساخت ویدیو از متن یا تصویر', activity: 'در حال ساخت ویدیو' },
  document_generation: { label: 'مهارت ساخت فایل', description: 'ساخت فایل ورد، اکسل، پی‌دی‌اف و جدول', activity: 'در حال ساخت فایل' },
  web_search: { label: 'مهارت پژوهش وب', description: 'جستجو در اینترنت برای اطلاعات به‌روز', activity: 'در حال جستجو در اینترنت' },
  deep_reasoning: { label: 'مهارت تحلیل عمیق', description: 'بررسی عمیق پرسش‌ها و مسائل پیچیده', activity: 'در حال تحلیل عمیق' },
  legal_assistant: { label: 'مهارت مشاوره حقوقی', description: 'بررسی حقوقی با تکیه بر منابع موجود', activity: 'در حال بررسی حقوقی' },
  record_creation: { label: 'مهارت ثبت اطلاعات', description: 'پیشنهاد ساخت یا ویرایش رکورد با تأیید شما', activity: 'در حال آماده‌سازی پیش‌نویس' },
  process_operation: { label: 'مهارت عملیات فرآیند', description: 'پیشنهاد اجرای فرآیند و تغییر مرحله با تأیید شما', activity: 'در حال بررسی فرآیند' },
  organization_data: { label: 'مهارت اطلاعات سازمان', description: 'بررسی داده‌های واقعی در محدودهٔ دسترسی کاربر', activity: 'در حال بررسی اطلاعات سازمان' },
  organization_knowledge: { label: 'مهارت دانش سازمان', description: 'بازیابی دانش و دستورالعمل‌های مجاز سازمان', activity: 'در حال جستجو در دانش سازمان' },
  customer_reply_suggestion: { label: 'مهارت پیشنهاد پاسخ مشتری', description: 'پیشنهاد پاسخ برای پیام‌های مشتریان', activity: 'در حال آماده‌سازی پاسخ مشتری' },
  customer_auto_reply: { label: 'مهارت پاسخ خودکار مشتری', description: 'پاسخ خودکار به مشتریان بر اساس تنظیمات سازمان', activity: 'در حال آماده‌سازی پاسخ مشتری' },
  voip_auto_reply: { label: 'مهارت پاسخ خودکار تماس', description: 'پاسخ صوتی خودکار به تماس‌ها', activity: 'در حال آماده‌سازی پاسخ تماس' },
  workflow_ai_prompt: { label: 'مهارت گردش کار', description: 'اجرای دستور هوش مصنوعی در گردش کار', activity: 'در حال اجرای دستور گردش کار' },
  embedding: { label: 'مهارت نمایه‌سازی دانش', description: 'آماده‌سازی اسناد برای بازیابی دانش', activity: 'در حال نمایه‌سازی دانش' },
} as const;

export type AiAgentId = keyof typeof AI_AGENTS;
export const AI_COMPOSER_AGENT_IDS = ['text_chat', 'document_analysis', 'voice_input', 'voice_output', 'image_generation', 'video_generation', 'document_generation', 'web_search', 'deep_reasoning', 'legal_assistant', 'record_creation', 'process_operation', 'free_chat'] as const satisfies readonly AiAgentId[];
export type AiComposerAgentId = typeof AI_COMPOSER_AGENT_IDS[number];
const ALIASES: Record<string, AiAgentId> = { auto_router: 'auto_decision', dashboard_chat: 'text_chat', record_chat: 'text_chat' };
export function resolveAiAgentId(value: unknown): AiAgentId {
  const key = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(AI_AGENTS, key) ? key as AiAgentId
    : Object.prototype.hasOwnProperty.call(ALIASES, key) ? ALIASES[key] : 'auto_decision';
}
export const getAiAgent = (id: unknown) => AI_AGENTS[resolveAiAgentId(id)];
export const getAiAgentLabel = (id: unknown) => getAiAgent(id).label;

export type AiActivityActionType =
  | 'routing'
  | 'read_data'
  | 'search_knowledge'
  | 'web_search'
  | 'analyze_document'
  | 'transcribe_voice'
  | 'generate_voice'
  | 'generate_image'
  | 'edit_image'
  | 'generate_video'
  | 'generate_file'
  | 'deep_reasoning'
  | 'legal_review'
  | 'record_mutation'
  | 'process_operation'
  | 'generating_reply'
  | 'customer_reply'
  | 'workflow_action'
  | 'indexing';

export const AI_ACTIVITY_ACTION_BY_CAPABILITY: Record<AiAgentId, AiActivityActionType> = {
  auto_decision: 'routing',
  text_chat: 'generating_reply',
  free_chat: 'generating_reply',
  document_analysis: 'analyze_document',
  voice_input: 'transcribe_voice',
  voice_output: 'generate_voice',
  voice_conversation: 'generate_voice',
  image_generation: 'generate_image',
  image_edit: 'edit_image',
  video_generation: 'generate_video',
  document_generation: 'generate_file',
  web_search: 'web_search',
  deep_reasoning: 'deep_reasoning',
  legal_assistant: 'legal_review',
  record_creation: 'record_mutation',
  process_operation: 'process_operation',
  organization_data: 'read_data',
  organization_knowledge: 'search_knowledge',
  customer_reply_suggestion: 'customer_reply',
  customer_auto_reply: 'customer_reply',
  voip_auto_reply: 'customer_reply',
  workflow_ai_prompt: 'workflow_action',
  embedding: 'indexing',
};

export type AiAgentActivity = {
  agentId: AiAgentId;
  phase: 'started' | 'completed';
  at: number;
  actionType?: AiActivityActionType;
  detail?: string;
};

export function parseAiAgentActivity(value: unknown): AiAgentActivity | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.agentId !== 'string' || !Object.prototype.hasOwnProperty.call(AI_AGENTS, item.agentId)) return null;
  if (item.phase !== 'started' && item.phase !== 'completed') return null;
  if (typeof item.at !== 'number' || !Number.isFinite(item.at)) return null;
  return {
    agentId: item.agentId as AiAgentId,
    phase: item.phase,
    at: item.at,
    ...(typeof item.actionType === 'string' ? { actionType: item.actionType as AiActivityActionType } : {}),
    ...(typeof item.detail === 'string' && item.detail.trim() ? { detail: item.detail.trim() } : {}),
  };
}

/** Keeps an ordered log of observed activities (updating phase in place for VS Code-style 1-line activity log). */
export function applyAiAgentActivity(current: AiAgentActivity[], event: AiAgentActivity): AiAgentActivity[] {
  const existingIndex = current.findIndex(
    (item) => item.agentId === event.agentId && (item.detail || '') === (event.detail || ''),
  );
  if (existingIndex >= 0) {
    const next = [...current];
    next[existingIndex] = { ...next[existingIndex], ...event };
    return next;
  }
  return [...current, event];
}

export type AiAgentActivityReporter = (event: AiAgentActivity) => void;
export async function withAiAgentActivity<T>(
  agentId: AiAgentId,
  work: () => Promise<T>,
  report?: AiAgentActivityReporter,
  options?: { actionType?: AiActivityActionType; detail?: string },
): Promise<T> {
  const actionType = options?.actionType || AI_ACTIVITY_ACTION_BY_CAPABILITY[agentId];
  const detail = options?.detail;
  report?.({ agentId, phase: 'started', at: Date.now(), actionType, detail });
  try { return await work(); }
  finally { report?.({ agentId, phase: 'completed', at: Date.now(), actionType, detail }); }
}
