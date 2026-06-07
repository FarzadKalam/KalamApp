import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { AI_CONTEXT_EVENT, type AssistantContext } from '../utils/aiAssistantEvents';

const NotificationsPopover = React.lazy(() => import('../components/NotificationsPopover'));

type MessagesTab = 'notes' | 'bot_messages' | 'sms_messages' | 'voip_calls' | 'assistant';
const MESSAGE_TABS = new Set<MessagesTab>(['notes', 'bot_messages', 'sms_messages', 'voip_calls', 'assistant']);

const MessagesPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const requestedTab = useMemo(() => {
    const tab = String(searchParams.get('tab') || '').trim();
    return MESSAGE_TABS.has(tab as MessagesTab) ? tab as MessagesTab : undefined;
  }, [searchParams]);
  const requestedConversationKey = String(searchParams.get('conversation') || '').trim() || undefined;
  const requestedBotGroupId = String(searchParams.get('botGroup') || '').trim() || undefined;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const context = (location.state as { assistantContext?: AssistantContext } | null)?.assistantContext;
    if (!context || requestedTab !== 'assistant') return;
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent(AI_CONTEXT_EVENT, { detail: context }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.state, requestedTab]);

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
        <NotificationsPopover
          isMobile={isMobile}
          variant="chat"
          standalone
          managedByRuntime
          requestedTab={requestedTab}
          requestedConversationKey={requestedConversationKey}
          requestedBotGroupId={requestedBotGroupId}
        />
      </Suspense>
    </div>
  );
};

export default MessagesPage;
