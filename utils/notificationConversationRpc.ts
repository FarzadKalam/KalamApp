export type NotificationConversationSection = 'notes' | 'bot_messages';

export type NotificationConversationSummary = {
  section: NotificationConversationSection;
  conversation_key: string;
  kind: 'system' | 'direct' | 'group' | 'bot' | string;
  title: string | null;
  subtitle: string | null;
  avatar_url: string | null;
  role_label: string | null;
  note_count: number;
  unread_count: number;
  latest_message_at: string | null;
  last_message_preview: string | null;
  user_id: string | null;
  group_id: string | null;
  bot_group_id: string | null;
  channel_type: string | null;
  status: string | null;
  counterparty_label: string | null;
  bot_chat_id: string | null;
};

export type NotificationReadModel = 'item' | 'cursor';

export type NotificationTimelinePayload<TItem> = {
  items: TItem[];
  unread_count: number;
  first_unread_id: string | null;
  has_more_before: boolean;
  next_before_cursor: string | null;
  read_model: NotificationReadModel;
};

export const EMPTY_TIMELINE_PAYLOAD: NotificationTimelinePayload<any> = {
  items: [],
  unread_count: 0,
  first_unread_id: null,
  has_more_before: false,
  next_before_cursor: null,
  read_model: 'item',
};

export const isMissingRpcError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    code === '42883'
    || code === 'PGRST202'
    || code === 'PGRST204'
    || message.includes('could not find the function')
    || (message.includes('function public.') && message.includes('does not exist'))
  );
};

const toSafeInteger = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeTimelinePayload = <TItem,>(value: any): NotificationTimelinePayload<TItem> => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || typeof raw !== 'object') {
    return EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>;
  }

  const items = Array.isArray(raw.items) ? raw.items as TItem[] : [];
  return {
    items,
    unread_count: toSafeInteger(raw.unread_count, 0),
    first_unread_id: raw.first_unread_id ? String(raw.first_unread_id) : null,
    has_more_before: Boolean(raw.has_more_before),
    next_before_cursor: raw.next_before_cursor ? String(raw.next_before_cursor) : null,
    read_model: raw.read_model === 'cursor' ? 'cursor' : 'item',
  };
};

export const compareIsoAsc = (left: any, right: any) =>
  new Date(left || 0).getTime() - new Date(right || 0).getTime();
