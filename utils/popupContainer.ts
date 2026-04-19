const OVERLAY_HOST_SELECTOR = [
  '.ant-modal-root',
  '.ant-modal-wrap',
  '.ant-modal',
  '.ant-drawer-root',
  '.ant-drawer-content-wrapper',
  '.ant-drawer-content',
  '.ant-drawer',
].join(', ');

const INTERACTIVE_PORTAL_SELECTOR = [
  OVERLAY_HOST_SELECTOR,
  '.ant-popover',
  '.ant-popconfirm',
  '.ant-tooltip',
  '.ant-dropdown',
].join(', ');

export const KALAM_SELECT_FIELD_CLASSNAME = 'kalam-select-field';

export const mergeClassNames = (...parts: Array<string | null | undefined | false>) =>
  parts.filter(Boolean).join(' ');

const KALAM_POPUP_ROOT_ID = 'kalam-popup-root';

const getKalamPopupRoot = () => {
  let root = document.getElementById(KALAM_POPUP_ROOT_ID);
  if (root) return root;

  root = document.createElement('div');
  root.id = KALAM_POPUP_ROOT_ID;
  document.body.appendChild(root);
  return root;
};

export const resolveOverlayPopupContainer = (triggerNode?: HTMLElement | null) => {
  if (typeof document === 'undefined') {
    return (triggerNode || {}) as HTMLElement;
  }

  if (!triggerNode) return getKalamPopupRoot();

  const stableOverlayHost = triggerNode.closest(OVERLAY_HOST_SELECTOR) as HTMLElement | null;
  return stableOverlayHost || getKalamPopupRoot();
};

export const resolveSelectPopupContainer = (triggerNode?: HTMLElement | null) => {
  if (typeof document === 'undefined') {
    return (triggerNode || {}) as HTMLElement;
  }

  if (!triggerNode) return getKalamPopupRoot();

  const interactivePortalHost = triggerNode.closest(INTERACTIVE_PORTAL_SELECTOR) as HTMLElement | null;

  // Select popups with custom footer/popup content remain fully clickable when
  // they are portaled to the body instead of nesting inside another Ant overlay.
  if (interactivePortalHost) return getKalamPopupRoot();

  return getKalamPopupRoot();
};

export const buildStandardSelectPopupRootStyle = ({
  zIndex,
  minWidth = 220,
  maxWidth = 'min(92vw, 520px)',
}: {
  zIndex?: number;
  minWidth?: number;
  maxWidth?: number | string;
} = {}) => ({
  ...(typeof zIndex === 'number' ? { zIndex } : {}),
  minWidth,
  maxWidth,
});
