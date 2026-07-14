export type ReplySuggestionTimelineItem = {
  direction?: string | null;
  author?: string | null;
  text?: string | null;
  attachments?: Array<{ name?: string | null }> | null;
  sourceRow?: { created_at?: string | null } | null;
};

export type ReplySuggestionMessage = {
  direction: 'inbound' | 'outbound';
  authorName: string;
  text: string;
  createdAt: string | null;
};

export const buildRecentReplySuggestionMessages = (
  items: ReplySuggestionTimelineItem[],
  limit = 18,
): ReplySuggestionMessage[] => {
  const safeLimit = Math.max(1, Math.min(18, Math.floor(Number(limit) || 18)));
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const direction = String(item?.direction || '').trim().toLowerCase();
      if (direction !== 'inbound' && direction !== 'outbound') return null;

      const attachmentNames = (item?.attachments || [])
        .map((attachment) => String(attachment?.name || '').trim())
        .filter(Boolean);
      const body = String(item?.text || '').trim();
      const text = (body || (attachmentNames.length > 0 ? `پیوست: ${attachmentNames.join('، ')}` : '')).slice(0, 2400);
      if (!text) return null;

      return {
        direction,
        authorName: String(item?.author || '').trim() || (direction === 'outbound' ? 'کاربر سازمان' : 'مخاطب'),
        text,
        createdAt: String(item?.sourceRow?.created_at || '').trim() || null,
      } as ReplySuggestionMessage;
    })
    .filter((item): item is ReplySuggestionMessage => Boolean(item))
    .slice(-safeLimit);
};
