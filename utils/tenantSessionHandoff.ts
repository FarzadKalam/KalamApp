import { supabase, SUPABASE_AUTH_STORAGE_KEY } from '../supabaseClient';

const HANDOFF_CHANNEL = 'tazesystem-tenant-session-v1';
const APP_ORIGIN = 'https://app.tazesystem.ir';

export const getTenantHandoffOrigin = (host: string): string => {
  const normalized = String(host || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(normalized)
    || normalized.includes('..') || !normalized.endsWith('.tazesystem.ir')) {
    throw new Error('آدرس سازمان معتبر نیست.');
  }
  const url = new URL(`https://${normalized}`);
  if (url.hostname !== normalized || url.port || url.username || url.password) {
    throw new Error('آدرس سازمان معتبر نیست.');
  }
  return url.origin;
};

/** Session tokens are sent to the selected origin in memory, never in a URL. */
export const handoffSessionToTenant = async (host: string, orgId: string): Promise<void> => {
  if (window.location.origin !== APP_ORIGIN) throw new Error('ورود مستقیم فقط از صفحه ورود تازه سیستم انجام می‌شود.');
  const origin = getTenantHandoffOrigin(host);
  if (origin === APP_ORIGIN || origin === 'https://kalam.tazesystem.ir') {
    throw new Error('آدرس سازمان معتبر نیست.');
  }
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token || !data.session.refresh_token) {
    throw new Error('نشست ورود پیدا نشد. دوباره وارد شوید.');
  }

  await new Promise<void>((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    frame.setAttribute('aria-hidden', 'true');
    frame.src = `${origin}/auth/handoff`;
    let sent = false;
    let finished = false;
    const finish = (failure?: Error) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      frame.remove();
      if (failure) reject(failure);
      else resolve();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      const message = event.data;
      if (message?.channel !== HANDOFF_CHANNEL) return;
      if (message.type === 'ready' && !sent) {
        sent = true;
        frame.contentWindow?.postMessage({
          channel: HANDOFF_CHANNEL,
          type: 'session',
          orgId,
          accessToken: data.session!.access_token,
          refreshToken: data.session!.refresh_token,
        }, origin);
      } else if (message.type === 'complete' && sent) {
        finish();
      } else if (message.type === 'failed' && sent) {
        finish(new Error('ورود مستقیم به سازمان انجام نشد. دوباره تلاش کنید.'));
      }
    };
    const timeout = window.setTimeout(() => finish(new Error('اتصال به آدرس سازمان برقرار نشد. دوباره تلاش کنید.')), 15000);
    window.addEventListener('message', onMessage);
    document.body.appendChild(frame);
  });

  // The destination now owns this session. Leaving the same refresh token in
  // app.tazesystem.ir would cause a stale-token error when it is rotated there.
  await supabase.auth.stopAutoRefresh();
  window.localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
};

export const receiveTenantSessionHandoff = (): (() => void) => {
  // This endpoint only accepts a parent on the dedicated sign-in origin.
  if (window.parent === window || window.location.origin === APP_ORIGIN) return () => undefined;
  let busy = false;
  const onMessage = async (event: MessageEvent) => {
    if (event.origin !== APP_ORIGIN || event.source !== window.parent) return;
    const message = event.data;
    if (busy || message?.channel !== HANDOFF_CHANNEL || message.type !== 'session') return;
    busy = true;
    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: String(message.accessToken || ''),
        refresh_token: String(message.refreshToken || ''),
      });
      if (error || !data.user?.id) throw error || new Error('نشست معتبر نیست.');
      const { data: accesses, error: accessError } = await supabase.rpc('get_current_user_organization_accesses');
      if (accessError || !Array.isArray(accesses) || !accesses.some((item) =>
        item.org_id === message.orgId && String(item.resolved_host || '').toLowerCase() === window.location.hostname.toLowerCase()
      )) throw accessError || new Error('دسترسی به این سازمان تایید نشد.');
      window.parent.postMessage({ channel: HANDOFF_CHANNEL, type: 'complete' }, APP_ORIGIN);
    } catch {
      window.parent.postMessage({ channel: HANDOFF_CHANNEL, type: 'failed' }, APP_ORIGIN);
    }
  };
  window.addEventListener('message', onMessage);
  window.parent.postMessage({ channel: HANDOFF_CHANNEL, type: 'ready' }, APP_ORIGIN);
  return () => window.removeEventListener('message', onMessage);
};
