import { useSyncExternalStore } from 'react';

export type MessagesSection = 'notes' | 'bot_messages' | 'sms_messages' | 'voip_calls' | 'tasks' | 'responsibilities';

export interface MessagesState {
  activeSection: MessagesSection;
  activeConversationKey: string | null;
  // unread counts per conversation key (from RPC summary)
  unreadByConversation: Record<string, number>;
  // total unread count per section badge
  sectionUnreadCount: Record<MessagesSection, number>;
}

const DEFAULT_STATE: MessagesState = {
  activeSection: 'notes',
  activeConversationKey: null,
  unreadByConversation: {},
  sectionUnreadCount: {
    notes: 0,
    bot_messages: 0,
    sms_messages: 0,
    voip_calls: 0,
    tasks: 0,
    responsibilities: 0,
  },
};

let state: MessagesState = { ...DEFAULT_STATE };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const getSnapshot = () => state;
const getServerSnapshot = () => DEFAULT_STATE;

const setState = (patch: Partial<MessagesState>) => {
  state = { ...state, ...patch };
  emit();
};

export const setActiveSection = (section: MessagesSection) => {
  setState({ activeSection: section, activeConversationKey: null });
};

export const setActiveConversation = (section: MessagesSection, conversationKey: string | null) => {
  setState({ activeSection: section, activeConversationKey: conversationKey });
};

export const setUnreadCounts = (map: Record<string, number>) => {
  setState({ unreadByConversation: map });
};

export const setSectionUnreadCount = (section: MessagesSection, count: number) => {
  setState({
    sectionUnreadCount: { ...state.sectionUnreadCount, [section]: count },
  });
};

export const resetMessagesStore = () => {
  state = { ...DEFAULT_STATE };
  emit();
};

export const useMessagesStore = (): MessagesState =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    getServerSnapshot,
  );
