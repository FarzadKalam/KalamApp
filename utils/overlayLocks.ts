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
  // Never change document-level interaction state while a visible overlay owns
  // it. Releasing it early lets a closing/opening Drawer leave the document in
  // an inconsistent state on mobile browsers.
  if (hasVisibleBlockingOverlay()) return;

  // Ant Design may keep a faded mask mounted until an animation completes.
  // A transparent mask can still absorb every tap and looks exactly like a
  // frozen page, so make only non-visible remnants inert.
  document.querySelectorAll<HTMLElement>('.ant-drawer-mask, .ant-modal-mask').forEach((mask) => {
    if (!isElementVisible(mask) && mask.style.pointerEvents !== 'none') {
      mask.style.pointerEvents = 'none';
    }
  });
  document.documentElement.style.pointerEvents = '';
  document.body.style.pointerEvents = '';
  document.body.style.touchAction = '';
  document.body.style.userSelect = '';

  document.body.classList.remove('ant-scrolling-effect');
  document.body.style.overflow = '';
  document.body.style.overflowX = '';
  document.body.style.overflowY = '';
  document.body.style.position = '';
  document.body.style.width = '';
  document.body.style.paddingRight = '';
  document.body.style.paddingLeft = '';
};

export const scheduleOverlayLockRelease = (delay = 180) => {
  if (typeof window === 'undefined') return undefined;
  const timers = [delay, delay + 180, delay + 420].map((timeout) => window.setTimeout(() => {
    releaseTransientOverlayLocks();
    window.requestAnimationFrame(() => releaseTransientOverlayLocks());
  }, timeout));
  return () => timers.forEach((timer) => window.clearTimeout(timer));
};
