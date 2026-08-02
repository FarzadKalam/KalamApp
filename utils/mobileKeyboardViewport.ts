export type MobileKeyboardViewportInput = {
  isMobile: boolean;
  visualViewportHeight: number;
  visualViewportOffsetTop: number;
  normalViewportHeight: number;
  isTextInputFocused: boolean;
  wasKeyboardVisible: boolean;
};

export type MobileKeyboardViewportState = {
  appViewportHeight: number;
  keyboardInset: number;
  keyboardVisible: boolean;
  viewportOffsetTop: number;
};

const KEYBOARD_OPEN_THRESHOLD = 120;
const KEYBOARD_CLOSE_THRESHOLD = 48;

/**
 * ارتفاع مرجع مستقل از رفتار مرورگر است: بعضی مرورگرها فقط visual viewport
 * و بعضی WebViewها هر دو viewport را هنگام بازشدن کیبورد کوچک می‌کنند.
 */
export const resolveMobileKeyboardViewport = ({
  isMobile,
  visualViewportHeight,
  visualViewportOffsetTop,
  normalViewportHeight,
  isTextInputFocused,
  wasKeyboardVisible,
}: MobileKeyboardViewportInput): MobileKeyboardViewportState => {
  const appViewportHeight = Math.max(0, Math.round(visualViewportHeight));
  const visibleViewportBottom = Math.max(0, Math.round(visualViewportHeight + visualViewportOffsetTop));
  const keyboardInset = Math.max(0, Math.round(normalViewportHeight) - visibleViewportBottom);
  const keyboardVisible = isMobile && (
    (isTextInputFocused && keyboardInset > KEYBOARD_OPEN_THRESHOLD)
    || (wasKeyboardVisible && keyboardInset > KEYBOARD_CLOSE_THRESHOLD)
  );

  return {
    appViewportHeight,
    keyboardInset: keyboardVisible ? keyboardInset : 0,
    keyboardVisible,
    viewportOffsetTop: keyboardVisible ? Math.max(0, Math.round(visualViewportOffsetTop)) : 0,
  };
};
