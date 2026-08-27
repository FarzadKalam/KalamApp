import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Collapse, Empty, Typography } from 'antd';
import WorkflowConditionsGroup from '../workflows/WorkflowConditionsGroup';
import { getWorkflowConditionFields } from '../../utils/workflowHelpers';
import { loadWorkflowConditionEditorOptions } from '../../utils/workflowConditionOptions';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import { CAMPAIGN_TARGET_MODULES, getCampaignToolLabel, usesCampaignAudience } from './constants';
import type { CampaignAudienceRule, CampaignTargetModule, CampaignToolRecord } from './types';
import CampaignField from './CampaignField';
import { FieldType } from '../../types';
import CampaignAudiencePreview from './CampaignAudiencePreview';
import { invalidateCampaignAudienceSummaryConfig } from './campaignUtils';

type OptionState = {
  dynamicOptions: Record<string, Array<{ label: string; value: string }>>;
  relationOptions: Record<string, Array<{ label: string; value: string }>>;
};

type Props = {
  campaignName: string;
  campaignId: string;
  tools: CampaignToolRecord[];
  rules: CampaignAudienceRule[];
  onRuleChange: (targetModule: CampaignTargetModule, patch: Partial<CampaignAudienceRule>) => void;
  disabled?: boolean;
  onToolChange: (toolId: string, patch: Partial<CampaignToolRecord>) => void;
  onBeforeAudienceSearch?: () => Promise<unknown>;
};

const EMPTY_OPTIONS: OptionState = { dynamicOptions: {}, relationOptions: {} };

const CampaignConditionsTab: React.FC<Props> = ({ campaignId, campaignName, tools, rules, onRuleChange, onToolChange, onBeforeAudienceSearch, disabled }) => {
  const [activeKeys, setActiveKeys] = useState<string[]>(['marketing_leads']);
  const [optionsByModule, setOptionsByModule] = useState<Partial<Record<CampaignTargetModule, OptionState>>>({});
  const applicableTools = useMemo(() => tools.filter((tool) => {
    const sources = (tool.config as any)?.audience_sources;
    return tool.enabled !== false
      && usesCampaignAudience(tool.tool_type)
      && Array.isArray(sources)
      && sources.includes('internal');
  }), [tools]);

  const updateRule = (targetModule: CampaignTargetModule, patch: Partial<CampaignAudienceRule>) => {
    onRuleChange(targetModule, patch);
    applicableTools.forEach((tool) => {
      if (!(tool.config as any)?.audience_finalized_at) return;
      onToolChange(tool.id, { config: invalidateCampaignAudienceSummaryConfig(tool.tool_type, tool.config) });
    });
  };

  useEffect(() => {
    const targets = activeKeys
      .map((key) => key as CampaignTargetModule)
      .filter((target) => !optionsByModule[target]);
    if (targets.length === 0) return;
    let active = true;
    void Promise.all(targets.map(async (target) => {
      try {
        const options = await loadWorkflowConditionEditorOptions(target, getWorkflowConditionFields(target));
        return [target, options] as const;
      } catch {
        return [target, EMPTY_OPTIONS] as const;
      }
    })).then((entries) => {
      if (!active) return;
      setOptionsByModule((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => { active = false; };
  }, [activeKeys, optionsByModule]);

  if (applicableTools.length === 0) {
    return <Empty description="هیچ ابزار انتخاب‌شده‌ای مخاطب داخل نرم‌افزار ندارد؛ در تنظیمات پیامک، ایمیل یا پی‌وی بات گزینه «از داخل نرم‌افزار» را فعال کنید." />;
  }

  return (
    <div className="space-y-4 pb-4">
      <Alert
        type="info"
        showIcon
        message={`این شرط‌ها فقط روی کمپین «${campaignName || 'بدون عنوان'}» و ابزارهای ${applicableTools.map((tool) => getCampaignToolLabel(tool.tool_type)).join('، ')} اعمال می‌شوند؛ ارسال باید از داخل همین پروژه و برای مخاطبان ذخیره‌شده باشد.`}
        description="اگر فایل اکسل نیز انتخاب شده باشد، مخاطبان معتبر فایل و رکوردهای منطبق با شرط‌ها با هم ترکیب و موارد تکراری حذف می‌شوند. مخاطبان نهایی هنگام آماده‌سازی ارسال snapshot خواهند شد."
      />
      <Collapse
        activeKey={activeKeys}
        onChange={(keys) => setActiveKeys(keys as string[])}
        items={CAMPAIGN_TARGET_MODULES.map((moduleOption) => {
          const targetModule = moduleOption.value as CampaignTargetModule;
          const rule = rules.find((item) => item.target_module_id === targetModule) || {
            target_module_id: targetModule,
            conditions_all: [],
            conditions_any: [],
            enabled: true,
          };
          const fields = getWorkflowConditionFields(targetModule);
          const options = optionsByModule[targetModule] || EMPTY_OPTIONS;
          return {
            key: targetModule,
            label: (
              <div className="flex flex-wrap items-center justify-between gap-3 pe-4">
                <span>{moduleOption.label}</span>
                <label className="flex items-center gap-2 text-xs" onClick={(event) => event.stopPropagation()}>
                  اعمال شرط‌ها
                  <div className="w-24"><CampaignField fieldKey={`rule_enabled_${targetModule}`} label="فعال" type={FieldType.CHECKBOX} value={rule.enabled !== false} readonly={disabled} compact onChange={(enabled) => updateRule(targetModule, { enabled })} /></div>
                </label>
              </div>
            ),
            children: activeKeys.includes(targetModule) ? (
                <div className="space-y-5">
                  <Card size="small" title="همه شرط‌های زیر باید برقرار باشند" className="!rounded-xl">
                    <WorkflowConditionsGroup
                      value={rule.conditions_all || []}
                      onChange={(conditions_all) => updateRule(targetModule, { conditions_all })}
                      fields={fields}
                      dynamicOptions={options.dynamicOptions}
                      relationOptions={options.relationOptions}
                      disabled={disabled || rule.enabled === false}
                      overlayZIndexBase={13200}
                      popupContainer={resolveOverlayPopupContainer}
                    />
                  </Card>
                  <Card size="small" title="برقرار بودن یکی از شرط‌های زیر کافی است" className="!rounded-xl">
                    <Typography.Text type="secondary" className="mb-3 block text-xs">اگر این بخش خالی باشد، فقط مجموعه «همه شرط‌ها» ارزیابی می‌شود.</Typography.Text>
                    <WorkflowConditionsGroup
                      value={rule.conditions_any || []}
                      onChange={(conditions_any) => updateRule(targetModule, { conditions_any })}
                      fields={fields}
                      dynamicOptions={options.dynamicOptions}
                      relationOptions={options.relationOptions}
                      disabled={disabled || rule.enabled === false}
                      overlayZIndexBase={13200}
                      popupContainer={resolveOverlayPopupContainer}
                    />
                  </Card>
                </div>
            ) : null,
          };
        })}
      />
      <CampaignAudiencePreview
        campaignId={campaignId}
        tools={applicableTools}
        disabled={disabled}
        onToolChange={onToolChange}
        onBeforeSearch={onBeforeAudienceSearch}
        criteriaSignature={JSON.stringify(rules)}
      />
    </div>
  );
};

export default CampaignConditionsTab;
