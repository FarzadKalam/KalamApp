import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type NotificationConversationSection,
  type NotificationConversationSummary,
  isMissingRpcError,
} from '../utils/notificationConversationRpc';

type UseNotificationConversationListOptions = {
  supabase: SupabaseClient<any, 'public', any>;
  section: NotificationConversationSection;
  enabled: boolean;
};

export const useNotificationConversationList = ({
  supabase,
  section,
  enabled,
}: UseNotificationConversationListOptions) => {
  const [items, setItems] = useState<NotificationConversationSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled || !available) return null;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_notification_conversations', {
        p_section: section,
      });
      if (error) {
        if (isMissingRpcError(error)) {
          setAvailable(false);
          setItems(null);
          return null;
        }
        throw error;
      }
      const nextItems = Array.isArray(data) ? data as NotificationConversationSummary[] : [];
      setItems(nextItems);
      return nextItems;
    } finally {
      setLoading(false);
    }
  }, [available, enabled, section, supabase]);

  useEffect(() => {
    if (!enabled || !available) return;
    void refresh();
  }, [available, enabled, refresh]);

  return {
    items,
    loading,
    available,
    refresh,
    setItems,
  };
};
