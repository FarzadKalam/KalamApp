const isElementVisible = (element: Element) => {
  if (typeof window === 'undefined') return false;
  const node = element as HTMLElement;
  const style = window.getComputedStyle(node);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const hasVisibleBlockingOverlay = () => {
  if (typeof document === 'undefined') return false;
  return Array.from(document.querySelectorAll('.ant-drawer-open, .ant-modal-wrap'))
    .some(isElementVisible);
};

export const releaseTransientOverlayLocks = () => {
  if (typeof document === 'undefined') return;
  document.documentElement.style.pointerEvents = '';
  document.body.style.pointerEvents = '';
  document.body.style.touchAction = '';
  document.body.style.userSelect = '';

  if (hasVisibleBlockingOverlay()) return;
  document.body.classList.remove('ant-scrolling-effect');
  document.body.style.overflow = '';
  document.body.style.width = '';
};

export const scheduleOverlayLockRelease = (delay = 180) => {
  if (typeof window === 'undefined') return undefined;
  const first = window.setTimeout(() => {
    releaseTransientOverlayLocks();
    window.requestAnimationFrame(() => releaseTransientOverlayLocks());
  }, delay);
  return () => window.clearTimeout(first);
};
