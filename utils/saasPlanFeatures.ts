import { supabase } from '../supabaseClient';
import { getAppRuntimeCached } from './appRuntimeCache';
import { fetchSessionBootstrap } from './sessionCache';

export const MULTI_LANE_PROCESSES_FEATURE = 'multi_lane_processes';
export const CONTENT_CALENDAR_PLAN_FEATURE = 'content_calendar';

export const hasContentCalendarFeature = (options?: { force?: boolean }) =>
  hasCurrentOrgPlanFeature(CONTENT_CALENDAR_PLAN_FEATURE, {
    ...options,
    defaultEnabled: false,
  });

export const hasCurrentOrgPlanFeature = async (
  featureKey: string,
  options?: { force?: boolean; defaultEnabled?: boolean },
) => {
  const normalizedFeatureKey = String(featureKey || '').trim();
  if (!normalizedFeatureKey) return false;

  // تصمیم دربارهٔ ویژگی، در سطح سازمان گرفته می‌شود؛ نه نقش کاربرِ درخواست‌دهنده.
  // RPC علاوه بر تنظیمات پلن، سازمان داخلیِ دارای دسترسی SaaS Admin را هم تشخیص می‌دهد.
  const session = await fetchSessionBootstrap(supabase, { force: options?.force });
  const orgId = String(session.orgId || '').trim() || '__guest__';
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
