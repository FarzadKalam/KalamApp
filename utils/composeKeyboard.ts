export const isMobileComposerViewport = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(max-width: 767px), (pointer: coarse)')?.matches ?? window.innerWidth < 768;
};

export const shouldSubmitComposerOnEnter = (event: { shiftKey?: boolean }, isMobile = isMobileComposerViewport()) => {
  if (isMobile) return false;
  return event.shiftKey !== true;
};
