import { resolveModelSlot, type AiModelCatalogRow } from './ai-gateway.ts';
import { estimateMessagesTokens, estimateTextTokens } from './ai-prompt-compiler.ts';

export type WorkingState = {
  confirmed_entities?: Record<string, { id?: string; system_code?: string; label?: string }>;
  selected_price_list_id?: string | null;
  selected_price_list_label?: string | null;
  selected_process_template_id?: string | null;
  pending_drafts?: Array<{ module_id: string; summary: string; draft_id?: string | null }>;
  open_questions?: string[];
  user_decisions?: string[];
  updated_at?: string;
};

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 64_000;
export const AUTO_COMPACTION_THRESHOLD_RATIO = 0.7;

export const getModelContextWindowTokens = (modelCatalog?: AiModelCatalogRow | null): number => {
  const fromMeta = Number(modelCatalog?.metadata?.context_window ?? modelCatalog?.metadata?.max_context_tokens ?? 0);
  if (Number.isFinite(fromMeta) && fromMeta >= 4096) return fromMeta;
  return DEFAULT_CONTEXT_WINDOW_TOKENS;
};

export const shouldAutoCompactContext = (params: {
  promptMessages: Array<{ role: string; content: any }>;
  rawMessageCount: number;
  modelCatalog?: AiModelCatalogRow | null;
  thresholdRatio?: number;
  minMessagesBeforeAutoCompact?: number;
}): { shouldCompact: boolean; estimatedTokens: number; contextWindow: number; ratio: number } => {
  const estimatedTokens = estimateMessagesTokens(params.promptMessages);
  const contextWindow = getModelContextWindowTokens(params.modelCatalog);
  const ratio = contextWindow > 0 ? estimatedTokens / contextWindow : 0;
  const threshold = Number(params.thresholdRatio ?? AUTO_COMPACTION_THRESHOLD_RATIO);
  const minMessages = Number(params.minMessagesBeforeAutoCompact ?? 14);
  return {
    shouldCompact: params.rawMessageCount >= minMessages && ratio >= threshold,
    estimatedTokens,
    contextWindow,
    ratio: Number(ratio.toFixed(3)),
  };
};

export const mergeWorkingStateFromMessages = (
  existingState: WorkingState | null | undefined,
  messages: Array<{ id?: string; role?: string; content?: string; metadata?: any }>,
): WorkingState => {
  const next: WorkingState = {
    ...(existingState && typeof existingState === 'object' ? existingState : {}),
    confirmed_entities: { ...(existingState?.confirmed_entities || {}) },
    pending_drafts: Array.isArray(existingState?.pending_drafts) ? [...existingState!.pending_drafts!] : [],
    open_questions: Array.isArray(existingState?.open_questions) ? [...existingState!.open_questions!] : [],
    user_decisions: Array.isArray(existingState?.user_decisions) ? [...existingState!.user_decisions!] : [],
  };

  for (const msg of messages || []) {
    const meta = msg?.metadata && typeof msg.metadata === 'object' ? msg.metadata : {};
    if (meta?.selected_price_list_id) {
      next.selected_price_list_id = String(meta.selected_price_list_id);
      if (meta.selected_price_list_label) next.selected_price_list_label = String(meta.selected_price_list_label);
    }
    if (meta?.selected_process_template_id) {
      next.selected_process_template_id = String(meta.selected_process_template_id);
    }
    if (meta?.confirmed_entity && typeof meta.confirmed_entity === 'object') {
      const entityKey = String(meta.confirmed_entity.key || meta.confirmed_entity.module_id || '').trim();
      if (entityKey) {
        next.confirmed_entities![entityKey] = {
          id: meta.confirmed_entity.id ? String(meta.confirmed_entity.id) : undefined,
          system_code: meta.confirmed_entity.system_code ? String(meta.confirmed_entity.system_code) : undefined,
          label: meta.confirmed_entity.label ? String(meta.confirmed_entity.label) : undefined,
        };
      }
    }
    if (Array.isArray(meta?.clarification_questions) && meta.role !== 'user') {
      next.open_questions = meta.clarification_questions.map((q: any) => String(q || '').trim()).filter(Boolean).slice(0, 5);
    } else if (msg.role === 'user' && String(msg.content || '').trim()) {
      const text = String(msg.content).trim();
      if (/تایید|موافقم|انجام بده|ثبت کن|باشه|قبول/i.test(text)) {
        next.user_decisions!.push(text.slice(0, 160));
        next.user_decisions = next.user_decisions!.slice(-8);
        next.open_questions = [];
      }
    }
  }

  next.updated_at = new Date().toISOString();
  return next;
};

