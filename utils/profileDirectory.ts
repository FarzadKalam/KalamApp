import { runSelectWithCompatibleColumns } from './selectCompat';
import { normalizePublicAssetUrl } from './assetUrl';

export const PROFILE_DIRECTORY_SAFE_COLUMNS = [
  'id',
  'org_id',
  'role',
  'role_id',
  'full_name',
  'avatar_url',
  'email',
  'mobile_1',
  'job_title',
  'voip_operator_code',
  'voip_extension',
  'is_active',
  'created_at',
] as const;

export const normalizeProfileDirectoryRow = (row: any) => ({
  ...row,
  id: String(row?.id || '').trim(),
  org_id: row?.org_id ? String(row.org_id).trim() : null,
  role_id: row?.role_id ? String(row.role_id).trim() : null,
  avatar_url: normalizePublicAssetUrl(row?.avatar_url),
  full_name: String(row?.full_name || '').trim() || null,
  email: String(row?.email || '').trim() || null,
  mobile_1: String(row?.mobile_1 || '').trim() || null,
  job_title: String(row?.job_title || '').trim() || null,
  voip_operator_code: String(row?.voip_operator_code || '').trim() || null,
  voip_extension: String(row?.voip_extension || '').trim() || null,
});

export const loadProfilesWithCompat = async (
  supabaseClient: any,
  options?: {
    orgId?: string | null;
    limit?: number;
    cacheKey?: string;
    orderByFullName?: boolean;
    allowGlobalScope?: boolean;
  }
) => {
  const normalizedOrgId = String(options?.orgId || '').trim() || null;
  if (!normalizedOrgId && options?.allowGlobalScope !== true) {
    return {
      data: [] as any[],
      error: null,
      selectedColumns: [...PROFILE_DIRECTORY_SAFE_COLUMNS],
    };
  }
  const limit = Math.max(1, Number(options?.limit || 300));
  const result = await runSelectWithCompatibleColumns<any[]>({
    cacheKey: options?.cacheKey || (normalizedOrgId ? 'profiles:directory:org' : 'profiles:directory:global'),
    columns: PROFILE_DIRECTORY_SAFE_COLUMNS,
    execute: (selectExpr) => {
      let query = supabaseClient.from('profiles').select(selectExpr).limit(limit);
      if (normalizedOrgId) {
        query = query.eq('org_id', normalizedOrgId);
      }
      if (options?.orderByFullName) {
        query = query.order('full_name', { ascending: true });
      }
      return query;
    },
  });

  return {
    ...result,
    data: (result.data || []).map(normalizeProfileDirectoryRow),
  };
};
