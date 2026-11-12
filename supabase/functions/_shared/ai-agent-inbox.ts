import {
  AI_AGENT_KEYS,
  getAgentTitleFa,
  type AgentKey,
} from './ai-agent-catalog.ts';

const VALID_AGENT_KEY_SET = new Set<string>(AI_AGENT_KEYS);
const DEDICATED_AGENT_INBOX_CHANNELS = new Set<string>([
  'agent_inbox',
  'staff_bot',
  'background_agent',
]);

export type AgentInboxThreadEntry = {
  agentKey: AgentKey;
  titleFa: string;
  conversationKey: string;
  lastMessageAt: string;
  lastPreview: string;
  unreadCount: number;
  messages: any[];
};

const normalizeTimestampMs = (value: unknown): number => {
  const ts = new Date(String(value || '')).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const normalizeAgentKeyCandidate = (value: unknown): AgentKey | null => {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_AGENT_KEY_SET.has(normalized) ? (normalized as AgentKey) : null;
};

export const isHiddenAgentInboxThread = (thread: any): boolean => {
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  const contextKey = String(thread?.context_key || metadata?.context_key || '').trim();
  const lastActivityKind = String(metadata?.last_activity_kind || '').trim();
  const replyChannel = String(metadata?.reply_channel || '').trim();
  const source = String(metadata?.source || metadata?.context?.source || '').trim();
  const capability = String(metadata?.capability || '').trim();
  const title = String(thread?.title || metadata?.title || '').trim();

  return contextKey.startsWith('reply:sms:')
    || contextKey.startsWith('reply:bot:')
    || contextKey.startsWith('reply:')
    || lastActivityKind === 'reply_suggestion'
    || replyChannel === 'sms'
    || replyChannel === 'bot'
    || source === 'reply_suggestion'
    || source === 'notifications_chat_reply_suggest'
    || capability === 'customer_reply_suggestion'
    || metadata?.customer_reply_suggestion === true
    || title === 'پیشنهاد پاسخ بات';
};

export const isFailedOrIncompleteAiMetadata = (metadata: any): boolean => {
  if (!metadata || typeof metadata !== 'object') return false;
  const status = String(metadata?.status || '').trim().toLowerCase();
  return metadata?.failed === true
    || status === 'failed'
    || metadata?.pending_status === true
    || metadata?.stopped === true
    || metadata?.incomplete === true;
};

export const isUsableAgentInboxEntry = (entry: any): boolean => {
  const content = String(entry?.content || '').trim();
  if (!content) return false;
  const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
  if (isFailedOrIncompleteAiMetadata(metadata)) return false;
  if (metadata?.internal_agent_step === true || metadata?.internal_agent_input === true) return false;
  return true;
};

export const resolveEligibleAgentInboxThread = (
  thread: any,
): { eligible: boolean; agentKey: AgentKey | null; channel: string } => {
  if (!thread || typeof thread !== 'object') {
    return { eligible: false, agentKey: null, channel: 'web' };
  }
  if (isHiddenAgentInboxThread(thread)) {
    return { eligible: false, agentKey: null, channel: String(thread?.channel || 'web').trim().toLowerCase() || 'web' };
  }

  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  const channel = String(thread?.channel || metadata?.channel || 'web').trim().toLowerCase() || 'web';
  const explicitSelected = metadata?.explicit_agent_selected;

  const selectedList = Array.isArray(thread?.selected_agents)
    ? thread.selected_agents
    : (Array.isArray(metadata?.selected_agents) ? metadata.selected_agents : []);

  const candidateAgentKey =
    normalizeAgentKeyCandidate(thread?.agent_key)
    || normalizeAgentKeyCandidate(metadata?.agent_key)
    || normalizeAgentKeyCandidate(selectedList[0]);

  if (DEDICATED_AGENT_INBOX_CHANNELS.has(channel)) {
    return {
      eligible: true,
      agentKey: candidateAgentKey || 'lead_orchestrator',
      channel,
    };
  }

  if (!candidateAgentKey || explicitSelected !== true) {
    return { eligible: false, agentKey: null, channel };
  }

  return { eligible: true, agentKey: candidateAgentKey, channel };
};

export const filterCohesiveThreadMessages = (
  rawMessages: any[],
  thread: any,
  resolvedAgentKey: AgentKey,
  channel: string,
): any[] => {
  const chronological = [...(rawMessages || [])]
    .filter((msg) => ['user', 'assistant'].includes(String(msg?.role || '').trim()))
    .sort((a, b) => normalizeTimestampMs(a?.created_at) - normalizeTimestampMs(b?.created_at));

  const kept: any[] = [];
  for (const msg of chronological) {
    const role = String(msg?.role || '').trim();
    const content = String(msg?.content || '').trim();
    const metadata = msg?.metadata && typeof msg.metadata === 'object' ? msg.metadata : {};
    if (!content) continue;
    if (metadata?.internal_agent_step === true || metadata?.internal_agent_input === true) continue;
    if (metadata?.pending_status === true) continue;

    if (role === 'assistant' && isFailedOrIncompleteAiMetadata(metadata)) {
      if (kept.length > 0 && String(kept[kept.length - 1]?.role || '') === 'user') {
        kept.pop();
      }
      continue;
    }

    kept.push(msg);
  }

  const lastActivityKind = String(thread?.metadata?.last_activity_kind || '').trim().toLowerCase();
  const threadEndedFailed = lastActivityKind.endsWith('_failed');
  if (threadEndedFailed || !DEDICATED_AGENT_INBOX_CHANNELS.has(channel)) {
    while (kept.length > 0 && String(kept[kept.length - 1]?.role || '') === 'user') {
      kept.pop();
    }
  }

  const hasAssistantReply = kept.some((msg) => String(msg?.role || '').trim() === 'assistant');
  if (!hasAssistantReply) {
    return [];
  }

  return kept
    .map((msg) => {
      const isUser = String(msg?.role || '').trim() === 'user';
      return {
        id: `ai-msg-${msg.id}`,
        module_id: thread?.module_id || null,
        record_id: thread?.record_id || null,
        content: String(msg.content || '').trim(),
        author_id: isUser ? thread?.user_id || null : null,
        author_name: isUser ? 'شما' : getAgentTitleFa(resolvedAgentKey),
        source_type: isUser ? 'user' : 'ai',
        created_at: msg.created_at,
        metadata: {
          agent_key: resolvedAgentKey,
          conversation_key: `agent:${resolvedAgentKey}`,
          source_table: 'ai_messages',
          thread_id: msg.thread_id,
          thread_title: thread?.title || null,
          channel,
        },
      };
    })
    .sort((a, b) => normalizeTimestampMs(b?.created_at) - normalizeTimestampMs(a?.created_at));
};

const deduplicateAgentInboxMessages = (notesDesc: any[], threadMessagesDesc: any[]): any[] => {
  const combined = [...notesDesc];
  for (const entry of threadMessagesDesc) {
    const entrySource = String(entry?.source_type || '');
    const entryContent = String(entry?.content || '').trim();
    const entryTime = normalizeTimestampMs(entry?.created_at);
    const isDuplicateOfNote = notesDesc.some((note) => {
      const sameSource = String(note?.source_type || '') === entrySource;
      const sameContent = String(note?.content || '').trim() === entryContent;
      if (!sameSource || !sameContent) return false;
      const deltaMs = Math.abs(normalizeTimestampMs(note?.created_at) - entryTime);
      return deltaMs <= 180_000;
    });
    if (!isDuplicateOfNote) {
      combined.push(entry);
    }
  }
  return combined.sort((a, b) => normalizeTimestampMs(b?.created_at) - normalizeTimestampMs(a?.created_at));
};

export const buildAgentInboxPayload = (params: {
  visibleAgentNotes: any[];
  eligibleThreads: Array<{ thread: any; agentKey: AgentKey; channel: string }>;
  threadMessages: any[];
  limit?: number;
}): { threads: AgentInboxThreadEntry[]; messages: any[] } => {
  const limit = Math.min(100, Math.max(10, Number(params.limit || 60)));

  const notesByAgent = new Map<AgentKey, any[]>();
  for (const note of params.visibleAgentNotes || []) {
    if (!isUsableAgentInboxEntry(note)) continue;
    const convKey = String(note?.metadata?.conversation_key || '').trim();
    const agentKey =
      normalizeAgentKeyCandidate(note?.metadata?.agent_key)
      || normalizeAgentKeyCandidate(convKey.replace(/^agent:/, ''))
      || 'lead_orchestrator';
    const current = notesByAgent.get(agentKey) || [];
    current.push(note);
    notesByAgent.set(agentKey, current);
  }
  for (const [agentKey, list] of notesByAgent.entries()) {
    list.sort((a, b) => normalizeTimestampMs(b?.created_at) - normalizeTimestampMs(a?.created_at));
    notesByAgent.set(agentKey, list);
  }

  const rawMessagesByThreadId = new Map<string, any[]>();
  for (const msg of params.threadMessages || []) {
    const tid = String(msg?.thread_id || '').trim();
    if (!tid) continue;
    const current = rawMessagesByThreadId.get(tid) || [];
    current.push(msg);
    rawMessagesByThreadId.set(tid, current);
  }

  const latestThreadByAgent = new Map<
    AgentKey,
    { threadId: string; channel: string; lastAtMs: number; messages: any[] }
  >();
  for (const item of params.eligibleThreads || []) {
    const tid = String(item?.thread?.id || '').trim();
    if (!tid) continue;
    const rawMsgs = rawMessagesByThreadId.get(tid) || [];
    const cohesive = filterCohesiveThreadMessages(rawMsgs, item.thread, item.agentKey, item.channel);
    if (cohesive.length === 0) continue;
    const lastAtMs = normalizeTimestampMs(cohesive[0]?.created_at);
    const existing = latestThreadByAgent.get(item.agentKey);
    if (!existing || lastAtMs > existing.lastAtMs) {
      latestThreadByAgent.set(item.agentKey, {
        threadId: tid,
        channel: item.channel,
        lastAtMs,
        messages: cohesive,
      });
    }
  }

  const allAgentKeys = new Set<AgentKey>([
    ...notesByAgent.keys(),
    ...latestThreadByAgent.keys(),
  ]);

  const threads: AgentInboxThreadEntry[] = [];
  const allMessages: any[] = [];

  for (const agentKey of allAgentKeys) {
    const agentNotes = notesByAgent.get(agentKey) || [];
    const latestThread = latestThreadByAgent.get(agentKey) || null;

    let selectedMessages: any[] = [];
    if (agentNotes.length > 0 && latestThread) {
      if (latestThread.channel === 'agent_inbox') {
        selectedMessages = deduplicateAgentInboxMessages(agentNotes, latestThread.messages);
      } else {
        const latestNoteMs = normalizeTimestampMs(agentNotes[0]?.created_at);
        selectedMessages = latestNoteMs >= latestThread.lastAtMs ? agentNotes : latestThread.messages;
      }
    } else if (agentNotes.length > 0) {
      selectedMessages = agentNotes;
    } else if (latestThread) {
      selectedMessages = latestThread.messages;
    }

    if (selectedMessages.length === 0) continue;

    const clipped = selectedMessages.slice(0, 30);
    const newest = clipped[0];
    threads.push({
      agentKey,
      titleFa: getAgentTitleFa(agentKey),
      conversationKey: `agent:${agentKey}`,
      lastMessageAt: String(newest?.created_at || ''),
      lastPreview: String(newest?.content || '').slice(0, 140),
      unreadCount: 0,
      messages: clipped,
    });
    allMessages.push(...clipped);
  }

  threads.sort((a, b) => normalizeTimestampMs(b.lastMessageAt) - normalizeTimestampMs(a.lastMessageAt));
  allMessages.sort((a, b) => normalizeTimestampMs(b?.created_at) - normalizeTimestampMs(a?.created_at));

  return {
    threads,
    messages: allMessages.slice(0, limit),
  };
};
