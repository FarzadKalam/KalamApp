import { describe, expect, it } from 'vitest';
import { resolveSidebarLayout, SIDEBAR_LAYOUT } from './sidebarLayout';

describe('sidebar workspace reservation', () => {
  it('reserves the attached panel only for the desktop dashboard', () => {
    expect(resolveSidebarLayout('/', false, false)).toEqual({ mode: 'push', reservedWidth: SIDEBAR_LAYOUT.railWidth + SIDEBAR_LAYOUT.panelWidth + SIDEBAR_LAYOUT.contentGap });
    expect(resolveSidebarLayout('/', false, true).reservedWidth).toBe(SIDEBAR_LAYOUT.railWidth);
    for (const route of ['/customers', '/customers/create', '/ai', '/messages', '/hr', '/taze-system/orgs']) {
      expect(resolveSidebarLayout(route, false, false)).toEqual({ mode: 'overlay', reservedWidth: SIDEBAR_LAYOUT.railWidth });
    }
  });
  it('never squeezes mobile pages behind a touch drawer', () => {
    expect(resolveSidebarLayout('/', true, false)).toEqual({ mode: 'overlay', reservedWidth: 0 });
    expect(resolveSidebarLayout('/customers', true, true).reservedWidth).toBe(0);
  });
});
