import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { AI_OPEN_EVENT, type AssistantContext } from '../../utils/aiAssistantEvents';
import { fetchSessionBootstrap } from '../../utils/sessionCache';
import { isMissingRpcError } from '../../utils/notificationConversationRpc';
import {
  canQuickReplyNotification,
  resolveDirectQuickReplyRecipient,
} from '../../utils/notificationQuickReply';
import {
  areNotificationUnreadSummariesEqual,
  EMPTY_NOTIFICATION_UNREAD_SUMMARY,
  normalizeNotificationUnreadSummary,
  sumNotificationUnread,
  type NotificationUnreadSection,
  type NotificationUnreadSummaryMap,
} from '../../utils/notificationUnreadSummary';
import {
  setUiNotificationOverlayItems,
  setUiNotificationOverlayPagination,
} from '../../utils/uiNotificationOverlayStore';

type RuntimeSection = NotificationUnreadSection;
type RuntimeRevisions = Record<RuntimeSection, number>;

type NotificationRuntimeValue = {
  ready: boolean;
  summary: NotificationUnreadSummaryMap;
  communicationUnread: number;
  alertsUnread: number;
  revisions: RuntimeRevisions;
  refreshSummary: () => Promise<void>;
  refreshOverlay: () => Promise<void>;
};

type OverlayFeedRow = {
  section: RuntimeSection;
  source_type: string;
  source_id: string;
  title: string | null;
  body: string | null;
  created_at: string | null;
  module_id: string | null;
  record_id: string | null;
  conversation_key: string | null;
  payload: Record<string, any> | null;
  feed_cursor?: string | null;
  has_more?: boolean | null;
};

const COMMUNICATION_SECTIONS = ['notes', 'bot_messages', 'sms_messages', 'voip_calls'] as const;
const ALERT_SECTIONS = ['tasks', 'responsibilities'] as const;
const OVERLAY_SOURCE = 'notification-runtime';
const isAbortRequestError = (error: any) => {
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return error?.name === 'AbortError' || text.includes('aborterror') || text.includes('request was aborted');
};
const isTransientOverlayFeedError = (error: any) => {
  const text = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  return isAbortRequestError(error)
    || text.includes('failed to fetch')
    || text.includes('networkerror')
    || text.includes('network request failed')
    || text.includes('http2')
    || text.includes('connection reset')
    || text.includes('err_failed');
};
const wait = (delayMs: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, delayMs);
});
const EMPTY_REVISIONS: RuntimeRevisions = {
  notes: 0,
  bot_messages: 0,
  sms_messages: 0,
  voip_calls: 0,
  tasks: 0,
  responsibilities: 0,
};

const NotificationRuntimeContext = createContext<NotificationRuntimeValue | null>(null);

const mapRealtimeSection = (table: string, row: Record<string, any>): RuntimeSection | null => {
  if (table === 'notes') return 'notes';
  if (table === 'counterparty_bot_groups' || table === 'counterparty_bot_messages') return 'bot_messages';
  if (table === 'outbound_messages' && String(row?.channel_type || '').trim() === 'sms') return 'sms_messages';
  if (table === 'voip_call_logs') return 'voip_calls';
  if (table === 'tasks') return 'tasks';
  if (table === 'notification_inbox_items') {
    const section = String(row?.section || '').trim();
    if (section === 'responsibilities') return 'responsibilities';
    if (section === 'notes') return 'notes';
  }
  if (table === 'notification_read_states') {
    const section = String(row?.section || '').trim();
    if (section === 'sms') return 'sms_messages';
    if (section in EMPTY_REVISIONS) return section as RuntimeSection;
  }
  if (table === 'communication_read_cursors') {
    return String(row?.channel || '').trim() === 'bot' ? 'bot_messages' : 'notes';
  }
  return null;
};

const getOverlayKind = (row: OverlayFeedRow) => {
  if (row.section === 'notes') {
    const category = String(row.payload?.category || '').trim();
    return category === 'assistant' ? 'assistant' : 'note';
  }
  if (row.section === 'bot_messages') return 'bot';
  if (row.section === 'sms_messages') return 'sms';
  if (row.section === 'voip_calls') return 'voip_call';
  if (row.section === 'tasks') return 'task';
  return 'responsibility';
};

