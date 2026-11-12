import {
  getAgentDefinition,
  getAgentToneGuidanceFa,
  normalizeSelectedAgents,
  type AgentKey,
  type AgentToneStyle,
} from './ai-agent-catalog.ts';
import type { CentralAiGrounding } from './ai-grounding.ts';

export type CompiledPromptResult = {
  staticSystemPrefix: string;
  cachedPrefixHash: string;
  compactionBlock: string;
  volatileUserBlock: string;
  messages: Array<{ role: string; content: any }>;
  estimatedTokens: number;
};

export const estimateTextTokens = (value: unknown): number => {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  // Conservative estimate for mixed Persian UTF-8 + JSON tokens
  return Math.max(1, Math.ceil(text.length / 3.2));
};

export const estimateMessagesTokens = (messages: Array<{ role: string; content: any }>): number =>
  (messages || []).reduce((sum, msg) => sum + estimateTextTokens(msg?.content) + 6, 0);

const computeSha256Hex = async (input: string): Promise<string> => {
  try {
    if (globalThis.crypto?.subtle) {
      const bytes = new TextEncoder().encode(input);
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // fallback if WebCrypto unavailable
  }
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv_${(hash >>> 0).toString(16)}`;
};

export const buildMultiAgentPromptSection = (params: {
  selectedAgents: AgentKey[];
  grounding: CentralAiGrounding;
}): string => {
  const sortedAgents = [...normalizeSelectedAgents(params.selectedAgents)].sort();
  if (!sortedAgents.length) return '';

  const agentBlocks = sortedAgents.map((agentKey) => {
    const def = getAgentDefinition(agentKey);
    const state = params.grounding.agentStates?.[agentKey];
    const policy = state?.config?.policy_json && typeof state.config.policy_json === 'object'
      ? state.config.policy_json
      : {};
    const customNotes = String(policy?.custom_tone_notes || policy?.notes || '').trim();
    const compactPolicy = Object.keys(policy).length > 0 ? JSON.stringify(policy) : 'تنظیم اختصاصی اضافه ثبت نشده';
    return [
      `### ${def?.titleFa || agentKey} (${agentKey})`,
      `- مأموریت: ${def?.roleFocusFa || ''}`,
      `- وضعیت دسترسی کاربر: ${state?.canUse ? 'مجاز و فعال' : 'محدودشده بر اساس دسترسی یا پلن'}`,
      `- سیاست سازمانی ثبت‌شده: ${compactPolicy}`,
      `- راهنمای لحن: ${getAgentToneGuidanceFa(state?.toneStyle, customNotes)}`,
    ].join('\n');
  });

  const orchestrationNote = sortedAgents.length > 1
    ? [
        '## هماهنگی چندایجنتی هم‌زمان',
        'کاربر هم‌زمان چند ایجنت را فعال کرده است. ایجنت راهبر وظیفه دارد پاسخ یا برنامه اقدام هر ایجنت را یکپارچه کند و بین مراحل فروش، خرید، پروژه، فرآیند، منابع انسانی یا رزرواسیون تداخل ایجاد نشود.',
      ].join('\n')
    : '';

  return [orchestrationNote, ...agentBlocks].filter(Boolean).join('\n\n');
};

