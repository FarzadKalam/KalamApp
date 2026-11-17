import type { PermissionAvailability } from '../hooks/usePermissionAvailability';
import { AI_AGENT_CATALOG, getAiAgentPlanFeatureKey } from './aiAgentCatalog';

// Resource/plan bindings stay separate from role grants. An enabled feature
// never grants a permission by itself.
const FEATURE_BINDINGS: Record<string, string[]> = {
  __goals: ['goals'], __reports: ['advanced_reports'],
  __customer_club: ['customer_club'],
  __communications: ['internal_chat', 'organization_email', 'telegram_bot', 'bale_bot', 'rubika_bot', 'voip_webphone'],
  __ai_agents: [...AI_AGENT_CATALOG.map((agent) => getAiAgentPlanFeatureKey(agent.key)), 'ai_staff_bot'],
};

export const isPermissionSectionAvailable = (key: string, availability: PermissionAvailability | null) => {
  if (!availability) return false;
  if (key === '__accounting') return ['chart_of_accounts','journal_entries','cash_bank_operations','bank_accounts'].some((module) => availability.modules[module] === true);
  const features = FEATURE_BINDINGS[key];
  return !features || features.some((feature) => availability.features[feature] === true);
};

export const isPermissionFieldAvailable = (section: string, field: string, availability: PermissionAvailability | null) => {
  if (!availability) return false;
  const moduleBindings: Record<string, Record<string, string[]>> = {
    __dashboard_widgets: { my_tasks: ['tasks'], activity_calendar: ['tasks'], our_processes: ['process_runs'] },
    __accounting: { journal_entry_lines_view: ['journal_entries'], journal_entry_lines_edit: ['journal_entries'], journal_entry_lines_delete: ['journal_entries'] },
  };
  const modules = moduleBindings[section]?.[field];
  if (modules && !modules.some((module) => availability.modules[module] === true)) return false;
  if (field.startsWith('__goals_') && availability.features.goals !== true) return false;
  if (field === '__action_reservation_settings' && availability.features.reservations !== true) return false;
  if (field === '__action_retail_invoice_settings' && availability.features.retail_sales_invoice !== true) return false;
  const bindings: Record<string, Record<string, string[]>> = {
    __settings_tabs: {
      reservation_settings: ['reservations'], ai_knowledge: ['ai_knowledge'], account: ['saas_account_billing'],
      ai: ['ai_chat','ai_staff_bot', ...AI_AGENT_CATALOG.map((agent) => getAiAgentPlanFeatureKey(agent.key))],
    },
    __dashboard_widgets: { reports_slider: ['advanced_reports'], communications: ['internal_chat','organization_email','telegram_bot','bale_bot','rubika_bot'] },
    __communications: { use_bot_channels: ['telegram_bot','bale_bot','rubika_bot'], use_sms: ['campaign_sms'], use_email: ['organization_email'], send_email: ['organization_email'], use_voip: ['voip_webphone'], manage_groups: ['internal_chat'], send_internal: ['internal_chat'] },
  };
  const features = bindings[section]?.[field];
  return !features || features.some((feature) => availability.features[feature] === true);
};
