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
    // Observe only portal mount/unmounts. Observing the whole application
    // subtree caused a feedback loop: the recovery changed body/mask styles,
    // which triggered another recovery while large SaaS pages were rendering.
    const observer = new MutationObserver(recover);
    observer.observe(document.body, { childList: true });
    document.addEventListener('transitionend', recover, true);
    recover();
    return () => {
      observer.disconnect();
      document.removeEventListener('transitionend', recover, true);
      window.clearTimeout(timer);
      cancelScheduledRecovery?.();
    };
  }, []);
  return null;
};

export default DrawerInteractionRecovery;