export const compileLayeredAgentPrompt = async (params: {
  userMessage: string;
  selectedAgents: AgentKey[];
  selectedCapabilities: string[];
  skillContractsPrompt?: string;
  grounding: CentralAiGrounding;
  pageContextSummary?: string;
  contextPayload: Record<string, any>;
  historyMessages: Array<{ role: string; content: string; metadata?: any }>;
  compactionSummary?: string | null;
  workingState?: Record<string, any> | null;
  preferredToneStyle?: AgentToneStyle | null;
  legacySystemPrompt?: string | null;
  maxHistoryMessages?: number;
}): Promise<CompiledPromptResult> => {
  const sortedCapabilities = Array.from(new Set((params.selectedCapabilities || []).map((c) => String(c || '').trim()).filter(Boolean))).sort();
  const sortedAgents = [...normalizeSelectedAgents(params.selectedAgents)].sort();

  // BLOCK 1: Byte-Stable Cacheable Prefix (ZERO timestamps or volatile per-turn IDs!)
  const staticGroundPayload = params.grounding.freeChatMode
    ? {
        mode: 'free_chat',
        rule: 'در حالت گفتگوی آزاد، از داده‌های محرمانه و داخلی سازمان استفاده نمی‌شود؛ فقط پاسخ عمومی دقیق، محترمانه و فارسی بده.',
      }
    : {
        company: params.grounding.company
          ? {
              name: params.grounding.company.company_name || params.grounding.company.company_title || null,
              currency_label: params.grounding.company.currency_label || null,
              currency_code: params.grounding.company.currency_code || null,
              working_hours: params.grounding.company.working_hours || null,
              reservation_settings: params.grounding.reservationSettings || null,
            }
          : null,
        work_schedules: (params.grounding.workSchedules || []).map((s) => ({
          name: s.name || s.title || null,
          working_days: s.working_days || s.days || null,
          start_time: s.start_time || null,
          end_time: s.end_time || null,
          is_active: s.is_active !== false,
        })),
        instructions: params.grounding.instructions,
        job_descriptions: params.grounding.jobDescriptions,
        roles: params.grounding.orgDirectory.roles,
        members_directory: params.grounding.orgDirectory.members.map((m) => ({
          full_name: m.full_name,
          role_id: m.role_id,
          job_title: m.job_title,
        })),
      };

  const agentPromptSection = buildMultiAgentPromptSection({
    selectedAgents: sortedAgents,
    grounding: params.grounding,
  });

  const staticSections = [
    'شما هسته عامل هوشمند یکپارچه (AaaS) در پلتفرم سازمانی هستید و همیشه مطابق قوانین سازمان، حدود دسترسی کاربر و داده‌های واقعی عمل می‌کنید.',
    'قوانین قطعی:\n1. هیچ شناسه خام UUID را در متن پاسخ به کاربر نشان نده؛ از کد سیستمی، نام یا عنوان فارسی استفاده کن.\n2. هرگز داده، عدد، تاریخ یا رکوردی را حدس نزن؛ اگر ابهام یا بیش از یک گزینه معتبر وجود دارد، حداکثر ۲ تا ۳ سؤال شفاف و اجرایی بپرس.\n3. برای تغییرات حساس یا ساخت/اصلاح رکورد و اجرای فرآیند، بدون تأیید کاربر عملیات نهایی را قطعی فرض نکن.\n4. تمام متن‌های خروجی، توضیحات و گزارش‌ها فارسی، دقیق و خوانا باشند.',
    sortedCapabilities.length ? `مهارت‌های انتخاب‌شده در این درخواست: ${sortedCapabilities.join('، ')}` : '',
    agentPromptSection,
    params.skillContractsPrompt || '',
    params.legacySystemPrompt || '',
    `دانش و چارچوب پایدار سازمان (Cacheable Grounding):\n${JSON.stringify(staticGroundPayload)}`,
  ].filter(Boolean);

  const staticSystemPrefix = staticSections.join('\n\n');
  const cachedPrefixHash = await computeSha256Hex(staticSystemPrefix);

  // BLOCK 2: Compacted History + Lossless Working State
  const workingStateJson = params.workingState && Object.keys(params.workingState).length > 0
    ? JSON.stringify(params.workingState)
    : '';
  const summaryText = String(params.compactionSummary || '').trim();
  const compactionParts = [
    summaryText ? `خلاصه فشرده زمینه گفتگو تا اینجا:\n${summaryText}` : '',
    workingStateJson ? `وضعیت فعال و شناسه‌های تأییدشده گفتگو (Working State):\n${workingStateJson}` : '',
  ].filter(Boolean);
  const compactionBlock = compactionParts.join('\n\n');

  // BLOCK 3: Volatile Suffix (Live Tehran Calendar, Tone Instruction, Page/Retrieved Context, User Turn)
  const effectiveTone = params.preferredToneStyle
    || (sortedAgents[0] ? params.grounding.agentStates?.[sortedAgents[0]]?.toneStyle : null)
    || 'friendly_warm';
  const toneGuidance = getAgentToneGuidanceFa(effectiveTone);

  const volatileHeader = [
    params.grounding.calendarContext
      ? `زمان و تقویم جلالی جاری: ${JSON.stringify({
          tehran_now_jalali: params.grounding.calendarContext.tehran_now_jalali,
          today: params.grounding.calendarContext.today,
          explicit_user_dates: params.grounding.calendarContext.explicit_user_dates,
          upcoming_dates: params.grounding.calendarContext.upcoming_dates?.slice(0, 14),
        })}`
      : '',
    `لحن پاسخ در این نوبت: ${toneGuidance}`,
    params.pageContextSummary ? `خلاصه صفحه جاری: ${params.pageContextSummary}` : '',
  ].filter(Boolean).join('\n');

  const volatileUserBlock = [
    volatileHeader,
    `زمینه پویا و پرسش کاربر:\n${JSON.stringify({ ...params.contextPayload, user_message: params.userMessage })}`,
  ].filter(Boolean).join('\n\n');

  const maxHistory = Math.max(4, Math.min(24, Number(params.maxHistoryMessages || 12)));
  const cleanedHistory = (params.historyMessages || [])
    .filter((item) => ['user', 'assistant'].includes(String(item?.role || '')))
    .slice(-maxHistory)
    .map((item) => ({
      role: String(item.role),
      content: String(item.content || '').slice(0, 3000),
    }));

  const messages: Array<{ role: string; content: any }> = [
    { role: 'system', content: staticSystemPrefix },
    ...(compactionBlock ? [{ role: 'assistant', content: compactionBlock }] : []),
    ...cleanedHistory,
    { role: 'user', content: volatileUserBlock },
  ];

  return {
    staticSystemPrefix,
    cachedPrefixHash,
    compactionBlock,
    volatileUserBlock,
    messages,
    estimatedTokens: estimateMessagesTokens(messages),
  };
};

export const applyExplicitCacheControlIfSupported = (
  messages: Array<{ role: string; content: any }>,
  supportsExplicitCacheControl: boolean,
): Array<{ role: string; content: any }> => {
  if (!supportsExplicitCacheControl || !Array.isArray(messages) || messages.length === 0) {
    return messages;
  }
  return messages.map((msg, index) => {
    if (index === 0 && msg.role === 'system' && typeof msg.content === 'string') {
      return {
        role: 'system',
        content: [
          {
            type: 'text',
            text: msg.content,
            cache_control: { type: 'ephemeral' },
          },
        ],
      };
    }
    return msg;
  });
};
