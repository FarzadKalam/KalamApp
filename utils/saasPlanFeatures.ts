import { supabase } from '../supabaseClient';
import { getAppRuntimeCached } from './appRuntimeCache';
import { fetchCurrentUserRoleContext, SAAS_ADMIN_PERMISSION_KEY } from './permissions';

export const MULTI_LANE_PROCESSES_FEATURE = 'multi_lane_processes';

export const hasCurrentOrgPlanFeature = async (
  featureKey: string,
  options?: { force?: boolean; defaultEnabled?: boolean },
) => {
  const normalizedFeatureKey = String(featureKey || '').trim();
  if (!normalizedFeatureKey) return false;

  const roleContext = await fetchCurrentUserRoleContext(supabase, { force: options?.force });
  const saasAdminPermission = roleContext?.permissions?.[SAAS_ADMIN_PERMISSION_KEY] || {};
  if (saasAdminPermission.view === true || saasAdminPermission.edit === true) return true;
  const orgId = String(roleContext?.orgId || '').trim() || '__guest__';
  const defaultEnabled = options?.defaultEnabled === true;

  return getAppRuntimeCached({
    key: `org-plan-feature:${orgId}:${normalizedFeatureKey}`,
    ttlMs: 60_000,
    force: options?.force,
    loader: async () => {
      const { data, error } = await supabase.rpc('current_org_has_plan_feature', {
        p_feature_key: normalizedFeatureKey,
        p_default_enabled: defaultEnabled,
      });
      if (error) return defaultEnabled;
      return data === true;
    },
  });
};

export const hasMultiLaneProcessesFeature = (options?: { force?: boolean }) =>
  hasCurrentOrgPlanFeature(MULTI_LANE_PROCESSES_FEATURE, {
    ...options,
    defaultEnabled: true,
  });
