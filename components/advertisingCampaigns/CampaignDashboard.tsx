import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Skeleton } from 'antd';
import {
  BarChartOutlined,
  CalendarOutlined,
  DashboardOutlined,
  FileTextOutlined,
  ReloadOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import type { ModuleDefinition } from '../../types';
import {
  ADVERTISING_CAMPAIGN_SOURCE_VALUE,
  type CampaignAccessMode,
  type CampaignToolStatus,
} from '../../utils/advertisingCampaigns';
import RelatedSidebar from '../Sidebar/RelatedSidebar';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import CampaignDashboardCharts from './CampaignDashboardCharts';
import CampaignKpiGrid from './CampaignKpiGrid';
import CampaignRangeCalendar, { type CampaignRangeDateField } from './CampaignRangeCalendar';
import CampaignToolCard, { isAutomatedCampaignTool } from './CampaignToolCard';
import CampaignToolWorkspaceModal from './CampaignToolWorkspaceModal';
import { loadCampaignDashboardSummary } from './campaignDashboardService';
import type {
  CampaignDashboardSummary,
  CampaignRecord,
  CampaignToolAction,
  CampaignToolRecord,
} from './types';

type DashboardSection = 'overview' | 'charts' | 'calendar';
type RelatedTargetModule = 'marketing_leads' | 'customers' | 'invoices';

export type CampaignDashboardProps = {
  campaign: CampaignRecord;
  tools: CampaignToolRecord[];
  moduleConfig: ModuleDefinition;
  accessMode?: CampaignAccessMode;
  summary?: CampaignDashboardSummary;
  currencyLabel?: string;
  loading?: boolean;
  actionLoadingByToolId?: Record<string, CampaignToolAction | null | undefined>;
  timeline?: Array<{ label: string; value: number }>;
  mentionUsers?: any[];
  mentionRoles?: any[];
  showRelatedSidebar?: boolean;
  onToolOpen?: (tool: CampaignToolRecord) => void;
  onToolAction?: (action: CampaignToolAction, tool: CampaignToolRecord) => void | Promise<void>;
  onToolPatch?: (toolId: string, patch: Partial<CampaignToolRecord> & Record<string, unknown>) => void | Promise<void>;
  onToolStatusChange?: (tool: CampaignToolRecord, status: CampaignToolStatus) => void | Promise<void>;
  onCreateRelated?: (moduleId: RelatedTargetModule, initialValues: Record<string, unknown>) => void;
  renderToolFields?: React.ComponentProps<typeof CampaignToolWorkspaceModal>['renderToolFields'];
  renderResultFields?: React.ComponentProps<typeof CampaignToolWorkspaceModal>['renderResultFields'];
};

const EMPTY_SUMMARY: CampaignDashboardSummary = {};

const CampaignDashboard: React.FC<CampaignDashboardProps> = ({
  campaign,
  tools,
  moduleConfig,
  accessMode = campaign.access_mode || 'full',
  summary,
  currencyLabel = '',
  loading = false,
  actionLoadingByToolId = {},
  timeline = [],
  mentionUsers = [],
  mentionRoles = [],
  showRelatedSidebar = true,
  onToolOpen,
  onToolAction,
  onToolPatch,
  onToolStatusChange,
  onCreateRelated,
  renderToolFields,
  renderResultFields,
}) => {
  const [section, setSection] = useState<DashboardSection>('overview');
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [runtimeSummary, setRuntimeSummary] = useState<CampaignDashboardSummary>(summary || EMPTY_SUMMARY);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [startFieldKey, setStartFieldKey] = useState<CampaignRangeDateField>('planned_start_at');
  const [endFieldKey, setEndFieldKey] = useState<CampaignRangeDateField>('planned_end_at');

  useEffect(() => {
    if (summary) setRuntimeSummary(summary);
  }, [summary]);

  const reloadSummary = React.useCallback(async () => {
    if (accessMode !== 'full' || summary) return;
    setSummaryLoading(true);
    setSummaryError('');
    try {
      setRuntimeSummary(await loadCampaignDashboardSummary(campaign.id));
    } catch {
      setSummaryError('خلاصه آماری کمپین دریافت نشد. اطلاعات ابزارها همچنان قابل مشاهده است.');
    } finally {
      setSummaryLoading(false);
    }
  }, [accessMode, campaign.id, summary]);

  useEffect(() => {
    void reloadSummary();
  }, [reloadSummary]);

  const enabledTools = useMemo(() => tools.filter((tool) => tool.enabled !== false), [tools]);
  const automatedTools = useMemo(() => enabledTools.filter(isAutomatedCampaignTool), [enabledTools]);
  const manualTools = useMemo(() => enabledTools.filter((tool) => !isAutomatedCampaignTool(tool)), [enabledTools]);
  const selectedTool = enabledTools.find((tool) => tool.id === selectedToolId) || null;

  const openTool = (tool: CampaignToolRecord) => {
    setSelectedToolId(tool.id);
    onToolOpen?.(tool);
  };

  const createRelated = (moduleId: RelatedTargetModule, toolId?: string) => {
    if (!onCreateRelated || accessMode !== 'full') return;
    const sourceField = moduleId === 'marketing_leads' ? 'source' : moduleId === 'customers' ? 'lead_source' : 'sale_source';
    onCreateRelated(moduleId, {
      [sourceField]: ADVERTISING_CAMPAIGN_SOURCE_VALUE,
      advertising_campaign_id: campaign.id,
      advertising_campaign_tool_id: toolId || undefined,
    });
  };

  if (loading) return <Skeleton active paragraph={{ rows: 12 }} />;

  return (
    <div className="space-y-5 pb-10">
      {accessMode === 'tool_limited' ? (
        <Alert
          type="info"
          showIcon
          message="دسترسی شما به ابزارهای همکاری محدود است"
          description="فقط ابزارهایی که به شما یا نقش شما واگذار شده‌اند نمایش داده می‌شوند. آمار کل کمپین، مخاطبان و ارتباطات سایر ابزارها قابل مشاهده نیست."
        />
      ) : null}

      {summaryError && accessMode === 'full' ? (
        <Alert
          type="warning"
          showIcon
          message={summaryError}
          action={<Button size="small" icon={<ReloadOutlined />} loading={summaryLoading} onClick={() => void reloadSummary()}>بارگذاری دوباره</Button>}
        />
      ) : null}

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-white/5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-full gap-2 overflow-x-auto">
          {accessMode === 'full' ? (
            <>
              <Button type={section === 'overview' ? 'primary' : 'default'} icon={<DashboardOutlined />} onClick={() => setSection('overview')}>نمای کلی</Button>
              <Button type={section === 'charts' ? 'primary' : 'default'} icon={<BarChartOutlined />} onClick={() => setSection('charts')}>نمودارها</Button>
              <Button type={section === 'calendar' ? 'primary' : 'default'} icon={<CalendarOutlined />} onClick={() => setSection('calendar')}>تقویم اجرا</Button>
            </>
          ) : <strong className="px-2 py-1 text-gray-700 dark:text-gray-200">ابزارهای همکاری من</strong>}
        </div>

        {accessMode === 'full' && onCreateRelated ? (
          <div className="flex max-w-full gap-2 overflow-x-auto">
            <Button size="small" icon={<UserAddOutlined />} onClick={() => createRelated('marketing_leads')}>ثبت لید</Button>
            <Button size="small" icon={<TeamOutlined />} onClick={() => createRelated('customers')}>ثبت مشتری</Button>
            <Button size="small" icon={<FileTextOutlined />} onClick={() => createRelated('invoices')}>ثبت فاکتور</Button>
          </div>
        ) : null}
      </div>

      {accessMode === 'full' && section === 'overview' ? (
        <CampaignKpiGrid summary={runtimeSummary} currencyLabel={currencyLabel} />
      ) : null}

      {accessMode === 'full' && section === 'charts' ? (
        <CampaignDashboardCharts summary={runtimeSummary} tools={enabledTools} currencyLabel={currencyLabel} timeline={timeline} />
      ) : null}

      {accessMode === 'full' && section === 'calendar' ? (
        <CampaignRangeCalendar
          tools={enabledTools}
          startFieldKey={startFieldKey}
          endFieldKey={endFieldKey}
          onStartFieldChange={setStartFieldKey}
          onEndFieldChange={setEndFieldKey}
          onToolOpen={openTool}
        />
      ) : null}

      {(accessMode === 'tool_limited' || section === 'overview') ? (
        <div className="space-y-6">
          {enabledTools.length === 0 ? <Empty description="ابزاری برای نمایش در این کمپین وجود ندارد" /> : null}

          {automatedTools.length > 0 ? (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="m-0 text-base font-black text-gray-800 dark:text-gray-100">ارسال و اجرای خودکار</h2>
                <span className="text-xs text-gray-400">{toPersianNumber(automatedTools.length)} ابزار</span>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {automatedTools.map((tool) => (
                  <CampaignToolCard
                    key={tool.id}
                    tool={tool}
                    accessMode={accessMode}
                    currencyLabel={currencyLabel}
                    actionLoading={actionLoadingByToolId[tool.id] || null}
                    onOpen={openTool}
                    onAction={onToolAction}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {manualTools.length > 0 ? (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="m-0 text-base font-black text-gray-800 dark:text-gray-100">اجرای دستی</h2>
                <span className="text-xs text-gray-400">{toPersianNumber(manualTools.length)} ابزار</span>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {manualTools.map((tool) => (
                  <CampaignToolCard
                    key={tool.id}
                    tool={tool}
                    accessMode={accessMode}
                    currencyLabel={currencyLabel}
                    actionLoading={actionLoadingByToolId[tool.id] || null}
                    onOpen={openTool}
                    onAction={onToolAction}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      <CampaignToolWorkspaceModal
        open={Boolean(selectedTool)}
        campaign={campaign}
        tool={selectedTool}
        accessMode={accessMode}
        currencyLabel={currencyLabel}
        mentionUsers={mentionUsers}
        mentionRoles={mentionRoles}
        onClose={() => setSelectedToolId(null)}
        onToolPatch={onToolPatch}
        onStatusChange={onToolStatusChange}
        onToolAction={onToolAction}
        actionLoading={selectedTool ? (actionLoadingByToolId[selectedTool.id] || null) : null}
        onCreateRelated={accessMode === 'full' && onCreateRelated
          ? (moduleId) => createRelated(moduleId, selectedTool?.id)
          : undefined}
        renderToolFields={renderToolFields}
        renderResultFields={renderResultFields}
      />

      {accessMode === 'full' && showRelatedSidebar ? (
        <RelatedSidebar
          moduleConfig={moduleConfig}
          recordId={campaign.id}
          recordName={campaign.name}
          currentRecord={campaign as any}
          mentionUsers={mentionUsers}
          mentionRoles={mentionRoles}
        />
      ) : null}
    </div>
  );
};

export default CampaignDashboard;
