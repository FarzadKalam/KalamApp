import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMobileComposerViewport, shouldSubmitComposerOnEnter } from './composeKeyboard';

describe('composeKeyboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not submit composer messages with Enter on mobile-like viewports', () => {
    expect(shouldSubmitComposerOnEnter({ shiftKey: false }, true)).toBe(false);
    expect(shouldSubmitComposerOnEnter({ shiftKey: true }, true)).toBe(false);
  });

  it('submits with plain Enter on desktop and keeps Shift+Enter as newline', () => {
    expect(shouldSubmitComposerOnEnter({ shiftKey: false }, false)).toBe(true);
    expect(shouldSubmitComposerOnEnter({ shiftKey: true }, false)).toBe(false);
  });

  it('detects coarse pointers as mobile composer viewports', () => {
    vi.stubGlobal('window', {
      innerWidth: 1024,
      matchMedia: vi.fn(() => ({ matches: true })),
    });

    expect(isMobileComposerViewport()).toBe(true);
  });
});
