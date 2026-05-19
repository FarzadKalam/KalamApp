import type { SupabaseClient } from '@supabase/supabase-js';
import { getResolvedCurrentOrgId } from './companySettings';

type LoadScopedIntegrationSettingsOptions = {
  connectionType: string;
  provider?: string | null;
  isActive?: boolean;
  columns?: string;
};

type ListScopedIntegrationSettingsOptions = {
  connectionTypes: string[];
  columns?: string;
  isActive?: boolean;
};

export const loadScopedIntegrationSettings = async (
  supabase: SupabaseClient,
  options: LoadScopedIntegrationSettingsOptions,
) => {
  const currentOrgId = await getResolvedCurrentOrgId(supabase);
  let query = supabase
    .from('integration_settings')
    .select(options.columns || '*')
    .eq('connection_type', options.connectionType)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (options.provider !== undefined) {
    query = query.eq('provider', options.provider);
  }
  if (options.isActive !== undefined) {
    query = query.eq('is_active', options.isActive);
  }

  query = currentOrgId
    ? query.eq('org_id', currentOrgId)
    : query.is('org_id', null);

  let result = await query.maybeSingle();

  if (!result.error && result.data) {
    return {
      ...result,
      orgId: currentOrgId,
      scope: currentOrgId ? 'org' as const : 'global' as const,
    };
  }

  if (currentOrgId) {
    let fallbackQuery = supabase
      .from('integration_settings')
      .select(options.columns || '*')
      .eq('connection_type', options.connectionType)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);

    if (options.provider !== undefined) {
      fallbackQuery = fallbackQuery.eq('provider', options.provider);
    }
    if (options.isActive !== undefined) {
      fallbackQuery = fallbackQuery.eq('is_active', options.isActive);
    }

    result = await fallbackQuery.is('org_id', null).maybeSingle();
    return {
      ...result,
      orgId: currentOrgId,
      scope: 'global-fallback' as const,
    };
  }

  return {
    ...result,
    orgId: currentOrgId,
    scope: 'global' as const,
  };
};

export const listScopedIntegrationSettings = async (
  supabase: SupabaseClient,
  options: ListScopedIntegrationSettingsOptions,
) => {
  const currentOrgId = await getResolvedCurrentOrgId(supabase);
  let query = supabase
    .from('integration_settings')
    .select(options.columns || '*')
    .in('connection_type', options.connectionTypes)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (options.isActive !== undefined) {
    query = query.eq('is_active', options.isActive);
  }

  query = currentOrgId
    ? query.eq('org_id', currentOrgId)
    : query.is('org_id', null);

  const result = await query;
  return {
    ...result,
    orgId: currentOrgId,
  };
};