const getOverlayChannel = (row: OverlayFeedRow) => {
  if (row.section === 'notes') {
    const category = String(row.payload?.category || '').trim().toLowerCase();
    return category === 'system' || category === 'assistant' ? 'system' : 'internal';
  }
  if (row.section === 'bot_messages') return 'bot';
  if (row.section === 'sms_messages') return 'sms';
  if (row.section === 'voip_calls') return 'voip';
  if (row.section === 'tasks' || row.section === 'responsibilities') return 'system';
  return 'generic';
};

const getPayloadText = (payload: Record<string, any> | null | undefined, keys: string[]) => {
  for (const key of keys) {
    const value = String(payload?.[key] || '').trim();
    if (value) return value;
  }
  return '';
};

const resolveInternalOverlayConversationTitle = (row: OverlayFeedRow) => {
  const payload = row.payload || {};
  const category = String(payload.category || '').trim().toLowerCase();
  if (category === 'system' || category === 'assistant') {
    return String(row.title || '').trim() || 'پیام سیستم';
  }
  return getPayloadText(payload, [
    'conversation_title',
    'group_title',
    'chat_group_name',
    'sender_display_name',
    'author_name',
    'display_name',
  ]) || String(row.title || '').trim() || 'پیام داخلی';
};

const resolveBotOverlaySenderName = (row: OverlayFeedRow) => {
  const payload = row.payload || {};
  const username = String(payload.username || '').trim().replace(/^@+/, '');
  return getPayloadText(payload, ['sender_display_name', 'sender_name'])
    || (username ? `@${username}` : '')
    || String(payload.sender_id || payload.user_id || payload.object_guid || '').trim()
    || '';
};

