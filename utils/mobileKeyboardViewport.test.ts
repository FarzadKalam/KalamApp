import { describe, expect, it } from 'vitest';
import { resolveMobileKeyboardViewport } from './mobileKeyboardViewport';

describe('resolveMobileKeyboardViewport', () => {
  it('keeps the visual viewport offset while the browser pans to a focused input', () => {
    expect(resolveMobileKeyboardViewport({
      isMobile: true,
      normalViewportHeight: 800,
      visualViewportHeight: 450,
      visualViewportOffsetTop: 100,
      isTextInputFocused: true,
      wasKeyboardVisible: false,
    })).toEqual({
      appViewportHeight: 450,
      keyboardInset: 250,
      keyboardVisible: true,
      viewportOffsetTop: 100,
    });
  });

  it('detects a keyboard when a WebView resizes both viewport measurements', () => {
    expect(resolveMobileKeyboardViewport({
      isMobile: true,
      normalViewportHeight: 800,
      visualViewportHeight: 450,
      visualViewportOffsetTop: 0,
      isTextInputFocused: true,
      wasKeyboardVisible: false,
    }).keyboardVisible).toBe(true);
  });

  it('keeps the keyboard state during its closing animation until the viewport recovers', () => {
    expect(resolveMobileKeyboardViewport({
      isMobile: true,
      normalViewportHeight: 800,
      visualViewportHeight: 730,
      visualViewportOffsetTop: 0,
      isTextInputFocused: false,
      wasKeyboardVisible: true,
    }).keyboardVisible).toBe(true);
  });

  it('does not treat an unfocused mobile viewport as an open keyboard', () => {
    expect(resolveMobileKeyboardViewport({
      isMobile: true,
      normalViewportHeight: 800,
      visualViewportHeight: 450,
      visualViewportOffsetTop: 0,
      isTextInputFocused: false,
      wasKeyboardVisible: false,
    }).keyboardVisible).toBe(false);
  });
});
