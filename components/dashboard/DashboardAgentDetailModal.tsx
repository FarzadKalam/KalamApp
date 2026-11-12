import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Badge,
  Button,
  Checkbox,
  Empty,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
} from 'antd';
import {
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  RobotOutlined,
  SaveOutlined,
  SendOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { isSaasAdminModuleId } from '../../utils/permissions';
import {
  AGENT_TONE_STYLES,
  formatPendingApprovalSummary,
  getAgentDefinition,
  getAgentTitleFa,
  getAgentToneLabelFa,
  resolvePendingApprovalAgentKey,
  type AgentKey,
  type AgentToneStyle,
} from '../../utils/aiAgentCatalog';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { createWorkflowId, type WorkflowRecord } from '../../utils/workflowTypes';
import WorkflowEditorModal from '../workflows/WorkflowEditorModal';
import { AiAgentAvatar } from '../ai/AiAgentIcon';
import { useCurrencyConfig } from '../../utils/currency';
import {
  convertDisplayInputToIrt,
  convertIrtToDisplayAmount,
  formatAiCurrencyFromIrt,
  getAiDisplayCurrencyMeta,
} from '../../utils/aiCurrency';

export type DashboardAgentModalItem = {
  key: AgentKey;
  titleFa: string;
  shortTitleFa: string;
  subtitleFa: string;
  descriptionFa: string;
  badgeColor: string;
  iconKey: string;
  supportsBackground: boolean;
  orgEnabled: boolean;
  planAllowed: boolean;
  canView: boolean;
  canChat: boolean;
  canToggle: boolean;
  canEdit: boolean;
  isWorking: boolean;
  toneStyle: AgentToneStyle;
  backgroundConfig?: {
    enabled?: boolean;
    interval_minutes?: number;
    cooldown_minutes?: number;
    daily_budget_irt?: number;
    respect_work_schedule?: boolean;
  };
  backgroundLastRunAt?: string | null;
  backgroundLastStatus?: string | null;
  backgroundLastSummary?: string | null;
  backgroundLastError?: string | null;
  nextBackgroundRunAt?: string | null;
  usageStats?: {
    runs?: number;
    totalTokens?: number;
    cachedTokens?: number;
    savingsIrt?: number;
    todaySpentIrt?: number;
  };
  effectiveModelId?: string | null;
  effectiveFastModelId?: string | null;
  workflowTriggers?: any[];
  recentRuns?: Array<{
    id?: string;
    status?: string;
    channel?: string;
    error_message?: string | null;
    created_at?: string | null;
    completed_at?: string | null;
  }>;
};

type DashboardAgentDetailModalProps = {
  open: boolean;
  agent: DashboardAgentModalItem | null;
  planFeatures?: Record<string, any> | null;
  pendingApprovals?: any[];
  selectedInComposer?: boolean;
  refreshing?: boolean;
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  onToggleAgentInComposer?: (agentKey: AgentKey) => void;
  onOpenChatPage?: (agentKey: AgentKey, toneStyle?: AgentToneStyle) => void;
};

const getModuleTitle = (moduleId: string): string => (
  MODULES[moduleId]?.titles?.faSingular || MODULES[moduleId]?.titles?.fa || moduleId
);

const CHANNEL_LABEL_FA: Record<string, string> = {
  web: 'پنل وب',
  staff_bot: 'بات همکار',
  agent_inbox: 'صندوق ایجنت',
  background: 'اجرای خودکار سرور',
  workflow: 'گردش کار',
};

const RUN_STATUS_META: Record<string, { label: string; color: string }> = {
  completed: { label: 'موفق', color: 'green' },
  running: { label: 'در حال اجرا', color: 'processing' },
  waiting_approval: { label: 'در انتظار تأیید', color: 'warning' },
  waiting_confirmation: { label: 'در انتظار تأیید', color: 'warning' },
  failed: { label: 'ناموفق', color: 'red' },
  skipped: { label: 'بدون تغییر', color: 'default' },
  cancelled: { label: 'لغو شد', color: 'default' },
};

const formatJalaliDateTime = (value?: string | null): string => {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dt);
  } catch {
    return new Intl.DateTimeFormat('fa-IR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dt);
  }
};

