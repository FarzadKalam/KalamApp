import { buildRecordReferenceKey } from './recordReference';

export type NotificationReadChecker = (
  section: 'notes' | 'tasks' | 'responsibilities' | 'bot_messages' | 'sms_messages' | 'voip_calls',
  sourceType: string,
  sourceId: string,
  fallbackRead?: boolean,
) => boolean;

export type SmsThreadViewModel = {
  id: string;
  phone: string;
  phoneNumberId: string | null;
  phoneMatchStatus: string | null;
  title: string;
  preview: string;
  unreadCount: number;
  latestMessageAt: number;
  messages: any[];
  moduleId: string | null;
  recordId: string | null;
};

export type VoipThreadViewModel = {
  id: string;
  phone: string;
  phoneNumberId: string | null;
  phoneMatchStatus: string | null;
  title: string;
  unreadCount: number;
  latestEventAt: number;
  calls: any[];
  moduleId: string | null;
  recordId: string | null;
};

export type DirectUserLike = {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  role_id?: string | null;
};

export type ChatGroupLike = {
  id: string;
  name: string;
};

export type ConversationListViewModel = {
  id: string;
  kind: 'direct' | 'group';
  displayName: string;
  avatarUrl?: string | null;
  noteCount: number;
  unreadCount: number;
  latestMessageAt: number;
  roleLabel?: string | null;
  userId?: string | null;
  groupId?: string | null;
  isGroup?: boolean;
};