export const NotificationRuntimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [identity, setIdentity] = useState({ userId: '', roleId: '', orgId: '', fullName: '' });
  const [ready, setReady] = useState(false);
  const [summary, setSummary] = useState<NotificationUnreadSummaryMap>(EMPTY_NOTIFICATION_UNREAD_SUMMARY);
  const [revisions, setRevisions] = useState<RuntimeRevisions>(EMPTY_REVISIONS);
  const refreshTimerRef = useRef<number | null>(null);
  const realtimeConnectedRef = useRef(false);
  const overlayRowsRef = useRef<OverlayFeedRow[]>([]);
  const overlayLoadMoreInFlightRef = useRef(false);
  const summaryRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const summaryRefreshQueuedRef = useRef(false);
  const overlayRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const [overlayLoadingMore, setOverlayLoadingMore] = useState(false);
  const loadOverlayPageRef = useRef<(beforeCursor: string | null, append: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;
    void fetchSessionBootstrap(supabase).then((snapshot) => {
      if (cancelled) return;
      setIdentity({
        userId: String(snapshot.user?.id || '').trim(),
        roleId: String(snapshot.roleId || '').trim(),
        orgId: String(snapshot.orgId || snapshot.profile?.org_id || '').trim(),
        fullName: String(snapshot.profile?.full_name || '').trim(),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSummary = useCallback(async () => {
    if (!identity.userId || !identity.orgId) return;
    if (summaryRefreshInFlightRef.current) {
      summaryRefreshQueuedRef.current = true;
      await summaryRefreshInFlightRef.current;
      return;
    }

    const request = (async () => {
      do {
        summaryRefreshQueuedRef.current = false;
        const { data, error } = await supabase.rpc('get_notification_unread_summary_v1', { p_variant: null });
        if (error) {
          if (!isMissingRpcError(error) && !isAbortRequestError(error)) {
            console.warn('Could not refresh central notification summary', error);
          }
          continue;
        }
        const nextSummary = normalizeNotificationUnreadSummary(data);
        setSummary((current) => (
          areNotificationUnreadSummariesEqual(current, nextSummary) ? current : nextSummary
        ));
        setReady(true);
      } while (summaryRefreshQueuedRef.current);
    })();

    summaryRefreshInFlightRef.current = request;
    try {
      await request;
    } finally {
      if (summaryRefreshInFlightRef.current === request) {
        summaryRefreshInFlightRef.current = null;
      }
    }
  }, [identity.orgId, identity.userId]);

  const openOverlayRow = useCallback((row: OverlayFeedRow) => {
    if (row.section === 'notes') {
      const key = String(row.conversation_key || row.payload?.conversation_key || '').trim();
      navigate(key ? `/messages?tab=notes&conversation=${encodeURIComponent(key)}` : '/messages?tab=notes');
      return;
    }
    if (row.section === 'bot_messages') {
      const groupId = String(row.payload?.bot_group_id || '').trim();
      navigate(groupId ? `/messages?tab=bot_messages&botGroup=${encodeURIComponent(groupId)}` : '/messages?tab=bot_messages');
      return;
    }
    if (row.section === 'sms_messages') {
      navigate('/messages?tab=sms_messages');
      return;
    }
    if (row.section === 'voip_calls') {
      navigate('/messages?tab=voip_calls');
      return;
    }
    if (row.module_id && row.record_id) {
      navigate(`/${row.module_id}/${row.record_id}`);
    }
  }, [navigate]);

  const snoozeOverlayRow = useCallback(async (row: OverlayFeedRow, until: string) => {
    const { error } = await supabase.rpc('snooze_notification_overlay_v1', {
      p_section: row.section === 'sms_messages' ? 'sms' : row.section,
      p_source_type: row.source_type,
      p_source_id: row.source_id,
      p_snoozed_until: until,
    });
    if (error && !isMissingRpcError(error)) {
      console.warn('Could not snooze notification', error);
    }
  }, []);

  const markOverlayCommunicationRead = useCallback(async (
    channel: 'internal' | 'bot',
    conversationKey: string,
    row: OverlayFeedRow,
  ) => {
    if (!row.created_at) return;
    const { error } = await supabase.rpc('mark_communication_read', {
      p_channel: channel,
      p_conversation_key: conversationKey,
      p_read_through_at: row.created_at,
      p_read_through_id: row.source_id,
    });
    if (error && !isMissingRpcError(error)) {
      console.warn('Could not mark quick-replied notification as read', error);
    }
  }, []);

  const markOverlayRowRead = useCallback(async (row: OverlayFeedRow) => {
    const stateSection = row.section === 'sms_messages' ? 'sms' : row.section;
    let data: unknown = null;
    let error: any = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await supabase.rpc('mark_notification_overlay_read_v1', {
          p_section: stateSection,
          p_source_type: row.source_type,
          p_source_id: row.source_id,
        });
        data = response.data;
        error = response.error;
      } catch (requestError) {
        data = null;
        error = requestError;
      }
      if (!error || isMissingRpcError(error)) break;
      if (attempt < 2 && isTransientOverlayFeedError(error)) {
        await wait(250 * (2 ** attempt));
        continue;
      }
      break;
    }

    if (!error && data === true) {
      void refreshSummary();
      return;
    }

    if (error && !isMissingRpcError(error)) {
      console.warn('Could not mark overlay notification as read', error);
      return;
    }

    // Compatibility fallback for deployments where the new controlled RPC
    // has not reached the database yet.
    const readAt = new Date().toISOString();
    const { error: fallbackError } = await supabase
      .from('notification_read_states')
      .upsert({
        org_id: identity.orgId,
        user_id: identity.userId,
        section: stateSection,
        source_type: row.source_type,
        source_id: row.source_id,
        read_at: readAt,
        snoozed_until: null,
      }, { onConflict: 'org_id,user_id,source_type,source_id' });
    if (fallbackError) {
      console.warn('Could not persist overlay notification read state', fallbackError);
      return;
    }

    const conversationKey = String(row.conversation_key || row.payload?.conversation_key || '').trim();
    const category = String(row.payload?.category || '').trim().toLowerCase();
    if (
      row.section === 'notes'
      && category !== 'system'
      && category !== 'assistant'
      && conversationKey
      && conversationKey !== 'system'
    ) {
      await markOverlayCommunicationRead('internal', conversationKey, row);
    } else if (row.section === 'bot_messages' && conversationKey) {
      await markOverlayCommunicationRead('bot', conversationKey, row);
    }
    void refreshSummary();
  }, [identity.orgId, identity.userId, markOverlayCommunicationRead, refreshSummary]);

  const replyToOverlayRow = useCallback(async (row: OverlayFeedRow, text: string) => {
    const replyText = String(text || '').trim();
    if (!replyText) return;

    if (row.section === 'notes') {
      const conversationKey = String(row.conversation_key || row.payload?.conversation_key || '').trim();
      if (!conversationKey.startsWith('direct:') && !conversationKey.startsWith('group:')) {
        throw new Error('این پیام امکان پاسخ سریع ندارد.');
      }

      let mentionUserIds: string[] = [];
      let mentionRoleIds: string[] = [];
      let metadata: Record<string, any> = {};

      if (conversationKey.startsWith('direct:')) {
        const recipientId = resolveDirectQuickReplyRecipient(conversationKey, identity.userId);
        if (!recipientId) {
          throw new Error('گفتگوی مستقیم معتبر نیست.');
        }
        mentionUserIds = [recipientId];
      } else {
        const groupId = conversationKey.slice('group:'.length).trim();
        const { data: group, error } = await supabase
          .from('chat_groups')
          .select('id, user_ids, role_ids')
          .eq('org_id', identity.orgId)
          .eq('id', groupId)
          .maybeSingle();
        if (error) throw error;
        if (!group?.id) throw new Error('گروه گفتگو پیدا نشد.');
        mentionUserIds = (Array.isArray(group.user_ids) ? group.user_ids : [])
          .map((item: unknown) => String(item || '').trim())
          .filter((item: string) => item && item !== identity.userId);
        mentionRoleIds = (Array.isArray(group.role_ids) ? group.role_ids : [])
          .map((item: unknown) => String(item || '').trim())
          .filter(Boolean);
        metadata = { chat_group_id: groupId };
      }

      const [{ insertNotesWithFallback }, { serializeNoteContent }] = await Promise.all([
        import('../../utils/noteDispatch'),
        import('../../utils/noteContent'),
      ]);
      await insertNotesWithFallback([{
        org_id: identity.orgId,
        module_id: row.module_id,
        record_id: row.record_id,
        content: serializeNoteContent(replyText),
        reply_to: row.source_id,
        mention_user_ids: mentionUserIds,
        mention_role_ids: mentionRoleIds,
        author_id: identity.userId,
        author_name: identity.fullName || null,
        metadata,
      }]);
      await markOverlayCommunicationRead('internal', conversationKey, row);
      return;
    }

    if (row.section === 'bot_messages') {
      const botGroupId = String(row.payload?.bot_group_id || '').trim();
      if (!botGroupId) throw new Error('گروه بات مشخص نیست.');
      const { data: group, error } = await supabase
        .from('counterparty_bot_groups')
        .select('id, customer_id, supplier_id, channel_type, bot_chat_id')
        .eq('org_id', identity.orgId)
        .eq('id', botGroupId)
        .maybeSingle();
      if (error) throw error;
      if (!group?.id) throw new Error('گروه بات پیدا نشد.');
      const { sendCounterpartyBotGroupMessage } = await import('../../utils/botGateway');
      await sendCounterpartyBotGroupMessage({
        group,
        text: replyText,
        payload: { reply_to_message_id: row.source_id },
        messageType: 'text',
      });
      await supabase
        .from('counterparty_bot_groups')
        .update({ status: 'active', last_outbound_at: new Date().toISOString() })
        .eq('org_id', identity.orgId)
        .eq('id', botGroupId);
      await markOverlayCommunicationRead('bot', `bot:${botGroupId}`, row);
      return;
    }

    throw new Error('این اعلان امکان پاسخ سریع ندارد.');
  }, [identity.fullName, identity.orgId, identity.userId, markOverlayCommunicationRead]);

  const publishOverlayRows = useCallback((rows: OverlayFeedRow[]) => {
    setUiNotificationOverlayItems(rows.map((row) => {
      const kind = getOverlayKind(row);
      const conversationKey = String(row.conversation_key || row.payload?.conversation_key || '').trim();
      const canQuickReply = canQuickReplyNotification({
        section: row.section,
        category: String(row.payload?.category || ''),
        conversationKey,
      });
      return {
        id: `${row.section}:${row.source_type}:${row.source_id}`,
        kind,
        channel: getOverlayChannel(row),
        kindLabel: row.section === 'notes' ? resolveInternalOverlayConversationTitle(row) : undefined,
        title: row.section === 'bot_messages'
          ? getPayloadText(row.payload, ['group_title', 'conversation_title']) || String(row.title || '').trim() || 'پیام جدید بات'
          : String(row.title || '').trim() || 'اعلان جدید',
        subtitle: row.section === 'bot_messages' ? resolveBotOverlaySenderName(row) : undefined,
        body: String(row.body || '').trim() || 'برای مشاهده جزئیات کلیک کنید.',
        avatarUrl: getPayloadText(row.payload, row.section === 'bot_messages'
          ? ['group_avatar_url', 'counterparty_image_url', 'avatar_url']
          : ['conversation_avatar_url', 'sender_avatar_url', 'author_avatar_url', 'avatar_url']) || null,
        avatarName: row.section === 'bot_messages'
          ? getPayloadText(row.payload, ['group_title', 'conversation_title']) || String(row.title || '').trim() || null
          : resolveInternalOverlayConversationTitle(row),
        createdAt: row.created_at,
        onOpen: () => openOverlayRow(row),
        onDismiss: () => markOverlayRowRead(row),
        onSnooze: (until: string) => {
          void snoozeOverlayRow(row, until);
        },
        onReply: canQuickReply
          ? async (text: string) => {
            await replyToOverlayRow(row, text);
          }
          : undefined,
      };
    }), OVERLAY_SOURCE);
  }, [markOverlayRowRead, openOverlayRow, replyToOverlayRow, snoozeOverlayRow]);

  const loadOverlayPage = useCallback(async (beforeCursor: string | null, append: boolean) => {
    if (!identity.userId || !identity.orgId) return;
    let data: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response: { data: unknown; error: any };
      try {
        response = await supabase.rpc('get_notification_overlay_feed_v1', {
          p_before_cursor: beforeCursor,
          p_limit: 20,
        });
      } catch (error) {
        response = { data: null, error };
      }
      data = response.data;
      if (!response.error) break;
      if (isMissingRpcError(response.error)) return;
      if (attempt < 2 && isTransientOverlayFeedError(response.error)) {
        await wait(350 * (2 ** attempt));
        continue;
      }
      if (!isAbortRequestError(response.error)) {
        console.warn('Could not refresh notification overlay feed', response.error);
      }
      return;
    }
    const rows = Array.isArray(data) ? data as OverlayFeedRow[] : [];
    const merged = append
      ? Array.from(new Map(
        [...overlayRowsRef.current, ...rows].map((row) => [`${row.section}:${row.source_type}:${row.source_id}`, row]),
      ).values())
      : rows;
    overlayRowsRef.current = merged;
    publishOverlayRows(merged);
    const last = rows[rows.length - 1];
    const hasMore = Boolean(last?.has_more);
    const nextCursor = String(last?.feed_cursor || '').trim() || null;
    setUiNotificationOverlayPagination(
      hasMore,
      false,
      hasMore && nextCursor
        ? () => {
          if (overlayLoadMoreInFlightRef.current) return;
          overlayLoadMoreInFlightRef.current = true;
          setOverlayLoadingMore(true);
          void loadOverlayPageRef.current(nextCursor, true).finally(() => {
            overlayLoadMoreInFlightRef.current = false;
            setOverlayLoadingMore(false);
          });
        }
        : null,
    );
  }, [identity.orgId, identity.userId, publishOverlayRows]);
  loadOverlayPageRef.current = loadOverlayPage;

  const refreshOverlay = useCallback(async () => {
    if (overlayRefreshInFlightRef.current) {
      await overlayRefreshInFlightRef.current;
      return;
    }
    const request = loadOverlayPage(null, false);
    overlayRefreshInFlightRef.current = request;
    try {
      await request;
    } finally {
      if (overlayRefreshInFlightRef.current === request) {
        overlayRefreshInFlightRef.current = null;
      }
    }
  }, [loadOverlayPage]);

  useEffect(() => {
    const last = overlayRowsRef.current[overlayRowsRef.current.length - 1];
    if (!last?.has_more || !last.feed_cursor) return;
    setUiNotificationOverlayPagination(true, overlayLoadingMore, () => {
      if (overlayLoadMoreInFlightRef.current) return;
      overlayLoadMoreInFlightRef.current = true;
      setOverlayLoadingMore(true);
      void loadOverlayPageRef.current(String(last.feed_cursor), true).finally(() => {
        overlayLoadMoreInFlightRef.current = false;
        setOverlayLoadingMore(false);
      });
    });
  }, [overlayLoadingMore]);

  const scheduleRefresh = useCallback((section?: RuntimeSection) => {
    if (section) {
      setRevisions((prev) => ({ ...prev, [section]: prev[section] + 1 }));
    }
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void Promise.all([refreshSummary(), refreshOverlay()]);
    }, 300);
  }, [refreshOverlay, refreshSummary]);

  useEffect(() => {
    if (!identity.userId || !identity.orgId) return;
    void Promise.all([refreshSummary(), refreshOverlay()]);
  }, [identity.orgId, identity.userId, refreshOverlay, refreshSummary]);

  useEffect(() => {
    if (!identity.userId || !identity.orgId) return undefined;
    const tables = [
      'notes',
      'counterparty_bot_groups',
      'counterparty_bot_messages',
      'outbound_messages',
      'voip_call_logs',
      'tasks',
      'notification_inbox_items',
      'notification_read_states',
      'communication_read_cursors',
    ];
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const subscribeTimer = window.setTimeout(() => {
      if (disposed) return;
      channel = supabase.channel(`notification-runtime-${identity.orgId}-${identity.userId}`);
      tables.forEach((table) => {
        channel = channel!.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `org_id=eq.${identity.orgId}` },
          (payload: any) => {
            const row = payload?.new || payload?.old || {};
            if (
              (table === 'notification_read_states' || table === 'communication_read_cursors')
              && String(row?.user_id || '').trim() !== identity.userId
            ) return;
            const section = mapRealtimeSection(table, row);
            if (section) scheduleRefresh(section);
          },
        );
      });
      channel.subscribe((status) => {
        realtimeConnectedRef.current = status === 'SUBSCRIBED';
      });
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(subscribeTimer);
      realtimeConnectedRef.current = false;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [identity.orgId, identity.userId, scheduleRefresh]);

  useEffect(() => {
    if (!identity.userId) return undefined;
    const interval = window.setInterval(() => {
      if (!realtimeConnectedRef.current && document.visibilityState === 'visible') {
        void Promise.all([refreshSummary(), refreshOverlay()]);
      }
    }, 90_000);
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        void Promise.all([refreshSummary(), refreshOverlay()]);
      }
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [identity.userId, refreshOverlay, refreshSummary]);

  useEffect(() => {
    const handleAiOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ context?: AssistantContext }>).detail || {};
      navigate('/messages?tab=assistant', {
        state: detail.context ? { assistantContext: detail.context } : undefined,
      });
    };
    window.addEventListener(AI_OPEN_EVENT, handleAiOpen as EventListener);
    return () => window.removeEventListener(AI_OPEN_EVENT, handleAiOpen as EventListener);
  }, [navigate]);

  useEffect(() => () => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    setUiNotificationOverlayItems([], OVERLAY_SOURCE);
    setUiNotificationOverlayPagination(false, false, null);
  }, []);

  const value = useMemo<NotificationRuntimeValue>(() => ({
    ready,
    summary,
    communicationUnread: sumNotificationUnread(summary, COMMUNICATION_SECTIONS),
    alertsUnread: sumNotificationUnread(summary, ALERT_SECTIONS),
    revisions,
    refreshSummary,
    refreshOverlay,
  }), [ready, refreshOverlay, refreshSummary, revisions, summary]);

  return (
    <NotificationRuntimeContext.Provider value={value}>
      {children}
    </NotificationRuntimeContext.Provider>
  );
};

export const useNotificationRuntime = () => {
  const value = useContext(NotificationRuntimeContext);
  if (!value) throw new Error('useNotificationRuntime must be used inside NotificationRuntimeProvider');
  return value;
};
