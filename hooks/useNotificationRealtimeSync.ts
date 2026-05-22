import { useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type NotificationSectionKey = 'notes' | 'tasks' | 'responsibilities' | 'bot_messages' | 'sms_messages' | 'voip_calls';

type UseNotificationRealtimeSyncOptions = {
  supabase: SupabaseClient<any, 'public', any>;
  enabled: boolean;
  variant: 'chat' | 'alerts';
  channelKey: string;
  currentUserId: string;
  currentRoleId?: string | null;
  currentOrgId?: string | null;
  mapBroadcastSection: (section: any) => NotificationSectionKey | null;
  scheduleLiveRefresh: (section?: NotificationSectionKey) => void;
  hasNoteMatch: (row: any) => boolean;
  hasAssigneeMatch: (row: any) => boolean;
  hasVoipCallMatch: (row: any) => boolean;
  responsibilityTables: string[];
  onVoipUpsert: (row: any) => void;
};

export const useNotificationRealtimeSync = ({
  supabase,
  enabled,
  variant,
  channelKey,
  currentUserId,
  currentRoleId,
  currentOrgId,
  mapBroadcastSection,
  scheduleLiveRefresh,
  hasNoteMatch,
  hasAssigneeMatch,
  hasVoipCallMatch,
  responsibilityTables,
  onVoipUpsert,
}: UseNotificationRealtimeSyncOptions) => {
  useEffect(() => {
    if (!enabled || !currentUserId) return;

    let disposed = false;
    let reconnectTimer: number | null = null;
    let channel: any = null;
    let broadcastChannels: any[] = [];

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null && typeof window !== 'undefined') {
        window.clearTimeout(reconnectTimer);
      }
      reconnectTimer = null;
    };

    const cleanupChannels = () => {
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
      broadcastChannels.forEach((broadcastChannel) => {
        void supabase.removeChannel(broadcastChannel);
      });
      broadcastChannels = [];
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null || typeof window === 'undefined') return;
      cleanupChannels();
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (!disposed) {
          connect();
        }
      }, 1500);
    };

    const buildOrgScopedChange = (table: string, event: '*' | 'INSERT' | 'UPDATE') => ({
      event,
      schema: 'public',
      table,
      filter: currentOrgId ? `org_id=eq.${currentOrgId}` : undefined,
    });

    const connect = () => {
      channel = supabase.channel(channelKey);

      if (currentOrgId) {
        const broadcastTopics = [
          `org:${currentOrgId}:notifications`,
          `org:${currentOrgId}:user:${currentUserId}:notifications`,
          currentRoleId ? `org:${currentOrgId}:role:${currentRoleId}:notifications` : null,
        ].filter(Boolean) as string[];

        broadcastTopics.forEach((topic) => {
          const broadcastChannel = supabase.channel(topic, { config: { private: true } } as any)
            .on('broadcast', { event: 'notification' }, (message: any) => {
              const section = mapBroadcastSection(message?.payload?.section);
              if (section) scheduleLiveRefresh(section);
            });
          broadcastChannel.subscribe((status: any) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              scheduleReconnect();
            }
          });
          broadcastChannels.push(broadcastChannel);
        });
      }

      if (variant === 'chat') {
        channel
          .on('postgres_changes', buildOrgScopedChange('notes', 'INSERT'), (payload: any) => {
            if (hasNoteMatch(payload?.new)) scheduleLiveRefresh('notes');
          })
          .on('postgres_changes', buildOrgScopedChange('notes', 'UPDATE'), (payload: any) => {
            if (hasNoteMatch(payload?.new) || hasNoteMatch(payload?.old)) scheduleLiveRefresh('notes');
          })
          .on('postgres_changes', buildOrgScopedChange('counterparty_bot_groups', '*'), () => {
            scheduleLiveRefresh('bot_messages');
          })
          .on('postgres_changes', buildOrgScopedChange('counterparty_bot_messages', '*'), () => {
            scheduleLiveRefresh('bot_messages');
          })
          .on('postgres_changes', buildOrgScopedChange('outbound_messages', '*'), (payload: any) => {
            const row = payload?.new || payload?.old || {};
            if (String(row?.channel_type || '').trim() === 'sms') scheduleLiveRefresh('sms_messages');
          })
          .on('postgres_changes', buildOrgScopedChange('voip_call_logs', 'INSERT'), (payload: any) => {
            if (hasVoipCallMatch(payload?.new)) onVoipUpsert(payload.new);
          })
          .on('postgres_changes', buildOrgScopedChange('voip_call_logs', 'UPDATE'), (payload: any) => {
            if (hasVoipCallMatch(payload?.new)) onVoipUpsert(payload.new);
          });
      } else {
        channel
          .on('postgres_changes', buildOrgScopedChange('tasks', 'INSERT'), (payload: any) => {
            if (hasAssigneeMatch(payload?.new)) scheduleLiveRefresh('tasks');
          })
          .on('postgres_changes', buildOrgScopedChange('tasks', 'UPDATE'), (payload: any) => {
            if (hasAssigneeMatch(payload?.new) || hasAssigneeMatch(payload?.old)) scheduleLiveRefresh('tasks');
          });

        responsibilityTables.forEach((table) => {
          channel
            .on('postgres_changes', buildOrgScopedChange(table, 'INSERT'), (payload: any) => {
              if (hasAssigneeMatch(payload?.new)) scheduleLiveRefresh('responsibilities');
            })
            .on('postgres_changes', buildOrgScopedChange(table, 'UPDATE'), (payload: any) => {
              if (hasAssigneeMatch(payload?.new) || hasAssigneeMatch(payload?.old)) scheduleLiveRefresh('responsibilities');
            });
        });
      }

      channel.subscribe((status: any) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Notifications realtime channel reconnect scheduled.');
          scheduleReconnect();
        }
      });
    };

    connect();

    return () => {
      disposed = true;
      clearReconnectTimer();
      cleanupChannels();
    };
  }, [
    channelKey,
    currentOrgId,
    currentRoleId,
    currentUserId,
    enabled,
    hasAssigneeMatch,
    hasNoteMatch,
    hasVoipCallMatch,
    mapBroadcastSection,
    onVoipUpsert,
    responsibilityTables,
    scheduleLiveRefresh,
    supabase,
    variant,
  ]);
};
