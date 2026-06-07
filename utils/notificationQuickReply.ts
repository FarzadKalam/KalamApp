export const canQuickReplyNotification = ({
  section,
  category,
  conversationKey,
}: {
  section: string;
  category?: string | null;
  conversationKey?: string | null;
}) => {
  if (section === 'bot_messages') return true;
  if (section !== 'notes') return false;

  const normalizedCategory = String(category || '').trim().toLowerCase();
  if (normalizedCategory === 'system' || normalizedCategory === 'assistant') return false;

  const key = String(conversationKey || '').trim();
  return key.startsWith('direct:') || key.startsWith('group:');
};

export const resolveDirectQuickReplyRecipient = (
  conversationKey: string,
  currentUserId: string,
) => {
  const key = String(conversationKey || '').trim();
  const userId = String(currentUserId || '').trim();
  if (!key.startsWith('direct:') || !userId) return null;

  const participants = key
    .slice('direct:'.length)
    .split(':')
    .map((item) => item.trim())
    .filter(Boolean);
  if (participants.length !== 2 || !participants.includes(userId)) return null;
  return participants.find((item) => item !== userId) || null;
};
