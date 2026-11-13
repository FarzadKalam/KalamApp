export const SIDEBAR_LAYOUT = Object.freeze({ railWidth: 80, panelWidth: 260, contentGap: 12 });

export const resolveSidebarLayout = (pathname: string, isMobile: boolean, collapsed: boolean) => {
  const push = !isMobile && pathname === '/';
  return {
    mode: push ? 'push' as const : 'overlay' as const,
    reservedWidth: isMobile ? 0 : SIDEBAR_LAYOUT.railWidth + (push && !collapsed ? SIDEBAR_LAYOUT.panelWidth + SIDEBAR_LAYOUT.contentGap : 0),
  };
};
