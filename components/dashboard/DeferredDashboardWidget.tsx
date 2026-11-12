import React, { Suspense, useEffect, useRef, useState } from 'react';
import DashboardWidgetLoading, { type DashboardLoadingProps } from './DashboardWidgetLoading';

/** Mount expensive lower widgets only when they approach the workspace viewport. */
export default function DeferredDashboardWidget({ children, ...props }: React.PropsWithChildren<DashboardLoadingProps>) {
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const containerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (visible || !containerRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true);observer.disconnect(); }
    }, { rootMargin: '240px' });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [visible]);
  const fallback = <DashboardWidgetLoading {...props} containerRef={containerRef} />;
  return visible ? <Suspense fallback={fallback}>{children}</Suspense> : fallback;
}
