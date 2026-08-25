import { useEffect } from 'react';

const isVisible = (element: Element) => {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
};

const hasOpenOverlay = () => (
  Array.from(document.querySelectorAll('.ant-drawer-open')).some(isVisible)
  || Array.from(document.querySelectorAll('.ant-modal-wrap')).some(isVisible)
);

/**
 * The application shell owns scrolling while Ant Design temporarily locks the
 * document for drawers. On some close animations Ant can leave its body lock
 * or an inert mask behind. Recover only after every Drawer and Modal is gone,
 * so active overlays continue to retain their normal protection.
 */
const DrawerInteractionRecovery = () => {
  useEffect(() => {
    let timer: number | undefined;
    const recover = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (hasOpenOverlay()) return;
        if (document.body.classList.contains('ant-scrolling-effect')) {
          document.body.classList.remove('ant-scrolling-effect');
        }
        ['overflow', 'overflow-x', 'overflow-y', 'position', 'width', 'padding-right', 'padding-left'].forEach((property) => {
          if (document.body.style.getPropertyValue(property)) {
            document.body.style.removeProperty(property);
          }
        });
        document.querySelectorAll<HTMLElement>('.ant-drawer-mask').forEach((mask) => {
          if (!isVisible(mask) && mask.style.pointerEvents !== 'none') mask.style.pointerEvents = 'none';
        });
      }, 360);
    };
    const observer = new MutationObserver(recover);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'], childList: true, subtree: true });
    recover();
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);
  return null;
};

export default DrawerInteractionRecovery;
