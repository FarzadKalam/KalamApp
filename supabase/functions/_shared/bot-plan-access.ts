import { loadOrgPlanAccess } from './org-plan-access.ts';
import { BOT_PLAN_FEATURES } from './bot-plan-features.ts';

export async function hasBotPlanAccess(url: string, serviceKey: string, orgId: string, channel: string) {
  const feature = BOT_PLAN_FEATURES[channel];
  if (!feature || !orgId) return false;
  const context = await loadOrgPlanAccess(url, serviceKey, orgId);
  return context.available === true && context.isReadonly !== true && context.features?.[feature] === true;
}

export function canUseBotAction(permissions: any, action: string, membership: any): boolean {
  if (membership?.is_owner === true) return true;
  if (['start_capture', 'poll_updates', 'diagnose_rubika_runtime'].includes(action)) {
    if (!['super_admin','admin','manager'].includes(String(membership?.software_role || '').toLowerCase())) return false;
    const settings = permissions?.__settings_tabs || {};
    return settings.view !== false && settings.fields?.connections !== false
      && (action === 'diagnose_rubika_runtime' || settings.edit !== false);
  }
  const communication = permissions?.__communications || {};
  return communication.view !== false && communication.fields?.use_bot_channels !== false;
}
