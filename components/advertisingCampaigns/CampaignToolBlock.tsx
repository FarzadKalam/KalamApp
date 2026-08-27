import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Collapse, Tag, Typography } from 'antd';
import { AppstoreOutlined } from '@ant-design/icons';
import AdaptiveIdentityPicker from '../AdaptiveIdentityPicker';
import AdaptiveSelectField from '../AdaptiveSelectField';
import RecordImageBox from '../RecordImageBox';
import { FieldType } from '../../types';
import { fetchProcessTemplateOptions } from '../../utils/referenceData';
import { supabase } from '../../supabaseClient';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { useCurrencyConfig } from '../../utils/currency';
import { ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID } from '../../utils/advertisingCampaigns';
import { CAMPAIGN_TOOL_STATUS_OPTIONS, getCampaignToolLabel, usesCampaignAudience } from './constants';
import { joinIdentityTokens, splitIdentityTokens } from './campaignUtils';
import type { CampaignToolRecord } from './types';
import CampaignAttachmentsField from './CampaignAttachmentsField';
import CampaignBotEditor from './CampaignBotEditor';
import CampaignEmailEditor from './CampaignEmailEditor';
import CampaignField from './CampaignField';
import CampaignInstagramEditor from './CampaignInstagramEditor';
import CampaignManualToolEditor from './CampaignManualToolEditor';
import CampaignSmsEditor from './CampaignSmsEditor';
import CampaignAuditStrip from './CampaignAuditStrip';
import { getPersistedCampaignToolId } from './campaignUtils';

type Props = {
  tool: CampaignToolRecord;
  onChange: (patch: Partial<CampaignToolRecord>) => void;
  disabled?: boolean;
  initiallyOpen?: boolean;
};

