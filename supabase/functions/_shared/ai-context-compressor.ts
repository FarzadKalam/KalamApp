import { resolveModelSlot, type AiModelCatalogRow } from './ai-gateway.ts';
import { estimateMessagesTokens, estimateTextTokens } from './ai-prompt-compiler.ts';
import { summarizeContextMessages } from './ai-context-lifecycle.ts';
import { getModelContextWindowTokens, AUTO_COMPACTION_THRESHOLD_RATIO } from './ai-context-policy.ts';
import { normalizeIntakeAttachments } from './ai-intake-attachments.ts';
export { getModelContextWindowTokens, DEFAULT_CONTEXT_WINDOW_TOKENS, AUTO_COMPACTION_THRESHOLD_RATIO } from './ai-context-policy.ts';

export type WorkingState = {
  confirmed_entities?: Record<string, { id?: string; system_code?: string; label?: string }>;
  selected_price_list_id?: string | null;
  selected_price_list_label?: string | null;
  selected_process_template_id?: string | null;
  pending_drafts?: Array<{ module_id: string; summary: string; draft_id?: string | null }>;
  open_questions?: string[];
  user_decisions?: string[];
  attachment_refs?: Array<{ message_id?: string; asset_id?: string; entry_id?: string; name?: string;url?: string }>;
  pending_action_refs?: Array<{ action_id: string; status: string }>;
  completed_record_refs?: Array<{ module_id: string; id: string; title?: string }>;
  active_intake_attachments?: ReturnType<typeof normalizeIntakeAttachments>;
  updated_at?: string;
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
  const minMessages = Number(params.minMessagesBeforeAutoCompact ?? 40);
  return {
    shouldCompact: ratio >= threshold || params.rawMessageCount >= minMessages,
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
    const files = normalizeIntakeAttachments([...(meta.attachments || []),...(meta.files || []),meta.file].filter(Boolean));
    if (files.length && msg.role === 'user') {
      next.active_intake_attachments = normalizeIntakeAttachments([...(next.active_intake_attachments || []),...files]);
      const refs = new Map((next.attachment_refs || []).map(ref => [ref.asset_id || ref.entry_id || `${ref.message_id}:${ref.url || ref.name}`,ref]));
      files.forEach(file => refs.set(file.assetId || file.entryId || `${msg.id}:${file.url || file.name}`,{ message_id: msg.id,asset_id: file.assetId || undefined,entry_id: file.entryId || undefined,name: file.name,url: file.url || undefined }));
      next.attachment_refs = [...refs.values()];
    }
    if (meta.action_log_id && (meta.requires_confirmation || meta.source?.startsWith('confirm_'))) {
      const refs = new Map((next.pending_action_refs || []).map(ref => [ref.action_id,ref]));
      refs.set(meta.action_log_id,{ action_id: meta.action_log_id,status: meta.source?.startsWith('confirm_') ? 'processed' : 'pending' });
      next.pending_action_refs = [...refs.values()];
    }
    if (meta.created_records?.length || meta.updated_records?.length) {
      const refs = new Map((next.completed_record_refs || []).map(ref => [`${ref.module_id}:${ref.id}`,ref]));
      [...(meta.created_records || []),...(meta.updated_records || [])].forEach(ref => { if (ref.module_id && ref.id) refs.set(`${ref.module_id}:${ref.id}`,{ module_id: ref.module_id,id: ref.id,title: ref.title }); });
      next.completed_record_refs = [...refs.values()];
      next.active_intake_attachments = [];
    }
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
    if (Array.isArray(meta?.clarification_questions) && msg.role !== 'user') {
      next.open_questions = meta.clarification_questions.map((q: any) => String(q?.question || q?.title || q || '').trim()).filter(Boolean).slice(0, 5);
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
  compressionModel?: { model: string; provider: string; catalogRow: AiModelCatalogRow | null };
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
  const resolved = params.compressionModel || resolveModelSlot({
    slot: 'context_compression',
    catalogRows: params.catalogRows,
    orgAiSettings: params.orgAiSettings,
    requestedOverride: params.requestedModelOverride,
  });

  const results: any[] = [];
  const summary = await summarizeContextMessages(turnsToCompact, async promptMessages => {
    const result = await params.runCompressionLlm(resolved, promptMessages as Array<{ role: string; content: string }>);
    results.push(result);
    return result.content;
  }, String(params.existingSummary || ''), Math.max(1000,Math.min(24000,Math.floor(getModelContextWindowTokens(resolved.catalogRow)*0.8))));
  const merge = (values: any[]): any => {
    if (!values.length) return null;
    const first = values.find(value => value != null);
    if (first == null) return null;
    if (typeof first === 'number') return values.reduce((sum,value) => sum + (Number(value) || 0),0);
    if (first && typeof first === 'object' && !Array.isArray(first)) return Object.fromEntries([...new Set(values.flatMap(value => Object.keys(value || {})))].map(key => [key,merge(values.map(value => value?.[key]))]));
    return first;
  };
  const llmResult = { usageMetadata: merge(results.map(result => result.usageMetadata)),requestId: results.at(-1)?.requestId || null };

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
