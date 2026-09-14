import { useEffect } from 'react';
import { scheduleOverlayLockRelease } from '../utils/overlayLocks';

/**
 * The application shell owns scrolling while Ant Design temporarily locks the
 * document for drawers. On some close animations Ant can leave its body lock
 * or an inert mask behind. Recover only after every Drawer and Modal is gone,
 * so active overlays continue to retain their normal protection.
 */
const DrawerInteractionRecovery = () => {
  useEffect(() => {
    let timer: number | undefined;
    let cancelScheduledRecovery: (() => void) | undefined;
    const recover = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        cancelScheduledRecovery?.();
        cancelScheduledRecovery = scheduleOverlayLockRelease();
      }, 80);
    };
    const observer = new MutationObserver(recover);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'], childList: true, subtree: true });
    recover();
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      cancelScheduledRecovery?.();
    };
  }, []);
  return null;
};

export default DrawerInteractionRecovery;
