export type PublicRuntimeConfig = {
  deploymentMode: 'cloud' | 'self_hosted'; supabaseUrl: string; supabaseAnonKey: string;
  installationCode?: string;
};
declare global { interface Window { __KALAMAPP_RUNTIME_CONFIG__?: Partial<PublicRuntimeConfig>; } }

export function resolvePublicRuntimeConfig(runtime: Partial<PublicRuntimeConfig> | undefined, fallback: { url?: string; key?: string }, localRequired = false): PublicRuntimeConfig {
  if (localRequired && (!runtime || Object.keys(runtime).length === 0)) throw new Error('تنظیمات نصب اختصاصی دریافت نشد. اتصال به سرور نصب را بررسی کنید.');
  if (!runtime || Object.keys(runtime).length === 0) return { deploymentMode: 'cloud', supabaseUrl: fallback.url || '', supabaseAnonKey: fallback.key || '' };
  // A broken local configuration must never silently connect a customer to the cloud.
  if (runtime.deploymentMode !== 'self_hosted' || !runtime.supabaseUrl || !runtime.supabaseAnonKey) throw new Error('تنظیمات اتصال نصب اختصاصی کامل نیست.');
  const url = new URL(runtime.supabaseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('نشانی اتصال نصب اختصاصی معتبر نیست.');
  const key = runtime.supabaseAnonKey;
  if (!key.startsWith('sb_publishable_')) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role !== 'anon') throw new Error('private');
    } catch { throw new Error('کلید عمومی نصب اختصاصی معتبر نیست.'); }
  }
  return { deploymentMode: 'self_hosted', supabaseUrl: url.origin, supabaseAnonKey: key, installationCode: runtime.installationCode };
}
export const publicRuntimeConfig = resolvePublicRuntimeConfig(typeof window === 'undefined' ? undefined : window.__KALAMAPP_RUNTIME_CONFIG__, {
  url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY,
}, typeof document !== 'undefined' && document.querySelector('meta[name="kalamapp-deployment"]')?.getAttribute('content') === 'self_hosted');
export const isSelfHostedDeployment = () => publicRuntimeConfig.deploymentMode === 'self_hosted';
