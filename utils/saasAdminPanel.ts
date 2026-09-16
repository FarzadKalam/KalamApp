import type { SupabaseClient } from '@supabase/supabase-js';
import { isSaasAdminPanelHost } from './hostRouting';
import { clearSessionBootstrapCache } from './sessionCache';

/**
 * پنل فروشنده باید همیشه با سازمان مستقل «تازه سیستم» باز شود. RPC سمت سرور
 * هم عضویت مدیر SaaS را کنترل می‌کند و هم انتخاب سازمان جاری را انجام می‌دهد.
 */
export const activateSaasAdminPanelContext = async (client: SupabaseClient) => {
  if (!isSaasAdminPanelHost()) return { activated: false, reason: 'not_panel_host' as const };

  const { data, error } = await client.rpc('activate_saas_admin_panel_context');
  if (error || !(data as any)?.success) {
    return { activated: false, reason: 'access_denied' as const, error };
  }

  clearSessionBootstrapCache();
  return { activated: true, reason: 'activated' as const };
};
