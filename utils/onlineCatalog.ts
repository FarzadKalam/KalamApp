import type { SupabaseClient } from '@supabase/supabase-js';
import { MODULES } from '../moduleRegistry';
import { fetchCurrentUserRoleContext } from './permissions';

export const ONLINE_CATALOG_FEATURE = 'online_catalog';
export const ONLINE_CATALOG_MODULE_IDS = ['products', 'billboards', 'price_lists', 'product_bundles'] as const;
export type OnlineCatalogModuleId = (typeof ONLINE_CATALOG_MODULE_IDS)[number];
export type OnlineCatalogTemplateId = 'catalog_grid' | 'catalog_fullpage';

export type OnlineCatalogRow = {
  id: string;
  org_id?: string | null;
  module_id: OnlineCatalogModuleId;
  title: string;
  public_description?: string | null;
  internal_description?: string | null;
  template_id: OnlineCatalogTemplateId;
  is_active: boolean;
  public_token: string;
  source_record_ids: string[];
  display_field_keys: string[];
  presentation: Record<string, any>;
  tags: any[];
  record_count: number;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  last_refreshed_at: string;
};

export const isOnlineCatalogModule = (moduleId?: string | null): moduleId is OnlineCatalogModuleId =>
  ONLINE_CATALOG_MODULE_IDS.includes(String(moduleId || '').trim() as OnlineCatalogModuleId);

export const getOnlineCatalogModuleTitle = (moduleId: string) =>
  String(MODULES[moduleId]?.titles?.fa || moduleId || 'ماژول').replace(/^مدیریت\s+/u, '');

const isCatalogDisplayField = (moduleId: string, field: any) => {
  const key = String(field?.key || '').trim();
  if (!key || key === 'product_id' || key === 'process_template_id') return false;
  if (moduleId === 'price_lists' && ['buy_price', 'profit_percentage'].includes(key)) return false;
  return field?.type !== 'json' && field?.type !== 'image' && field?.nature !== 'system' && field?.printable !== false;
};

/**
 * Fields that may be published for a catalog.  Price lists and packages are
 * catalogues of their table rows, so their row columns are included alongside
 * ordinary module fields.
 */
export const getOnlineCatalogDisplayFields = (moduleId: string) => {
  const moduleConfig = MODULES[moduleId];
  const moduleFields = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [];
  const rowFields = ['price_lists', 'product_bundles'].includes(moduleId)
    ? (Array.isArray(moduleConfig?.blocks) ? moduleConfig.blocks : [])
      .flatMap((block: any) => Array.isArray(block?.tableColumns) ? block.tableColumns : [])
      .map((field: any) => ({
        ...field,
        labels: field?.labels || { fa: field?.title || field?.key },
      }))
    : [];
  const uniqueFields = new Map<string, any>();
  [...moduleFields, ...rowFields].forEach((field: any) => {
    const key = String(field?.key || '').trim();
    if (key && !uniqueFields.has(key) && isCatalogDisplayField(moduleId, field)) uniqueFields.set(key, field);
  });
  return Array.from(uniqueFields.values());
};

const normalizeRow = (row: any): OnlineCatalogRow => ({
  ...row,
  source_record_ids: Array.isArray(row?.source_record_ids) ? row.source_record_ids.map(String) : [],
  display_field_keys: Array.isArray(row?.display_field_keys) ? row.display_field_keys.map(String) : [],
  presentation: row?.presentation && typeof row.presentation === 'object' ? row.presentation : {},
  tags: Array.isArray(row?.tags) ? row.tags : [],
  record_count: Number(row?.record_count || 0),
  is_active: row?.is_active !== false,
});

export const listOnlineCatalogs = async (
  client: SupabaseClient,
  moduleId?: string | null,
  options?: { activeOnly?: boolean }
) => {
  let query = client
    .from('online_catalogs')
    .select('id,org_id,module_id,title,public_description,internal_description,template_id,is_active,public_token,source_record_ids,display_field_keys,presentation,tags,record_count,created_by,updated_by,created_at,updated_at,last_refreshed_at')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (moduleId && isOnlineCatalogModule(moduleId)) query = query.eq('module_id', moduleId);
  if (options?.activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []).map(normalizeRow);
  try {
    const { data: liveCounts } = await client.rpc('list_online_catalog_live_counts');
    const counts = new Map((Array.isArray(liveCounts) ? liveCounts : []).map((item: any) => [String(item?.catalog_id || ''), Number(item?.live_count || 0)]));
    return rows.map((row) => ({ ...row, record_count: counts.has(row.id) ? Number(counts.get(row.id) || 0) : row.record_count }));
  } catch {
    return rows;
  }
};

