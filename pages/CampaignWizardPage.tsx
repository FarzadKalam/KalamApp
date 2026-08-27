import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Result, Skeleton, Steps, Tag, Typography } from 'antd';
import { ArrowRightOutlined, CheckOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import CampaignBasicsTab from '../components/advertisingCampaigns/CampaignBasicsTab';
import CampaignBotEditor from '../components/advertisingCampaigns/CampaignBotEditor';
import CampaignConditionsTab from '../components/advertisingCampaigns/CampaignConditionsTab';
import CampaignDashboard from '../components/advertisingCampaigns/CampaignDashboard';
import CampaignEmailEditor from '../components/advertisingCampaigns/CampaignEmailEditor';
import CampaignInstagramEditor from '../components/advertisingCampaigns/CampaignInstagramEditor';
import CampaignManualToolEditor from '../components/advertisingCampaigns/CampaignManualToolEditor';
import CampaignSettingsTab from '../components/advertisingCampaigns/CampaignSettingsTab';
import CampaignSmsEditor from '../components/advertisingCampaigns/CampaignSmsEditor';
import CampaignField from '../components/advertisingCampaigns/CampaignField';
import { patchAdvertisingCampaignCollaborationTool, patchAdvertisingCampaignToolExecution } from '../components/advertisingCampaigns/campaignApi';
import { useCampaignPlanAvailability, useCampaignWizard } from '../components/advertisingCampaigns/useCampaignWizard';
import type { CampaignToolAction, CampaignToolRecord } from '../components/advertisingCampaigns/types';
import { advertisingCampaignsConfig } from '../modules/advertisingCampaignsConfig';
import { FieldType } from '../types';
import { ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID } from '../utils/advertisingCampaigns';
import { supabase } from '../supabaseClient';
import { useCurrencyConfig } from '../utils/currency';
import { CUSTOMER_CLUB_FEATURE, CUSTOMER_CLUB_PERMISSION_KEY } from '../utils/customerClub';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { fetchCurrentUserRoleContext } from '../utils/permissions';
import { hasCurrentOrgPlanFeature } from '../utils/saasPlanFeatures';

type WizardTab = 'basics' | 'settings' | 'conditions' | 'dashboard';

const CampaignWizardPage: React.FC = () => {
  const params = useParams();
  const routeId = String((params as any).id || '').trim();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const currency = useCurrencyConfig();
  const wizard = useCampaignWizard(routeId);
  const plan = useCampaignPlanAvailability();
  const [activeTab, setActiveTab] = useState<WizardTab>('basics');
  const [manualSaving, setManualSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, CampaignToolAction | null>>({});
  const [canQuickCreateClub, setCanQuickCreateClub] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      hasCurrentOrgPlanFeature(CUSTOMER_CLUB_FEATURE, { defaultEnabled: false }),
      fetchCurrentUserRoleContext(supabase),
    ]).then(([featureEnabled, context]) => {
      if (!active) return;
      const permission = context.permissions?.[CUSTOMER_CLUB_PERMISSION_KEY];
      setCanQuickCreateClub(featureEnabled && permission?.view !== false && permission?.edit !== false);
    }).catch(() => { if (active) setCanQuickCreateClub(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (wizard.accessMode === 'tool_limited') setActiveTab('dashboard');
  }, [wizard.accessMode]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (wizard.saveState !== 'dirty' && wizard.saveState !== 'saving') return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [wizard.saveState]);

  const persistAndStay = async (createIfNeeded = false) => {
    setManualSaving(true);
    try {
      const id = await wizard.persist({ createIfNeeded });
      if (id && wizard.isCreateMode) navigate(`/advertising_campaigns/${id}`, { replace: true });
      message.success('کمپین ذخیره شد.');
      return id;
    } catch (error) {
      message.error(toFaErrorMessage(error, 'ذخیره کمپین ناموفق بود.'));
      return null;
    } finally {
      setManualSaving(false);
    }
  };

  const changeTab = async (next: string) => {
    const tab = next as WizardTab;
    if (!wizard.draft.campaign.id && tab !== 'basics') {
      const id = await persistAndStay(true);
      if (!id) return;
      setActiveTab(tab);
      return;
    }
    setActiveTab(tab);
  };

  const messageSnapshot = (tool: CampaignToolRecord) => {
    const config = (tool.config || {}) as any;
    return {
      message: config.message_template || config.html_body || '',
      text: config.message_template || config.plain_text_body || config.html_body || '',
      subject: config.subject || '',
      sender_number: config.sender_number || null,
      connection_id: config.connection_id || null,
      channel: config.channel || null,
      attachments: config.attachments || [],
    };
  };

  const runToolAction = async (action: CampaignToolAction, tool: CampaignToolRecord) => {
    setActionLoading((current) => ({ ...current, [tool.id]: action }));
    try {
      if (wizard.accessMode === 'tool_limited') {
        const limitedPatch: Partial<CampaignToolRecord> = action === 'start_manual'
          ? { status: 'running', actual_start_at: tool.actual_start_at || new Date().toISOString() }
          : action === 'complete_manual'
            ? { status: 'completed', actual_end_at: new Date().toISOString() }
            : action === 'pause'
              ? { status: 'paused' }
              : action === 'resume'
                ? { status: 'running' }
                : {};
        if (!Object.keys(limitedPatch).length) throw new Error('این عملیات در فضای همکاری محدود مجاز نیست.');
        const saved = await patchAdvertisingCampaignCollaborationTool(tool.id, limitedPatch);
        wizard.applyExternalToolPatch(tool.id, saved);
        message.success('وضعیت ابزار همکاری به‌روزرسانی شد.');
        return;
      }
      if (action === 'test') {
        message.info('گیرنده آزمایشی را در تنظیمات همان کانال وارد کنید؛ ارسال آزمایشی بدون گیرنده امن انجام نمی‌شود.');
        return;
      }
      if (action === 'prepare') {
        const saved = await patchAdvertisingCampaignToolExecution(tool, { status: 'ready' });
        wizard.applyExternalToolPatch(tool.id, saved);
        message.success('ابزار برای ارسال آماده شد.');
        return;
      }
      if (action === 'start_manual' || action === 'complete_manual') {
        const patch: Partial<CampaignToolRecord> = {
          status: action === 'start_manual' ? 'running' : 'completed',
          actual_start_at: action === 'start_manual' ? (tool.actual_start_at || new Date().toISOString()) : tool.actual_start_at,
          actual_end_at: action === 'complete_manual' ? new Date().toISOString() : tool.actual_end_at,
        };
        const saved = await patchAdvertisingCampaignToolExecution(tool, patch);
        wizard.applyExternalToolPatch(tool.id, saved);
        return;
      }
      if (action === 'send_now' || action === 'schedule') {
        // شرط‌ها و انتخاب/حذف دستی مخاطبان بخشی از payload اجرای واقعی‌اند.
        // پیش از snapshot و ساخت dispatch منتظر ذخیرهٔ قطعی می‌مانیم تا کلیک
        // سریع روی «ارسال اکنون» از autosave جلو نزند و فرد حذف‌شده ارسال نگیرد.
        await wizard.persist({ createIfNeeded: true });
        const scheduledAt = action === 'schedule'
          ? ((tool.config as any)?.scheduled_at || tool.planned_start_at || null)
          : null;
        const rpcResult = await supabase.rpc('create_advertising_campaign_dispatch_from_rules', {
          p_tool_id: tool.id,
          p_channel_type: tool.tool_type,
          p_file_recipients: [],
          p_message_snapshot: messageSnapshot(tool),
          p_scheduled_at: scheduledAt,
          p_idempotency_key: `${tool.id}:${action}:${Date.now()}`,
        });
        if (rpcResult.error) throw rpcResult.error;
        wizard.applyExternalToolPatch(tool.id, { status: 'scheduled' });
        message.success(action === 'schedule' ? 'ارسال زمان‌بندی شد.' : 'ارسال در صف اجرا قرار گرفت.');
        return;
      }
      const dispatchResult = await supabase
        .from('advertising_campaign_dispatches')
        .select('id,status')
        .eq('tool_id', tool.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (dispatchResult.error) throw dispatchResult.error;
      if (!dispatchResult.data?.id) throw new Error('ارسال فعالی برای این ابزار پیدا نشد.');
      const control = await supabase.rpc('control_advertising_campaign_dispatch', {
        p_dispatch_id: dispatchResult.data.id,
        p_action: action,
      });
      if (control.error) throw control.error;
      const status = action === 'pause' ? 'paused' : action === 'cancel' ? 'canceled' : action === 'resume' || action === 'retry' ? 'scheduled' : tool.status;
      wizard.applyExternalToolPatch(tool.id, { status });
      message.success('وضعیت ارسال به‌روزرسانی شد.');
    } catch (error) {
      message.error(toFaErrorMessage(error, 'اجرای عملیات ابزار ناموفق بود.'));
    } finally {
      setActionLoading((current) => ({ ...current, [tool.id]: null }));
    }
  };

  const renderToolFields = ({ tool, readonly }: { tool: CampaignToolRecord; readonly: boolean }) => {
    const props = { tool, disabled: readonly, onChange: (patch: Partial<CampaignToolRecord>) => wizard.updateTool(tool.id, patch) };
    if (tool.tool_type === 'sms') return <CampaignSmsEditor {...props} />;
    if (tool.tool_type === 'email') return <CampaignEmailEditor {...props} />;
    if (tool.tool_type === 'bot_group' || tool.tool_type === 'bot_private') return <CampaignBotEditor {...props} />;
    if (tool.tool_type === 'instagram_post') return <CampaignInstagramEditor {...props} />;
    return <CampaignManualToolEditor {...props} />;
  };

  const renderResultFields = ({ tool, readonly }: { tool: CampaignToolRecord; readonly: boolean }) => (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <CampaignField fieldKey="actual_start_at" label="شروع واقعی" type={FieldType.DATETIME} value={tool.actual_start_at} onChange={(actual_start_at) => wizard.updateTool(tool.id, { actual_start_at })} readonly={readonly} moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={tool.id} />
      <CampaignField fieldKey="actual_end_at" label="پایان واقعی" type={FieldType.DATETIME} value={tool.actual_end_at} onChange={(actual_end_at) => wizard.updateTool(tool.id, { actual_end_at })} readonly={readonly} moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={tool.id} />
      <CampaignField fieldKey="actual_cost" label="هزینه واقعی" type={FieldType.PRICE} value={tool.actual_cost} onChange={(actual_cost) => wizard.updateTool(tool.id, { actual_cost })} readonly={readonly} moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={tool.id} />
      <CampaignField fieldKey="actual_leads" label="لید منتسب‌شده" type={FieldType.NUMBER} value={tool.actual_leads} onChange={() => undefined} readonly moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={tool.id} />
      <CampaignField fieldKey="actual_customers" label="مشتری منتسب‌شده" type={FieldType.NUMBER} value={tool.actual_customers} onChange={() => undefined} readonly moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={tool.id} />
      <div className="md:col-span-2"><CampaignField fieldKey="result_summary" label="خلاصه نتیجه اجرا" type={FieldType.LONG_TEXT} value={tool.result_summary} onChange={(result_summary) => wizard.updateTool(tool.id, { result_summary })} readonly={readonly} moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID} recordId={tool.id} /></div>
    </div>
  );

  const patchDashboardTool = async (toolId: string, patch: Partial<CampaignToolRecord>) => {
    if (wizard.accessMode === 'full') {
      wizard.updateTool(toolId, patch);
      return;
    }
    const saved = await patchAdvertisingCampaignCollaborationTool(toolId, patch);
    wizard.applyExternalToolPatch(toolId, saved);
  };

  const timeline = useMemo(() => {
    let cumulative = 0;
    return wizard.selectedTools
      .map((tool) => ({
        date: tool.actual_end_at || tool.actual_start_at || tool.planned_end_at || tool.planned_start_at,
        value: Number(tool.actual_leads || 0) + Number(tool.actual_customers || 0) || (tool.status === 'completed' ? 1 : 0),
      }))
      .filter((item): item is { date: string; value: number } => Boolean(item.date))
      .sort((left, right) => Date.parse(left.date) - Date.parse(right.date))
      .map((item) => {
        cumulative += item.value;
        const parsed = new Date(item.date);
        return {
          label: Number.isNaN(parsed.getTime()) ? 'بازه اجرا' : new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' }).format(parsed),
          value: cumulative,
        };
      });
  }, [wizard.selectedTools]);

  const tabItems = useMemo(() => {
    if (wizard.accessMode === 'tool_limited') return [{ key: 'dashboard', label: 'داشبورد همکاری', children: null }];
    return [
      { key: 'basics', label: '۱. مشخصات کمپین', children: null },
      { key: 'conditions', label: '۲. مخاطبان و شرط‌ها', children: null },
      { key: 'settings', label: '۳. تنظیمات ابزارها', children: null },
      { key: 'dashboard', label: '۴. داشبورد کمپین', children: null },
    ];
  }, [wizard.accessMode]);

  if (wizard.loading) return <div className="mx-auto max-w-[1600px] p-4 md:p-6"><Skeleton active paragraph={{ rows: 16 }} /></div>;
  if (wizard.loadError) return <Result status="error" title="کمپین بارگذاری نشد" subTitle={wizard.loadError} extra={[<Button key="retry" icon={<ReloadOutlined />} onClick={() => void wizard.reload()}>تلاش دوباره</Button>, <Button key="back" onClick={() => navigate('/advertising_campaigns')}>بازگشت به فهرست</Button>]} />;

  const readOnly = wizard.accessMode !== 'full';
  return (
    <div className="mx-auto w-full max-w-[1680px] px-3 py-4 sm:px-4 md:px-6" dir="rtl">
      <div className="sticky top-0 z-20 mb-4 overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#181818]/95">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button shape="circle" icon={<ArrowRightOutlined />} onClick={() => navigate('/advertising_campaigns')} aria-label="بازگشت به فهرست کمپین‌ها" />
            <div className="min-w-0">
              <Typography.Title level={3} className="!m-0 truncate !text-lg md:!text-xl">{wizard.draft.campaign.name || 'کمپین تبلیغاتی جدید'}</Typography.Title>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                {wizard.draft.campaign.system_code ? <Tag>{wizard.draft.campaign.system_code}</Tag> : null}
                <span>{wizard.saveState === 'saving' ? 'در حال ذخیره…' : wizard.saveState === 'dirty' ? 'تغییرات ذخیره‌نشده' : wizard.saveState === 'error' ? 'خطا در ذخیره' : wizard.lastSavedAt ? 'ذخیره شد' : 'آماده ویرایش'}</span>
              </div>
            </div>
          </div>
          {!readOnly ? <Button type="primary" icon={wizard.saveState === 'saved' ? <CheckOutlined /> : <SaveOutlined />} loading={manualSaving || wizard.saveState === 'saving'} onClick={() => void persistAndStay(!wizard.draft.campaign.id)}>ذخیره کمپین</Button> : null}
        </div>
        {wizard.saveError ? <Alert type="error" showIcon className="mt-3" message={wizard.saveError} /> : null}
        {wizard.recoveredLocalDraft ? <Alert type="info" showIcon className="mt-3" message="پیش‌نویس ذخیره‌شده روی این دستگاه بازیابی شد. با برقرار شدن اتصال، تغییرات به‌صورت خودکار ذخیره می‌شوند." /> : null}
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/10">
          <Steps
            current={Math.max(0, tabItems.findIndex((item) => item.key === activeTab))}
            items={tabItems.map((item) => ({ title: item.label.replace(/^\d+\.\s*/, '') }))}
            onChange={(index) => { const item = tabItems[index]; if (item) void changeTab(item.key); }}
            responsive
            size="small"
          />
        </div>
      </div>

      {activeTab === 'basics' ? (
        <CampaignBasicsTab campaign={wizard.draft.campaign} onChange={wizard.updateCampaign} onToolTypesChange={wizard.setToolTypes} availability={plan.availability} availabilityLoading={plan.loading} canQuickCreateClub={canQuickCreateClub} disabled={readOnly} />
      ) : activeTab === 'settings' ? (
        <CampaignSettingsTab campaignId={wizard.draft.campaign.id} tools={wizard.selectedTools} onToolChange={wizard.updateTool} disabled={readOnly} />
      ) : activeTab === 'conditions' ? (
        <CampaignConditionsTab
          campaignId={wizard.draft.campaign.id}
          campaignName={wizard.draft.campaign.name}
          tools={wizard.selectedTools}
          rules={wizard.draft.audienceRules}
          onRuleChange={wizard.updateAudienceRule}
          onToolChange={wizard.updateTool}
          onBeforeAudienceSearch={() => wizard.persist({ createIfNeeded: true })}
          disabled={readOnly}
        />
      ) : (
        <CampaignDashboard
          campaign={{ ...wizard.draft.campaign, access_mode: wizard.accessMode }}
          tools={wizard.selectedTools}
          moduleConfig={advertisingCampaignsConfig}
          accessMode={wizard.accessMode}
          currencyLabel={currency.label}
          timeline={timeline}
          actionLoadingByToolId={actionLoading}
          onToolAction={runToolAction}
          onToolPatch={patchDashboardTool}
          onToolStatusChange={(tool, status) => patchDashboardTool(tool.id, { status })}
          onCreateRelated={wizard.accessMode === 'full' ? (moduleId, initialValues) => navigate(`/${moduleId}/create`, { state: { initialValues } }) : undefined}
          renderToolFields={renderToolFields as any}
          renderResultFields={renderResultFields as any}
        />
      )}
    </div>
  );
};

export default CampaignWizardPage;
