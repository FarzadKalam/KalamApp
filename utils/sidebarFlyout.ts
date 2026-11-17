// Keep the existing RTL opening direction, then shift the entire popup into the
// visible viewport. Flipping alone cannot fit a tall menu near either edge.
const viewportOverflow = { adjustX: 1, adjustY: 1, shiftX: true, shiftY: true };

export const SIDEBAR_FLYOUT_PLACEMENTS = {
  rightTop: { points: ['tr', 'tl'], overflow: viewportOverflow, htmlRegion: 'visible' as const },
  rightBottom: { points: ['br', 'bl'], overflow: viewportOverflow, htmlRegion: 'visible' as const },
  leftTop: { points: ['tl', 'tr'], overflow: viewportOverflow, htmlRegion: 'visible' as const },
  leftBottom: { points: ['bl', 'br'], overflow: viewportOverflow, htmlRegion: 'visible' as const },
};

export const getSidebarPopupContainer = (trigger: HTMLElement) => trigger.ownerDocument.body;
