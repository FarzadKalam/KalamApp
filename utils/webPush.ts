import { supabase } from '../supabaseClient';
import { publicRuntimeConfig } from './runtimeConfig';

export type WebPushState = 'unsupported' | 'unconfigured' | 'denied' | 'prompt' | 'enabled' | 'disabled';

const getApplicationServerKey = () => String(publicRuntimeConfig.webPushPublicKey || '').trim();

const decodeBase64Url = (value: string) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
};

export const getWebPushState = async (): Promise<WebPushState> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  if (!getApplicationServerKey()) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'prompt';
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return 'disabled';
  const { data, error } = await supabase.rpc('has_current_web_push_subscription_v1', { p_endpoint: subscription.endpoint });
  if (error) return 'disabled';
  return data === true ? 'enabled' : 'disabled';
};

export const enableWebPush = async () => {
  const state = await getWebPushState();
  if (state === 'unsupported' || state === 'unconfigured' || state === 'denied') return state;

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'prompt';

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeBase64Url(getApplicationServerKey()),
  });
  const { data, error } = await supabase.rpc('register_web_push_subscription_v1', {
    p_subscription: subscription.toJSON(),
    p_user_agent: navigator.userAgent,
  });
  if (error || data !== true) {
    if (!existing) await subscription.unsubscribe().catch(() => undefined);
    throw error || new Error('ثبت اعلان روی دستگاه انجام نشد.');
  }
  return 'enabled' as const;
};

export const disableWebPush = async () => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported' as const;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return 'disabled' as const;
  const { error } = await supabase.rpc('unregister_web_push_subscription_v1', { p_endpoint: subscription.endpoint });
  if (error) throw error;
  return 'disabled' as const;
};
