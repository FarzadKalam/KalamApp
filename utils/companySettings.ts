import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePublicAssetUrl } from './assetUrl';
import { fetchSessionBootstrap } from './sessionCache';
import { normalizePrintLetterheads } from './printTemplates/letterheads';
import { attachAbortSignalIfSupported, runWithSupabaseTimeout } from './supabaseTimeout';

const normalizeText = (value: unknown) => String(value || '').trim();

export const DEFAULT_MANAGER_TITLE = 'مدیرعامل';

export const resolveManagerTitle = (companyInfo: any) =>
  normalizeText(companyInfo?.manager_title) || DEFAULT_MANAGER_TITLE;

export const normalizeCompanyAssetFields = (row: any) => {
  if (!row || typeof row !== 'object') return row;
  const letterheads = normalizePrintLetterheads(row.print_letterheads).map((item) => ({
    ...item,
    imageUrl: normalizePublicAssetUrl(item.imageUrl) || null,
  }));
  return {
    ...row,
    logo_url: normalizePublicAssetUrl(row.logo_url) || null,
    icon_url: normalizePublicAssetUrl(row.icon_url) || null,
    signature_image_url: normalizePublicAssetUrl(row.signature_image_url) || null,
    stamp_image_url: normalizePublicAssetUrl(row.stamp_image_url) || null,
    print_letterheads: letterheads,
  };
};

export const getResolvedCurrentOrgId = async (supabase: SupabaseClient) => {
  const session = await fetchSessionBootstrap(supabase);
  return normalizeText(session?.orgId) || null;
};

export const loadScopedCompanySettings = async (supabase: SupabaseClient) => {
  const session = await fetchSessionBootstrap(supabase);
  const currentOrgId = normalizeText(session?.orgId) || null;
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
    .from('company_settings')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1);

  query = currentOrgId
    ? query.eq('org_id', currentOrgId)
    : query.is('org_id', null);

  let result = await runWithSupabaseTimeout((signal) =>
    attachAbortSignalIfSupported(query, signal).maybeSingle()
  );

  if (!result.error && result.data) {
    return {
      ...result,
      data: normalizeCompanyAssetFields(result.data),
      orgId: currentOrgId,
      scope: currentOrgId ? 'org' as const : 'global' as const,
    };
  }

  if (result.error) {
    return {
      ...result,
      data: normalizeCompanyAssetFields(result.data),
      orgId: currentOrgId,
      scope: currentOrgId ? 'org' as const : 'global' as const,
    };
  }

  if (currentOrgId) {
    const fallbackQuery = supabase
      .from('company_settings')
      .select('*')
      .is('org_id', null)
      .order('updated_at', { ascending: false })
      .limit(1);

    result = await runWithSupabaseTimeout((signal) =>
      attachAbortSignalIfSupported(fallbackQuery, signal).maybeSingle()
    );

    return {
      ...result,
      data: normalizeCompanyAssetFields(result.data),
      orgId: currentOrgId,
      scope: 'global-fallback' as const,
    };
  }

  return {
    ...result,
    data: normalizeCompanyAssetFields(result.data),
    orgId: currentOrgId,
    scope: 'global' as const,
  };
};
