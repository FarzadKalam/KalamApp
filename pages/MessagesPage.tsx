import React, { Suspense, useEffect, useState } from 'react';

const NotificationsPopover = React.lazy(() => import('../components/NotificationsPopover'));

const MessagesPage: React.FC = () => {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Let the chat panels manage their own scroll — remove Layout Content's overflow and mobile padding.
  useEffect(() => {
    const content = document.querySelector('.layout-main-scroll') as HTMLElement | null;
    if (!content) return;
    const prevOverflow = content.style.overflow;
    const prevPaddingBottom = content.style.paddingBottom;
    content.style.overflow = 'hidden';
    content.style.paddingBottom = '0';
    return () => {
      content.style.overflow = prevOverflow;
      content.style.paddingBottom = prevPaddingBottom;
    };
  }, []);

  return (
    <div className="messages-page-root" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Suspense fallback={null}>
        <NotificationsPopover isMobile={isMobile} variant="chat" standalone />
      </Suspense>
    </div>
  );
};

export default MessagesPage;
