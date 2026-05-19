import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSessionBootstrap } from './sessionCache';

const normalizeText = (value: unknown) => String(value || '').trim();

export const getResolvedCurrentOrgId = async (supabase: SupabaseClient) => {
  const session = await fetchSessionBootstrap(supabase);
  return normalizeText(session?.orgId) || null;
};

export const loadScopedCompanySettings = async (supabase: SupabaseClient) => {
  const currentOrgId = await getResolvedCurrentOrgId(supabase);

  let query = supabase
    .from('company_settings')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1);

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
    result = await supabase
      .from('company_settings')
      .select('*')
      .is('org_id', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

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