const getTime = (value: any) => {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const normalizePhoneThreadValue = (value: any) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  if (digits.startsWith('0098')) {
    digits = digits.slice(4);
  } else if (digits.startsWith('98') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  if (digits.length > 10 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits || raw;
};

export const resolveSmsCounterpartyPhone = (row: any) => {
  const direction = String(row?.direction || '').trim().toLowerCase();
  if (direction === 'inbound') {
    return String(row?.sender || row?.phone_number || '').trim();
  }
  return String(row?.recipient || row?.phone_number || '').trim();
};

export const getSmsThreadKey = (row: any) => {
  const phoneNumberId = String(row?.phone_number_id || '').trim();
  if (phoneNumberId) return `sms_phone:${phoneNumberId}`;
  const phone = resolveSmsCounterpartyPhone(row);
  const normalizedPhone = normalizePhoneThreadValue(phone);
  if (normalizedPhone) return `sms:${normalizedPhone}`;
  const fallbackId = String(row?.id || '').trim();
  return fallbackId ? `sms:${fallbackId}` : 'sms:unknown';
};

export const resolveVoipCounterpartyPhone = (row: any) => {
  const direction = String(row?.direction || '').trim().toLowerCase();
  if (direction === 'incoming') {
    return String(row?.source_number || row?.title || '').trim();
  }
  return String(row?.destination_number || row?.title || '').trim();
};

export const getVoipThreadKey = (row: any) => {
  const phoneNumberId = String(row?.phone_number_id || '').trim();
  if (phoneNumberId) return `voip_phone:${phoneNumberId}`;
  const phone = resolveVoipCounterpartyPhone(row);
  const normalizedPhone = normalizePhoneThreadValue(phone);
  if (normalizedPhone) return `voip:${normalizedPhone}`;
  const fallbackId = String(row?.id || '').trim();
  return fallbackId ? `voip:${fallbackId}` : 'voip:unknown';
};

const getNoteMentionUserIds = (note: any) =>
  Array.isArray(note?.mention_user_ids)
    ? note.mention_user_ids.map((id: string) => String(id))
    : [];

const isAutomatedPersonalNote = (note: any) => {
  if (String(note?.metadata?.chat_group_id || '').trim()) return false;
  const sourceType = String(note?.source_type || note?.metadata?.source_type || '').trim();
  return (
    sourceType === 'system'
    || sourceType === 'ai'
    || Boolean(note?.metadata?.workflow_id || note?.metadata?.automation_rule_id || note?.metadata?.process_automation_rule_id)
  );
};

export const buildSmsThreads = ({
  messages,
  recordTitleMap = {},
  seenSmsMessageIds = new Set<string>(),
  isNotificationRead,
}: {
  messages: any[];
  recordTitleMap?: Record<string, string>;
  seenSmsMessageIds?: Set<string>;
  isNotificationRead: NotificationReadChecker;
}): SmsThreadViewModel[] => {
  const groups = new Map<string, SmsThreadViewModel>();
  (messages || []).forEach((row: any) => {
    const threadId = getSmsThreadKey(row);
    const messageAt = getTime(row?.message_at || row?.created_at);
    const phone = resolveSmsCounterpartyPhone(row);
    const phoneNumberId = String(row?.phone_number_id || '').trim();
    const phoneMatchStatus = String(row?.phone_match_status || '').trim();
    const moduleId = String(row?.module_id || '').trim();
    const recordId = String(row?.record_id || '').trim();
    const title = (
      moduleId && recordId
        ? recordTitleMap[buildRecordReferenceKey(moduleId, recordId)]
        : ''
    ) || String(row?.title || '').trim() || phone || 'شماره ناشناس';
    const preview = String(row?.message_text || '').trim() || (String(row?.direction || '').trim() === 'inbound' ? 'پیامک ورودی' : 'پیامک');
    const sourceId = String(row?.id || '').trim();
    const unreadCount = (
      String(row?.direction || '').trim() === 'inbound'
      && !isNotificationRead('sms_messages', 'inbound_sms', sourceId, seenSmsMessageIds.has(sourceId))
    ) ? 1 : 0;
    const current = groups.get(threadId);
    if (!current) {
      groups.set(threadId, {
        id: threadId,
        phone,
        phoneNumberId: phoneNumberId || null,
        phoneMatchStatus: phoneMatchStatus || null,
        title,
        preview,
        unreadCount,
        latestMessageAt: messageAt,
        messages: [row],
        moduleId: moduleId || null,
        recordId: recordId || null,
      });
      return;
    }
    current.messages.push(row);
    current.unreadCount += unreadCount;
    if (messageAt >= current.latestMessageAt) {
      current.latestMessageAt = messageAt;
      current.preview = preview;
      current.title = title;
      current.phone = phone;
      current.phoneNumberId = phoneNumberId || current.phoneNumberId;
      current.phoneMatchStatus = phoneMatchStatus || current.phoneMatchStatus;
      current.moduleId = moduleId || current.moduleId;
      current.recordId = recordId || current.recordId;
    }
  });

  return Array.from(groups.values())
    .map((thread) => ({
      ...thread,
      messages: [...thread.messages].sort((a: any, b: any) => getTime(a?.message_at || a?.created_at) - getTime(b?.message_at || b?.created_at)),
    }))
    .sort((a, b) => {
      if (b.latestMessageAt !== a.latestMessageAt) return b.latestMessageAt - a.latestMessageAt;
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
      return String(a.title || '').localeCompare(String(b.title || ''), 'fa');
    });
};

export const buildVoipThreads = ({
  calls,
  recordTitleMap = {},
  seenVoipCallIds = new Set<string>(),
  isNotificationRead,
}: {
  calls: any[];
  recordTitleMap?: Record<string, string>;
  seenVoipCallIds?: Set<string>;
  isNotificationRead: NotificationReadChecker;
}): VoipThreadViewModel[] => {
  const groups = new Map<string, VoipThreadViewModel>();
  (calls || []).forEach((row: any) => {
    const threadId = getVoipThreadKey(row);
    const eventAt = getTime(row?.started_at || row?.created_at);
    const phone = resolveVoipCounterpartyPhone(row);
    const phoneNumberId = String(row?.phone_number_id || '').trim();
    const phoneMatchStatus = String(row?.phone_match_status || '').trim();
    const moduleId = String(row?.module_id || '').trim();
    const recordId = String(row?.record_id || '').trim();
    const title = (
      moduleId && recordId
        ? recordTitleMap[buildRecordReferenceKey(moduleId, recordId)]
        : ''
    ) || String(row?.title || '').trim() || phone || 'تماس ورودی';
    const sourceId = String(row?.id || '').trim();
    const unreadCount = (
      String(row?.direction || '').trim() === 'incoming'
      && !isNotificationRead('voip_calls', 'voip_call', sourceId, seenVoipCallIds.has(sourceId))
    ) ? 1 : 0;
    const current = groups.get(threadId);
    if (!current) {
      groups.set(threadId, {
        id: threadId,
        phone,
        phoneNumberId: phoneNumberId || null,
        phoneMatchStatus: phoneMatchStatus || null,
        title,
        unreadCount,
        latestEventAt: eventAt,
        calls: [row],
        moduleId: moduleId || null,
        recordId: recordId || null,
      });
      return;
    }
    current.calls.push(row);
    current.unreadCount += unreadCount;
    if (eventAt >= current.latestEventAt) {
      current.latestEventAt = eventAt;
      current.title = title;
      current.phone = phone;
      current.phoneNumberId = phoneNumberId || current.phoneNumberId;
      current.phoneMatchStatus = phoneMatchStatus || current.phoneMatchStatus;
      current.moduleId = moduleId || current.moduleId;
      current.recordId = recordId || current.recordId;
    }
  });

  return Array.from(groups.values())
    .map((thread) => ({
      ...thread,
      calls: [...thread.calls].sort((a: any, b: any) => getTime(b?.started_at || b?.created_at) - getTime(a?.started_at || a?.created_at)),
    }))
    .sort((a, b) => {
      if (b.latestEventAt !== a.latestEventAt) return b.latestEventAt - a.latestEventAt;
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
      return String(a.title || '').localeCompare(String(b.title || ''), 'fa');
    });
};

const addDirectNoteCandidate = (
  targetUserIds: Set<string>,
  availableUserIds: Set<string>,
  userId?: string | null,
) => {
  const normalized = String(userId || '').trim();
  if (normalized && availableUserIds.has(normalized)) {
    targetUserIds.add(normalized);
  }
};

export const buildNoteConversations = ({
  availableDirectUsers,
  chatGroups,
  notes,
  noteLookup,
  currentUserId,
  roleLookup = {},
  seenNoteIds = new Set<string>(),
  isNotificationRead,
}: {
  availableDirectUsers: DirectUserLike[];
  chatGroups: ChatGroupLike[];
  notes: any[];
  noteLookup?: Map<string, any>;
  currentUserId?: string | null;
  roleLookup?: Record<string, string>;
  seenNoteIds?: Set<string>;
  isNotificationRead: NotificationReadChecker;
}): ConversationListViewModel[] => {
  const normalizedCurrentUserId = String(currentUserId || '').trim();
  const availableUserIds = new Set((availableDirectUsers || []).map((user) => String(user.id || '').trim()).filter(Boolean));
  const directStats = new Map<string, { noteCount: number; unreadCount: number; latestMessageAt: number }>();
  const groupStats = new Map<string, { noteCount: number; unreadCount: number; latestMessageAt: number }>();

  availableUserIds.forEach((userId) => {
    directStats.set(userId, { noteCount: 0, unreadCount: 0, latestMessageAt: 0 });
  });
  (chatGroups || []).forEach((group) => {
    const groupId = String(group?.id || '').trim();
    if (groupId) groupStats.set(groupId, { noteCount: 0, unreadCount: 0, latestMessageAt: 0 });
  });

  (notes || []).forEach((note: any) => {
    const noteTime = getTime(note?.created_at);
    const noteId = String(note?.id || '').trim();
    const authorId = String(note?.author_id || '').trim();
    const isUnread = (
      authorId !== normalizedCurrentUserId
      && !isNotificationRead('notes', 'note', noteId, seenNoteIds.has(noteId))
    );
    const groupId = String(note?.metadata?.chat_group_id || '').trim();
    if (groupId) {
      const stats = groupStats.get(groupId);
      if (!stats) return;
      stats.noteCount += 1;
      if (isUnread) stats.unreadCount += 1;
      stats.latestMessageAt = Math.max(stats.latestMessageAt, noteTime);
      return;
    }
    if (isAutomatedPersonalNote(note)) return;

    if (!normalizedCurrentUserId) return;
    const mentionUserIds = getNoteMentionUserIds(note);
    const targetUserIds = new Set<string>();
    const replyTarget = noteLookup && note?.reply_to ? noteLookup.get(String(note.reply_to)) : null;
    const replyGroupId = String(replyTarget?.metadata?.chat_group_id || '').trim();
    const replyAuthorId = !replyGroupId ? String(replyTarget?.author_id || '').trim() : '';
    const replyMentionUserIds = !replyGroupId ? getNoteMentionUserIds(replyTarget) : [];

    if (authorId === normalizedCurrentUserId) {
      mentionUserIds.forEach((userId: string) => addDirectNoteCandidate(targetUserIds, availableUserIds, userId));
      addDirectNoteCandidate(targetUserIds, availableUserIds, replyAuthorId);
      replyMentionUserIds.forEach((userId: string) => addDirectNoteCandidate(targetUserIds, availableUserIds, userId));
    } else {
      const isAddressedToCurrentUser =
        mentionUserIds.includes(normalizedCurrentUserId)
        || replyAuthorId === normalizedCurrentUserId
        || replyMentionUserIds.includes(normalizedCurrentUserId);
      if (isAddressedToCurrentUser) {
        addDirectNoteCandidate(targetUserIds, availableUserIds, authorId);
      }
    }

    targetUserIds.forEach((userId) => {
      const stats = directStats.get(userId);
      if (!stats) return;
      stats.noteCount += 1;
      if (isUnread) stats.unreadCount += 1;
      stats.latestMessageAt = Math.max(stats.latestMessageAt, noteTime);
    });
  });

  const directItems: ConversationListViewModel[] = (availableDirectUsers || [])
    .map((user) => {
      const userId = String(user.id || '').trim();
      const stats = directStats.get(userId) || { noteCount: 0, unreadCount: 0, latestMessageAt: 0 };
      return {
        id: userId,
        kind: 'direct' as const,
        displayName: user.display_name,
        avatarUrl: user.avatar_url || null,
        noteCount: stats.noteCount,
        unreadCount: stats.unreadCount,
        latestMessageAt: stats.latestMessageAt,
        roleLabel: user.role_id ? roleLookup[String(user.role_id)] || null : null,
        userId,
        isGroup: false,
      };
    })
    .sort((a, b) => {
      if (b.latestMessageAt !== a.latestMessageAt) return b.latestMessageAt - a.latestMessageAt;
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
      return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'fa');
    });

  const groupItems: ConversationListViewModel[] = (chatGroups || [])
    .map((group) => {
      const groupId = String(group.id || '').trim();
      const stats = groupStats.get(groupId) || { noteCount: 0, unreadCount: 0, latestMessageAt: 0 };
      return {
        id: `group:${groupId}`,
        kind: 'group' as const,
        displayName: group.name,
        noteCount: stats.noteCount,
        latestMessageAt: stats.latestMessageAt,
        unreadCount: stats.unreadCount,
        groupId,
        isGroup: true,
      };
    })
    .sort((a, b) => {
      if (b.latestMessageAt !== a.latestMessageAt) return b.latestMessageAt - a.latestMessageAt;
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
      return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'fa');
    });

  return [...groupItems, ...directItems].sort((a, b) => {
    if (b.latestMessageAt !== a.latestMessageAt) return b.latestMessageAt - a.latestMessageAt;
    if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
    return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'fa');
  });
};
