const OVERLAY_ROOT_SELECTOR = [
  '.ant-modal-root',
  '.ant-drawer-root',
].join(', ');

const OVERLAY_HOST_SELECTOR = [
  OVERLAY_ROOT_SELECTOR,
  '.ant-modal-wrap',
  '.ant-modal',
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

const VIEWPORT_SENSITIVE_OVERLAY_SELECTOR = [
  '.ant-modal',
  '.ant-modal-wrap',
  '.ant-drawer',
  '.ant-drawer-content',
  '.ant-drawer-content-wrapper',
  '.ant-popover',
  '.ant-popconfirm',
  '.ant-tooltip',
  '.ant-dropdown',
].join(', ');

export const KALAM_SELECT_FIELD_CLASSNAME = 'kalam-select-field';
export type AdaptivePickerMode = 'auto' | 'desktop' | 'mobile-sheet';
export const KALAM_POPUP_ROOT_Z_INDEX = 40000;

export const mergeClassNames = (...parts: Array<string | null | undefined | false>) =>
  parts.filter(Boolean).join(' ');

const KALAM_POPUP_ROOT_ID = 'kalam-popup-root';

const getKalamPopupRoot = () => {
  let root = document.getElementById(KALAM_POPUP_ROOT_ID);
  if (root) {
    root.style.setProperty('--kalam-popup-root-z-index', String(KALAM_POPUP_ROOT_Z_INDEX));
    root.style.zIndex = String(KALAM_POPUP_ROOT_Z_INDEX);
    return root;
  }

  root = document.createElement('div');
  root.id = KALAM_POPUP_ROOT_ID;
  root.style.setProperty('--kalam-popup-root-z-index', String(KALAM_POPUP_ROOT_Z_INDEX));
  root.style.zIndex = String(KALAM_POPUP_ROOT_Z_INDEX);
  document.body.appendChild(root);
  return root;
};

export const resolveOverlayPopupContainer = (triggerNode?: HTMLElement | null) => {
  if (typeof document === 'undefined') {
    return (triggerNode || {}) as HTMLElement;
  }

  if (!triggerNode) return getKalamPopupRoot();

  const viewportSensitiveHost = triggerNode.closest(VIEWPORT_SENSITIVE_OVERLAY_SELECTOR) as HTMLElement | null;
  if (viewportSensitiveHost) return getKalamPopupRoot();

  const stableOverlayHost = triggerNode.closest(OVERLAY_HOST_SELECTOR) as HTMLElement | null;
  return stableOverlayHost || getKalamPopupRoot();
};

/**
 * برای کنترل‌های داخل Modal/Drawer، popup را در همان overlay نگه می‌دارد تا
 * زیر لایهٔ مودال دیگری قرار نگیرد و موقعیت آن با اسکرول محتوا هماهنگ بماند.
 */
export const resolveModalPopupContainer = (triggerNode?: HTMLElement | null) => {
  if (typeof document === 'undefined') {
    return (triggerNode || {}) as HTMLElement;
  }

  const modalBodyHost = triggerNode?.closest?.('.ant-modal-body, .ant-modal-content, .ant-modal, .ant-drawer-body, .ant-drawer-content') as HTMLElement | null;
  return modalBodyHost || resolveOverlayPopupContainer(triggerNode);
};

export const resolveStableOverlayRoot = (hostNode?: HTMLElement | null) => {
  if (typeof document === 'undefined') {
    return (hostNode || {}) as HTMLElement;
  }

  if (!hostNode) return getKalamPopupRoot();
  if (hostNode === document.body) return hostNode;

  if (hostNode.matches(OVERLAY_ROOT_SELECTOR)) {
    return hostNode;
  }

  const stableRoot = hostNode.closest(OVERLAY_ROOT_SELECTOR) as HTMLElement | null;
  return stableRoot || hostNode;
};

const parseComputedZIndex = (node?: HTMLElement | null) => {
  if (typeof window === 'undefined' || !node) return null;
  const value = Number.parseInt(window.getComputedStyle(node).zIndex || '', 10);
  return Number.isFinite(value) ? value : null;
};

export const resolveParentOverlayZIndex = (triggerNode?: HTMLElement | null, fallback = 1000) => {
  if (typeof window === 'undefined') return fallback;

  const seen = new Set<HTMLElement>();
  const candidates: HTMLElement[] = [];
  let current = triggerNode || null;

  while (current) {
    if (
      current.matches?.(OVERLAY_HOST_SELECTOR)
      || current.matches?.('.ant-modal-wrap')
      || current.matches?.('.ant-modal-mask')
    ) {
      if (!seen.has(current)) {
        seen.add(current);
        candidates.push(current);
      }
    }
    current = current.parentElement;
  }

  const resolved = candidates
    .map((node) => parseComputedZIndex(node))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return resolved.length > 0
    ? Math.max(fallback, ...resolved)
    : fallback;
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

export const isMobileAdaptiveViewport = () =>
  typeof window !== 'undefined' && window.innerWidth <= 768;

export const resolveAdaptivePickerMode = (
  adaptiveMode: AdaptivePickerMode = 'auto'
): Exclude<AdaptivePickerMode, 'auto'> => {
  if (adaptiveMode === 'desktop' || adaptiveMode === 'mobile-sheet') {
    return adaptiveMode;
  }
  return isMobileAdaptiveViewport() ? 'mobile-sheet' : 'desktop';
};

export const buildOverlayZIndexBase = (base = 1400) => ({
  base,
  modal: base + 10,
  popover: base + 20,
  sheet: base + 40,
});
