import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { AI_OPEN_EVENT } from '../../utils/aiAssistantEvents';
import { isMissingRpcError } from '../../utils/notificationConversationRpc';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

const NotificationsPopover = React.lazy(() => import('../NotificationsPopover'));

type CommunicationTab = 'notes' | 'bot_messages' | 'sms_messages' | 'voip_calls' | 'assistant';

type CommunicationLauncherProps = {
  isMobile: boolean;
  currentUserId?: string | null;
  currentRoleId?: string | null;
  currentOrgId?: string | null;
};

type CommunicationBadgeSummary = {
  total_unread?: number | string | null;
};

const isCommunicationSection = (section: unknown) => (
  ['notes', 'bot_messages', 'sms', 'sms_messages', 'voip_calls'].includes(String(section || '').trim())
);

const CommunicationLauncher: React.FC<CommunicationLauncherProps> = ({
  isMobile,
  currentUserId,
  currentRoleId,
  currentOrgId,
}) => {
  const normalizedUserId = String(currentUserId || '').trim();
  const normalizedRoleId = String(currentRoleId || '').trim();
  const normalizedOrgId = String(currentOrgId || '').trim();
  const [lightweightAvailable, setLightweightAvailable] = useState<boolean | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [panelMounted, setPanelMounted] = useState(false);
  const [requestedTab, setRequestedTab] = useState<CommunicationTab>('notes');

  const refreshBadge = useCallback(async () => {
    if (!normalizedUserId) {
      setTotalUnread(0);
      return;
    }
    const { data, error } = await supabase.rpc('get_communication_badge_summary');
    if (error) {
      if (isMissingRpcError(error)) {
        setLightweightAvailable(false);
        return;
      }
      console.warn('Could not refresh communication badge summary', error);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as CommunicationBadgeSummary | null;
    const nextTotal = Number(row?.total_unread || 0);
    setTotalUnread(Number.isFinite(nextTotal) ? nextTotal : 0);
    setLightweightAvailable(true);
  }, [normalizedUserId]);

  useEffect(() => {
    void refreshBadge();
  }, [refreshBadge]);

  useEffect(() => {
    if (!normalizedUserId || panelMounted || lightweightAvailable !== true) return undefined;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        void refreshBadge();
      }
    }, 90_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshBadge();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [lightweightAvailable, normalizedUserId, panelMounted, refreshBadge]);

  useEffect(() => {
    if (!normalizedUserId || !normalizedOrgId || panelMounted || lightweightAvailable !== true) return undefined;
    const topics = [
      `org:${normalizedOrgId}:notifications`,
      `org:${normalizedOrgId}:user:${normalizedUserId}:notifications`,
      normalizedRoleId ? `org:${normalizedOrgId}:role:${normalizedRoleId}:notifications` : null,
    ].filter(Boolean) as string[];
    const channels = topics.map((topic) => (
      supabase
        .channel(topic, { config: { private: true } } as any)
        .on('broadcast', { event: 'notification' }, (message: any) => {
          if (isCommunicationSection(message?.payload?.section)) {
            void refreshBadge();
          }
        })
        .subscribe()
    ));
    return () => {
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [lightweightAvailable, normalizedOrgId, normalizedRoleId, normalizedUserId, panelMounted, refreshBadge]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleAiOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ requestedTab?: CommunicationTab }>).detail;
      setRequestedTab(detail?.requestedTab || 'assistant');
      setPanelMounted(true);
    };
    window.addEventListener(AI_OPEN_EVENT, handleAiOpen as EventListener);
    return () => window.removeEventListener(AI_OPEN_EVENT, handleAiOpen as EventListener);
  }, []);

  const openPanel = useCallback(() => {
    setRequestedTab('notes');
    setPanelMounted(true);
  }, []);

  if (lightweightAvailable === false) {
    return (
      <React.Suspense fallback={null}>
        <NotificationsPopover
          isMobile={isMobile}
          variant="chat"
          requestedTab={requestedTab}
          initialOpen={panelMounted}
        />
      </React.Suspense>
    );
  }

  return (
    <>
      <Badge count={totalUnread ? toPersianNumber(totalUnread) : 0} size="small" color="#c0392b">
        <Button
          type="text"
          shape="circle"
          icon={<MessageOutlined className="text-gray-500 dark:text-gray-400" />}
          onClick={openPanel}
          aria-label="ارتباطات"
        />
      </Badge>
      {panelMounted ? (
        <React.Suspense fallback={null}>
          <NotificationsPopover
            isMobile={isMobile}
            variant="chat"
            requestedTab={requestedTab}
            initialOpen
            triggerless
            onClosed={() => {
              setPanelMounted(false);
              void refreshBadge();
            }}
          />
        </React.Suspense>
      ) : null}
    </>
  );
};

export default CommunicationLauncher;
