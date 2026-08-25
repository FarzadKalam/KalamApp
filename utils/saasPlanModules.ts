import { supabase } from '../supabaseClient';
import { getAppRuntimeCached } from './appRuntimeCache';
import { fetchSessionBootstrap } from './sessionCache';

/**
 * Plan-level module availability is intentionally separate from role permissions.
 * A user must pass both checks before a paid module is rendered or mutated.
 */
export const hasCurrentOrgPlanModule = async (
  moduleId: string,
  options?: { force?: boolean; defaultEnabled?: boolean },
) => {
  const normalizedModuleId = String(moduleId || '').trim();
  if (!normalizedModuleId) return false;

  const session = await fetchSessionBootstrap(supabase, { force: options?.force });
  const orgId = String(session.orgId || '').trim() || '__guest__';
  const defaultEnabled = options?.defaultEnabled === true;

  return getAppRuntimeCached({
    key: `org-plan-module:${orgId}:${normalizedModuleId}`,
    ttlMs: 60_000,
    force: options?.force,
    loader: async () => {
      const { data, error } = await supabase.rpc('current_org_has_plan_module', {
        p_module_id: normalizedModuleId,
        p_default_enabled: defaultEnabled,
      });
      if (error) return defaultEnabled;
      return data === true;
    },
  });
};