const CampaignToolBlock: React.FC<Props> = ({ tool, onChange, disabled, initiallyOpen }) => {
  const { label: currencyLabel } = useCurrencyConfig();
  const [active, setActive] = useState(initiallyOpen ? ['tool'] : []);
  const [processOptions, setProcessOptions] = useState<Array<{ label: string; value: string }>>([]);
  const config = tool.config || ({ kind: 'manual' } as any);
  const persistedToolId = getPersistedCampaignToolId(tool.id);
  const collaboratorTokens = joinIdentityTokens(tool.collaborator_user_ids, tool.collaborator_role_ids);
  const assigneeToken = tool.assignee_role_id ? `role:${tool.assignee_role_id}` : tool.assignee_id ? `user:${tool.assignee_id}` : undefined;
  const costPerLead = Number(tool.expected_leads || 0) > 0 ? Number(tool.estimated_cost || 0) / Number(tool.expected_leads) : 0;
  const costPerCustomer = Number(tool.expected_customers || 0) > 0 ? Number(tool.estimated_cost || 0) / Number(tool.expected_customers) : 0;
  const finalizedAudience = usesCampaignAudience(tool.tool_type) && Boolean((config as any).audience_finalized_at);

  useEffect(() => {
    let mounted = true;
    void fetchProcessTemplateOptions(supabase, 'advertising_campaign_tools').then((options) => { if (mounted) setProcessOptions(options); }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const channelEditor = useMemo(() => {
    const props = { tool, onChange, disabled };
    if (tool.tool_type === 'sms') return <CampaignSmsEditor {...props} />;
    if (tool.tool_type === 'email') return <CampaignEmailEditor {...props} />;
    if (tool.tool_type === 'bot_group' || tool.tool_type === 'bot_private') return <CampaignBotEditor {...props} />;
    if (tool.tool_type === 'instagram_post') return <CampaignInstagramEditor {...props} />;
    return <CampaignManualToolEditor {...props} />;
  }, [disabled, onChange, tool]);

  return (
    <Collapse
      activeKey={active}
      onChange={(keys) => setActive(keys as string[])}
      className="overflow-hidden !rounded-2xl border border-slate-200/90 bg-white dark:border-white/10 dark:bg-[#1e1e1e]"
      items={[{
        key: 'tool',
        classNames: {
          header: 'sticky top-0 z-10 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#1e1e1e]/95',
        },
        label: (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <AppstoreOutlined />
            <Typography.Text strong>{getCampaignToolLabel(tool.tool_type)}</Typography.Text>
            <Tag>{CAMPAIGN_TOOL_STATUS_OPTIONS.find((item) => item.value === tool.status)?.label || tool.status}</Tag>
            {tool.enabled === false ? <Tag color="default">غیرفعال</Tag> : null}
          </div>
        ),
        children: active.includes('tool') ? (
          <div className="space-y-5">
            {finalizedAudience ? (
              <Card size="small" title="فهرست نهایی مخاطبان این ابزار" className="!rounded-xl">
                <div className="flex flex-wrap gap-2">
                  <Tag>منطبق: {toPersianNumber(Number((config as any).matched_audience_count || 0).toLocaleString())}</Tag>
                  <Tag color="blue">یکتا: {toPersianNumber(Number((config as any).unique_audience_count || 0).toLocaleString())}</Tag>
                  <Tag color="orange">تکراری: {toPersianNumber(Number((config as any).duplicate_audience_count || 0).toLocaleString())}</Tag>
                  <Tag color="red">بدون راه ارتباطی: {toPersianNumber(Number((config as any).invalid_audience_count || 0).toLocaleString())}</Tag>
                  <Tag>حذف دستی: {toPersianNumber(Number((config as any).excluded_audience_count || 0).toLocaleString())}</Tag>
                  <Tag color="volcano">فهرست عدم ارسال: {toPersianNumber(Number((config as any).suppressed_audience_count || 0).toLocaleString())}</Tag>
                  <Tag color="green">قابل ارسال: {toPersianNumber(Number((config as any).sendable_audience_count || 0).toLocaleString())}</Tag>
                </div>
                <Typography.Text type="secondary" className="mt-2 block text-xs">
                  آخرین نهایی‌سازی: {safeJalaliFormat((config as any).audience_finalized_at, 'YYYY/MM/DD HH:mm') || '—'}؛ با تغییر شرط‌ها یا انتخاب مخاطبان، این آمار تا نهایی‌سازی دوباره پاک می‌شود.
                </Typography.Text>
              </Card>
            ) : usesCampaignAudience(tool.tool_type) ? (
              <Alert type="info" showIcon message="تعداد واقعی قابل ارسال پس از جست‌وجو و نهایی‌سازی فهرست در مرحله «مخاطبان و شرط‌ها» اینجا ثبت می‌شود." />
            ) : null}
            <Card size="small" className="!rounded-xl">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[180px_minmax(0,1fr)]">
                <RecordImageBox moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={persistedToolId || undefined} compact canEdit={!disabled && Boolean(persistedToolId)} />
                <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <CampaignField fieldKey="title" label="عنوان این اجرا" value={tool.title} onChange={(title) => onChange({ title })} readonly={disabled} moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={persistedToolId} />
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                    <div className="mb-1 text-xs font-medium text-slate-500">وضعیت ابزار</div>
                    <AdaptiveSelectField value={tool.status} onChange={(status) => onChange({ status })} options={CAMPAIGN_TOOL_STATUS_OPTIONS.map((item) => ({ ...item }))} disabled={disabled} pickerTitle="وضعیت ابزار" getPopupContainer={resolveOverlayPopupContainer as any} modalContainer={resolveOverlayPopupContainer} preferLocalPopupContainer overlayZIndexBase={13200} />
                  </div>
                  <CampaignField fieldKey="planned_start_at" label="شروع برنامه‌ریزی‌شده" type={FieldType.DATETIME} value={tool.planned_start_at} onChange={(planned_start_at) => onChange({ planned_start_at })} readonly={disabled} moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={persistedToolId} />
                  <CampaignField fieldKey="planned_end_at" label="پایان برنامه‌ریزی‌شده" type={FieldType.DATETIME} value={tool.planned_end_at} onChange={(planned_end_at) => onChange({ planned_end_at })} readonly={disabled} moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={persistedToolId} />
                  <CampaignField fieldKey="estimated_cost" label="هزینه برآوردی" type={FieldType.PRICE} value={tool.estimated_cost} onChange={(estimated_cost) => onChange({ estimated_cost })} readonly={disabled} moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={persistedToolId} />
                  <CampaignField fieldKey="expected_leads" label="لید مورد انتظار" type={FieldType.NUMBER} value={tool.expected_leads} onChange={(expected_leads) => onChange({ expected_leads })} readonly={disabled} moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={persistedToolId} />
                  <CampaignField fieldKey="expected_customers" label="مشتری مورد انتظار" type={FieldType.NUMBER} value={tool.expected_customers} onChange={(expected_customers) => onChange({ expected_customers })} readonly={disabled} moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={persistedToolId} />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><Typography.Text type="secondary" className="text-xs">هزینه برآوردی هر لید</Typography.Text><div className="font-bold">{costPerLead ? `${formatPersianPrice(costPerLead)} ${currencyLabel}` : '—'}</div></div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><Typography.Text type="secondary" className="text-xs">هزینه برآوردی هر مشتری</Typography.Text><div className="font-bold">{costPerCustomer ? `${formatPersianPrice(costPerCustomer)} ${currencyLabel}` : '—'}</div></div>
              </div>
            </Card>

            <Card size="small" title="همکاران و فرآیند اجرا" className="!rounded-xl">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div>
                  <div className="mb-1.5 text-xs font-medium text-slate-500">مسئول این ابزار</div>
                  <AdaptiveIdentityPicker
                    value={assigneeToken}
                    onChange={(value) => {
                      const token = String(value || '');
                      if (token.startsWith('role:')) onChange({ assignee_role_id: token.slice(5), assignee_id: null });
                      else if (token.startsWith('user:')) onChange({ assignee_id: token.slice(5), assignee_role_id: null });
                      else onChange({ assignee_id: null, assignee_role_id: null });
                    }}
                    scopes={['user', 'role']}
                    disabled={disabled}
                    placeholder="انتخاب کاربر یا نقش"
                    pickerTitle="مسئول ابزار"
                    overlayZIndexBase={13200}
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-medium text-slate-500">همکاران این ابزار</div>
                  <AdaptiveIdentityPicker
                    mode="multiple"
                    value={collaboratorTokens}
                    onChange={(value) => {
                      const split = splitIdentityTokens(value);
                      onChange({ collaborator_user_ids: split.userIds, collaborator_role_ids: split.roleIds });
                    }}
                    scopes={['user', 'role']}
                    disabled={disabled}
                    placeholder="انتخاب کاربران و نقش‌ها"
                    pickerTitle="همکاران ابزار"
                    overlayZIndexBase={13200}
                  />
                  <Typography.Text type="secondary" className="mt-1 block text-xs">همکاری که بیننده کامل کمپین نیست، فقط همین ابزار را در داشبورد محدود می‌بیند.</Typography.Text>
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-medium text-slate-500">الگوی فرآیند</div>
                  <AdaptiveSelectField value={tool.process_template_id} onChange={(process_template_id) => onChange({ process_template_id })} options={processOptions} disabled={disabled} placeholder="انتخاب الگوی سازگار" pickerTitle="الگوی فرآیند ابزار" optionFilterProp="label" showSearch getPopupContainer={resolveOverlayPopupContainer as any} modalContainer={resolveOverlayPopupContainer} preferLocalPopupContainer overlayZIndexBase={13200} />
                </div>
              </div>
              <Alert type="info" showIcon className="mt-3" message="اجرای واقعی، پیش‌نویس و حالت ترکیبی فرآیند V2 از زمینه همین ابزار استفاده می‌کنند و در داشبورد/مودال ابزار مدیریت می‌شوند." />
            </Card>

            <Card size="small" title="نتیجه واقعی ابزار" className="!rounded-xl">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <CampaignField fieldKey="actual_start_at" label="شروع واقعی" type={FieldType.DATETIME} value={tool.actual_start_at} onChange={(actual_start_at) => onChange({ actual_start_at })} readonly={disabled} moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={persistedToolId} />
                <CampaignField fieldKey="actual_end_at" label="پایان واقعی" type={FieldType.DATETIME} value={tool.actual_end_at} onChange={(actual_end_at) => onChange({ actual_end_at })} readonly={disabled} moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={persistedToolId} />
                <CampaignField fieldKey="actual_cost" label="هزینه واقعی" type={FieldType.PRICE} value={tool.actual_cost} onChange={(actual_cost) => onChange({ actual_cost })} readonly={disabled} moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={persistedToolId} />
                <CampaignField fieldKey="actual_leads" label="لید منتسب‌شده" type={FieldType.NUMBER} value={tool.actual_leads} onChange={() => undefined} readonly moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={persistedToolId} />
                <CampaignField fieldKey="actual_customers" label="مشتری منتسب‌شده" type={FieldType.NUMBER} value={tool.actual_customers} onChange={() => undefined} readonly moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={persistedToolId} />
                <div className="md:col-span-2 xl:col-span-3"><CampaignField fieldKey="result_summary" label="خلاصه نتیجه اجرا" type={FieldType.LONG_TEXT} value={tool.result_summary} onChange={(result_summary) => onChange({ result_summary })} readonly={disabled} moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={persistedToolId} /></div>
              </div>
            </Card>

            <Card size="small" title="تنظیمات اختصاصی ابزار" className="!rounded-xl">{channelEditor}</Card>

            <Card size="small" title="توضیحات تکمیلی ابزار" className="!rounded-xl">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
                <CampaignAttachmentsField moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={persistedToolId} value={(config as any).attachments || []} onChange={(attachments) => onChange({ config: { ...config, attachments } })} disabled={disabled} />
                <CampaignField fieldKey="tool_notes" label="یادداشت برنامه‌ریزی ابزار" type={FieldType.LONG_TEXT} value={(config as any).notes} onChange={(notes) => onChange({ config: { ...config, notes } })} readonly={disabled} moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={persistedToolId} />
              </div>
            </Card>

            <CampaignAuditStrip createdBy={tool.created_by} createdAt={tool.created_at} updatedBy={tool.updated_by} updatedAt={tool.updated_at} />
          </div>
        ) : null,
      }]}
    />
  );
};

export default CampaignToolBlock;
