import React, { useEffect, useMemo, useState } from 'react';
import { App, Badge, Button, Descriptions, Input, Modal, Skeleton, Tag, Tooltip } from 'antd';
import {
  FileOutlined,
  HistoryOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  NodeIndexOutlined,
  ReadOutlined,
  SendOutlined,
  FileTextOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import {
  ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID,
  CAMPAIGN_TOOL_STATUS_OPTIONS,
  getCampaignToolLabel,
  type CampaignAccessMode,
  type CampaignToolStatus,
} from '../../utils/advertisingCampaigns';
import { AI_CONTEXT_EVENT, type AssistantContext } from '../../utils/aiAssistantEvents';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import RecordImageBox from '../RecordImageBox';
import ActivityPanel from '../Sidebar/ActivityPanel';
import AssistantPanel from '../ai/AssistantPanel';
import AiSparkleIcon from '../ai/AiSparkleIcon';
import SmartFieldRenderer from '../SmartFieldRenderer';
import type { ModuleField } from '../../types';
import type { CampaignRecord, CampaignToolAction, CampaignToolRecord } from './types';
import { isAutomatedCampaignTool } from './CampaignToolCard';
import CampaignToolReportPanel from './CampaignToolReportPanel';
import CampaignDeliveryReportPanel from './CampaignDeliveryReportPanel';
import { supabase } from '../../supabaseClient';
import TaskStatusActionStrip, {
  TASK_STATUS_TILE_CLASS_NAME,
  TASK_STATUS_TILE_ICON_CLASS_NAME,
} from '../tasks/TaskStatusActionStrip';
import CampaignToolDeliverySummaryCards from './CampaignToolDeliverySummaryCards';
import { buildCampaignMessageSnapshot, getCampaignToolEmptyMessageError } from './campaignUtils';
import { CampaignFieldSurfaceProvider } from './CampaignField';
import { useCampaignMessageVariableOptions } from './CampaignMessageVariables';

const ProcessCardsV2RuntimeBlock = React.lazy(() => import('../processes/ProcessCardsV2RuntimeBlock'));

type ToolModalSideTab = 'files' | 'conversation' | 'ai' | 'changelogs';
type ToolModalMainTab = 'details' | 'process' | 'results' | 'delivery' | 'report';

type CampaignToolWorkspaceModalProps = {
  open: boolean;
  campaign: CampaignRecord;
  tool: CampaignToolRecord | null;
  accessMode: CampaignAccessMode;
  currencyLabel?: string;
  mentionUsers?: any[];
  mentionRoles?: any[];
  onClose: () => void;
  onToolPatch?: (toolId: string, patch: Partial<CampaignToolRecord> & Record<string, unknown>) => void | Promise<void>;
  onStatusChange?: (tool: CampaignToolRecord, status: CampaignToolStatus) => void | Promise<void>;
  onToolAction?: (action: CampaignToolAction, tool: CampaignToolRecord) => void | Promise<void>;
  actionLoading?: CampaignToolAction | null;
  onCreateRelated?: (moduleId: 'marketing_leads' | 'customers' | 'invoices') => void;
  renderToolFields?: (context: {
    tool: CampaignToolRecord;
    readonly: boolean;
    overlayZIndexBase: number;
    popupContainer: typeof resolveOverlayPopupContainer;
  }) => React.ReactNode;
  renderResultFields?: (context: {
    tool: CampaignToolRecord;
    readonly: boolean;
    overlayZIndexBase: number;
    popupContainer: typeof resolveOverlayPopupContainer;
  }) => React.ReactNode;
};

const COMMON_FIELD_KEYS = new Set([
  'estimated_cost',
  'actual_cost',
  'planned_start_at',
  'planned_end_at',
  'actual_start_at',
  'actual_end_at',
  'expected_leads',
  'actual_leads',
  'expected_customers',
  'actual_customers',
]);

const RESULT_FIELD_KEYS = new Set(['actual_cost', 'actual_start_at', 'actual_end_at', 'actual_leads', 'actual_customers', 'result_summary']);
const STATUS_TONES: Record<string, string> = {
  default: '#64748b', blue: '#2563eb', cyan: '#0891b2', orange: '#ea580c', red: '#dc2626', green: '#16a34a',
};
const CAMPAIGN_STATUS_ICON_KEYS: Record<CampaignToolStatus, string> = {
  draft: 'circle', ready: 'check', scheduled: 'clock', running: 'play', paused: 'pause',
  completed: 'approve', failed: 'warning', canceled: 'cancel',
};

const sideTabs: Array<{ key: ToolModalSideTab; label: string; icon: React.ReactNode }> = [
  { key: 'files', label: 'فایل‌ها', icon: <FileOutlined /> },
  { key: 'conversation', label: 'گفتگو', icon: <MessageOutlined /> },
  { key: 'ai', label: 'هوش مصنوعی', icon: <AiSparkleIcon className="h-4 w-4" /> },
  { key: 'changelogs', label: 'آخرین تغییرات', icon: <HistoryOutlined /> },
];

const CampaignToolWorkspaceModal: React.FC<CampaignToolWorkspaceModalProps> = ({
  open,
  campaign,
  tool,
  accessMode,
  currencyLabel = '',
  mentionUsers = [],
  mentionRoles = [],
  onClose,
  onToolPatch,
  onStatusChange,
  onToolAction,
  actionLoading = null,
  onCreateRelated,
  renderToolFields,
  renderResultFields,
}) => {
  const campaignVariableOptions = useCampaignMessageVariableOptions();
  const [sideTab, setSideTab] = useState<ToolModalSideTab>('files');
  const [mainTab, setMainTab] = useState<ToolModalMainTab>('details');
  const [statusSaving, setStatusSaving] = useState<CampaignToolStatus | null>(null);
  const [testRecipient, setTestRecipient] = useState('');
  const [testSending, setTestSending] = useState(false);
  const { message } = App.useApp();
  const moduleConfig = MODULES[ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID];
  const detailsReadonly = accessMode !== 'full' || !onToolPatch;
  const resultsReadonly = !onToolPatch;
  const toolRecord = tool as (CampaignToolRecord & Record<string, any>) | null;

  useEffect(() => {
    if (!open) return;
    setSideTab('files');
    setMainTab('details');
    setTestRecipient('');
  }, [open, tool?.id]);

  const dispatchAiContext = React.useCallback(() => {
    if (!tool?.id || typeof window === 'undefined') return;
    const detail: AssistantContext = {
      mode: 'record',
      moduleId: ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID,
      recordId: tool.id,
      route: `${window.location.pathname}${window.location.search || ''}`,
    };
    window.dispatchEvent(new CustomEvent(AI_CONTEXT_EVENT, { detail }));
  }, [tool?.id]);

  useEffect(() => {
    if (open && sideTab === 'ai') {
      dispatchAiContext();
      window.setTimeout(dispatchAiContext, 0);
    }
  }, [dispatchAiContext, open, sideTab]);

  const editableFields = useMemo(() => {
    if (!moduleConfig) return [] as ModuleField[];
    return moduleConfig.fields.filter((field) => COMMON_FIELD_KEYS.has(field.key));
  }, [moduleConfig]);

  const resultFields = useMemo(() => editableFields.filter((field) => RESULT_FIELD_KEYS.has(field.key)), [editableFields]);
  const detailFields = useMemo(() => editableFields.filter((field) => !RESULT_FIELD_KEYS.has(field.key)), [editableFields]);

  if (!tool || !toolRecord) return null;

  const patchField = (fieldKey: string, value: unknown) => {
    if (!onToolPatch) return;
    void onToolPatch(tool.id, { [fieldKey]: value });
  };

  const changeStatus = async (status: CampaignToolStatus) => {
    if (!onStatusChange || status === tool.status) return;
    setStatusSaving(status);
    try {
      await onStatusChange(tool, status);
    } finally {
      setStatusSaving(null);
    }
  };

  const allowedStatusValues = accessMode === 'tool_limited'
    ? new Set<CampaignToolStatus>(['running', 'paused', 'completed'])
    : null;
  const automated = isAutomatedCampaignTool(tool);
  const sendTest = async () => {
    const recipient = testRecipient.trim();
    if (!recipient) { message.warning('گیرنده آزمایشی را وارد کنید.'); return; }
    const emptyMessageError = getCampaignToolEmptyMessageError(tool);
    if (emptyMessageError) { message.warning(emptyMessageError); return; }
    setTestSending(true);
    try {
      const snapshot = buildCampaignMessageSnapshot(tool, {
        variableCatalog: campaignVariableOptions.map((option) => option.descriptor),
      });
      const result = await supabase.rpc('create_advertising_campaign_test_dispatch', {
        p_tool_id: tool.id,
        p_recipient: recipient,
        p_message_snapshot: { ...snapshot, is_test: true },
        p_idempotency_key: `${tool.id}:test:${Date.now()}`,
      });
      if (result.error) throw result.error;
      message.success('ارسال آزمایشی در صف اجرا قرار گرفت.');
    } catch (cause: any) { message.error(String(cause?.message || 'ارسال آزمایشی ناموفق بود.')); }
    finally { setTestSending(false); }
  };

  const renderCentralFields = (fields: ModuleField[], fieldReadonly: boolean) => (
    fields.length > 0 ? (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <div key={field.key} className="min-w-0 rounded-xl border border-gray-100 p-3 dark:border-white/10">
            <div className="mb-2 text-xs font-bold text-gray-600 dark:text-gray-300">{field.labels.fa}</div>
            <SmartFieldRenderer
              field={field}
              value={toolRecord[field.key]}
              onChange={(value) => patchField(field.key, value)}
              onSave={(value) => patchField(field.key, value)}
              allValues={toolRecord}
              recordId={tool.id}
              moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID}
              forceEditMode={!fieldReadonly}
              compactMode
              disableRequired
              overlayZIndexBase={15320}
              popupContainer={resolveOverlayPopupContainer}
              preferLocalPopupContainer
            />
          </div>
        ))}
      </div>
    ) : null
  );

  const sideContent = sideTab === 'files' ? (
    <div className="space-y-3">
      <RecordImageBox
        moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID}
        recordId={tool.id}
        imageUrl={String((tool.config as any)?.image_url || '') || null}
        canEdit={!resultsReadonly}
        canViewFilesManager
        canEditFilesManager={!resultsReadonly}
        canUploadFilesManager={!resultsReadonly}
        canDeleteFilesManager={accessMode === 'full' && !resultsReadonly}
        compact
        filesButtonLabel="مدیریت فایل‌های ابزار"
      />
      <div className="rounded-xl bg-gray-50 p-3 text-xs leading-6 text-gray-500 dark:bg-white/5 dark:text-gray-400">
        فایل‌های این بخش فقط به همین ابزار کمپین متصل می‌شوند. پوشه ابزار داخل پوشه کمپین توسط FileManager مدیریت می‌شود.
      </div>
    </div>
  ) : sideTab === 'conversation' ? (
    <div className="h-[24rem] min-h-[18rem] max-h-[55vh] overflow-hidden">
      <ActivityPanel
        moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID}
        recordId={tool.id}
        view="notes"
        recordName={`${campaign.name} - ${getCampaignToolLabel(tool.tool_type)}`}
        mentionUsers={mentionUsers}
        mentionRoles={mentionRoles}
        moduleConfig={moduleConfig}
        compact
      />
    </div>
  ) : sideTab === 'ai' ? (
    <div className="h-[24rem] min-h-[18rem] max-h-[55vh] overflow-hidden rounded-xl bg-slate-100 dark:bg-[#101113]">
      <AssistantPanel active={sideTab === 'ai'} showThreadListButton />
    </div>
  ) : (
    <div className="h-[24rem] min-h-[18rem] max-h-[55vh] overflow-hidden">
      <ActivityPanel
        moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID}
        recordId={tool.id}
        view="changelogs"
        recordName={`${campaign.name} - ${getCampaignToolLabel(tool.tool_type)}`}
        mentionUsers={mentionUsers}
        mentionRoles={mentionRoles}
        moduleConfig={moduleConfig}
        compact
      />
    </div>
  );

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        width={1440}
        zIndex={15200}
        destroyOnHidden
        style={{ top: 12, maxWidth: 'calc(100vw - 16px)' }}
        styles={{ body: { maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', padding: 14 } }}
        title={(
          <div className="min-w-0 pl-8">
            <div className="truncate text-base font-black">{getCampaignToolLabel(tool.tool_type)} — {campaign.name}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-400">
              <span>{campaign.system_code || 'کمپین بدون کد'}</span>
              {accessMode === 'tool_limited' ? <Tag color="gold">دسترسی محدود به همین ابزار</Tag> : null}
            </div>
          </div>
        )}
      >
        <CampaignFieldSurfaceProvider
          alwaysShowLabels
          overlayZIndexBase={15380}
          popupContainer={resolveOverlayPopupContainer}
          preferLocalPopupContainer
        >
        <div className="mb-3 flex flex-wrap items-stretch gap-2 rounded-lg border border-gray-100 bg-gray-50/70 p-2 dark:border-gray-700 dark:bg-transparent">
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-white px-2 py-2 dark:bg-white/5">
            <TaskStatusActionStrip
              options={CAMPAIGN_TOOL_STATUS_OPTIONS.map((option) => ({
                ...option,
                color: STATUS_TONES[option.color] || STATUS_TONES.default,
                icon: CAMPAIGN_STATUS_ICON_KEYS[option.value],
              }))}
              currentValue={tool.status}
              savingValue={statusSaving}
              onChange={(value) => changeStatus(value as CampaignToolStatus)}
              isDisabled={(value) => !onStatusChange || (
                allowedStatusValues !== null
                && value !== tool.status
                && !allowedStatusValues.has(value as CampaignToolStatus)
              )}
              renderAfterOption={(value) => value === 'scheduled' && automated && onToolAction ? (
                <button
                  type="button"
                  className={`${TASK_STATUS_TILE_CLASS_NAME} !rounded-xl bg-[rgba(var(--brand-50-rgb),0.92)] ring-1 ring-[rgba(var(--brand-300-rgb),0.75)] shadow-[0_8px_22px_rgba(var(--brand-600-rgb),0.12)] hover:!bg-[rgba(var(--brand-100-rgb),0.98)] hover:shadow-[0_12px_28px_rgba(var(--brand-600-rgb),0.24)] disabled:!opacity-70 dark:bg-[rgba(var(--brand-500-rgb),0.14)] dark:ring-[rgba(var(--brand-400-rgb),0.45)] dark:hover:!bg-[rgba(var(--brand-500-rgb),0.22)]`}
                  disabled={Boolean(actionLoading) || tool.status !== 'ready'}
                  onClick={() => void onToolAction('send_now', tool)}
                  aria-label="ارسال اکنون"
                  title="ارسال اکنون"
                >
                  <span
                    className={`${TASK_STATUS_TILE_ICON_CLASS_NAME} !h-10 !w-10 !rounded-xl`}
                    style={{
                      color: '#fff',
                      backgroundImage: 'linear-gradient(135deg, rgba(var(--brand-500-rgb),1), rgba(var(--brand-700-rgb),1))',
                      boxShadow: '0 10px 24px rgba(var(--brand-600-rgb),0.38)',
                    }}
                  >
                    {actionLoading === 'send_now' ? <ClockCircleOutlined className="!text-xl" spin /> : <SendOutlined className="!text-xl" />}
                  </span>
                  <span className="line-clamp-2 min-h-[1.5rem] text-[11px] font-black leading-3 text-[rgba(var(--brand-700-rgb),1)] dark:text-[rgba(var(--brand-200-rgb),1)]">
                    ارسال اکنون
                  </span>
                </button>
              ) : null}
            />
          </div>
        </div>

        {onCreateRelated ? (
          <div className="mb-4 rounded-xl border border-gray-100 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="mb-2 text-xs font-bold text-slate-500">افزودن نتیجه مرتبط</div>
            <div className="flex max-w-full flex-wrap gap-2">
              <Button size="small" icon={<UserAddOutlined />} onClick={() => onCreateRelated('marketing_leads')}>ثبت لید</Button>
              <Button size="small" icon={<TeamOutlined />} onClick={() => onCreateRelated('customers')}>ثبت مشتری</Button>
              <Button size="small" icon={<FileTextOutlined />} onClick={() => onCreateRelated('invoices')}>ثبت فاکتور</Button>
            </div>
          </div>
        ) : null}

        {automated ? <CampaignToolDeliverySummaryCards tool={tool} /> : null}

        <div className="flex flex-col gap-4 xl:flex-row" dir="ltr">
          <aside className="min-w-0 rounded-2xl border border-gray-200 bg-white p-2 dark:border-white/10 dark:bg-white/5 xl:w-[19rem] xl:shrink-0" dir="rtl">
            <div className="mb-2 grid grid-cols-4 gap-1 border-b border-gray-100 pb-2 dark:border-white/10">
              {sideTabs.map((tab) => (
                <Tooltip
                  key={tab.key}
                  title={tab.label}
                  getPopupContainer={resolveOverlayPopupContainer}
                  zIndex={15360}
                >
                  <button
                    type="button"
                    onClick={() => setSideTab(tab.key)}
                    className={`inline-flex h-9 items-center justify-center rounded-lg border text-base transition ${sideTab === tab.key ? 'border-[rgba(var(--brand-400-rgb),0.8)] bg-[rgba(var(--brand-50-rgb),0.9)] text-[rgb(var(--brand-700-rgb))]' : 'border-transparent text-gray-400 hover:bg-gray-50 dark:hover:bg-white/10'}`}
                    aria-label={tab.label}
                  >
                    <Badge dot={false}>{tab.icon}</Badge>
                  </button>
                </Tooltip>
              ))}
            </div>
            {sideContent}
          </aside>

          <main className="min-w-0 flex-1" dir="rtl">
            <div className="mb-3 flex max-w-full gap-2 overflow-x-auto rounded-xl border border-gray-100 bg-white p-1.5 dark:border-white/10 dark:bg-white/5">
              {([
                { key: 'details' as const, label: 'مشخصات ابزار', icon: <FileOutlined /> },
                { key: 'process' as const, label: 'فرآیندها', icon: <NodeIndexOutlined /> },
                { key: 'results' as const, label: 'نتیجه اجرا', icon: <HistoryOutlined /> },
                ...(automated ? [{ key: 'delivery' as const, label: 'گزارش ارسال', icon: <SendOutlined /> }] : []),
                { key: 'report' as const, label: 'گزارش نتایج', icon: <ReadOutlined /> },
              ]).map((tab) => (
                <Button key={tab.key} type={mainTab === tab.key ? 'primary' : 'text'} icon={tab.icon} onClick={() => setMainTab(tab.key)}>
                  {tab.label}
                </Button>
              ))}
            </div>

            {mainTab === 'details' ? (
              <div className="space-y-4">
                {renderCentralFields(detailFields, detailsReadonly)}
                {renderToolFields?.({ tool, readonly: detailsReadonly, overlayZIndexBase: 15320, popupContainer: resolveOverlayPopupContainer })}
                {!renderToolFields && detailFields.length === 0 ? (
                  <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                    <Descriptions.Item label="هزینه برآوردی">{formatPersianPrice(tool.estimated_cost || 0)} {currencyLabel}</Descriptions.Item>
                    <Descriptions.Item label="زمان شروع">{safeJalaliFormat(tool.planned_start_at, 'YYYY/MM/DD HH:mm') || '-'}</Descriptions.Item>
                    <Descriptions.Item label="زمان پایان">{safeJalaliFormat(tool.planned_end_at, 'YYYY/MM/DD HH:mm') || '-'}</Descriptions.Item>
                    <Descriptions.Item label="لید مورد انتظار">{toPersianNumber(tool.expected_leads || 0)}</Descriptions.Item>
                    <Descriptions.Item label="مشتری مورد انتظار">{toPersianNumber(tool.expected_customers || 0)}</Descriptions.Item>
                  </Descriptions>
                ) : null}
              </div>
            ) : null}

            {mainTab === 'process' ? (
              <React.Suspense fallback={<Skeleton active paragraph={{ rows: 6 }} />}>
                <ProcessCardsV2RuntimeBlock
                  moduleId={ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID}
                  recordId={tool.id}
                  recordData={toolRecord}
                  fieldKey="execution_process_draft"
                  draftStages={Array.isArray(tool.execution_process_draft) ? tool.execution_process_draft : []}
                  onDraftStagesChange={accessMode === 'full' && onToolPatch
                    ? (stages) => onToolPatch(tool.id, { execution_process_draft: stages })
                    : undefined}
                  variant="full"
                  snapshotOnly={accessMode !== 'full'}
                />
              </React.Suspense>
            ) : null}

            {mainTab === 'results' ? (
              <div className="space-y-4">
                {renderCentralFields(resultFields, resultsReadonly)}
                {renderResultFields?.({ tool, readonly: resultsReadonly, overlayZIndexBase: 15320, popupContainer: resolveOverlayPopupContainer })}
                {!renderResultFields && resultFields.length === 0 ? (
                  <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                    <Descriptions.Item label="هزینه واقعی">{formatPersianPrice(tool.actual_cost || 0)} {currencyLabel}</Descriptions.Item>
                    <Descriptions.Item label="لید واقعی">{toPersianNumber(tool.actual_leads || 0)}</Descriptions.Item>
                    <Descriptions.Item label="مشتری واقعی">{toPersianNumber(tool.actual_customers || 0)}</Descriptions.Item>
                    <Descriptions.Item label="شروع واقعی">{safeJalaliFormat(tool.actual_start_at, 'YYYY/MM/DD HH:mm') || '-'}</Descriptions.Item>
                    <Descriptions.Item label="پایان واقعی">{safeJalaliFormat(tool.actual_end_at, 'YYYY/MM/DD HH:mm') || '-'}</Descriptions.Item>
                  </Descriptions>
                ) : null}
              </div>
            ) : null}
            {mainTab === 'delivery' && automated ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-100 p-3 dark:border-white/10">
                  <div className="mb-2 text-xs font-bold">ارسال آزمایشی</div>
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                        {tool.tool_type === 'email' ? 'ایمیل گیرنده آزمایشی' : tool.tool_type.startsWith('bot_') ? 'شناسه کاربر یا چت آزمایشی' : 'شماره موبایل گیرنده آزمایشی'}
                      </div>
                      <Input value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder={tool.tool_type === 'email' ? 'ایمیل گیرنده' : tool.tool_type.startsWith('bot_') ? 'شناسه کاربر یا چت' : 'شماره موبایل'} />
                    </div>
                    <Button type="primary" icon={<SendOutlined />} loading={testSending} onClick={() => void sendTest()}>ارسال آزمایشی</Button>
                  </div>
                </div>
                <CampaignDeliveryReportPanel toolId={tool.id} />
              </div>
            ) : null}
            {mainTab === 'report' ? (
              <CampaignToolReportPanel toolId={tool.id} currencyLabel={currencyLabel} />
            ) : null}
          </main>
        </div>
        </CampaignFieldSurfaceProvider>
      </Modal>
    </>
  );
};

export default CampaignToolWorkspaceModal;