export const saveOnlineCatalog = async (
  client: SupabaseClient,
  payload: Partial<OnlineCatalogRow> & Pick<OnlineCatalogRow, 'module_id' | 'title'>
) => {
  const role = await fetchCurrentUserRoleContext(client as any);
  const userId = String(role?.userId || '').trim() || null;
  const sourceIds = Array.from(new Set((payload.source_record_ids || []).map((value) => String(value || '').trim()).filter(Boolean)));
  const body: Record<string, any> = {
    module_id: payload.module_id,
    title: String(payload.title || '').trim() || getOnlineCatalogModuleTitle(payload.module_id),
    public_description: payload.public_description || null,
    internal_description: payload.internal_description || null,
    template_id: payload.template_id || 'catalog_grid',
    is_active: payload.is_active !== false,
    source_record_ids: sourceIds,
    display_field_keys: Array.from(new Set((payload.display_field_keys || []).map((value) => String(value || '').trim()).filter(Boolean))),
    presentation: payload.presentation || {},
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    updated_by: userId,
  };
  if (payload.id) {
    const { data, error } = await client.from('online_catalogs').update(body).eq('id', payload.id).select('*').single();
    if (error) throw error;
    return normalizeRow(data);
  }
  const { data, error } = await client.from('online_catalogs').insert({ ...body, created_by: userId }).select('*').single();
  if (error) throw error;
  return normalizeRow(data);
};

export const setOnlineCatalogActive = async (client: SupabaseClient, id: string, active: boolean) => {
  const { data, error } = await client.from('online_catalogs').update({ is_active: active }).eq('id', id).select('*').single();
  if (error) throw error;
  return normalizeRow(data);
};

export const buildOnlineCatalogPath = (token: string) => `/c/${encodeURIComponent(String(token || '').trim())}`;

export const resolveOnlineCatalogPublicOrigin = async (client: SupabaseClient) => {
  try {
    const role = await fetchCurrentUserRoleContext(client as any);
    const orgId = String(role?.orgId || '').trim();
    if (orgId) {
      const { data } = await client.from('saas_org_settings').select('resolved_host').eq('org_id', orgId).maybeSingle();
      const host = String(data?.resolved_host || '').trim();
      if (host && typeof window !== 'undefined') return `https://${host}`;
    }
  } catch {
    // Fall through to the current tenant origin.
  }
  return typeof window !== 'undefined' ? String(window.location.origin || '').replace(/\/+$/, '') : '';
};

export const buildOnlineCatalogPublicUrl = async (client: SupabaseClient, token: string) => {
  const origin = await resolveOnlineCatalogPublicOrigin(client);
  return `${origin}${buildOnlineCatalogPath(token)}`;
};

const SHORT_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const generateOnlineCatalogShortCode = (length = 7) => {
  const values = new Uint32Array(length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else values.forEach((_, index) => { values[index] = Math.floor(Math.random() * 0xffffffff); });
  return Array.from(values).map((value) => SHORT_CODE_ALPHABET[value % SHORT_CODE_ALPHABET.length]).join('');
};

export const getOrCreateShortOnlineCatalogUrl = async (client: SupabaseClient, catalog: Pick<OnlineCatalogRow, 'id' | 'module_id' | 'public_token' | 'org_id' | 'title'>) => {
  const catalogId = String(catalog?.id || '').trim();
  const targetUrl = await buildOnlineCatalogPublicUrl(client, catalog.public_token);
  if (!catalogId || !targetUrl) return targetUrl;
  try {
    const { data: existing, error: existingError } = await client
      .from('short_links')
      .select('code')
      .eq('link_type', 'generic')
      .contains('metadata', { kind: 'online_catalog', catalog_id: catalogId })
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    const origin = (() => { try { return new URL(targetUrl).origin; } catch { return typeof window !== 'undefined' ? window.location.origin : ''; } })();
    if (existing?.code) return `${origin}/r/${encodeURIComponent(String(existing.code))}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data, error } = await client.from('short_links').insert({
        org_id: catalog.org_id || undefined,
        code: generateOnlineCatalogShortCode(),
        link_type: 'generic',
        target_url: targetUrl,
        module_id: catalog.module_id,
        title: catalog.title,
        metadata: { kind: 'online_catalog', catalog_id: catalogId },
      }).select('code').single();
      if (!error && data?.code) return `${origin}/r/${encodeURIComponent(String(data.code))}`;
      if (String(error?.code || '') === '23505') continue;
      throw error;
    }
  } catch (error) {
    console.warn('Could not create short online catalog link', error);
  }
  return targetUrl;
};

export const getPublicOnlineCatalog = async (client: SupabaseClient, token: string) => {
  const { data, error } = await client.rpc('get_public_online_catalog', { p_token: String(token || '').trim() });
  if (error) throw error;
  return data && typeof data === 'object' ? data : { error: 'not_found' };
};
