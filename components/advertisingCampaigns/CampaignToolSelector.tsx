import React, { useMemo } from 'react';
import { App, Card, Tag, Typography } from 'antd';
import { CheckCircleFilled, LockOutlined, PlusOutlined } from '@ant-design/icons';
import DynamicSelectField from '../DynamicSelectField';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import { CAMPAIGN_TOOL_OPTIONS, CAMPAIGN_TOOL_TYPE_CATEGORY } from './constants';
import type { CampaignToolType } from './types';

type CampaignToolSelectorProps = {
  value: CampaignToolType[];
  onChange: (value: CampaignToolType[]) => void;
  availability: Record<string, boolean>;
  loading?: boolean;
  disabled?: boolean;
};

const CampaignToolSelector: React.FC<CampaignToolSelectorProps> = ({
  value,
  onChange,
  availability,
  loading,
  disabled,
}) => {
  const { message } = App.useApp();
  const selected = new Set((value || []).map(String));
  const coreValues = useMemo(() => new Set(CAMPAIGN_TOOL_OPTIONS.map((item) => String(item.value))), []);
  const customValues = (value || []).map(String).filter((item) => !coreValues.has(item));

  const toggle = (toolType: CampaignToolType, locked: boolean) => {
    if (locked || disabled) {
      if (locked) message.warning('این ابزار در پلن فعلی سازمان فعال نیست.');
      return;
    }
    const key = String(toolType);
    onChange(selected.has(key) ? value.filter((item) => String(item) !== key) : [...value, toolType]);
  };

  const renderGroup = (group: 'automatic' | 'manual', title: string) => (
    <section>
      <div className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">{title}</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {CAMPAIGN_TOOL_OPTIONS.filter((item) => item.group === group).map((item) => {
          const lockedByPlan = Boolean(item.featureKey && availability[item.value] !== true);
          const locked = item.releaseDisabled === true || lockedByPlan;
          const active = selected.has(String(item.value));
          return (
            <Card
              key={item.value}
              size="small"
              hoverable={!locked && !disabled}
              loading={loading && Boolean(item.featureKey)}
              role="checkbox"
              aria-checked={active}
              aria-disabled={locked || disabled}
              tabIndex={locked || disabled ? -1 : 0}
              onClick={() => toggle(item.value, locked)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggle(item.value, locked);
                }
              }}
              className={[
                '!rounded-xl transition-colors',
                active ? '!border-[rgb(var(--brand-500-rgb))] !bg-[rgba(var(--brand-50-rgb),0.65)]' : '',
                locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              ].join(' ')}
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5 text-base">
                  {locked ? <LockOutlined /> : active ? <CheckCircleFilled className="text-[rgb(var(--brand-600-rgb))]" /> : <PlusOutlined />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <Typography.Text strong>{item.label}</Typography.Text>
                    {item.releaseDisabled ? <Tag>فعلاً غیرفعال</Tag> : lockedByPlan ? <Tag color="gold">خارج از پلن</Tag> : null}
                  </div>
                  <Typography.Text type="secondary" className="text-xs">{item.description}</Typography.Text>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="space-y-5">
      {renderGroup('automatic', 'ابزارهای ارسال و اجرای خودکار')}
      {renderGroup('manual', 'ابزارهای اجرایی و دستی')}
      <div>
        <div className="mb-1 text-sm font-bold text-slate-700 dark:text-slate-200">ابزارهای سفارشی</div>
        <DynamicSelectField
          value={customValues}
          onChange={(next) => {
            const nextCustom = (Array.isArray(next) ? next : [next]).map(String).filter((item) => !coreValues.has(item));
            onChange([...value.filter((item) => coreValues.has(String(item))), ...nextCustom]);
          }}
          options={customValues.map((item) => ({ label: item, value: item }))}
          category={CAMPAIGN_TOOL_TYPE_CATEGORY}
          mode="multiple"
          disabled={disabled}
          placeholder="انتخاب یا افزودن ابزار سفارشی"
          protectedValues={Array.from(coreValues)}
          pickerTitle="ابزارهای سفارشی"
          getPopupContainer={resolveOverlayPopupContainer as any}
          modalContainer={resolveOverlayPopupContainer}
          preferLocalPopupContainer
          overlayZIndexBase={13200}
        />
      </div>
    </div>
  );
};

export default CampaignToolSelector;
