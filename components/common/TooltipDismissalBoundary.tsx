import { useEffect } from 'react';

const dismissOpenHoverHints = () => {
  document.querySelectorAll<HTMLElement>('.ant-tooltip-open, .ant-popover-open, .ant-dropdown-open').forEach((trigger) => {
    // Ant Design's hover trigger listens for leave. A click can open a modal
    // while the pointer remains over the original icon, so no native leave fires.
    trigger.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    if (typeof PointerEvent !== 'undefined') {
      trigger.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
    }
  });
};

/** Closes only hover tooltips when an action is activated; click popovers stay open. */
const TooltipDismissalBoundary = () => {
  useEffect(() => {
    const onPointerDown = () => dismissOpenHoverHints();
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ')
        && event.target instanceof Element
        && event.target.closest('button, [role="button"], a, input[type="submit"], input[type="button"]')) {
        dismissOpenHoverHints();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
  return null;
};

export default TooltipDismissalBoundary;
