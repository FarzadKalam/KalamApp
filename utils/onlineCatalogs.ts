import { supabase } from '../supabaseClient';
import { hasCurrentOrgPlanFeature } from './saasPlanFeatures';

export const ONLINE_CATALOG_FEATURE = 'online_catalog';
export const ONLINE_CATALOG_MODULE_IDS = ['products', 'billboards', 'price_lists', 'product_bundles'] as const;
export type OnlineCatalogModuleId = typeof ONLINE_CATALOG_MODULE_IDS[number];
export type OnlineCatalogUpdateMode = 'static' | 'live';

export const isOnlineCatalogModule = (moduleId: string): moduleId is OnlineCatalogModuleId =>
  (ONLINE_CATALOG_MODULE_IDS as readonly string[]).includes(String(moduleId || '').trim());

export const hasOnlineCatalogFeature = (options?: { force?: boolean }) =>
  hasCurrentOrgPlanFeature(ONLINE_CATALOG_FEATURE, { ...options, defaultEnabled: false });

export const buildOnlineCatalogPath = (token: string) => `/c/${String(token || '').trim()}`;

export const buildOnlineCatalogUrl = async (catalog: { public_token?: string | null; org_id?: string | null }) => {
  const path = buildOnlineCatalogPath(String(catalog?.public_token || '').trim());
  if (!String(catalog?.public_token || '').trim()) return '';
  const orgId = String(catalog?.org_id || '').trim();
  if (!orgId || typeof window === 'undefined') return `${typeof window !== 'undefined' ? window.location.origin : ''}${path}`;
  const { data } = await supabase
    .from('saas_org_settings')
    .select('resolved_host')
    .eq('org_id', orgId)
    .maybeSingle();
  const host = String(data?.resolved_host || '').trim().toLowerCase();
  return host ? `https://${host}${path}` : `${window.location.origin}${path}`;
};

export const buildOnlineCatalogSnapshot = (records: Array<Record<string, any>>, fieldKeys: string[]) =>
  (records || []).map((record) => ({
    title: String(record?.name || record?.address || record?.title || '').trim() || 'بدون عنوان',
    image_url: record?.image_url || null,
    status: record?.status || null,
    location: record?.location || null,
    fields: Object.fromEntries((fieldKeys || []).map((key) => [key, record?.[key]])),
  }));
