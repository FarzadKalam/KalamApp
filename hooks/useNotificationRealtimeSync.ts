import { useEffect, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { botMessageInsertBus, noteInsertBus } from '../utils/communicationRealtimeBus';

type NotificationSectionKey = 'notes' | 'tasks' | 'responsibilities' | 'bot_messages' | 'bot_direct_messages' | 'sms_messages' | 'voip_calls';

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
  // Store callbacks in refs so the channel setup effect never re-runs due to function identity changes.
  const mapBroadcastSectionRef = useRef(mapBroadcastSection);
  const scheduleLiveRefreshRef = useRef(scheduleLiveRefresh);
  const hasNoteMatchRef = useRef(hasNoteMatch);
  const hasAssigneeMatchRef = useRef(hasAssigneeMatch);
  const hasVoipCallMatchRef = useRef(hasVoipCallMatch);
  const onVoipUpsertRef = useRef(onVoipUpsert);
  const responsibilityTablesRef = useRef(responsibilityTables);

  useEffect(() => { mapBroadcastSectionRef.current = mapBroadcastSection; }, [mapBroadcastSection]);
  useEffect(() => { scheduleLiveRefreshRef.current = scheduleLiveRefresh; }, [scheduleLiveRefresh]);
  useEffect(() => { hasNoteMatchRef.current = hasNoteMatch; }, [hasNoteMatch]);
  useEffect(() => { hasAssigneeMatchRef.current = hasAssigneeMatch; }, [hasAssigneeMatch]);
  useEffect(() => { hasVoipCallMatchRef.current = hasVoipCallMatch; }, [hasVoipCallMatch]);
  useEffect(() => { onVoipUpsertRef.current = onVoipUpsert; }, [onVoipUpsert]);
  useEffect(() => { responsibilityTablesRef.current = responsibilityTables; }, [responsibilityTables]);

  useEffect(() => {
    if (!enabled || !currentUserId) return;

    let disposed = false;
    let reconnectTimer: number | null = null;
    let channel: any = null;
    let broadcastChannels: any[] = [];
    let backoffMs = 1500;
    const MAX_BACKOFF_MS = 60_000;

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
      const delay = backoffMs;
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (!disposed) {
          connect();
        }
      }, delay);
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
              const section = mapBroadcastSectionRef.current(message?.payload?.section);
              if (section) scheduleLiveRefreshRef.current(section);
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
            if (payload?.new) noteInsertBus.emit(payload.new);
            if (hasNoteMatchRef.current(payload?.new)) scheduleLiveRefreshRef.current('notes');
          })
          .on('postgres_changes', buildOrgScopedChange('notes', 'UPDATE'), (payload: any) => {
            if (hasNoteMatchRef.current(payload?.new) || hasNoteMatchRef.current(payload?.old)) scheduleLiveRefreshRef.current('notes');
          })
          .on('postgres_changes', buildOrgScopedChange('counterparty_bot_groups', '*'), () => {
            scheduleLiveRefreshRef.current('bot_messages');
          })
          .on('postgres_changes', buildOrgScopedChange('counterparty_bot_messages', '*'), (payload: any) => {
            if (payload?.eventType === 'INSERT' && payload?.new) botMessageInsertBus.emit(payload.new);
            scheduleLiveRefreshRef.current('bot_messages');
          })
          .on('postgres_changes', buildOrgScopedChange('counterparty_bot_direct_threads', '*'), () => {
            scheduleLiveRefreshRef.current('bot_direct_messages');
          })
          .on('postgres_changes', buildOrgScopedChange('counterparty_bot_direct_messages', '*'), (payload: any) => {
            if (payload?.eventType === 'INSERT' && payload?.new) botMessageInsertBus.emit(payload.new);
            scheduleLiveRefreshRef.current('bot_direct_messages');
          })
          .on('postgres_changes', buildOrgScopedChange('outbound_messages', '*'), (payload: any) => {
            const row = payload?.new || payload?.old || {};
            if (String(row?.channel_type || '').trim() === 'sms') scheduleLiveRefreshRef.current('sms_messages');
          })
          .on('postgres_changes', buildOrgScopedChange('sms_delivery_reports', '*'), () => {
            scheduleLiveRefreshRef.current('sms_messages');
          })
          .on('postgres_changes', buildOrgScopedChange('voip_call_logs', 'INSERT'), (payload: any) => {
            if (hasVoipCallMatchRef.current(payload?.new)) onVoipUpsertRef.current(payload.new);
          })
          .on('postgres_changes', buildOrgScopedChange('voip_call_logs', 'UPDATE'), (payload: any) => {
            if (hasVoipCallMatchRef.current(payload?.new)) onVoipUpsertRef.current(payload.new);
          });
      } else {
        channel
          .on('postgres_changes', buildOrgScopedChange('tasks', 'INSERT'), (payload: any) => {
            if (hasAssigneeMatchRef.current(payload?.new)) scheduleLiveRefreshRef.current('tasks');
          })
          .on('postgres_changes', buildOrgScopedChange('tasks', 'UPDATE'), (payload: any) => {
            if (hasAssigneeMatchRef.current(payload?.new) || hasAssigneeMatchRef.current(payload?.old)) scheduleLiveRefreshRef.current('tasks');
          });

        responsibilityTablesRef.current.forEach((table) => {
          channel
            .on('postgres_changes', buildOrgScopedChange(table, 'INSERT'), (payload: any) => {
              if (hasAssigneeMatchRef.current(payload?.new)) scheduleLiveRefreshRef.current('responsibilities');
            })
            .on('postgres_changes', buildOrgScopedChange(table, 'UPDATE'), (payload: any) => {
              if (hasAssigneeMatchRef.current(payload?.new) || hasAssigneeMatchRef.current(payload?.old)) scheduleLiveRefreshRef.current('responsibilities');
            });
        });
      }

      channel.subscribe((status: any) => {
        if (status === 'SUBSCRIBED') {
          backoffMs = 1500;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
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
    supabase,
    variant,
  ]);
};
