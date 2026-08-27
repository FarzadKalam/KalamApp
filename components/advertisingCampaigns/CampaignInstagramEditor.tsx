import React, { useEffect, useState } from 'react';
import { Alert } from 'antd';
import AdaptiveSelectField from '../AdaptiveSelectField';
import { supabase } from '../../supabaseClient';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import type { CampaignInstagramPostConfig, CampaignToolRecord } from './types';
import CampaignAttachmentsField from './CampaignAttachmentsField';
import CampaignContentTable from './CampaignContentTable';
import { getPersistedCampaignToolId } from './campaignUtils';
import { useCampaignFieldSurface } from './CampaignField';

type Props = { tool: CampaignToolRecord; onChange: (patch: Partial<CampaignToolRecord>) => void; disabled?: boolean };

const CampaignInstagramEditor: React.FC<Props> = ({ tool, onChange, disabled }) => {
  const fieldSurface = useCampaignFieldSurface();
  const campaignPopupContainer = fieldSurface.popupContainer || resolveOverlayPopupContainer;
  const campaignOverlayZIndexBase = fieldSurface.overlayZIndexBase || 13200;
  const config: CampaignInstagramPostConfig = { attachments: [], content_items: [], ...tool.config, kind: 'instagram_post' } as CampaignInstagramPostConfig;
  const persistedToolId = getPersistedCampaignToolId(tool.id);
  const patch = (next: Partial<CampaignInstagramPostConfig>) => onChange({ config: { ...config, ...next } });
  const [accounts, setAccounts] = useState<Array<{ label: string; value: string }>>([]);
  useEffect(() => {
    let active = true;
    void supabase.from('instagram_accounts').select('id,username,display_name').eq('is_active', true).order('username').limit(100)
      .then(({ data }) => { if (active) setAccounts((data || []).map((row: any) => ({ label: row.display_name ? `${row.display_name} (@${row.username})` : `@${row.username}`, value: String(row.id) }))); });
    return () => { active = false; };
  }, []);
  return (
    <div className="space-y-4">
      <Alert type="info" showIcon message="در این نسخه انتشار مستقیم انجام نمی‌شود. محتوا را برنامه‌ریزی کنید و پس از انتشار، پست همگام‌شده یا لینک آن را به ردیف متصل کنید." />
      <div>
        <div className="mb-1.5 text-xs font-medium text-slate-500">حساب پیش‌فرض اینستاگرام</div>
        <AdaptiveSelectField value={config.account_id} onChange={(account_id) => patch({ account_id })} options={accounts} disabled={disabled} placeholder="انتخاب حساب متصل" pickerTitle="حساب اینستاگرام" optionFilterProp="label" showSearch getPopupContainer={campaignPopupContainer as any} modalContainer={campaignPopupContainer} preferLocalPopupContainer overlayZIndexBase={campaignOverlayZIndexBase} />
      </div>
      <CampaignAttachmentsField moduleId="advertising_campaign_tools" recordId={persistedToolId} title="فایل‌های عمومی تولید محتوا" fileTypes={['image', 'video', 'file']} value={config.attachments} onChange={(attachments) => patch({ attachments })} disabled={disabled} />
      <CampaignContentTable value={config.content_items} onChange={(content_items) => patch({ content_items })} recordId={persistedToolId || undefined} variant="instagram" readOnly={disabled} />
    </div>
  );
};

export default CampaignInstagramEditor;
