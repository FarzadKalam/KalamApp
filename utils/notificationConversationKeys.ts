export const SYSTEM_MESSAGES_USER_ID = '__system_messages__';
export const MY_NOTES_CONVERSATION_KEY = 'mine';
export const SAVED_MESSAGES_FORWARD_TARGET = '__saved_messages__';
export const CHAT_GROUP_PREFIX = 'group:';
export const BOT_GROUP_FORWARD_PREFIX = 'botgroup:';

export const isChatGroupSelection = (value: string | null | undefined) =>
  String(value || '').startsWith(CHAT_GROUP_PREFIX);

export const getChatGroupSelectionId = (value: string | null | undefined) =>
  isChatGroupSelection(value) ? String(value).slice(CHAT_GROUP_PREFIX.length) : null;

export const buildDirectConversationKey = (currentUserId: string, otherUserId: string) => {
  const left = String(currentUserId || '').trim();
  const right = String(otherUserId || '').trim();
  if (!left || !right || left === right) return null;
  return left <= right ? `direct:${left}:${right}` : `direct:${right}:${left}`;
};

export const resolveConversationSelection = (
  conversationKey: string | null | undefined,
  currentUserId: string | null | undefined,
) => {
  const key = String(conversationKey || '').trim();
  const userId = String(currentUserId || '').trim();
  if (!key || key === MY_NOTES_CONVERSATION_KEY) return null;
  if (key === 'system') return SYSTEM_MESSAGES_USER_ID;
  if (key.startsWith(CHAT_GROUP_PREFIX)) return key;
  if (!key.startsWith('direct:') || !userId) return undefined;

  const participants = key.slice('direct:'.length).split(':').map((item) => item.trim()).filter(Boolean);
  if (participants.length !== 2 || !participants.includes(userId)) return undefined;
  return participants.find((participant) => participant !== userId);
};

export const isBotGroupForwardSelection = (value: string | null | undefined) =>
  String(value || '').startsWith(BOT_GROUP_FORWARD_PREFIX);

export const getBotGroupForwardSelectionId = (value: string | null | undefined) =>
  isBotGroupForwardSelection(value) ? String(value || '').slice(BOT_GROUP_FORWARD_PREFIX.length) || null : null;

export const isSavedMessagesForwardSelection = (value: string | null | undefined) =>
  String(value || '').trim() === SAVED_MESSAGES_FORWARD_TARGET;
