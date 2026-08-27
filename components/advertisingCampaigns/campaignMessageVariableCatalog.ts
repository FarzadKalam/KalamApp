import { getFieldLabelFa } from '../../utils/fieldLabel';
import { getWorkflowConditionFields } from '../../utils/workflowHelpers';
import { getCanonicalModuleFields } from '../../utils/recordVariableCatalog';
import type { CampaignMessageVariableDescriptor } from '../../supabase/functions/_shared/campaign-message-variables';
import { CAMPAIGN_TARGET_MODULES } from './constants';
import type { CampaignAudienceRule, CampaignTargetModule } from './types';

export type CampaignMessageVariableOption = {
  value: string;
  label: string;
  token: string;
  moduleId: CampaignTargetModule;
  fieldKey: string;
  descriptor: CampaignMessageVariableDescriptor;
};

export const buildCampaignMessageVariableOptions = (
  rules: CampaignAudienceRule[],
): CampaignMessageVariableOption[] => {
  const ruleByModule = new Map(rules.map((rule) => [rule.target_module_id, rule] as const));
  return CAMPAIGN_TARGET_MODULES.flatMap((moduleOption) => {
    const moduleId = moduleOption.value as CampaignTargetModule;
    if (ruleByModule.get(moduleId)?.enabled === false) return [];
    const seen = new Set<string>();
    const canonicalFields = getCanonicalModuleFields(moduleId);
    return getWorkflowConditionFields(moduleId).flatMap((field) => {
      const fieldKey = String(field?.key || '').trim();
      if (!fieldKey || seen.has(fieldKey)) return [];
      seen.add(fieldKey);
      const directField = canonicalFields.find((item) => String(item.key || '').trim() === fieldKey);
      const relationConfig = (field as any).multiRelationConfig || field.relationConfig || directField?.relationConfig;
      const label = `${getFieldLabelFa(field, { moduleId, fallback: fieldKey })} (${moduleOption.label})`;
      return [{
        value: `${moduleId}:${fieldKey}`,
        label,
        token: `{{${fieldKey}}}`,
        moduleId,
        fieldKey,
        descriptor: {
          key: fieldKey,
          module_id: moduleId,
          field_key: fieldKey,
          field_type: String(field.type || ''),
          label,
          relation_target_module: String(relationConfig?.targetModule || '').trim() || null,
          relation_target_field: String(relationConfig?.targetField || '').trim() || null,
          options: Array.isArray(field.options)
            ? field.options.map((option: any) => ({ value: option.value, label: String(option.label || option.value || '') }))
            : [],
        },
      }];
    });
  });
};

export const appendCampaignMessageVariable = (value: unknown, token: string) => {
  const current = String(value || '');
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken || current.includes(normalizedToken)) return current;
  return current.trim() ? `${current} ${normalizedToken}` : normalizedToken;
};
