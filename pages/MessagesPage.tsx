import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const NotificationsPopover = React.lazy(() => import('../components/NotificationsPopover'));

const MessagesPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const requestedTab = useMemo(() => {
    const tab = String(searchParams.get('tab') || '').trim();
    return tab === 'assistant' ? 'assistant' : undefined;
  }, [searchParams]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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
          requestedTab={requestedTab}
        />
      </Suspense>
    </div>
  );
};

export default MessagesPage;
