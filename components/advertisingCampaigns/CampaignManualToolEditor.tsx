import React from 'react';
import { Alert } from 'antd';
import AdaptiveSelectField from '../AdaptiveSelectField';
import { FieldType } from '../../types';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import { getCampaignToolLabel } from '../../utils/advertisingCampaigns';
import type { CampaignManualToolConfig, CampaignToolRecord } from './types';
import CampaignAttachmentsField from './CampaignAttachmentsField';
import CampaignContentTable from './CampaignContentTable';
import CampaignField from './CampaignField';
import { getPersistedCampaignToolId } from './campaignUtils';

type Props = { tool: CampaignToolRecord; onChange: (patch: Partial<CampaignToolRecord>) => void; disabled?: boolean };

const FIELD_LABELS: Record<string, { vendor: string; location: string; platform: string; objective: string }> = {
  outdoor: { vendor: 'مجری / مالک رسانه', location: 'محل نصب یا نمایش', platform: 'نوع رسانه محیطی', objective: 'شرح مجوز و ابعاد' },
  instagram_ads: { vendor: 'مجری یا صفحه تبلیغ‌کننده', location: 'محدوده جامعه هدف', platform: 'حساب / پلتفرم', objective: 'هدف تبلیغ' },
  click_ads: { vendor: 'مجری / ارائه‌دهنده', location: 'محدوده نمایش', platform: 'شبکه تبلیغاتی', objective: 'هدف تبدیل' },
  exhibition: { vendor: 'برگزارکننده', location: 'محل نمایشگاه و غرفه', platform: 'نام نمایشگاه', objective: 'هدف حضور' },
  conference: { vendor: 'برگزارکننده', location: 'محل همایش', platform: 'عنوان رویداد', objective: 'نوع حضور / اسپانسرینگ' },
  advertorial: { vendor: 'ناشر', location: 'دامنه / رسانه', platform: 'نوع انتشار', objective: 'موضوع و Anchor' },
  influencer: { vendor: 'اینفلوئنسر / صفحه', location: 'جامعه مخاطب', platform: 'پلتفرم', objective: 'خروجی‌های مورد تعهد' },
  content_seo: { vendor: 'نویسنده / مجری', location: 'وب‌سایت مقصد', platform: 'نوع محتوا', objective: 'کلمه کلیدی و هدف رتبه' },
  affiliate: { vendor: 'شریک / معرف', location: 'کانال معرفی', platform: 'مدل همکاری', objective: 'نرخ و قاعده کمیسیون' },
  sponsorship: { vendor: 'طرف قرارداد', location: 'محل یا رسانه', platform: 'سطح حمایت', objective: 'مزایا و تعهدات' },
};

const CampaignManualToolEditor: React.FC<Props> = ({ tool, onChange, disabled }) => {
  const config: CampaignManualToolConfig = { attachments: [], content_items: [], custom_values: {}, ...tool.config, kind: 'manual' } as CampaignManualToolConfig;
  const persistedToolId = getPersistedCampaignToolId(tool.id);
  const patch = (next: Partial<CampaignManualToolConfig>) => onChange({ config: { ...config, ...next } });
  const labels = FIELD_LABELS[String(tool.tool_type)] || { vendor: 'مجری / تامین‌کننده', location: 'موقعیت یا رسانه', platform: 'بستر اجرا', objective: 'هدف و خروجی مورد انتظار' };
  return (
    <div className="space-y-4">
      <Alert type="info" showIcon message={`${getCampaignToolLabel(tool.tool_type)} یک ابزار اجرایی است؛ نتیجه واقعی، هزینه، تاریخ و رسانه‌های آن را پس از اجرا تکمیل کنید.`} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <CampaignField fieldKey="manual_vendor" label={labels.vendor} value={config.vendor} onChange={(vendor) => patch({ vendor })} readonly={disabled} />
        <CampaignField fieldKey="manual_location" label={labels.location} value={config.location} onChange={(location) => patch({ location })} readonly={disabled} />
        <CampaignField fieldKey="manual_platform" label={labels.platform} value={config.platform} onChange={(platform) => patch({ platform })} readonly={disabled} />
        <CampaignField fieldKey="manual_objective" label={labels.objective} type={FieldType.LONG_TEXT} value={config.objective} onChange={(objective) => patch({ objective })} readonly={disabled} />
        <div>
          <div className="mb-1.5 text-xs font-medium text-slate-500">مدل هزینه</div>
          <AdaptiveSelectField value={config.pricing_model} onChange={(pricing_model) => patch({ pricing_model })} options={[{ label: 'مبلغ ثابت', value: 'fixed' }, { label: 'به‌ازای کلیک (CPC)', value: 'cpc' }, { label: 'به‌ازای هزار نمایش (CPM)', value: 'cpm' }, { label: 'به‌ازای اقدام (CPA)', value: 'cpa' }]} disabled={disabled} pickerTitle="مدل هزینه" getPopupContainer={resolveOverlayPopupContainer as any} modalContainer={resolveOverlayPopupContainer} preferLocalPopupContainer overlayZIndexBase={13200} />
        </div>
        <CampaignField fieldKey="manual_landing_url" label="لینک مقصد / صفحه فرود" type={FieldType.LINK} value={config.landing_url} onChange={(landing_url) => patch({ landing_url })} readonly={disabled} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <CampaignField fieldKey="manual_impressions" label="نمایش واقعی" type={FieldType.NUMBER} value={config.impressions} onChange={(impressions) => patch({ impressions })} readonly={disabled} />
        <CampaignField fieldKey="manual_clicks" label="کلیک واقعی" type={FieldType.NUMBER} value={config.clicks} onChange={(clicks) => patch({ clicks })} readonly={disabled} />
        <CampaignField fieldKey="manual_conversions" label="تبدیل واقعی" type={FieldType.NUMBER} value={config.conversions} onChange={(conversions) => patch({ conversions })} readonly={disabled} />
      </div>
      <CampaignAttachmentsField moduleId="advertising_campaign_tools" recordId={persistedToolId} title="فایل‌ها، قرارداد و مستندات اجرا" value={config.attachments} onChange={(attachments) => patch({ attachments })} disabled={disabled} />
      <CampaignContentTable value={config.content_items} onChange={(content_items) => patch({ content_items })} recordId={persistedToolId || undefined} variant="advertising" readOnly={disabled} />
    </div>
  );
};

export default CampaignManualToolEditor;