export const compactThreadConversation = async (params: {
  threadId: string;
  orgId: string;
  existingSummary?: string | null;
  existingWorkingState?: WorkingState | null;
  messages: Array<{ id?: string; role: string; content: string; metadata?: any }>;
  keepRecentCount?: number;
  catalogRows: AiModelCatalogRow[];
  orgAiSettings?: Record<string, any> | null;
  requestedModelOverride?: string | null;
  runCompressionLlm: (resolvedModel: {
    model: string;
    provider: string;
    catalogRow: AiModelCatalogRow | null;
  }, promptMessages: Array<{ role: string; content: string }>) => Promise<{
    content: string;
    usageMetadata?: any;
    requestId?: string | null;
  }>;
}): Promise<{
  compacted: boolean;
  summary: string;
  workingState: WorkingState;
  cursorMessageId: string | null;
  modelUsed: string | null;
  providerUsed: string | null;
  usageMetadata: any;
  requestId: string | null;
}> => {
  const keepRecent = Math.max(4, Math.min(12, Number(params.keepRecentCount ?? 6)));
  const chatTurns = (params.messages || []).filter((item) => ['user', 'assistant'].includes(String(item?.role || '')));
  if (chatTurns.length <= keepRecent) {
    return {
      compacted: false,
      summary: String(params.existingSummary || ''),
      workingState: mergeWorkingStateFromMessages(params.existingWorkingState, chatTurns),
      cursorMessageId: null,
      modelUsed: null,
      providerUsed: null,
      usageMetadata: null,
      requestId: null,
    };
  }

  const turnsToCompact = chatTurns.slice(0, chatTurns.length - keepRecent);
  const cursorMessageId = turnsToCompact[turnsToCompact.length - 1]?.id
    ? String(turnsToCompact[turnsToCompact.length - 1].id)
    : null;
  const workingState = mergeWorkingStateFromMessages(params.existingWorkingState, chatTurns);

  // Dynamically resolve selectable compression model (zero hardcoded fallback!)
  const resolved = resolveModelSlot({
    slot: 'context_compression',
    catalogRows: params.catalogRows,
    orgAiSettings: params.orgAiSettings,
    requestedOverride: params.requestedModelOverride,
  });

  const transcript = turnsToCompact
    .map((turn) => `${turn.role === 'user' ? 'کاربر' : 'دستیار'}: ${String(turn.content || '').slice(0, 1800)}`)
    .join('\n\n');

  const previousSummaryBlock = String(params.existingSummary || '').trim()
    ? `خلاصه قبلی تا پیش از این پیام‌ها:\n${String(params.existingSummary).trim()}\n\n`
    : '';

  const promptMessages = [
    {
      role: 'system',
      content: [
        'خلاصه‌ساز دقیق و فشرده حافظه مکالمه در سیستم یکپارچه سازمانی هستی.',
        'پیام‌های قدیمی‌تر زیر را در یک خلاصه فارسی ساختاریافته، کوتاه و بدون تکرار ادغام کن.',
        'موارد الزامی برای حفظ: تصمیم‌های قطعی کاربر، کد سیستمی و نام رکوردها (مشتری، کالا، فاکتور، پروژه، فرآیند)، اولویت قیمت/لیست قیمت، محدودیت‌ها، مبالغ، تاریخ‌ها و کارهای باز.',
        'تعارف، سلام و احوال‌پرسی و جزئیات کم‌ارزش را حذف کن و هیچ UUID خامی در متن نیاور.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `${previousSummaryBlock}پیام‌های جدید برای ادغام در خلاصه:\n${transcript}`,
    },
  ];

  const llmResult = await params.runCompressionLlm(resolved, promptMessages);
  const summary = String(llmResult?.content || '').trim();

  return {
    compacted: Boolean(summary),
    summary: summary || String(params.existingSummary || ''),
    workingState,
    cursorMessageId,
    modelUsed: resolved.model,
    providerUsed: resolved.provider,
    usageMetadata: llmResult?.usageMetadata || null,
    requestId: llmResult?.requestId || null,
  };
};

export { estimateMessagesTokens, estimateTextTokens };
