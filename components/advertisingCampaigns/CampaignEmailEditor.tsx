import React, { useMemo } from 'react';
import { Alert, Button, Card, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import AdaptiveSelectField from '../AdaptiveSelectField';
import { FieldType } from '../../types';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import { formatPersianPrice } from '../../utils/persianNumberFormatter';
import { useCurrencyConfig } from '../../utils/currency';
import type { CampaignEmailConfig, CampaignToolRecord } from './types';
import CampaignAttachmentsField from './CampaignAttachmentsField';
import CampaignField, { useCampaignFieldSurface } from './CampaignField';
import { getPersistedCampaignToolId } from './campaignUtils';
import CampaignImportProgress from './CampaignImportProgress';
import { downloadCampaignAudienceSample } from './campaignImportSample';
import CampaignMessageVariablePicker, { appendCampaignMessageVariable } from './CampaignMessageVariables';

type Props = { tool: CampaignToolRecord; onChange: (patch: Partial<CampaignToolRecord>) => void; disabled?: boolean };

const CampaignEmailEditor: React.FC<Props> = ({ tool, onChange, disabled }) => {
  const fieldSurface = useCampaignFieldSurface();
  const campaignPopupContainer = fieldSurface.popupContainer || resolveOverlayPopupContainer;
  const campaignOverlayZIndexBase = fieldSurface.overlayZIndexBase || 13200;
  const { label: currencyLabel } = useCurrencyConfig();
  const config: CampaignEmailConfig = { audience_sources: ['internal'], vat_percent: 10, unsubscribe_footer_enabled: true, attachments: [], ...tool.config, kind: 'email' } as CampaignEmailConfig;
  const persistedToolId = getPersistedCampaignToolId(tool.id);
  const patch = (next: Partial<CampaignEmailConfig>) => onChange({ config: { ...config, ...next } });
  const estimatedCost = useMemo(() => {
    const net = Math.max(0, Number(config.cost_per_email || 0)) * Math.max(0, Number(config.estimated_audience || 0));
    return Math.round(net * (1 + Math.max(0, Number(config.vat_percent || 0)) / 100) * 100) / 100;
  }, [config.cost_per_email, config.estimated_audience, config.vat_percent]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <CampaignField fieldKey="email_sender_name" label="نام فرستنده" value={config.sender_name} onChange={(sender_name) => patch({ sender_name })} readonly={disabled} />
        <CampaignField fieldKey="email_reply_to" label="ایمیل Reply-To" value={config.reply_to} onChange={(reply_to) => patch({ reply_to })} readonly={disabled} />
        <CampaignField fieldKey="email_estimated_audience" label="تعداد تخمینی مخاطبان ایمیل" type={FieldType.NUMBER} value={config.estimated_audience} onChange={(estimated_audience) => patch({ estimated_audience })} readonly={disabled} />
        <CampaignField fieldKey="email_scheduled_at" label="زمان شروع ارسال" type={FieldType.DATETIME} value={config.scheduled_at} onChange={(scheduled_at) => patch({ scheduled_at })} readonly={disabled} />
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium text-slate-500">مخاطبان ارسال</div>
        <AdaptiveSelectField mode="multiple" value={config.audience_sources || []} onChange={(audience_sources) => patch({ audience_sources })} options={[{ label: 'از داخل نرم‌افزار', value: 'internal' }, { label: 'افزودن از اکسل', value: 'excel' }]} disabled={disabled} pickerTitle="منبع مخاطبان ایمیل" getPopupContainer={campaignPopupContainer as any} modalContainer={campaignPopupContainer} preferLocalPopupContainer overlayZIndexBase={campaignOverlayZIndexBase} />
      </div>
      {config.audience_sources?.includes('excel') ? (
        <div className="space-y-3">
          <Button type="link" icon={<DownloadOutlined />} onClick={() => void downloadCampaignAudienceSample()}>دانلود فایل نمونه</Button>
          <CampaignAttachmentsField moduleId="advertising_campaign_tools" recordId={persistedToolId} title="فایل‌های مخاطبان ایمیل" fileTypes={['file']} value={config.import_attachments} onChange={(import_attachments) => patch({ import_attachments })} disabled={disabled} />
          {persistedToolId ? <CampaignImportProgress campaignId={tool.campaign_id} toolId={persistedToolId} channel="email" attachments={config.import_attachments || []} disabled={disabled} /> : null}
        </div>
      ) : null}
      <CampaignField fieldKey="email_subject" label="موضوع ایمیل" value={config.subject} onChange={(subject) => patch({ subject })} readonly={disabled} required />
      <CampaignField fieldKey="email_preheader" label="پیش‌نمایش کوتاه (Preheader)" value={config.preheader} onChange={(preheader) => patch({ preheader })} readonly={disabled} />
      <div className="space-y-2">
        <CampaignField fieldKey="email_html_body" label="متن ایمیل" type={FieldType.SUPER_LONG_TEXT} value={config.html_body} onChange={(html_body) => patch({ html_body })} readonly={disabled} moduleId="advertising_campaign_tools" recordId={persistedToolId} />
        {config.audience_sources?.includes('internal') ? (
          <CampaignMessageVariablePicker
            disabled={disabled}
            targetLabel="متن ایمیل"
            onInsert={(token) => patch({ html_body: appendCampaignMessageVariable(config.html_body, token) })}
          />
        ) : null}
      </div>
      <CampaignField fieldKey="email_plain_body" label="نسخه متنی جایگزین" type={FieldType.LONG_TEXT} value={config.plain_text_body} onChange={(plain_text_body) => patch({ plain_text_body })} readonly={disabled} moduleId="advertising_campaign_tools" recordId={persistedToolId} />
      <CampaignAttachmentsField moduleId="advertising_campaign_tools" recordId={persistedToolId} title="پیوست‌های ایمیل" value={config.attachments} onChange={(attachments) => patch({ attachments })} disabled={disabled} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <CampaignField fieldKey="email_utm_source" label="UTM Source" value={config.utm_source} onChange={(utm_source) => patch({ utm_source })} readonly={disabled} />
        <CampaignField fieldKey="email_utm_medium" label="UTM Medium" value={config.utm_medium} onChange={(utm_medium) => patch({ utm_medium })} readonly={disabled} />
        <CampaignField fieldKey="email_utm_campaign" label="UTM Campaign" value={config.utm_campaign} onChange={(utm_campaign) => patch({ utm_campaign })} readonly={disabled} />
      </div>
      <Alert type="warning" showIcon message={<div className="flex flex-wrap items-center justify-between gap-3"><span>پیوند لغو اشتراک برای ایمیل تبلیغاتی الزامی است.</span><div className="w-40"><CampaignField fieldKey="email_unsubscribe" label="فعال" type={FieldType.CHECKBOX} value={true} onChange={() => undefined} readonly compact /></div></div>} />
      <Card size="small" title="محاسبه‌گر هزینه ایمیل" className="!rounded-xl">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <CampaignField fieldKey="email_unit_cost" label="هزینه هر ایمیل" type={FieldType.PRICE} value={config.cost_per_email} onChange={(cost_per_email) => patch({ cost_per_email })} readonly={disabled} compact />
          <CampaignField fieldKey="email_vat" label="ارزش افزوده (درصد)" type={FieldType.PERCENTAGE} value={config.vat_percent} onChange={(vat_percent) => patch({ vat_percent })} readonly={disabled} compact />
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><Typography.Text type="secondary" className="text-xs">هزینه محاسبه‌شده</Typography.Text><div className="mt-1 text-lg font-bold">{formatPersianPrice(estimatedCost)} <span className="text-xs font-normal text-slate-500">{currencyLabel}</span></div></div>
          <Button disabled={disabled || estimatedCost <= 0} onClick={() => onChange({ estimated_cost: estimatedCost })}>ثبت هزینه تقریبی</Button>
        </div>
      </Card>
    </div>
  );
};

export default CampaignEmailEditor;
