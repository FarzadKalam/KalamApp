import React, { useEffect, useState } from 'react';
import { Alert, Card, Typography } from 'antd';
import { AimOutlined, CalendarOutlined, TagsOutlined, UserOutlined } from '@ant-design/icons';
import AdaptiveIdentityPicker from '../AdaptiveIdentityPicker';
import AdaptiveSelectField from '../AdaptiveSelectField';
import RecordImageBox from '../RecordImageBox';
import { FieldType } from '../../types';
import { fetchTagOptions } from '../../utils/referenceData';
import { supabase } from '../../supabaseClient';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import { CAMPAIGN_STATUS_OPTIONS } from './constants';
import { joinIdentityTokens, splitIdentityTokens } from './campaignUtils';
import CampaignField from './CampaignField';
import CampaignRelationsPicker from './CampaignRelationsPicker';
import CampaignToolSelector from './CampaignToolSelector';
import type { CampaignRecord, CampaignToolType } from './types';
import CampaignAuditStrip from './CampaignAuditStrip';
import TagInput from '../TagInput';

type CampaignBasicsTabProps = {
  campaign: CampaignRecord;
  onChange: (patch: Partial<CampaignRecord>) => void;
  onToolTypesChange: (toolTypes: CampaignToolType[]) => void;
  availability: Record<string, boolean>;
  availabilityLoading?: boolean;
  canQuickCreateClub?: boolean;
  disabled?: boolean;
};

