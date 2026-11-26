/** A selection belongs to this browser tab, never to the person's shared profile. */
const STORAGE_KEY = 'kalam:organization-context';

export const getSelectedOrganizationId = (): string | null => {
  try { return window.sessionStorage.getItem(STORAGE_KEY) || null; } catch { return null; }
};

export const selectOrganizationContext = (orgId: string) => {
  if (!orgId) throw new Error('سازمان انتخاب‌شده معتبر نیست.');
  window.sessionStorage.setItem(STORAGE_KEY, orgId);
};

export const clearOrganizationContext = () => {
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
};

export const withOrganizationClientInfo = (headers: Headers) => {
  const orgId = getSelectedOrganizationId();
  if (orgId) {
    const clientInfo = (headers.get('x-client-info') || 'kalamapp').replace(/;\s*org=[^;]*/g, '');
    headers.set('x-client-info', `${clientInfo}; org=${orgId}`);
  }
  return headers;
};

export const organizationContextFetch: typeof fetch = (input, init) => {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname.startsWith('/rest/v1/') || url.pathname === '/functions/v1/ai-assistant') withOrganizationClientInfo(headers);
  return fetch(input, { ...init, headers });
};
