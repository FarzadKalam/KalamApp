import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Divider, Space, Tag, Typography } from 'antd';
import { CalculatorOutlined, DownloadOutlined } from '@ant-design/icons';
import AdaptiveSelectField from '../AdaptiveSelectField';
import WorkflowActionsBuilder from '../workflows/WorkflowActionsBuilder';
import { FieldType } from '../../types';
import { supabase } from '../../supabaseClient';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import { formatPersianPrice, toPersianNumber } from '../../utils/persianNumberFormatter';
import { getConfiguredSmsSenderNumbers } from '../../utils/smsGateway';
import { useCurrencyConfig } from '../../utils/currency';
import { advertisingCampaignResponsesConfig } from '../../modules/advertisingCampaignResponsesConfig';
import type { WorkflowAction } from '../../utils/workflowTypes';
import {
  calculateSmsEstimatedCost,
  containsSmsOptOutPhrase,
  estimateSmsPages,
  mergeSmsConfig,
  getPersistedCampaignToolId,
} from './campaignUtils';
import type { CampaignSmsConfig, CampaignToolRecord } from './types';
import CampaignAttachmentsField from './CampaignAttachmentsField';
import CampaignField, { useCampaignFieldSurface } from './CampaignField';
import CampaignImportProgress from './CampaignImportProgress';
import { downloadCampaignAudienceSample } from './campaignImportSample';

type CampaignSmsEditorProps = {
  tool: CampaignToolRecord;
  onChange: (patch: Partial<CampaignToolRecord>) => void;
  disabled?: boolean;
};

