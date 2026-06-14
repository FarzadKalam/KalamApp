// ---------------------------------------------------------------------------
// Persists the last opened tab/conversation of the messages page so the user
// returns exactly where they left off instead of always landing on the
// system-messages conversation. Stored per device (localStorage) and validated
// against the signed-in user id before being applied.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'notif_last_chat_state_v1';

export type MessagesLastState = {
  userId: string;
  tab?: string | null;
  /** selectedNoteUserId — null means «یادداشت‌های من» */
  noteConversationId?: string | null;
  botGroupId?: string | null;
  botDirectThreadId?: string | null;
};

export const loadMessagesLastState = (): MessagesLastState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !String(parsed.userId || '').trim()) return null;
    return parsed as MessagesLastState;
  } catch {
    return null;
  }
};

export const saveMessagesLastState = (state: MessagesLastState) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable (private mode/quota) — restoring is best-effort
  }
};
