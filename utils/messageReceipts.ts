const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReadReceiptEntry = {
  userId: string;
  userName: string;
  readAt: string | null;
};

export type LikeReceiptEntry = {
  userId: string;
  userName: string;
  likedAt: string | null;
};

const asRecord = (value: unknown): Record<string, any> | null => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, any>
      : null;
  } catch {
    return null;
  }
};

const resolveBox = (value: unknown) => {
  const box = asRecord(value);
  if (!box) return null;
  const nested = asRecord(box.metadata) || asRecord(box.payload);
  return nested ? { ...nested, ...box } : box;
};

export const getReadReceiptUserId = (value: any, fallback?: string) => (
  typeof value === 'string' && UUID_REGEX.test(value.trim())
    ? value.trim()
    : String(value?.user_id || value?.userId || value?.id || fallback || '').trim()
);

export const getReadReceiptReadAt = (value: any) =>
  String(value?.read_at || value?.readAt || value?.seen_at || value?.seenAt || value?.at || '').trim() || null;

export const getReadReceiptUserName = (value: any) =>
  String(value?.user_name || value?.userName || value?.name || value?.display_name || value?.displayName || '').trim();

export const readReceiptMapFromBox = (value: unknown): Record<string, any> => {
  const box = resolveBox(value);
  const source = box && (
    box.read_receipts
    || box.readReceipts
    || box.seen_by
    || box.seenBy
    || box.read_by
    || box.readBy
  );
  const map: Record<string, any> = {};

  if (Array.isArray(source)) {
    source.forEach((item) => {
      const userId = getReadReceiptUserId(item);
      if (!userId) return;
      map[userId] = asRecord(item) || { user_id: userId };
    });
  } else {
    const sourceRecord = asRecord(source);
    Object.entries(sourceRecord || {}).forEach(([key, item]) => {
      const userId = getReadReceiptUserId(item, key);
      if (!userId) return;
      map[userId] = asRecord(item) || {
        user_id: userId,
        read_at: typeof item === 'string' && !UUID_REGEX.test(item.trim()) ? item.trim() || null : null,
      };
    });
  }

  return map;
};

export const getLikeUserId = (value: any, fallback?: string) => (
  typeof value === 'string' && UUID_REGEX.test(value.trim())
    ? value.trim()
    : String(value?.user_id || value?.userId || value?.id || fallback || '').trim()
);

export const getLikeUserName = (value: any) =>
  String(value?.user_name || value?.userName || value?.name || value?.display_name || value?.displayName || '').trim();

export const getLikeAt = (value: any) =>
  String(value?.liked_at || value?.likedAt || value?.created_at || value?.createdAt || value?.at || '').trim() || null;

export const likeReceiptMapFromBox = (value: unknown): Record<string, any> => {
  const box = resolveBox(value);
  const source = box && (box.likes || box.liked_by || box.likedBy);
  const map: Record<string, any> = {};

  if (Array.isArray(source)) {
    source.forEach((item) => {
      const userId = getLikeUserId(item);
      if (!userId) return;
      map[userId] = asRecord(item) || { user_id: userId };
    });
  } else {
    const sourceRecord = asRecord(source);
    Object.entries(sourceRecord || {}).forEach(([key, item]) => {
      const userId = getLikeUserId(item, key);
      if (!userId) return;
      map[userId] = asRecord(item) || {
        user_id: userId,
        liked_at: typeof item === 'string' && !UUID_REGEX.test(item.trim()) ? item.trim() || null : null,
      };
    });
  }

  return map;
};

export const selectInternalReceiptCursorRows = <T extends {
  id?: unknown;
  author_id?: unknown;
  created_at?: unknown;
}>(
  rows: T[],
  currentUserId: string,
  isSystemRow: (row: T) => boolean,
) => rows.filter((row) => {
  const id = String(row?.id || '').trim();
  const authorId = String(row?.author_id || '').trim();
  const createdAt = new Date(String(row?.created_at || '')).getTime();
  return Boolean(
    id
    && Number.isFinite(createdAt)
    && authorId !== currentUserId
    && !isSystemRow(row)
  );
});

export const selectBotReceiptCursorRows = <T extends {
  id?: unknown;
  direction?: unknown;
  created_at?: unknown;
}>(rows: T[]) => rows.filter((row) => (
  UUID_REGEX.test(String(row?.id || '').trim())
  && Number.isFinite(new Date(String(row?.created_at || '')).getTime())
));