const DashboardAgentDetailModal: React.FC<DashboardAgentDetailModalProps> = ({
  open,
  agent,
  planFeatures,
  pendingApprovals = [],
  selectedInComposer = false,
  refreshing = false,
  onClose,
  onRefresh,
  onToggleAgentInComposer,
  onOpenChatPage,
}) => {
  const { message } = App.useApp();
  const orgCurrency = useCurrencyConfig();
  const budgetCurrencyMeta = useMemo(
    () => getAiDisplayCurrencyMeta(orgCurrency, orgCurrency),
    [orgCurrency],
  );
  const [activeTab, setActiveTab] = useState<'activity' | 'settings'>('activity');
  const [toggling, setToggling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningSchedule, setRunningSchedule] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [workflowEditorOpen, setWorkflowEditorOpen] = useState(false);
  const [editingWorkflowRecord, setEditingWorkflowRecord] = useState<WorkflowRecord | null>(null);
  const [togglingWorkflowId, setTogglingWorkflowId] = useState<string | null>(null);

  const def = useMemo(() => (agent ? getAgentDefinition(agent.key) : null), [agent]);
  const workflowModuleOptions = useMemo(
    () =>
      Object.values(MODULES)
        .filter((module) => !isSaasAdminModuleId(module.id) && module.registryVisibility?.workflows !== false)
        .map((module) => ({ label: module.titles.fa, value: module.id }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fa')),
    [],
  );
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [draftTone, setDraftTone] = useState<AgentToneStyle>('friendly_warm');
  const [draftBgEnabled, setDraftBgEnabled] = useState(false);
  const [draftIntervalMinutes, setDraftIntervalMinutes] = useState(60);
  const [draftCooldownMinutes, setDraftCooldownMinutes] = useState(240);
  const [draftDailyBudgetIrt, setDraftDailyBudgetIrt] = useState(30000);
  const [draftRespectWorkSchedule, setDraftRespectWorkSchedule] = useState(true);

  useEffect(() => {
    if (!open || !agent) return;
    setActiveTab('activity');
    const bg = agent.backgroundConfig || def?.defaultBackgroundConfig || {
      enabled: false,
      interval_minutes: 60,
      cooldown_minutes: 240,
      daily_budget_irt: 30000,
      respect_work_schedule: true,
    };
    setDraftEnabled(agent.orgEnabled !== false);
    setDraftTone((agent.toneStyle || def?.defaultToneStyle || 'friendly_warm') as AgentToneStyle);
    setDraftBgEnabled(bg.enabled === true);
    setDraftIntervalMinutes(Math.max(5, Number(bg.interval_minutes || 60)));
    setDraftCooldownMinutes(Math.max(5, Number(bg.cooldown_minutes || 240)));
    setDraftDailyBudgetIrt(Math.max(0, Number(bg.daily_budget_irt ?? 30000)));
    setDraftRespectWorkSchedule(bg.respect_work_schedule !== false);
  }, [agent, def, open]);

  const agentApprovals = useMemo(() => {
    if (!agent) return [];
    return (Array.isArray(pendingApprovals) ? pendingApprovals : []).filter(
      (item: any) => resolvePendingApprovalAgentKey(item) === agent.key,
    );
  }, [agent, pendingApprovals]);

  const recentRuns = useMemo(() => {
    if (!agent) return [];
    return Array.isArray(agent.recentRuns) ? agent.recentRuns : [];
  }, [agent]);

  const workflowTriggers = useMemo(() => {
    if (!agent) return [];
    return Array.isArray(agent.workflowTriggers) ? agent.workflowTriggers : [];
  }, [agent]);

  if (!agent) return null;

  const canManagePower = Boolean(agent.canToggle || agent.canEdit);
  const canEdit = Boolean(agent.canEdit);
  const canChat = Boolean(agent.canChat);
  const supportsBg = Boolean(agent.supportsBackground ?? def?.supportsBackground);
  const bgPlanAllowed = planFeatures?.ai_background_agents !== false && (
    planFeatures == null || Object.keys(planFeatures).length === 0 || Boolean(planFeatures.ai_background_agents)
  );
  const lastStatusMeta = agent.backgroundLastStatus
    ? (RUN_STATUS_META[String(agent.backgroundLastStatus)] || { label: String(agent.backgroundLastStatus), color: 'default' })
    : null;

  const handleQuickToggle = async (checked: boolean) => {
    if (!canManagePower || toggling) return;
    setToggling(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'save_org_agent_config',
          agentKey: agent.key,
          toggleOnly: true,
          isEnabled: checked,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'تغییر وضعیت ایجنت ناموفق بود.'));
      setDraftEnabled(checked);
      message.success(String(data.message || `${getAgentTitleFa(agent.key)} ${checked ? 'فعال' : 'غیرفعال'} شد.`));
      await onRefresh();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'تغییر وضعیت ایجنت ناموفق بود.'));
    } finally {
      setToggling(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'save_org_agent_config',
          agentKey: agent.key,
          isEnabled: draftEnabled,
          toneStyle: draftTone,
          backgroundConfig: supportsBg
            ? {
                enabled: bgPlanAllowed ? draftBgEnabled : false,
                interval_minutes: Math.min(1440, Math.max(5, Number(draftIntervalMinutes || 60))),
                cooldown_minutes: Math.min(10080, Math.max(5, Number(draftCooldownMinutes || 240))),
                daily_budget_irt: Math.min(10000000, Math.max(0, Number(draftDailyBudgetIrt ?? 30000))),
                respect_work_schedule: draftRespectWorkSchedule,
              }
            : { enabled: false },
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'ذخیره تنظیمات ایجنت ناموفق بود.'));
      message.success(String(data.message || 'تنظیمات ایجنت ذخیره شد.'));
      await onRefresh();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'ذخیره تنظیمات ایجنت ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  const handleRunScheduleNow = async () => {
    if (!canEdit || !supportsBg || !bgPlanAllowed || runningSchedule) return;
    setRunningSchedule(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'run_background_agents',
          agentKey: agent.key,
          force: true,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'اجرای خودکار ایجنت ناموفق بود.'));
      const triggered = Number(data?.runsTriggered || 0);
      const firstResult = Array.isArray(data?.results) ? data.results[0] : null;
      const firstSkipReason = Array.isArray(data?.skippedReasons) ? String(data.skippedReasons[0] || '').trim() : '';
      if (firstResult?.status === 'failed') {
        message.warning(toFaErrorMessage(firstResult?.reason || 'اجرای خودکار با خطا مواجه شد.'));
      } else if (triggered > 0) {
        message.success(`بررسی خودکار ${agent.titleFa} با موفقیت اجرا شد.`);
      } else {
        message.info(String(firstResult?.summary || firstResult?.reason || firstSkipReason || 'بررسی خودکار انجام شد؛ مورد جدیدی برای اقدام نبود.'));
      }
      await onRefresh();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'اجرای دستی زمان‌بندی خودکار ناموفق بود.'));
    } finally {
      setRunningSchedule(false);
    }
  };

  const handleToggleWorkflowTrigger = async (workflowId: string, nextActive: boolean) => {
    if (!canEdit || !workflowId || togglingWorkflowId) return;
    setTogglingWorkflowId(workflowId);
    try {
      const { error } = await supabase
        .from('workflows')
        .update({ is_active: nextActive, updated_at: new Date().toISOString() })
        .eq('id', workflowId);
      if (error) throw error;
      message.success(nextActive ? 'فعال‌کننده روشن شد.' : 'فعال‌کننده خاموش شد.');
      await onRefresh();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'تغییر وضعیت فعال‌کننده ناموفق بود.'));
    } finally {
      setTogglingWorkflowId(null);
    }
  };

  const handleOpenWorkflowEditor = async (workflowId?: string) => {
    if (!canEdit) return;
    if (!workflowId) {
      setEditingWorkflowRecord(null);
      setWorkflowEditorOpen(true);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .maybeSingle();
      if (error) throw error;
      setEditingWorkflowRecord((data as WorkflowRecord) || null);
      setWorkflowEditorOpen(true);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'بارگذاری تنظیمات فعال‌کننده ناموفق بود.'));
    }
  };

  const handleResolveApproval = async (actionLogId: string, decision: 'approve' | 'reject') => {
    if (!actionLogId || resolvingId) return;
    setResolvingId(actionLogId);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { action: 'resolve_waiting_approval', actionLogId, decision },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'ثبت تصمیم ناموفق بود.'));
      message.success(decision === 'approve' ? 'اقدام تایید و اجرا شد.' : 'اقدام پیشنهادی لغو شد.');
      await onRefresh();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'ثبت تصمیم تایید/رد ناموفق بود.'));
    } finally {
      setResolvingId(null);
    }
  };

  const tabItems = [
    {
      key: 'activity',
      label: (
        <span className="inline-flex items-center gap-1.5">
          <ClockCircleOutlined />
          گزارش زندهٔ فعالیت
          {agentApprovals.length > 0 ? (
            <Badge count={toPersianNumber(agentApprovals.length)} size="small" style={{ backgroundColor: '#d97706' }} />
          ) : null}
        </span>
      ),
      children: (
        <div className="space-y-3" dir="rtl">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/75 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
              <span>اجراها: <b>{toPersianNumber(Number(agent.usageStats?.runs || 0))}</b></span>
              <span>صرفه‌جویی کش: <b>{formatAiCurrencyFromIrt(agent.usageStats?.savingsIrt || 0, orgCurrency, orgCurrency)}</b></span>
              <span>لحن: <b>{getAgentToneLabelFa(agent.toneStyle)}</b></span>
            </div>
            <Button size="small" icon={<ReloadOutlined />} loading={refreshing} onClick={() => void onRefresh()}>
              بروزرسانی
            </Button>
          </div>

          {supportsBg ? (
            <div className="space-y-2 rounded-xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-white/[0.02]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                  <RobotOutlined style={{ color: agent.badgeColor }} />
                  وضعیت پایش خودکار سرور (زمان‌بندی خودکار)
                </span>
                {!bgPlanAllowed ? (
                  <Tag color="red" className="m-0">خارج از پلن</Tag>
                ) : (
                  <Tag color={agent.orgEnabled && agent.backgroundConfig?.enabled ? 'green' : 'default'} className="m-0">
                    {agent.orgEnabled && agent.backgroundConfig?.enabled ? 'زمان‌بندی فعال' : 'زمان‌بندی خاموش'}
                  </Tag>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2 text-[11.5px] text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-white/[0.04]">
                  آخرین بررسی خودکار: <b className="text-slate-800 dark:text-slate-100">{formatJalaliDateTime(agent.backgroundLastRunAt)}</b>
                </div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-white/[0.04]">
                  زمان اجرای بعدی:{' '}
                  <b className="text-slate-800 dark:text-slate-100">
                    {agent.orgEnabled && agent.backgroundConfig?.enabled && bgPlanAllowed
                      ? formatJalaliDateTime(agent.nextBackgroundRunAt)
                      : 'غیرفعال'}
                  </b>
                </div>
                <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-white/[0.04]">
                  وضعیت آخرین اجرا:
                  {lastStatusMeta ? (
                    <Tag color={lastStatusMeta.color} className="m-0 text-[10.5px]">{lastStatusMeta.label}</Tag>
                  ) : (
                    <span>ثبت نشده</span>
                  )}
                </div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-white/[0.04]">
                  مصرف امروز بررسی خودکار:{' '}
                  <b className="text-slate-800 dark:text-slate-100">
                    {formatAiCurrencyFromIrt(agent.usageStats?.todaySpentIrt || 0, orgCurrency, orgCurrency)}
                  </b>
                  {Number(agent.backgroundConfig?.daily_budget_irt || 0) > 0
                    ? ` از ${formatAiCurrencyFromIrt(agent.backgroundConfig?.daily_budget_irt || 0, orgCurrency, orgCurrency)}`
                    : ''}
                </div>
              </div>

              {agent.backgroundLastSummary ? (
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-2 text-xs leading-5 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">
                  <span className="font-semibold">خلاصه آخرین بررسی: </span>
                  {agent.backgroundLastSummary}
                </div>
              ) : null}

              {agent.backgroundLastError ? (
                <Alert
                  type="error"
                  showIcon
                  className="text-xs"
                  message="خطای آخرین اجرای خودکار"
                  description={toFaErrorMessage(agent.backgroundLastError, agent.backgroundLastError)}
                />
              ) : null}
            </div>
          ) : null}

          {agentApprovals.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
              <div className="text-xs font-bold text-amber-800 dark:text-amber-200">
                اقدامات در انتظار تأیید ({toPersianNumber(agentApprovals.length)})
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {agentApprovals.map((item: any, idx: number) => {
                  const busy = resolvingId === item.id;
                  const formatted = formatPendingApprovalSummary(item, getModuleTitle);
                  return (
                    <div
                      key={item.id || `approval-${idx}`}
                      className="rounded-lg border border-amber-200/70 bg-white/90 p-2.5 dark:border-white/10 dark:bg-white/[0.04]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Space size={6} wrap>
                          <Tag color="gold" className="m-0 text-[10.5px]">
                            {formatted.titleFa}
                          </Tag>
                          <Tag className="m-0 text-[10.5px]">
                            {CHANNEL_LABEL_FA[String(item?.channel || '')] || 'وب'}
                          </Tag>
                          <span className="text-[11px] text-slate-400">
                            {formatJalaliDateTime(item?.created_at)}
                          </span>
                        </Space>
                        <Space size={6}>
                          <Button
                            type="primary"
                            size="small"
                            loading={busy}
                            icon={<CheckOutlined />}
                            onClick={() => void handleResolveApproval(item.id, 'approve')}
                          >
                            تایید و اجرا
                          </Button>
                          <Button
                            size="small"
                            danger
                            disabled={busy}
                            icon={<CloseOutlined />}
                            onClick={() => void handleResolveApproval(item.id, 'reject')}
                          >
                            رد
                          </Button>
                        </Space>
                      </div>
                      <div className="mt-1.5 text-xs font-semibold leading-5 text-slate-800 dark:text-slate-100">
                        {formatted.summaryFa}
                      </div>
                      {formatted.detailLines.length > 0 ? (
                        <ul className="m-0 mt-1 space-y-0.5 pr-4 text-[11px] text-slate-600 dark:text-slate-300">
                          {formatted.detailLines.map((line, lineIdx) => (
                            <li key={`line-${lineIdx}`}>{line}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
              آخرین اجراهای ثبت‌شده
            </div>
            {recentRuns.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="هنوز اجرایی برای این ایجنت ثبت نشده است." />
            ) : (
              <div className="max-h-52 space-y-1.5 overflow-y-auto">
                {recentRuns.slice(0, 10).map((run, index) => {
                  const st = RUN_STATUS_META[String(run?.status || '')] || { label: 'ثبت‌شده', color: 'default' };
                  return (
                    <div
                      key={run?.id || `run-${index}`}
                      className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2 text-xs dark:border-white/10 dark:bg-white/[0.03]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Space size={6}>
                          <Tag className="m-0 text-[10.5px]">
                            {CHANNEL_LABEL_FA[String(run?.channel || '')] || 'وب'}
                          </Tag>
                          <Tag color={st.color} className="m-0 text-[10.5px]">{st.label}</Tag>
                        </Space>
                        <span className="text-[11px] text-slate-400">
                          {formatJalaliDateTime(run?.created_at)}
                        </span>
                      </div>
                      {run?.error_message ? (
                        <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-300">
                          {toFaErrorMessage(run.error_message, run.error_message)}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ),
    },
    ...(canManagePower
      ? [{
          key: 'settings',
          label: (
            <span className="inline-flex items-center gap-1.5">
              <SettingOutlined />
              تنظیمات و زمان‌بندی خودکار
            </span>
          ),
          children: (
            <div className="space-y-3" dir="rtl">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/75 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                    <PoweroffOutlined />
                    وضعیت فعالیت ایجنت در سازمان
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    خاموش‌کردن ایجنت، پاسخگویی و زمان‌بندی خودکار آن را برای کل سازمان متوقف می‌کند.
                  </div>
                </div>
                <Switch
                  checked={draftEnabled}
                  loading={toggling}
                  disabled={!canManagePower || (!draftEnabled && !agent.planAllowed)}
                  checkedChildren="روشن"
                  unCheckedChildren="خاموش"
                  onChange={(checked) => void handleQuickToggle(checked)}
                />
              </div>

              {canEdit ? (
                <>
                  <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="mb-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                      لحن پاسخ‌گویی پیش‌فرض
                    </div>
                    <Select
                      className="w-full"
                      value={draftTone}
                      onChange={(value) => setDraftTone(value as AgentToneStyle)}
                      options={AGENT_TONE_STYLES.map((item) => ({
                        value: item.value,
                        label: item.labelFa,
                      }))}
                    />
                  </div>

                  {supportsBg ? (
                    <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-white/[0.02]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                            زمان‌بندی خودکار سروری (پایش دوره‌ای)
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            بدون نیاز به باز بودن مرورگر، طبق بازه زیر از سرور بررسی و پیام‌گذاری انجام می‌دهد.
                          </div>
                        </div>
                        <Switch
                          checked={draftBgEnabled && bgPlanAllowed}
                          disabled={!bgPlanAllowed}
                          checkedChildren="فعال"
                          unCheckedChildren="خاموش"
                          onChange={setDraftBgEnabled}
                        />
                      </div>

                      {!bgPlanAllowed ? (
                        <Alert
                          type="warning"
                          showIcon
                          className="text-xs"
                          message="قابلیت ایجنت‌های پس‌زمینه در پلن فعلی سازمان فعال نیست."
                        />
                      ) : null}

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <div className="mb-1 text-[11px] text-slate-500">بازه اجرا (دقیقه)</div>
                          <InputNumber
                            min={5}
                            max={1440}
                            step={5}
                            className="w-full"
                            disabled={!bgPlanAllowed}
                            value={draftIntervalMinutes}
                            onChange={(val) => setDraftIntervalMinutes(Math.max(5, Number(val || 60)))}
                          />
                        </div>
                        <div>
                          <div className="mb-1 text-[11px] text-slate-500">فاصله تکرار (دقیقه)</div>
                          <InputNumber
                            min={5}
                            max={10080}
                            step={15}
                            className="w-full"
                            disabled={!bgPlanAllowed}
                            value={draftCooldownMinutes}
                            onChange={(val) => setDraftCooldownMinutes(Math.max(5, Number(val || 240)))}
                          />
                        </div>
                        <div>
                          <div className="mb-1 text-[11px] text-slate-500">بودجه روزانه ({budgetCurrencyMeta.label})</div>
                          <InputNumber
                            min={0}
                            max={10000000 * budgetCurrencyMeta.multiplierFromIrt}
                            step={5000 * budgetCurrencyMeta.multiplierFromIrt}
                            className="w-full"
                            disabled={!bgPlanAllowed}
                            value={convertIrtToDisplayAmount(draftDailyBudgetIrt, orgCurrency, orgCurrency)}
                            onChange={(val) => setDraftDailyBudgetIrt(Math.max(0, convertDisplayInputToIrt(val, orgCurrency, orgCurrency)))}
                          />
                        </div>
                      </div>

                      <Checkbox
                        checked={draftRespectWorkSchedule}
                        disabled={!bgPlanAllowed}
                        onChange={(e) => setDraftRespectWorkSchedule(e.target.checked)}
                      >
                        <span className="text-xs">اجرا فقط در ساعات کاری و روزهای غیرتعطیل تقویم</span>
                      </Checkbox>
                    </div>
                  ) : null}

                  <div className="space-y-2 rounded-xl border border-indigo-200/70 bg-indigo-50/35 p-3 dark:border-indigo-400/20 dark:bg-indigo-950/15">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                        <ThunderboltOutlined className="text-indigo-600" />
                        فعال‌کننده‌ها و وظایف خودکار ({toPersianNumber(workflowTriggers.length)})
                      </span>
                      <Button
                        size="small"
                        type="primary"
                        ghost
                        icon={<PlusOutlined />}
                        onClick={() => void handleOpenWorkflowEditor()}
                      >
                        افزودن فعال‌کننده
                      </Button>
                    </div>
                    {workflowTriggers.length > 0 ? (
                      <div className="space-y-1.5">
                        {workflowTriggers.map((wf: any) => (
                          <div
                            key={wf.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-white/[0.04]"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-bold text-slate-800 dark:text-slate-100">{wf.name}</div>
                              <div className="text-[10.5px] text-slate-500">
                                {getModuleTitle(String(wf.module_id || ''))} •{' '}
                                {wf.trigger_type === 'interval' ? 'زمان‌بندی خودکار' : wf.trigger_type === 'on_upsert' ? 'ایجاد/ویرایش' : 'ایجاد رکورد'}
                              </div>
                            </div>
                            <Space size={6}>
                              <Switch
                                size="small"
                                checked={wf.is_active !== false}
                                loading={togglingWorkflowId === wf.id}
                                onChange={(checked) => void handleToggleWorkflowTrigger(wf.id, checked)}
                              />
                              <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => void handleOpenWorkflowEditor(wf.id)}
                              />
                            </Space>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        می‌توانید برای همین ایجنت چندین فعال‌کننده مختلف در موتور گردش کار بسازید.
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {supportsBg ? (
                      <Button
                        icon={<PlayCircleOutlined />}
                        loading={runningSchedule}
                        disabled={!bgPlanAllowed || !draftEnabled}
                        onClick={() => void handleRunScheduleNow()}
                      >
                        اجرای خودکار همین الان
                      </Button>
                    ) : <span />}
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={saving}
                      onClick={() => void handleSaveSettings()}
                    >
                      ذخیره تنظیمات
                    </Button>
                  </div>
                </>
              ) : (
                <Alert
                  type="info"
                  showIcon
                  className="text-xs"
                  message="شما فقط مجوز روشن/خاموش‌کردن این ایجنت را دارید؛ ویرایش تنظیمات کامل و زمان‌بندی خودکار نیازمند مجوز ویرایش ایجنت است."
                />
              )}
            </div>
          ),
        }]
      : []),
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={680}
      destroyOnHidden
      title={(
        <div dir="rtl" className="flex flex-wrap items-center justify-between gap-2 pl-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <AiAgentAvatar
              agentKey={agent.key}
              color={agent.badgeColor}
              size={38}
              isWorking={agent.isWorking}
              disabled={!agent.orgEnabled}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-black text-slate-900 dark:text-white">{agent.titleFa}</span>
                {agent.isWorking ? (
                  <Tag color="processing" className="m-0 text-[10px]">در حال کار</Tag>
                ) : !agent.planAllowed ? (
                  <Tag color="red" className="m-0 text-[10px]">محدودیت پلن</Tag>
                ) : !agent.orgEnabled ? (
                  <Tag className="m-0 text-[10px]">خاموش</Tag>
                ) : (
                  <Tag color="green" className="m-0 text-[10px]">آماده</Tag>
                )}
              </div>
              <div className="truncate text-[11px] font-normal text-slate-500 dark:text-slate-400">
                {agent.subtitleFa}
              </div>
            </div>
          </div>
        </div>
      )}
      footer={(
        <div dir="rtl" className="flex flex-wrap items-center justify-between gap-2">
          <Button onClick={onClose}>بستن</Button>
          {canChat ? (
            <Space wrap>
              {onToggleAgentInComposer ? (
                <Button onClick={() => onToggleAgentInComposer(agent.key)}>
                  {selectedInComposer ? 'حذف از گفتگوی داشبورد' : 'انتخاب در گفتگوی داشبورد'}
                </Button>
              ) : null}
              {onOpenChatPage ? (
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={() => onOpenChatPage(agent.key, draftTone || agent.toneStyle)}
                >
                  شروع گفتگو با {agent.shortTitleFa}
                </Button>
              ) : null}
            </Space>
          ) : null}
        </div>
      )}
    >
      <div dir="rtl" className="space-y-3 pt-1">
        <p className="m-0 text-xs leading-5 text-slate-600 dark:text-slate-300">
          {agent.descriptionFa}
        </p>
        <Tabs
          size="small"
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as 'activity' | 'settings')}
          items={tabItems}
        />
      </div>

      <WorkflowEditorModal
        open={workflowEditorOpen}
        onClose={() => {
          setWorkflowEditorOpen(false);
          setEditingWorkflowRecord(null);
        }}
        onSaved={() => {
          setWorkflowEditorOpen(false);
          setEditingWorkflowRecord(null);
          void onRefresh();
        }}
        record={editingWorkflowRecord}
        canEdit={canEdit}
        initialModuleId={def?.primaryModules?.[0] || workflowModuleOptions[0]?.value || 'customers'}
        initialAgentKey={agent.key}
        moduleOptions={workflowModuleOptions}
        initialDraft={!editingWorkflowRecord ? {
          moduleId: def?.primaryModules?.[0] || workflowModuleOptions[0]?.value || 'customers',
          agentKey: agent.key,
          name: `وظیفه خودکار ${agent.shortTitleFa}`,
          triggerType: 'interval',
          actions: [{
            id: createWorkflowId(),
            type: 'run_ai_prompt',
            config: {
              prompt_template: `بررسی موارد مرتبط در حوزه ${agent.titleFa} و ارائه گزارش یا پیشنهاد اقدام دقیق`,
              output_mode: 'text',
              delivery_channels: ['note'],
            },
          }],
        } : null}
      />
    </Modal>
  );
};

export default DashboardAgentDetailModal;
