import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSessionBootstrap } from './sessionCache';
import { attachAbortSignalIfSupported, runWithSupabaseTimeout } from './supabaseTimeout';

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
  const session = await fetchSessionBootstrap(supabase);
  const currentOrgId = String(session?.orgId || '').trim() || null;
  const bootstrapError = session?.bootstrapError || null;
  const hasAuthenticatedUser = Boolean(session?.user?.id);

  if (hasAuthenticatedUser && bootstrapError && !currentOrgId) {
    return {
      data: null,
      error: bootstrapError,
      orgId: null,
      scope: 'bootstrap-error' as const,
    };
  }

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

  let result = await runWithSupabaseTimeout((signal) =>
    attachAbortSignalIfSupported(query, signal).maybeSingle()
  );

  if (!result.error && result.data) {
    return {
      ...result,
      orgId: currentOrgId,
      scope: currentOrgId ? 'org' as const : 'global' as const,
    };
  }

  if (result.error) {
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

    fallbackQuery = fallbackQuery.is('org_id', null);
    result = await runWithSupabaseTimeout((signal) =>
      attachAbortSignalIfSupported(fallbackQuery, signal).maybeSingle()
    );
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
  const session = await fetchSessionBootstrap(supabase);
  const currentOrgId = String(session?.orgId || '').trim() || null;
  const bootstrapError = session?.bootstrapError || null;
  const hasAuthenticatedUser = Boolean(session?.user?.id);

  if (hasAuthenticatedUser && bootstrapError && !currentOrgId) {
    return {
      data: [],
      error: bootstrapError,
      orgId: null,
    };
  }

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

  const result = await runWithSupabaseTimeout((signal) =>
    attachAbortSignalIfSupported(query, signal)
  );
  return {
    ...result,
    orgId: currentOrgId,
  };
};