const CampaignSmsEditor: React.FC<CampaignSmsEditorProps> = ({ tool, onChange, disabled }) => {
  const fieldSurface = useCampaignFieldSurface();
  const campaignPopupContainer = fieldSurface.popupContainer || resolveOverlayPopupContainer;
  const campaignOverlayZIndexBase = fieldSurface.overlayZIndexBase || 13200;
  const { label: currencyLabel } = useCurrencyConfig();
  const config = mergeSmsConfig(tool.config);
  const persistedToolId = getPersistedCampaignToolId(tool.id);
  const [senderNumbers, setSenderNumbers] = useState<string[]>([]);
  const pageEstimate = useMemo(() => estimateSmsPages(config.message_template), [config.message_template]);
  const estimatedCost = useMemo(() => calculateSmsEstimatedCost({
    costPerPage: config.cost_per_page,
    audienceCount: config.estimated_audience,
    pages: pageEstimate.pages,
    vatPercent: config.vat_percent,
  }), [config.cost_per_page, config.estimated_audience, config.vat_percent, pageEstimate.pages]);
  const patchConfig = (patch: Partial<CampaignSmsConfig>) => onChange({ config: { ...config, ...patch } });

  useEffect(() => {
    let active = true;
    void supabase.from('integration_settings').select('settings').eq('connection_type', 'sms').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (active) setSenderNumbers(getConfiguredSmsSenderNumbers(data?.settings || {})); });
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-xs font-medium text-slate-500">شماره ارسال‌کننده</div>
        <AdaptiveSelectField
          value={config.sender_number || undefined}
          onChange={(sender_number) => patchConfig({ sender_number })}
          options={senderNumbers.map((value) => ({ label: value, value }))}
          disabled={disabled}
          placeholder="انتخاب خط ثبت‌شده در تنظیمات پیامک"
          pickerTitle="خط ارسال پیامک"
          getPopupContainer={campaignPopupContainer as any}
          modalContainer={campaignPopupContainer}
          preferLocalPopupContainer
          overlayZIndexBase={campaignOverlayZIndexBase}
        />
        <Typography.Text type="danger" className="mt-1 block text-[11px]">هرگز از خطوط خدماتی برای ارسال پیامک تبلیغاتی استفاده نکنید.</Typography.Text>
      </div>
      <CampaignField fieldKey="estimated_audience" label="تعداد تخمینی مخاطبان پیامک" type={FieldType.NUMBER} value={config.estimated_audience} onChange={(estimated_audience) => patchConfig({ estimated_audience })} readonly={disabled} />
      <CampaignField fieldKey="message_template" label="متن پیامک" type={FieldType.LONG_TEXT} value={config.message_template} onChange={(message_template) => patchConfig({ message_template })} readonly={disabled} moduleId="advertising_campaign_tools" recordId={persistedToolId} />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Tag color="blue">{toPersianNumber(pageEstimate.length)} نویسه</Tag>
        <Tag color={pageEstimate.pages > 1 ? 'gold' : 'green'}>{toPersianNumber(pageEstimate.pages)} صفحه پیامک</Tag>
        <Tag>{pageEstimate.encoding === 'unicode' ? 'یونیکد / فارسی' : 'GSM'}</Tag>
        <span className="text-slate-400">{toPersianNumber(pageEstimate.remainingInPage)} نویسه تا انتهای ظرفیت فعلی</span>
      </div>
      {!containsSmsOptOutPhrase(config.message_template) ? (
        <Typography.Text type="danger" className="block text-[11px]">جهت جلوگیری از فیلتر شدن پیامک، حتماً کلمه لغو۱۱ را در انتهای پیام بنویسید.</Typography.Text>
      ) : null}

      <Card size="small" title={<Space><CalculatorOutlined />محاسبه‌گر هزینه پیامک</Space>} className="!rounded-xl">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CampaignField fieldKey="sms_cost_per_page" label="هزینه هر صفحه" type={FieldType.PRICE} value={config.cost_per_page} onChange={(cost_per_page) => patchConfig({ cost_per_page })} readonly={disabled} compact />
          <CampaignField fieldKey="sms_vat" label="ارزش افزوده (درصد)" type={FieldType.PERCENTAGE} value={config.vat_percent} onChange={(vat_percent) => patchConfig({ vat_percent })} readonly={disabled} compact />
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <Typography.Text type="secondary" className="text-xs">هزینه محاسبه‌شده</Typography.Text>
            <div className="mt-1 text-lg font-bold">{formatPersianPrice(estimatedCost)} <span className="text-xs font-normal text-slate-500">{currencyLabel}</span></div>
          </div>
          <Button disabled={disabled || estimatedCost <= 0} onClick={() => onChange({ estimated_cost: estimatedCost })}>ثبت به‌عنوان هزینه تقریبی</Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <div className="mb-1 text-xs font-medium text-slate-500">مخاطبان ارسال</div>
          <AdaptiveSelectField mode="multiple" value={config.audience_sources || []} onChange={(audience_sources) => patchConfig({ audience_sources })} options={[{ label: 'از داخل نرم‌افزار', value: 'internal' }, { label: 'افزودن از اکسل', value: 'excel' }]} disabled={disabled} pickerTitle="منبع مخاطبان پیامک" getPopupContainer={campaignPopupContainer as any} modalContainer={campaignPopupContainer} preferLocalPopupContainer overlayZIndexBase={campaignOverlayZIndexBase} />
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <CampaignField fieldKey="sms_scheduled_at" label="زمان برنامه‌ریزی شروع ارسال" type={FieldType.DATETIME} value={config.scheduled_at} onChange={(scheduled_at) => patchConfig({ scheduled_at })} readonly={disabled} />
        </div>
      </div>
      {config.audience_sources?.includes('excel') ? (
        <div className="space-y-2">
          <Button type="link" icon={<DownloadOutlined />} onClick={() => void downloadCampaignAudienceSample()}>دانلود فایل نمونه</Button>
          <CampaignAttachmentsField
            moduleId="advertising_campaign_tools"
            recordId={persistedToolId}
            title="فایل‌های مخاطبان پیامک"
            fileTypes={['file']}
            value={config.import_attachments}
            onChange={(import_attachments) => patchConfig({ import_attachments })}
            disabled={disabled}
          />
          <Alert type="info" showIcon message="فایل‌ها پس از ذخیره، به‌صورت امن و سروری پردازش می‌شوند؛ ارقام فارسی، UTF-8، رکوردهای تکراری و شماره‌های نامعتبر در گزارش import مشخص خواهند شد." />
          {persistedToolId ? <CampaignImportProgress campaignId={tool.campaign_id} toolId={persistedToolId} channel="sms" attachments={config.import_attachments || []} disabled={disabled} /> : null}
        </div>
      ) : null}

      <Divider />
      <div className="flex items-center justify-between gap-3">
        <div>
          <Typography.Text strong>تنظیمات دریافت پیامک</Typography.Text>
          <Typography.Text type="secondary" className="block text-xs">پاسخ‌های مخاطب در بازه تعیین‌شده به رکورد و ابزار همین کمپین متصل می‌شوند.</Typography.Text>
        </div>
        <div className="w-48"><CampaignField fieldKey="sms_inbound_enabled" label="فعال" type={FieldType.CHECKBOX} value={config.inbound_enabled} onChange={(inbound_enabled) => patchConfig({ inbound_enabled })} readonly={disabled} compact /></div>
      </div>
      {config.inbound_enabled ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-white/10">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <CampaignField fieldKey="reply_window_value" label="بازه دریافت پاسخ" type={FieldType.NUMBER} value={config.reply_window_value} onChange={(reply_window_value) => patchConfig({ reply_window_value })} readonly={disabled} />
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <div className="mb-1 text-xs font-medium text-slate-500">واحد بازه</div>
              <AdaptiveSelectField value={config.reply_window_unit} onChange={(reply_window_unit) => patchConfig({ reply_window_unit })} options={[{ label: 'ساعت', value: 'hour' }, { label: 'روز', value: 'day' }]} disabled={disabled} pickerTitle="واحد بازه پاسخ" getPopupContainer={campaignPopupContainer as any} modalContainer={campaignPopupContainer} preferLocalPopupContainer overlayZIndexBase={campaignOverlayZIndexBase} />
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <div className="mb-1 text-xs font-medium text-slate-500">نوع تطبیق متن</div>
              <AdaptiveSelectField value={config.inbound_match_mode} onChange={(inbound_match_mode) => patchConfig({ inbound_match_mode })} options={[{ label: 'دقیقاً برابر باشد', value: 'exact' }, { label: 'شامل عبارت باشد', value: 'contains' }]} disabled={disabled} pickerTitle="نوع تطبیق" getPopupContainer={campaignPopupContainer as any} modalContainer={campaignPopupContainer} preferLocalPopupContainer overlayZIndexBase={campaignOverlayZIndexBase} />
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-500">در صورت دریافت این مقادیر</div>
            <AdaptiveSelectField mode="tags" tokenSeparators={[',', '،', '\n']} value={config.inbound_expected_values || []} onChange={(inbound_expected_values) => patchConfig({ inbound_expected_values })} options={[]} disabled={disabled} placeholder="مقدار را بنویسید و Enter بزنید" pickerTitle="مقادیر پاسخ" getPopupContainer={campaignPopupContainer as any} modalContainer={campaignPopupContainer} preferLocalPopupContainer overlayZIndexBase={campaignOverlayZIndexBase} />
          </div>
          <WorkflowActionsBuilder
            value={(config.inbound_actions || []) as WorkflowAction[]}
            onChange={(inbound_actions) => patchConfig({ inbound_actions })}
            currentModuleId="advertising_campaign_responses"
            currentModuleFields={advertisingCampaignResponsesConfig.fields}
            variableFields={advertisingCampaignResponsesConfig.fields}
            moduleOptions={[
              { label: 'لیدهای بازاریابی', value: 'marketing_leads' },
              { label: 'مشتریان', value: 'customers' },
              { label: 'فاکتورهای فروش', value: 'invoices' },
            ]}
            dynamicOptions={{}}
            relationOptions={{}}
            actionOptions={[
              { label: 'ایجاد رکورد مرتبط', value: 'create_related_record' },
              { label: 'ایجاد رکورد مستقل', value: 'create_standalone_record' },
              { label: 'ویرایش رکورد مرتبط', value: 'update_related_record' },
            ]}
            disabled={disabled}
            overlayZIndexBase={campaignOverlayZIndexBase}
            popupContainer={campaignPopupContainer}
          />
        </div>
      ) : null}
    </div>
  );
};

export default CampaignSmsEditor;
