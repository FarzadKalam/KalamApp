import React, { Suspense, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { AssistantContext } from '../utils/aiAssistantEvents';

const MessagingSurfacePrototype = React.lazy(() => import('../components/notifications/messaging/MessagingSurfacePrototype'));

type MessagesTab = 'notes' | 'bot_messages' | 'bot_direct_messages' | 'sms_messages' | 'voip_calls';
type MessagesInitialFilter = 'internal' | 'bot_group' | 'bot_direct' | 'sms' | 'call';
const MESSAGE_TABS = new Set<MessagesTab>(['notes', 'bot_messages', 'bot_direct_messages', 'sms_messages', 'voip_calls']);

const MessagesPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [initialForwardMessage] = React.useState<any | null>(() => (
    (location.state as { aiForwardMessage?: any } | null)?.aiForwardMessage || null
  ));
  const requestedTab = useMemo(() => {
    const tab = String(searchParams.get('tab') || '').trim();
    return MESSAGE_TABS.has(tab as MessagesTab) ? tab as MessagesTab : undefined;
  }, [searchParams]);
  const requestedConversationKey = String(searchParams.get('conversation') || '').trim() || undefined;
  const requestedBotGroupId = String(searchParams.get('botGroup') || '').trim() || undefined;
  const requestedBotDirectThreadId = String(searchParams.get('botDirectThread') || '').trim() || undefined;
  const initialFilter = useMemo<MessagesInitialFilter>(() => {
    if (requestedTab === 'bot_messages') return 'bot_group';
    if (requestedTab === 'bot_direct_messages') return 'bot_direct';
    if (requestedTab === 'sms_messages') return 'sms';
    if (requestedTab === 'voip_calls') return 'call';
    return 'internal';
  }, [requestedTab]);
  const initialConversationKey = useMemo(() => {
    if (requestedConversationKey) return `live:internal:${requestedConversationKey}`;
    if (requestedBotGroupId) return `live:bot_group:${requestedBotGroupId}`;
    if (requestedBotDirectThreadId) return `live:bot_direct:${requestedBotDirectThreadId}`;
    return null;
  }, [requestedBotDirectThreadId, requestedBotGroupId, requestedConversationKey]);

  useEffect(() => {
    const context = (location.state as { assistantContext?: AssistantContext } | null)?.assistantContext;
    if (String(searchParams.get('tab') || '').trim() !== 'assistant') return;
    navigate('/ai', {
      replace: true,
      state: context ? { assistantContext: context } : undefined,
    });
  }, [location.state, navigate, searchParams]);

  useEffect(() => {
    if (!initialForwardMessage) return;
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [initialForwardMessage, location.pathname, location.search, navigate]);

  // Let the chat panels manage their own scroll while keeping Layout's mobile footer inset.
  useEffect(() => {
    const content = document.querySelector('.layout-main-scroll') as HTMLElement | null;
    if (!content) return;
    const prevOverflow = content.style.overflow;
    content.style.overflow = 'hidden';
    return () => {
      content.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div className="messages-page-root" style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Suspense fallback={null}>
        <MessagingSurfacePrototype
          initialFilter={initialFilter}
          initialConversationKey={initialConversationKey}
          initialForwardMessage={initialForwardMessage}
        />
      </Suspense>
    </div>
  );
};

export default MessagesPage;
