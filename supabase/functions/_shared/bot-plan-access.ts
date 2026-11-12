import { loadOrgPlanAccess } from './org-plan-access.ts';
import { BOT_PLAN_FEATURES } from './bot-plan-features.ts';

export async function hasBotPlanAccess(url: string, serviceKey: string, orgId: string, channel: string) {
  const feature = BOT_PLAN_FEATURES[channel];
  if (!feature || !orgId) return false;
  const context = await loadOrgPlanAccess(url, serviceKey, orgId);
  return context.available === true && context.isReadonly !== true && context.features?.[feature] === true;
}
