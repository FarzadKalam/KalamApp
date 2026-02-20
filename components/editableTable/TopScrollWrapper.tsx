import React, { useEffect, useRef } from 'react';

interface TopScrollWrapperProps {
  children: React.ReactNode;
}

const TopScrollWrapper: React.FC<TopScrollWrapperProps> = ({ children }) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const topInnerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const top = topRef.current;
    const topInner = topInnerRef.current;
    if (!wrapper || !top || !topInner) return;

    const body = wrapper.querySelector('.ant-table-body') as HTMLElement | null;
    if (!body) return;

    const syncWidth = () => {
      topInner.style.width = `${body.scrollWidth}px`;
    };

    const handleTopScroll = () => {
      body.scrollLeft = top.scrollLeft;
    };

    const handleBodyScroll = () => {
      top.scrollLeft = body.scrollLeft;
    };

    syncWidth();
    const timer = setTimeout(syncWidth, 0);
    top.addEventListener('scroll', handleTopScroll);
    body.addEventListener('scroll', handleBodyScroll);
    window.addEventListener('resize', syncWidth);

    return () => {
      clearTimeout(timer);
      top.removeEventListener('scroll', handleTopScroll);
      body.removeEventListener('scroll', handleBodyScroll);
      window.removeEventListener('resize', syncWidth);
    };
  }, [children]);

  return (
    <div ref={wrapperRef} className="top-scroll-wrapper inline-block max-w-full">
      <div ref={topRef} className="w-full overflow-x-auto overflow-y-hidden h-2">
        <div ref={topInnerRef} className="h-1" />
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
};

export default TopScrollWrapper;