const CampaignBasicsTab: React.FC<CampaignBasicsTabProps> = ({
  campaign,
  onChange,
  onToolTypesChange,
  availability,
  availabilityLoading,
  canQuickCreateClub,
  disabled,
}) => {
  const [tagOptions, setTagOptions] = useState<Array<{ label: string; value: string; color?: string }>>([]);
  useEffect(() => {
    let active = true;
    void fetchTagOptions(supabase).then((items) => { if (active) setTagOptions(items); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const assigneeToken = campaign.assignee_type === 'role'
    ? campaign.assignee_role_id ? `role:${campaign.assignee_role_id}` : undefined
    : campaign.assignee_id ? `user:${campaign.assignee_id}` : undefined;
  const viewerTokens = joinIdentityTokens(campaign.viewer_user_ids, campaign.viewer_role_ids);
  const heroTags = (campaign.tags || []).map((id) => {
    const tag = tagOptions.find((item) => item.value === id);
    return { id, title: tag?.label || 'برچسب', color: tag?.color || '#1677ff' };
  });

  return (
    <div className="space-y-4 pb-4">
      <Card className="overflow-hidden !rounded-[2rem] !border-slate-200/80 dark:!border-white/10">
        <div className="-mx-6 -mt-6 mb-5 bg-gradient-to-l from-[rgb(var(--brand-600-rgb),0.13)] via-sky-50 to-white px-6 pb-5 pt-6 dark:from-[rgb(var(--brand-500-rgb),0.2)] dark:via-slate-900 dark:to-[#181818]">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-300">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/85 px-3 py-1.5 shadow-sm dark:bg-white/10"><AimOutlined /> برنامه‌ریزی و اجرای کمپین</span>
            <span className="text-slate-400">مشخصات اصلی، مسئول و زمان‌بندی را اینجا تنظیم کنید.</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <RecordImageBox
              moduleId="advertising_campaigns"
              recordId={campaign.id || undefined}
              imageUrl={campaign.image_url}
              compact
              canEdit={!disabled && Boolean(campaign.id)}
              onMainImageChange={(imageUrl) => onChange({ image_url: imageUrl })}
            />
            {!campaign.id ? <Typography.Text type="secondary" className="mt-1 block text-xs">برای افزودن تصویر، ابتدا مشخصات را ذخیره کنید.</Typography.Text> : null}
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
            <CampaignField fieldKey="name" label="نام کمپین" value={campaign.name} onChange={(name) => onChange({ name })} required readonly={disabled} />
            <CampaignField fieldKey="system_code" label="کد سیستمی" value={campaign.system_code || 'پس از ذخیره ساخته می‌شود'} onChange={() => undefined} readonly />
            <div>
              <div className="mb-1.5 text-xs font-medium text-slate-500">وضعیت</div>
              <AdaptiveSelectField
                value={campaign.status}
                onChange={(status) => onChange({ status })}
                options={CAMPAIGN_STATUS_OPTIONS.map((item) => ({ ...item }))}
                disabled={disabled}
                className="w-full"
                pickerTitle="وضعیت کمپین"
                getPopupContainer={resolveOverlayPopupContainer as any}
                modalContainer={resolveOverlayPopupContainer}
                preferLocalPopupContainer
                overlayZIndexBase={13200}
              />
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500"><UserOutlined /> مسئول</div>
              <AdaptiveIdentityPicker
                variant="borderless"
                value={assigneeToken}
                onChange={(value) => {
                  const token = String(value || '');
                  if (token.startsWith('role:')) onChange({ assignee_type: 'role', assignee_role_id: token.slice(5), assignee_id: null });
                  else if (token.startsWith('user:')) onChange({ assignee_type: 'user', assignee_id: token.slice(5), assignee_role_id: null });
                  else onChange({ assignee_type: null, assignee_id: null, assignee_role_id: null });
                }}
                scopes={['user', 'role']}
                disabled={disabled}
                className="w-full font-bold text-slate-700 dark:text-slate-200"
                placeholder="انتخاب مسئول یا نقش"
                pickerTitle="مسئول کمپین"
                overlayZIndexBase={13200}
              />
            </div>
            <div className="md:col-span-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500"><TagsOutlined /> برچسب‌ها</div>
              {campaign.id ? (
                <TagInput
                  recordId={campaign.id}
                  moduleId="advertising_campaigns"
                  initialTags={heroTags}
                  disabled={disabled}
                  popupZIndex={13240}
                  onChange={(tags) => onChange({ tags: (tags || []).map((tag) => tag.id) })}
                />
              ) : (
                <AdaptiveSelectField
                  mode="multiple" value={campaign.tags || []} onChange={(tags) => onChange({ tags: Array.isArray(tags) ? tags : [] })}
                  options={tagOptions} disabled={disabled} className="w-full" placeholder="انتخاب برچسب‌ها" pickerTitle="برچسب‌های کمپین"
                  optionFilterProp="label" showSearch getPopupContainer={resolveOverlayPopupContainer as any} modalContainer={resolveOverlayPopupContainer}
                  preferLocalPopupContainer overlayZIndexBase={13200}
                />
              )}
            </div>
          </div>
        </div>
        <div className="mt-4"><CampaignAuditStrip createdBy={campaign.created_by} createdAt={campaign.created_at} updatedBy={campaign.updated_by} updatedAt={campaign.updated_at} /></div>
      </Card>

      <Card title="ابزارهای تبلیغاتی" className="!rounded-2xl">
        <CampaignToolSelector
          value={campaign.tool_types || []}
          onChange={onToolTypesChange}
          availability={availability}
          loading={availabilityLoading}
          disabled={disabled}
        />
      </Card>

      <Card title="باشگاه مشتریان" className="!rounded-2xl">
        <CampaignRelationsPicker
          loyaltyRuleIds={campaign.loyalty_rule_ids || []}
          discountCodeIds={campaign.discount_code_ids || []}
          onLoyaltyRulesChange={(loyalty_rule_ids) => onChange({ loyalty_rule_ids })}
          onDiscountCodesChange={(discount_code_ids) => onChange({ discount_code_ids })}
          canQuickCreate={canQuickCreateClub}
          disabled={disabled}
        />
      </Card>

      <Card title={<span className="inline-flex items-center gap-2"><CalendarOutlined /> شرح و زمان‌بندی</span>} className="!rounded-2xl">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <CampaignField fieldKey="description" label="توضیحات" type={FieldType.LONG_TEXT} value={campaign.description} onChange={(description) => onChange({ description })} readonly={disabled} recordId={campaign.id} />
          </div>
          <div className="lg:col-span-2">
            <CampaignField fieldKey="target_audience" label="جامعه هدف" type={FieldType.LONG_TEXT} value={campaign.target_audience} onChange={(target_audience) => onChange({ target_audience })} readonly={disabled} recordId={campaign.id} />
          </div>
          <CampaignField fieldKey="start_at" label="زمان شروع" type={FieldType.DATETIME} value={campaign.start_at} onChange={(start_at) => onChange({ start_at })} readonly={disabled} />
          <CampaignField fieldKey="end_at" label="زمان پایان" type={FieldType.DATETIME} value={campaign.end_at} onChange={(end_at) => onChange({ end_at })} readonly={disabled} />
        </div>
      </Card>

      <Card title="قابل مشاهده برای" className="!rounded-2xl">
        <Alert type="info" showIcon className="mb-3" message="ایجادکننده و مسئول کمپین همواره دسترسی دارند. کاربران و نقش‌های زیر نیز می‌توانند کمپین را مشاهده کنند." />
        <AdaptiveIdentityPicker
          mode="multiple"
          value={viewerTokens}
          onChange={(value) => {
            const split = splitIdentityTokens(value);
            onChange({ viewer_user_ids: split.userIds, viewer_role_ids: split.roleIds });
          }}
          scopes={['user', 'role']}
          disabled={disabled}
          className="w-full"
          placeholder="انتخاب کاربران و نقش‌ها"
          pickerTitle="قابل مشاهده برای"
          overlayZIndexBase={13200}
        />
      </Card>
    </div>
  );
};

export default CampaignBasicsTab;
