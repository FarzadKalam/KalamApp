// ---------------------------------------------------------------------------
// In-app pub/sub for realtime communication rows.
//
// Supabase realtime INSERT events already carry the full inserted row, but the
// subscription lives in NotificationRuntimeProvider (or the legacy
// useNotificationRealtimeSync hook) while the open-conversation state lives in
// NotificationsPopover. This bus hands the row over directly so the open chat
// can append the message instantly instead of waiting for a full RPC refetch.
// ---------------------------------------------------------------------------

type RealtimeRow = Record<string, any>;
type Listener = (row: RealtimeRow) => void;

const createTopic = () => {
  const listeners = new Set<Listener>();
  return {
    emit(row: RealtimeRow) {
      if (!row || typeof row !== 'object') return;
      listeners.forEach((listener) => {
        try {
          listener(row);
        } catch (error) {
          console.warn('communicationRealtimeBus listener failed', error);
        }
      });
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

/** Fired with the inserted `notes` row from any realtime subscription. */
export const noteInsertBus = createTopic();

/** Fired with the inserted `counterparty_bot_messages` row from any realtime subscription. */
export const botMessageInsertBus = createTopic();
