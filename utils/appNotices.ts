export const LOGIN_NOTICE_STORAGE_KEY = 'kalam_login_notice';

export const setLoginNotice = (message: string) => {
  if (typeof window === 'undefined') return;
  const normalized = String(message || '').trim();
  if (!normalized) return;
  window.sessionStorage.setItem(LOGIN_NOTICE_STORAGE_KEY, normalized);
};

export const consumeLoginNotice = () => {
  if (typeof window === 'undefined') return '';
  const value = String(window.sessionStorage.getItem(LOGIN_NOTICE_STORAGE_KEY) || '').trim();
  if (value) {
    window.sessionStorage.removeItem(LOGIN_NOTICE_STORAGE_KEY);
  }
  return value;
};
