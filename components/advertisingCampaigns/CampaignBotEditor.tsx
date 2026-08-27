import React, { useEffect, useState } from 'react';
import { Alert, Typography } from 'antd';
import AdaptiveSelectField from '../AdaptiveSelectField';
import { FieldType } from '../../types';
import { supabase } from '../../supabaseClient';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import type { CampaignBotConfig, CampaignToolRecord } from './types';
import CampaignAttachmentsField from './CampaignAttachmentsField';
import CampaignField, { useCampaignFieldSurface } from './CampaignField';
import { getPersistedCampaignToolId } from './campaignUtils';
import CampaignMessageVariablePicker, { appendCampaignMessageVariable } from './CampaignMessageVariables';

type Props = { tool: CampaignToolRecord; onChange: (patch: Partial<CampaignToolRecord>) => void; disabled?: boolean };

const CampaignBotEditor: React.FC<Props> = ({ tool, onChange, disabled }) => {
  const fieldSurface = useCampaignFieldSurface();
  const campaignPopupContainer = fieldSurface.popupContainer || resolveOverlayPopupContainer;
  const campaignOverlayZIndexBase = fieldSurface.overlayZIndexBase || 13200;
  const isGroup = tool.tool_type === 'bot_group';
  const config: CampaignBotConfig = { channel: 'telegram', group_ids: [], audience_sources: ['internal'], attachments: [], ...tool.config, kind: isGroup ? 'bot_group' : 'bot_private' } as CampaignBotConfig;
  const persistedToolId = getPersistedCampaignToolId(tool.id);
  const patch = (next: Partial<CampaignBotConfig>) => onChange({ config: { ...config, ...next } });
  const [groupOptions, setGroupOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [connectionOptions, setConnectionOptions] = useState<Array<{ label: string; value: string; channel: string }>>([]);

  useEffect(() => {
    let active = true;
    void supabase.from('integration_settings').select('id,connection_type,provider,settings').in('connection_type', ['telegram_bot', 'bale_bot', 'rubika_bot']).eq('is_active', true).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => {
        if (!active) return;
        const items = (data || []).map((row: any) => {
          const channel = String(row.connection_type || '').replace(/_bot$/, '');
          const identity = String(row.settings?.bot_username || row.settings?.bot_name || row.provider || '').trim();
          return { value: String(row.id), channel, label: `${channel === 'telegram' ? 'تلگرام' : channel === 'bale' ? 'بله' : 'روبیکا'}${identity ? ` - ${identity}` : ''}` };
        });
        setConnectionOptions(items);
        if (config.connection_id && !items.some((item) => item.value === config.connection_id)) patch({ connection_id: null });
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isGroup) return;
    let active = true;
    void supabase.from('counterparty_bot_groups').select('id,group_title,channel_type,status').eq('status', 'active').order('group_title').limit(300)
      .then(({ data }) => {
        if (!active) return;
        setGroupOptions((data || []).filter((row: any) => !config.channel || row.channel_type === config.channel).map((row: any) => ({ label: `${row.group_title || 'گروه بدون عنوان'} - ${row.channel_type}`, value: String(row.id) })));
      });
    return () => { active = false; };
  }, [config.channel, isGroup]);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-xs font-medium text-slate-500">پلتفرم بات</div>
        <AdaptiveSelectField value={config.channel} onChange={(channel) => patch({ channel, group_ids: [] })} options={[{ label: 'تلگرام', value: 'telegram' }, { label: 'بله', value: 'bale' }, { label: 'روبیکا', value: 'rubika' }]} disabled={disabled} pickerTitle="پلتفرم بات" getPopupContainer={campaignPopupContainer as any} modalContainer={campaignPopupContainer} preferLocalPopupContainer overlayZIndexBase={campaignOverlayZIndexBase} />
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium text-slate-500">اتصال بات</div>
        <AdaptiveSelectField value={config.connection_id} onChange={(connection_id) => patch({ connection_id })} options={connectionOptions.filter((item) => item.channel === config.channel)} disabled={disabled} placeholder="انتخاب اتصال فعال سازمان" pickerTitle="اتصال بات" optionFilterProp="label" showSearch getPopupContainer={campaignPopupContainer as any} modalContainer={campaignPopupContainer} preferLocalPopupContainer overlayZIndexBase={campaignOverlayZIndexBase} />
      </div>
      {isGroup ? (
        <div>
          <div className="mb-1.5 text-xs font-medium text-slate-500">گروه‌های مقصد (دستی)</div>
          <AdaptiveSelectField mode="multiple" value={config.group_ids || []} onChange={(group_ids) => patch({ group_ids })} options={groupOptions} disabled={disabled} placeholder="انتخاب گروه‌های فعال" pickerTitle="گروه‌های بات" optionFilterProp="label" showSearch getPopupContainer={campaignPopupContainer as any} modalContainer={campaignPopupContainer} preferLocalPopupContainer overlayZIndexBase={campaignOverlayZIndexBase} />
        </div>
      ) : (
        <Alert type="info" showIcon message="فقط مخاطبانی که شناسه چت معتبر و متصل به همین سازمان دارند وارد ارسال خصوصی می‌شوند؛ تعداد حذف‌شده پیش از تأیید نهایی نمایش داده خواهد شد." />
      )}
      <div className="space-y-2">
        <CampaignField fieldKey="bot_message" label="متن پیام" type={FieldType.SUPER_LONG_TEXT} value={config.message_template} onChange={(message_template) => patch({ message_template })} readonly={disabled} moduleId="advertising_campaign_tools" recordId={persistedToolId} />
        {!isGroup ? (
          <CampaignMessageVariablePicker
            disabled={disabled}
            targetLabel="متن پیام بات"
            onInsert={(token) => patch({ message_template: appendCampaignMessageVariable(config.message_template, token) })}
          />
        ) : null}
      </div>
      <CampaignAttachmentsField moduleId="advertising_campaign_tools" recordId={persistedToolId} title="پیوست‌های پیام بات" value={config.attachments} onChange={(attachments) => patch({ attachments })} disabled={disabled} />
      <CampaignField fieldKey="bot_scheduled_at" label="زمان شروع ارسال" type={FieldType.DATETIME} value={config.scheduled_at} onChange={(scheduled_at) => patch({ scheduled_at })} readonly={disabled} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <CampaignField fieldKey="bot_cta_label" label="عنوان دکمه اقدام" value={config.cta_label} onChange={(cta_label) => patch({ cta_label })} readonly={disabled} />
        <CampaignField fieldKey="bot_cta_url" label="لینک دکمه اقدام" type={FieldType.LINK} value={config.cta_url} onChange={(cta_url) => patch({ cta_url })} readonly={disabled} />
      </div>
      {isGroup ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><CampaignField fieldKey="bot_silent" label="ارسال بی‌صدا" type={FieldType.CHECKBOX} value={config.silent} onChange={(silent) => patch({ silent })} readonly={disabled} compact /><CampaignField fieldKey="bot_pin" label="سنجاق پیام در صورت پشتیبانی" type={FieldType.CHECKBOX} value={config.pin_message} onChange={(pin_message) => patch({ pin_message })} readonly={disabled} compact /></div> : null}
      <Typography.Text type="secondary" className="text-xs">فایل‌های ستاره‌دار و چند پیوست مطابق منطق فعلی FileManager در زمان ارسال در دسترس هستند.</Typography.Text>
    </div>
  );
};

export default CampaignBotEditor;
