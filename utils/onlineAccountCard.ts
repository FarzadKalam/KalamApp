import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCurrentUserRoleContext } from './permissions';
import { hasOnlineCatalogFeature } from './onlineCatalogs';
import { resolveOnlineCatalogPublicOrigin } from './onlineCatalog';

export type OnlineAccountCardEntityType = 'customer' | 'supplier' | 'employee';

export type OnlineAccountCard = {
  id: string;
  org_id?: string | null;
  entity_type: OnlineAccountCardEntityType;
  entity_id: string;
  title: string;
  is_active: boolean;
  public_token: string;
  created_at: string;
  updated_at: string;
};

const normalizeCard = (row: any): OnlineAccountCard => ({
  ...row,
  entity_type: String(row?.entity_type || 'customer') as OnlineAccountCardEntityType,
  entity_id: String(row?.entity_id || ''),
  title: String(row?.title || 'کارت حساب آنلاین'),
  is_active: row?.is_active !== false,
  public_token: String(row?.public_token || ''),
});

export const buildOnlineAccountCardPath = (token: string) => `/account/${encodeURIComponent(String(token || '').trim())}`;

export const buildOnlineAccountCardPublicUrl = async (client: SupabaseClient, token: string) => {
  const origin = await resolveOnlineCatalogPublicOrigin(client);
  return token ? `${origin}${buildOnlineAccountCardPath(token)}` : '';
};

export const findOnlineAccountCard = async (
  client: SupabaseClient,
  entityType: OnlineAccountCardEntityType,
  entityId: string,
) => {
  const { data, error } = await client
    .from('online_account_cards')
    .select('id,org_id,entity_type,entity_id,title,is_active,public_token,created_at,updated_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeCard(data) : null;
};

export const getOrCreateOnlineAccountCard = async (
  client: SupabaseClient,
  args: { entityType: OnlineAccountCardEntityType; entityId: string; title: string },
) => {
  const existing = await findOnlineAccountCard(client, args.entityType, args.entityId);
  if (existing) return existing;
  const featureEnabled = await hasOnlineCatalogFeature();
  if (!featureEnabled) throw new Error('فعال‌سازی کارت حساب آنلاین به ویژگی کاتالوگ آنلاین در پلن سازمان نیاز دارد.');
  const role = await fetchCurrentUserRoleContext(client as any);
  const { data, error } = await client
    .from('online_account_cards')
    .insert({
      entity_type: args.entityType,
      entity_id: args.entityId,
      title: String(args.title || 'کارت حساب آنلاین').trim() || 'کارت حساب آنلاین',
      created_by: String(role?.userId || '').trim() || null,
      updated_by: String(role?.userId || '').trim() || null,
    })
    .select('id,org_id,entity_type,entity_id,title,is_active,public_token,created_at,updated_at')
    .single();
  if (!error && data) return normalizeCard(data);
  // Unique index makes concurrent clicks safe; read the winner instead of showing a false error.
  if (String((error as any)?.code || '') === '23505') {
    const concurrentCard = await findOnlineAccountCard(client, args.entityType, args.entityId);
    if (concurrentCard) return concurrentCard;
  }
  throw error;
};

export const getPublicOnlineAccountCard = async (client: SupabaseClient, token: string) => {
  const { data, error } = await client.rpc('get_public_online_account_card', { p_token: String(token || '').trim() });
  if (error) throw error;
  return data && typeof data === 'object' ? data : { error: 'not_found' };
};
