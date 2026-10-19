import { afterEach, describe, expect, it } from 'vitest';
import { releaseTransientOverlayLocks } from './overlayLocks';

describe('releaseTransientOverlayLocks', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');
  });

  it('keeps the document locked while a Drawer is entering at zero opacity', () => {
    const drawer = document.createElement('div');
    drawer.className = 'ant-drawer-open';
    drawer.style.cssText = 'width: 320px; height: 400px; opacity: 0;';
    drawer.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 400,
      width: 320, height: 400, toJSON: () => ({}),
    });
    document.body.appendChild(drawer);
    document.body.style.overflow = 'hidden';
    document.body.classList.add('ant-scrolling-effect');

    releaseTransientOverlayLocks();

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.classList.contains('ant-scrolling-effect')).toBe(true);
  });
});
