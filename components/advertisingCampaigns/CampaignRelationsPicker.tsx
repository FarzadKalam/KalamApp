import React, { useEffect, useState } from 'react';
import { App, Button, Form, Modal, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import AdaptiveSelectField from '../AdaptiveSelectField';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import CampaignField from './CampaignField';
import {
  createQuickDiscountCode,
  createQuickLoyaltyRule,
  loadCampaignRelationOptions,
  type CampaignRelationOption,
} from './campaignApi';

type CampaignRelationsPickerProps = {
  loyaltyRuleIds: string[];
  discountCodeIds: string[];
  onLoyaltyRulesChange: (value: string[]) => void;
  onDiscountCodesChange: (value: string[]) => void;
  canQuickCreate?: boolean;
  disabled?: boolean;
};

const CampaignRelationsPicker: React.FC<CampaignRelationsPickerProps> = ({
  loyaltyRuleIds,
  discountCodeIds,
  onLoyaltyRulesChange,
  onDiscountCodesChange,
  canQuickCreate = true,
  disabled,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<CampaignRelationOption[]>([]);
  const [codes, setCodes] = useState<CampaignRelationOption[]>([]);
  const [quickType, setQuickType] = useState<'rule' | 'code' | null>(null);
  const [quickDraft, setQuickDraft] = useState({ name: '', code: '', title: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await loadCampaignRelationOptions();
      setRules(result.loyaltyRules);
      setCodes(result.discountCodes);
    } catch (error) {
      message.warning(toFaErrorMessage(error, 'خواندن طرح‌ها و کدهای تخفیف ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const saveQuick = async () => {
    setSaving(true);
    try {
      if (quickType === 'rule') {
        if (!quickDraft.name.trim()) throw new Error('عنوان طرح الزامی است.');
        const option = await createQuickLoyaltyRule(quickDraft.name);
        setRules((current) => [option, ...current]);
        onLoyaltyRulesChange(Array.from(new Set([...loyaltyRuleIds, option.value])));
      } else {
        if (!quickDraft.title.trim() || !quickDraft.code.trim()) throw new Error('عنوان و کد تخفیف الزامی است.');
        const option = await createQuickDiscountCode({ title: quickDraft.title, code: quickDraft.code });
        setCodes((current) => [option, ...current]);
        onDiscountCodesChange(Array.from(new Set([...discountCodeIds, option.value])));
      }
      setQuickType(null);
      setQuickDraft({ name: '', code: '', title: '' });
      message.success('رکورد جدید ایجاد و به کمپین متصل شد.');
    } catch (error) {
      message.error(toFaErrorMessage(error, 'افزودن سریع ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  const picker = (
    label: string,
    value: string[],
    options: CampaignRelationOption[],
    onChange: (value: string[]) => void,
    type: 'rule' | 'code',
  ) => (
    <div>
      <div className="mb-1.5 text-xs font-medium text-slate-500">{label}</div>
      <div className="flex items-start gap-2">
        <AdaptiveSelectField
          mode="multiple"
          value={value}
          options={options}
          loading={loading}
          disabled={disabled}
          onChange={(next) => onChange(Array.isArray(next) ? next : [])}
          className="min-w-0 flex-1"
          placeholder={`انتخاب ${label}`}
          pickerTitle={label}
          optionFilterProp="label"
          showSearch
          getPopupContainer={resolveOverlayPopupContainer as any}
          modalContainer={resolveOverlayPopupContainer}
          preferLocalPopupContainer
          overlayZIndexBase={13200}
        />
        {canQuickCreate && !disabled ? (
          <Button icon={<PlusOutlined />} aria-label={`افزودن سریع ${label}`} onClick={() => setQuickType(type)} />
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {picker('طرح‌های باشگاه مشتریان', loyaltyRuleIds, rules, onLoyaltyRulesChange, 'rule')}
        {picker('کدهای تخفیف', discountCodeIds, codes, onDiscountCodesChange, 'code')}
      </div>
      <Modal
        open={Boolean(quickType)}
        onCancel={() => setQuickType(null)}
        onOk={() => void saveQuick()}
        confirmLoading={saving}
        title={quickType === 'rule' ? 'افزودن سریع طرح باشگاه مشتریان' : 'افزودن سریع کد تخفیف'}
        okText="ایجاد و انتخاب"
        cancelText="انصراف"
        zIndex={13300}
      >
        <Form layout="vertical" className="pt-3">
          {quickType === 'rule' ? (
            <CampaignField fieldKey="quick_rule_name" label="عنوان طرح" value={quickDraft.name} onChange={(name) => setQuickDraft((current) => ({ ...current, name }))} required />
          ) : (
            <Space direction="vertical" className="w-full" size="middle">
              <CampaignField fieldKey="quick_discount_title" label="عنوان کد تخفیف" value={quickDraft.title} onChange={(title) => setQuickDraft((current) => ({ ...current, title }))} required />
              <CampaignField fieldKey="quick_discount_code" label="کد" value={quickDraft.code} onChange={(code) => setQuickDraft((current) => ({ ...current, code }))} required />
            </Space>
          )}
        </Form>
      </Modal>
    </>
  );
};

export default CampaignRelationsPicker;
