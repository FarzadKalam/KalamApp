export const resolveOverlayPopupContainer = (triggerNode?: HTMLElement | null) => {
  if (typeof document === 'undefined') {
    return (triggerNode || {}) as HTMLElement;
  }

  if (!triggerNode) return document.body;

  const stableOverlayHost = triggerNode.closest(
    [
      '.ant-modal-root',
      '.ant-modal-wrap',
      '.ant-modal',
      '.ant-drawer-root',
      '.ant-drawer-content-wrapper',
      '.ant-drawer-content',
      '.ant-drawer',
    ].join(', ')
  ) as HTMLElement | null;

  return stableOverlayHost || triggerNode.parentElement || document.body;
};
