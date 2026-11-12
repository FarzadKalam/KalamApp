import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Empty,
  InputNumber,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import {
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  SaveOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { isSaasAdminModuleId } from '../../utils/permissions';
import {
  AGENT_TONE_STYLES,
  AI_AGENT_CATALOG,
  type AgentKey,
  type AgentToneStyle,
} from '../../utils/aiAgentCatalog';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { createWorkflowId, type WorkflowRecord } from '../../utils/workflowTypes';
import WorkflowEditorModal from '../workflows/WorkflowEditorModal';
import AiAgentOnboardingWizard from './AiAgentOnboardingWizard';
import { AiAgentAvatar } from './AiAgentIcon';
import { useCurrencyConfig } from '../../utils/currency';
import {
  convertDisplayInputToIrt,
  convertIrtToDisplayAmount,
  getAiDisplayCurrencyMeta,
} from '../../utils/aiCurrency';

type AgentModelOption = {
  id: string;
  displayName: string;
  provider?: string;
  capabilityTags?: string[];
};

type AgentOverviewRow = {
  key: AgentKey;
  titleFa: string;
  shortTitleFa: string;
  subtitleFa: string;
  descriptionFa: string;
  badgeColor: string;
  supportsBackground: boolean;
  supportsStaffBot: boolean;
  orgEnabled: boolean;
  planAllowed: boolean;
  toneStyle: AgentToneStyle;
  modelOverride: string | null;
  fastModelOverride: string | null;
  allowedChannels: string[];
  backgroundConfig: Record<string, any>;
  policyJson: Record<string, any>;
  usageStats?: { runs?: number; cachedTokens?: number; savingsIrt?: number };
};

type MemberPermissionDraft = {
  subjectType: 'user' | 'role';
  subjectId: string;
  agentKey: string;
  canUse: boolean;
  staffBotEnabled: boolean;
  autonomyMode: 'confirm' | 'auto_low_risk';
  toneStyle: AgentToneStyle | null;
};

type AiAgentConfigPanelProps = {
  overview?: any | null;
  onSaved?: () => void | Promise<void>;
  compact?: boolean;
};

const CHANNEL_OPTIONS = [
  { value: 'web', label: 'چت و پنل وب' },
  { value: 'agent_inbox', label: 'صندوق پیام ایجنت‌ها' },
  { value: 'staff_bot', label: 'بات هوشمند همکار (تلگرام/بله/روبیکا)' },
];

const buildPermMapKey = (subjectType: string, subjectId: string, agentKey: string) =>
  `${subjectType}:${subjectId}:${agentKey}`;

const CRON_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  completed: { label: 'موفق', color: 'green' },
  failed: { label: 'ناموفق', color: 'red' },
  skipped: { label: 'بدون تغییر', color: 'default' },
};

const formatJalaliDateTime = (value?: string | null) => {
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

const AiAgentConfigPanel: React.FC<AiAgentConfigPanelProps> = ({
  overview: externalOverview = null,
  onSaved,
  compact = false,
}) => {
  const { message } = App.useApp();
  const orgCurrency = useCurrencyConfig();
  const [internalOverview, setInternalOverview] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeAgentKey, setActiveAgentKey] = useState<AgentKey>('lead_orchestrator');
  const [savingAgentKey, setSavingAgentKey] = useState<AgentKey | null>(null);
  const [runningBackground, setRunningBackground] = useState(false);
  const [runningSingleSchedule, setRunningSingleSchedule] = useState(false);
  const [wizardAgentKey, setWizardAgentKey] = useState<AgentKey | null>(null);
  const [workflowEditorOpen, setWorkflowEditorOpen] = useState(false);
  const [editingWorkflowRecord, setEditingWorkflowRecord] = useState<WorkflowRecord | null>(null);
  const [workflowDraftAgentKey, setWorkflowDraftAgentKey] = useState<AgentKey | null>(null);
  const [togglingWorkflowId, setTogglingWorkflowId] = useState<string | null>(null);

  const [agentDrafts, setAgentDrafts] = useState<Record<string, {
    isEnabled: boolean;
    modelOverride: string | null;
    fastModelOverride: string | null;
    toneStyle: AgentToneStyle;
    allowedChannels: string[];
    backgroundConfig: {
      enabled: boolean;
      interval_minutes: number;
      cooldown_minutes: number;
      daily_budget_irt: number;
      respect_work_schedule: boolean;
    };
  }>>({});

  const [subjectMode, setSubjectMode] = useState<'role' | 'user'>('role');
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, MemberPermissionDraft>>({});
  const [dirtyPermissionKeys, setDirtyPermissionKeys] = useState<Set<string>>(new Set());
  const [savingPermissions, setSavingPermissions] = useState(false);

  const overview = externalOverview || internalOverview;
  const budgetCurrencyMeta = useMemo(
    () => getAiDisplayCurrencyMeta(overview?.company, orgCurrency),
    [overview?.company, orgCurrency],
  );

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { action: 'get_agents_workspace_overview' },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'دریافت تنظیمات ایجنت‌ها ناموفق بود.'));
      setInternalOverview(data);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'بارگذاری تنظیمات ایجنت‌ها ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (!externalOverview) {
      void loadOverview();
    }
  }, [externalOverview, loadOverview]);

  const reloadAll = useCallback(async () => {
    if (onSaved) {
      await onSaved();
    }
    if (!externalOverview) {
      await loadOverview();
    }
  }, [externalOverview, loadOverview, onSaved]);

  useEffect(() => {
    if (!overview) return;
    const nextAgentDrafts: typeof agentDrafts = {};
    for (const def of AI_AGENT_CATALOG) {
      const serverItem = (Array.isArray(overview.agents) ? overview.agents : []).find(
        (item: AgentOverviewRow) => item.key === def.key,
      ) as AgentOverviewRow | undefined;
      const bg = serverItem?.backgroundConfig || def.defaultBackgroundConfig;
      nextAgentDrafts[def.key] = {
        isEnabled: serverItem ? serverItem.orgEnabled !== false : true,
        modelOverride: serverItem?.modelOverride || null,
        fastModelOverride: serverItem?.fastModelOverride || null,
        toneStyle: (serverItem?.toneStyle || def.defaultToneStyle) as AgentToneStyle,
        allowedChannels: Array.isArray(serverItem?.allowedChannels) && serverItem.allowedChannels.length > 0
          ? serverItem.allowedChannels
          : ['web', 'staff_bot', 'agent_inbox'],
        backgroundConfig: {
          enabled: bg?.enabled === true,
          interval_minutes: Math.max(15, Number(bg?.interval_minutes || def.defaultBackgroundConfig.interval_minutes || 60)),
          cooldown_minutes: Math.max(15, Number(bg?.cooldown_minutes || def.defaultBackgroundConfig.cooldown_minutes || 240)),
          daily_budget_irt: Math.max(0, Number(bg?.daily_budget_irt ?? def.defaultBackgroundConfig.daily_budget_irt ?? 30000)),
          respect_work_schedule: bg?.respect_work_schedule !== false,
        },
      };
    }
    setAgentDrafts(nextAgentDrafts);

    const nextPerms: Record<string, MemberPermissionDraft> = {};
    for (const row of Array.isArray(overview.memberPermissions) ? overview.memberPermissions : []) {
      const subjectType = row?.subject_type === 'user' ? 'user' : 'role';
      const subjectId = String(row?.subject_id || '').trim();
      const agentKey = String(row?.agent_key || '').trim();
      if (!subjectId || !agentKey) continue;
      nextPerms[buildPermMapKey(subjectType, subjectId, agentKey)] = {
        subjectType,
        subjectId,
        agentKey,
        canUse: row?.can_use !== false,
        staffBotEnabled: row?.staff_bot_enabled === true,
        autonomyMode: row?.autonomy_mode === 'auto_low_risk' ? 'auto_low_risk' : 'confirm',
        toneStyle: row?.tone_style || null,
      };
    }
    setPermissionDrafts(nextPerms);
    setDirtyPermissionKeys(new Set());
  }, [overview]);

  const modelOptions = useMemo(() => (
    (Array.isArray(overview?.models) ? overview.models : [])
      .map((item: AgentModelOption) => ({
        value: String(item.id || '').trim(),
        label: String(item.displayName || item.id || '').trim(),
      }))
      .filter((item: { value: string }) => Boolean(item.value))
  ), [overview?.models]);

  const fastModelOptions = useMemo(() => {
    const tagged = (Array.isArray(overview?.models) ? overview.models : [])
      .filter((item: AgentModelOption) =>
        Array.isArray(item.capabilityTags) && item.capabilityTags.includes('agent_fast'),
      )
      .map((item: AgentModelOption) => ({
        value: String(item.id || '').trim(),
        label: String(item.displayName || item.id || '').trim(),
      }))
      .filter((item: { value: string }) => Boolean(item.value));
    return tagged.length > 0 ? tagged : modelOptions;
  }, [modelOptions, overview?.models]);

  const modelLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of Array.isArray(overview?.models) ? overview.models : []) {
      const id = String(item?.id || '').trim();
      if (id) map[id] = String(item?.displayName || id).trim();
    }
    return map;
  }, [overview?.models]);

  const workflowModuleOptions = useMemo(
    () =>
      Object.values(MODULES)
        .filter((module) => !isSaasAdminModuleId(module.id) && module.registryVisibility?.workflows !== false)
        .map((module) => ({ label: module.titles.fa, value: module.id }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fa')),
    [],
  );

  const planFeatures = overview?.planFeatures || {};
  const canManage = overview?.canManage === true;
  const configurableCatalog = useMemo(() => {
    const serverAgents = Array.isArray(overview?.agents) ? overview.agents : [];
    const byKey = new Map<string, any>(serverAgents.map((item: any) => [String(item?.key || ''), item]));
    return AI_AGENT_CATALOG.filter((def) => {
      const row = byKey.get(def.key);
      if (!row || (row.canView ?? row.canUse) === false) return false;
      if (canManage) return true;
      return Boolean(row.canEdit || row.canToggle);
    });
  }, [canManage, overview?.agents]);

  useEffect(() => {
    if (!configurableCatalog.length) return;
    if (!configurableCatalog.some((item) => item.key === activeAgentKey)) {
      setActiveAgentKey(configurableCatalog[0].key);
    }
  }, [activeAgentKey, configurableCatalog]);

  const activeAgentDef = useMemo(
    () => configurableCatalog.find((item) => item.key === activeAgentKey) || configurableCatalog[0] || AI_AGENT_CATALOG[0],
    [activeAgentKey, configurableCatalog],
  );
  const activeOverviewRow = useMemo(
    () => (Array.isArray(overview?.agents) ? overview.agents : []).find((item: any) => item.key === activeAgentKey) || null,
    [activeAgentKey, overview?.agents],
  );
  const activeCanEdit = Boolean(canManage || activeOverviewRow?.canEdit);
  const activeCanToggle = Boolean(canManage || activeCanEdit || activeOverviewRow?.canToggle);
  const activeDraft = agentDrafts[activeAgentKey];

  const updateActiveDraft = (patch: Partial<NonNullable<typeof activeDraft>>) => {
    setAgentDrafts((prev) => ({
      ...prev,
      [activeAgentKey]: {
        ...(prev[activeAgentKey] || {
          isEnabled: true,
          modelOverride: null,
          fastModelOverride: null,
          toneStyle: activeAgentDef.defaultToneStyle,
          allowedChannels: ['web', 'staff_bot', 'agent_inbox'],
          backgroundConfig: { ...activeAgentDef.defaultBackgroundConfig },
        }),
        ...patch,
      },
    }));
  };

  const handleSaveAgentConfig = async () => {
    if (!activeDraft || !activeCanToggle) return;
    setSavingAgentKey(activeAgentKey);
    try {
      const payloadBody = activeCanEdit
        ? {
            action: 'save_org_agent_config',
            agentKey: activeAgentKey,
            isEnabled: activeDraft.isEnabled,
            modelOverride: activeDraft.modelOverride || null,
            fastModelOverride: activeDraft.fastModelOverride || null,
            toneStyle: activeDraft.toneStyle,
            allowedChannels: activeDraft.allowedChannels,
            backgroundConfig: activeDraft.backgroundConfig,
          }
        : {
            action: 'save_org_agent_config',
            agentKey: activeAgentKey,
            toggleOnly: true,
            isEnabled: activeDraft.isEnabled,
          };
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: payloadBody,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'ذخیره تنظیمات ایجنت ناموفق بود.'));
      message.success(String(data.message || 'تنظیمات ایجنت ذخیره شد.'));
      await reloadAll();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره تنظیمات ایجنت ناموفق بود.'));
    } finally {
      setSavingAgentKey(null);
    }
  };

  const handleRunBackgroundAgents = async () => {
    setRunningBackground(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { action: 'run_background_agents' },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'اجرای دوره‌ای ایجنت‌های پس‌زمینه ناموفق بود.'));
      message.success(`بررسی دوره‌ای انجام شد (${toPersianNumber(Number(data?.runsTriggered || 0))} اجرا).`);
      await reloadAll();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'اجرای دوره‌ای ایجنت‌های پس‌زمینه ناموفق بود.'));
    } finally {
      setRunningBackground(false);
    }
  };

  const handleRunSingleAgentSchedule = async () => {
    if (!activeCanEdit || runningSingleSchedule) return;
    setRunningSingleSchedule(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { action: 'run_background_agents', agentKey: activeAgentKey, force: true },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'اجرای زمان‌بندی خودکار ایجنت ناموفق بود.'));
      const triggered = Number(data?.runsTriggered || 0);
      if (triggered > 0) {
        message.success(`بررسی خودکار ${activeAgentDef.titleFa} با موفقیت اجرا شد.`);
      } else {
        const reason = Array.isArray(data?.skippedReasons) ? String(data.skippedReasons[0] || '').trim() : '';
        message.info(reason || 'بررسی خودکار انجام شد؛ مورد جدیدی برای اقدام نبود.');
      }
      await reloadAll();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'اجرای دستی زمان‌بندی خودکار ایجنت ناموفق بود.'));
    } finally {
      setRunningSingleSchedule(false);
    }
  };

  const handleToggleWorkflowTrigger = async (workflowId: string, nextActive: boolean) => {
    if (!activeCanEdit || !workflowId || togglingWorkflowId) return;
    setTogglingWorkflowId(workflowId);
    try {
      const { error } = await supabase
        .from('workflows')
        .update({ is_active: nextActive, updated_at: new Date().toISOString() })
        .eq('id', workflowId);
      if (error) throw error;
      message.success(nextActive ? 'فعال‌کننده روشن شد.' : 'فعال‌کننده خاموش شد.');
      await reloadAll();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'تغییر وضعیت فعال‌کننده ناموفق بود.'));
    } finally {
      setTogglingWorkflowId(null);
    }
  };

  const handleOpenWorkflowEditorForTrigger = async (workflowId?: string) => {
    if (!activeCanEdit) return;
    if (!workflowId) {
      setEditingWorkflowRecord(null);
      setWorkflowDraftAgentKey(activeAgentKey);
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
      setWorkflowDraftAgentKey(activeAgentKey);
      setWorkflowEditorOpen(true);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'بارگذاری تنظیمات فعال‌کننده ناموفق بود.'));
    }
  };

  const getPermEntry = (subjectType: 'user' | 'role', subjectId: string, agentKey: string): MemberPermissionDraft => {
    const mapKey = buildPermMapKey(subjectType, subjectId, agentKey);
    return permissionDrafts[mapKey] || {
      subjectType,
      subjectId,
      agentKey,
      canUse: true,
      staffBotEnabled: false,
      autonomyMode: 'confirm',
      toneStyle: null,
    };
  };

  const updatePermEntry = (
    subjectType: 'user' | 'role',
    subjectId: string,
    agentKey: string,
    patch: Partial<MemberPermissionDraft>,
  ) => {
    const mapKey = buildPermMapKey(subjectType, subjectId, agentKey);
    setPermissionDrafts((prev) => ({
      ...prev,
      [mapKey]: {
        ...getPermEntry(subjectType, subjectId, agentKey),
        ...prev[mapKey],
        ...patch,
      },
    }));
    setDirtyPermissionKeys((prev) => new Set(prev).add(mapKey));
  };

  const handleSavePermissions = async () => {
    if (dirtyPermissionKeys.size === 0) {
      message.info('تغییری برای ذخیره ثبت نشده است.');
      return;
    }
    setSavingPermissions(true);
    try {
      const entries = Array.from(dirtyPermissionKeys)
        .map((key) => permissionDrafts[key])
        .filter(Boolean);
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'save_agent_member_permissions',
          entries,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'ذخیره دسترسی‌های ایجنت ناموفق بود.'));
      message.success(String(data.message || 'دسترسی‌های ایجنت‌ها و بات همکار ذخیره شد.'));
      setDirtyPermissionKeys(new Set());
      await reloadAll();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره دسترسی‌های ایجنت‌ها ناموفق بود.'));
    } finally {
      setSavingPermissions(false);
    }
  };

  const subjects = useMemo(() => {
    if (subjectMode === 'role') {
      return (Array.isArray(overview?.roles) ? overview.roles : []).map((role: any) => ({
        id: String(role.id),
        title: String(role.title || 'نقش بدون عنوان'),
        subtitle: 'نقش سازمانی',
      }));
    }
    return (Array.isArray(overview?.users) ? overview.users : []).map((user: any) => ({
      id: String(user.id),
      title: String(user.full_name || 'کاربر بدون نام'),
      subtitle: [
        user.job_title ? String(user.job_title) : '',
        user.telegram_chat_id ? 'تلگرام متصل' : '',
        user.bale_chat_id ? 'بله متصل' : '',
        user.rubika_chat_id ? 'روبیکا متصل' : '',
      ].filter(Boolean).join(' · '),
    }));
  }, [overview?.roles, overview?.users, subjectMode]);

  if (loading && !overview) {
    return (
      <div className="flex justify-center py-8">
        <Spin />
      </div>
    );
  }

  if (!overview) {
    return <Empty description="اطلاعات تنظیمات ایجنت‌ها در دسترس نیست." />;
  }

  if (!canManage && configurableCatalog.length === 0) {
    return (
      <Alert
        type="info"
        showIcon
        message="دسترسی مدیریت تنظیمات ایجنت‌ها"
        description="پیکربندی، روشن/خاموش‌کردن یا تنظیم دسترسی اعضای سازمان در ایجنت‌ها برای نقش فعلی شما فعال نیست."
      />
    );
  }

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          تنظیمات هر ایجنت به‌صورت مستقل در سطح همین سازمان نگهداری می‌شود و مدل‌ها مستقیماً از فهرست فعال سیستم خوانده می‌شوند.
        </div>
        <Space wrap>
          {planFeatures.ai_background_agents && (canManage || activeCanEdit) ? (
            <Button
              size="small"
              icon={<PlayCircleOutlined />}
              loading={runningBackground}
              onClick={() => void handleRunBackgroundAgents()}
            >
              اجرای دوره‌ای پس‌زمینه
            </Button>
          ) : null}
          {!externalOverview ? (
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadOverview()} loading={loading}>
              بروزرسانی
            </Button>
          ) : null}
        </Space>
      </div>

      <Tabs
        size={compact ? 'small' : 'middle'}
        items={[
          {
            key: 'per-org-agents',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <RobotOutlined />
                پیکربندی و پرسش‌وپاسخ هر ایجنت
              </span>
            ),
            children: (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="space-y-1.5 lg:col-span-4">
                  {configurableCatalog.map((item) => {
                    const draft = agentDrafts[item.key];
                    const row = (Array.isArray(overview.agents) ? overview.agents : []).find((a: any) => a.key === item.key);
                    const isSelected = activeAgentKey === item.key;
                    const policyKeys = Object.keys(row?.policyJson || {}).filter((k) => Boolean(row?.policyJson?.[k])).length;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActiveAgentKey(item.key)}
                        className={`flex w-full items-start justify-between gap-2 rounded-xl border p-2.5 text-right transition ${
                          isSelected
                            ? 'border-[rgb(var(--brand-500-rgb))] bg-[rgba(var(--brand-50-rgb),0.75)] dark:bg-white/10'
                            : 'border-slate-200/80 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03]'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <AiAgentAvatar
                              agentKey={item.key}
                              color={item.badgeColor}
                              size={26}
                              disabled={draft?.isEnabled === false}
                            />
                            <span className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                              {item.titleFa}
                            </span>
                          </div>
                          <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {item.subtitleFa}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Tag color={draft?.isEnabled === false ? 'default' : 'green'} className="m-0 text-[10px]">
                            {draft?.isEnabled === false ? 'غیرفعال' : 'فعال'}
                          </Tag>
                          {policyKeys > 0 ? (
                            <Tag color="blue" className="m-0 text-[10px]">
                              {toPersianNumber(policyKeys)} تنظیم اختصاصی
                            </Tag>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="lg:col-span-8">
                  {activeDraft ? (
                    <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-white/10">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <AiAgentAvatar
                              agentKey={activeAgentDef.key}
                              color={activeAgentDef.badgeColor}
                              size={34}
                              disabled={activeDraft.isEnabled === false}
                            />
                            <h4 className="m-0 text-sm font-black text-slate-800 dark:text-slate-100">
                              {activeAgentDef.titleFa}
                            </h4>
                            {activeOverviewRow?.planAllowed === false ? (
                              <Tag color="red" className="m-0">خارج از پلن</Tag>
                            ) : null}
                          </div>
                          <p className="m-0 mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {activeAgentDef.descriptionFa}
                          </p>
                        </div>
                        <Space wrap>
                          {activeCanEdit ? (
                            <Button
                              size="small"
                              icon={<QuestionCircleOutlined />}
                              onClick={() => setWizardAgentKey(activeAgentKey)}
                            >
                              پرسش و پاسخ تکمیلی
                            </Button>
                          ) : null}
                          <Button
                            type="primary"
                            size="small"
                            icon={<SaveOutlined />}
                            disabled={!activeCanToggle}
                            loading={savingAgentKey === activeAgentKey}
                            onClick={() => void handleSaveAgentConfig()}
                          >
                            {activeCanEdit ? 'ذخیره ایجنت' : 'ذخیره وضعیت'}
                          </Button>
                        </Space>
                      </div>

                      {!activeCanEdit ? (
                        <Alert
                          type="info"
                          showIcon
                          className="text-xs"
                          message="دسترسی شما روی این ایجنت محدود به روشن/خاموش‌کردن است؛ ویرایش مدل و تنظیمات زمان‌بندی خودکار نیازمند مجوز ویرایش ایجنت در تنظیمات نقش‌هاست."
                        />
                      ) : null}

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-slate-100 p-3 dark:border-white/10">
                          <div className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                            وضعیت در سازمان
                          </div>
                          <Switch
                            checked={activeDraft.isEnabled}
                            disabled={!activeCanToggle}
                            checkedChildren="فعال"
                            unCheckedChildren="غیرفعال"
                            onChange={(checked) => updateActiveDraft({ isEnabled: checked })}
                          />
                        </div>

                        <div className="rounded-xl border border-slate-100 p-3 dark:border-white/10">
                          <div className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                            لحن پاسخ‌گویی پیش‌فرض
                          </div>
                          <Select
                            className="w-full"
                            disabled={!activeCanEdit}
                            value={activeDraft.toneStyle}
                            options={AGENT_TONE_STYLES.map((t) => ({
                              value: t.value,
                              label: `${t.labelFa}`,
                            }))}
                            onChange={(val) => updateActiveDraft({ toneStyle: val as AgentToneStyle })}
                          />
                        </div>

                        <div className="rounded-xl border border-slate-100 p-3 dark:border-white/10">
                          <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                            مدل اصلی اختصاصی (اختیاری)
                          </div>
                          <div className="mb-1.5 text-[11px] text-slate-400">
                            پیش‌فرض فعلی:{' '}
                            <span className="font-semibold text-slate-600 dark:text-slate-300">
                              {modelLabelById[String(activeOverviewRow?.effectiveModelId || activeOverviewRow?.saasDefaultModelId || '')]
                                || activeOverviewRow?.effectiveModelId
                                || activeOverviewRow?.saasDefaultModelId
                                || 'مدل اصلی سازمان'}
                            </span>
                          </div>
                          <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            className="w-full"
                            disabled={!activeCanEdit}
                            value={activeDraft.modelOverride || undefined}
                            options={modelOptions}
                            placeholder={
                              activeOverviewRow?.saasDefaultModelId
                                ? `پیش‌فرض سیستم (${modelLabelById[activeOverviewRow.saasDefaultModelId] || activeOverviewRow.saasDefaultModelId})`
                                : 'استفاده از مدل پیش‌فرض سیستم/سازمان'
                            }
                            onChange={(val) => updateActiveDraft({ modelOverride: val ? String(val) : null })}
                          />
                        </div>

                        <div className="rounded-xl border border-slate-100 p-3 dark:border-white/10">
                          <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                            مدل سریع و اقتصادی برای پایش/رله (اختیاری)
                          </div>
                          <div className="mb-1.5 text-[11px] text-slate-400">
                            پیش‌فرض فعلی:{' '}
                            <span className="font-semibold text-slate-600 dark:text-slate-300">
                              {modelLabelById[String(activeOverviewRow?.effectiveFastModelId || activeOverviewRow?.saasFastDefaultModelId || '')]
                                || activeOverviewRow?.effectiveFastModelId
                                || activeOverviewRow?.saasFastDefaultModelId
                                || 'مدل رله سازمان'}
                            </span>
                          </div>
                          <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            className="w-full"
                            disabled={!activeCanEdit}
                            value={activeDraft.fastModelOverride || undefined}
                            options={fastModelOptions}
                            placeholder={
                              activeOverviewRow?.saasFastDefaultModelId
                                ? `پیش‌فرض رله (${modelLabelById[activeOverviewRow.saasFastDefaultModelId] || activeOverviewRow.saasFastDefaultModelId})`
                                : 'استفاده از مدل سریع سیستم/سازمان'
                            }
                            onChange={(val) => updateActiveDraft({ fastModelOverride: val ? String(val) : null })}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-100 p-3 dark:border-white/10">
                        <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                          کانال‌های مجاز فعالیت این ایجنت
                        </div>
                        <Checkbox.Group
                          disabled={!activeCanEdit}
                          value={activeDraft.allowedChannels}
                          options={CHANNEL_OPTIONS}
                          onChange={(checked) => updateActiveDraft({ allowedChannels: checked as string[] })}
                        />
                      </div>

                      <div className="rounded-xl border border-slate-100 p-3 dark:border-white/10 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            اجرای خودکار در پس‌زمینه و بررسی دوره‌ای (زمان‌بندی خودکار)
                          </span>
                          <Space size={8}>
                            {activeAgentDef.supportsBackground && planFeatures.ai_background_agents && activeCanEdit ? (
                              <Button
                                size="small"
                                icon={<PlayCircleOutlined />}
                                loading={runningSingleSchedule}
                                disabled={!activeDraft.isEnabled}
                                onClick={() => void handleRunSingleAgentSchedule()}
                              >
                                اجرای خودکار همین الان
                              </Button>
                            ) : null}
                            {!activeAgentDef.supportsBackground ? (
                              <Tag className="m-0">این ایجنت پس‌زمینه ندارد</Tag>
                            ) : !planFeatures.ai_background_agents ? (
                              <Tag color="red" className="m-0">نیازمند قابلیت ایجنت‌های پس‌زمینه در پلن</Tag>
                            ) : (
                              <Switch
                                disabled={!activeCanEdit}
                                checked={activeDraft.backgroundConfig.enabled}
                                checkedChildren="فعال"
                                unCheckedChildren="خاموش"
                                onChange={(checked) => updateActiveDraft({
                                  backgroundConfig: { ...activeDraft.backgroundConfig, enabled: checked },
                                })}
                              />
                            )}
                          </Space>
                        </div>
                        {activeAgentDef.supportsBackground ? (
                          <>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                              <div>
                                <div className="mb-1 text-[11px] text-slate-500">بازه اجرا (دقیقه)</div>
                                <InputNumber
                                  min={5}
                                  max={1440}
                                  step={5}
                                  className="w-full"
                                  disabled={!activeCanEdit || !planFeatures.ai_background_agents}
                                  value={activeDraft.backgroundConfig.interval_minutes}
                                  onChange={(v) => updateActiveDraft({
                                    backgroundConfig: {
                                      ...activeDraft.backgroundConfig,
                                      interval_minutes: Math.max(5, Number(v || 60)),
                                    },
                                  })}
                                />
                              </div>
                              <div>
                                <div className="mb-1 text-[11px] text-slate-500">فاصله تکرار پیگیری (دقیقه)</div>
                                <InputNumber
                                  min={5}
                                  max={10080}
                                  step={15}
                                  className="w-full"
                                  disabled={!activeCanEdit || !planFeatures.ai_background_agents}
                                  value={activeDraft.backgroundConfig.cooldown_minutes}
                                  onChange={(v) => updateActiveDraft({
                                    backgroundConfig: {
                                      ...activeDraft.backgroundConfig,
                                      cooldown_minutes: Math.max(5, Number(v || 240)),
                                    },
                                  })}
                                />
                              </div>
                              <div>
                                <div className="mb-1 text-[11px] text-slate-500">سقف هزینه روزانه ({budgetCurrencyMeta.label})</div>
                                <InputNumber
                                  min={0}
                                  max={10000000 * budgetCurrencyMeta.multiplierFromIrt}
                                  step={5000 * budgetCurrencyMeta.multiplierFromIrt}
                                  className="w-full"
                                  disabled={!activeCanEdit || !planFeatures.ai_background_agents}
                                  value={convertIrtToDisplayAmount(activeDraft.backgroundConfig.daily_budget_irt, overview?.company, orgCurrency)}
                                  onChange={(v) => updateActiveDraft({
                                    backgroundConfig: {
                                      ...activeDraft.backgroundConfig,
                                      daily_budget_irt: Math.max(0, convertDisplayInputToIrt(v, overview?.company, orgCurrency)),
                                    },
                                  })}
                                />
                              </div>
                              <div className="flex flex-col justify-end pb-1">
                                <Checkbox
                                  disabled={!activeCanEdit || !planFeatures.ai_background_agents}
                                  checked={activeDraft.backgroundConfig.respect_work_schedule}
                                  onChange={(e) => updateActiveDraft({
                                    backgroundConfig: {
                                      ...activeDraft.backgroundConfig,
                                      respect_work_schedule: e.target.checked,
                                    },
                                  })}
                                >
                                  <span className="text-[11px]">فقط در ساعات کاری و غیرتعطیل</span>
                                </Checkbox>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50/85 px-2.5 py-2 text-[11px] text-slate-600 dark:bg-white/[0.03] dark:text-slate-300">
                              <span>
                                آخرین اجرا: <b>{formatJalaliDateTime(activeOverviewRow?.backgroundLastRunAt)}</b>
                              </span>
                              <span>
                                اجرای بعدی: <b>{activeDraft.isEnabled && activeDraft.backgroundConfig.enabled && planFeatures.ai_background_agents ? formatJalaliDateTime(activeOverviewRow?.nextBackgroundRunAt) : 'غیرفعال'}</b>
                              </span>
                              {activeOverviewRow?.backgroundLastStatus ? (
                                <Tag color={CRON_STATUS_LABELS[String(activeOverviewRow.backgroundLastStatus)]?.color || 'default'} className="m-0 text-[10px]">
                                  {CRON_STATUS_LABELS[String(activeOverviewRow.backgroundLastStatus)]?.label || activeOverviewRow.backgroundLastStatus}
                                </Tag>
                              ) : null}
                              {activeOverviewRow?.backgroundLastSummary ? (
                                <span className="text-slate-500 dark:text-slate-400">
                                  ({activeOverviewRow.backgroundLastSummary})
                                </span>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                      </div>

                      {Object.keys(activeOverviewRow?.policyJson || {}).length > 0 ? (
                        <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-3 text-xs dark:border-emerald-500/20 dark:bg-emerald-500/10">
                          <div className="mb-1 font-bold text-emerald-800 dark:text-emerald-200">
                            سیاست اختصاصی ثبت‌شده در پرسش و پاسخ
                          </div>
                          <div className="space-y-1 text-[11.5px] text-slate-700 dark:text-slate-200">
                            {Object.entries(activeOverviewRow.policyJson as Record<string, any>)
                              .filter(([, val]) => Boolean(val))
                              .slice(0, 6)
                              .map(([key, val]) => {
                                const questionMatch = activeAgentDef.onboardingQuestions.find(
                                  (q) => q.policyField === key || q.key === key,
                                );
                                const labelFa = questionMatch?.questionFa
                                  || (key === 'custom_tone_notes'
                                    ? 'توضیح لحن سفارشی'
                                    : key === 'org_custom_notes'
                                      ? 'قوانین و استثناهای سازمان'
                                      : key);
                                return (
                                  <div key={key} className="leading-5">
                                    <span className="font-semibold">{labelFa}: </span>
                                    <span>{typeof val === 'string' ? val : JSON.stringify(val)}</span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      ) : null}

                      <div className="space-y-2.5 rounded-xl border border-indigo-200/70 bg-indigo-50/35 p-3 dark:border-indigo-400/20 dark:bg-indigo-950/15">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                              <ThunderboltOutlined className="text-indigo-600" />
                              فعال‌کننده‌ها و وظایف خودکار (مبتنی بر موتور گردش کار)
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              برای این ایجنت می‌توانید چندین فعال‌کننده مختلف (رویداد ثبت رکورد یا زمان‌بندی دوره‌ای) با وظایف مجزا تعریف کنید.
                            </div>
                          </div>
                          {activeCanEdit ? (
                            <Button
                              size="small"
                              type="primary"
                              ghost
                              icon={<PlusOutlined />}
                              onClick={() => void handleOpenWorkflowEditorForTrigger()}
                            >
                              افزودن فعال‌کننده برای این ایجنت
                            </Button>
                          ) : null}
                        </div>

                        {Array.isArray(activeOverviewRow?.workflowTriggers) && activeOverviewRow.workflowTriggers.length > 0 ? (
                          <div className="space-y-1.5">
                            {activeOverviewRow.workflowTriggers.map((wf: any) => {
                              const triggerLabel = wf.trigger_type === 'interval'
                                ? `زمان‌بندی هر ${toPersianNumber(Number(wf.interval_value || 1))} ${wf.interval_unit === 'hour' ? 'ساعت' : wf.interval_unit === 'day' ? 'روز' : wf.interval_unit === 'week' ? 'هفته' : 'ماه'}`
                                : wf.trigger_type === 'on_upsert'
                                  ? 'هنگام ایجاد یا ویرایش رکورد'
                                  : 'هنگام ایجاد رکورد جدید';
                              const modTitle = MODULES[String(wf.module_id || '')]?.titles?.fa || wf.module_id;
                              return (
                                <div
                                  key={wf.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-2 text-xs dark:border-white/10 dark:bg-white/[0.04]"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-bold text-slate-800 dark:text-slate-100">{wf.name}</span>
                                      <Tag className="m-0 text-[10px]">{modTitle}</Tag>
                                      <Tag color="blue" className="m-0 text-[10px]">{triggerLabel}</Tag>
                                    </div>
                                    {wf.description ? (
                                      <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{wf.description}</div>
                                    ) : null}
                                  </div>
                                  <Space size={6}>
                                    <Switch
                                      size="small"
                                      checked={wf.is_active !== false}
                                      loading={togglingWorkflowId === wf.id}
                                      disabled={!activeCanEdit}
                                      onChange={(checked) => void handleToggleWorkflowTrigger(wf.id, checked)}
                                    />
                                    {activeCanEdit ? (
                                      <Button
                                        size="small"
                                        icon={<EditOutlined />}
                                        onClick={() => void handleOpenWorkflowEditorForTrigger(wf.id)}
                                      >
                                        ویرایش
                                      </Button>
                                    ) : null}
                                  </Space>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-slate-200/80 bg-white/70 px-3 py-2 text-[11px] text-slate-500 dark:border-white/10 dark:bg-white/[0.02]">
                            هنوز فعال‌کننده اختصاصی در موتور گردش کار برای {activeAgentDef.shortTitleFa} ساخته نشده است.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ),
          },
          ...(canManage ? [{
            key: 'member-rbac',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <TeamOutlined />
                دسترسی کارکنان، نقش‌ها و بات همکار
              </span>
            ),
            children: (
              <div className="space-y-3">
                <Alert
                  type="info"
                  showIcon
                  className="text-xs"
                  message="برای تعیین مجوزهای دقیق «مشاهده»، «گفتگو»، «روشن/خاموش» و «ویرایش/زمان‌بندی» برای هر نقش سازمانی، می‌توانید از مسیر «تنظیمات ← چارت سازمانی (نقش‌ها) ← ایجنت‌های هوشمند» نیز استفاده کنید."
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Space wrap>
                    <Segmented
                      value={subjectMode}
                      onChange={(val) => setSubjectMode(val as 'role' | 'user')}
                      options={[
                        { value: 'role', label: 'سطح دسترسی بر اساس نقش' },
                        { value: 'user', label: 'استثنا و تنظیم هر کاربر' },
                      ]}
                    />
                    <Select
                      size="small"
                      value={activeAgentKey}
                      className="min-w-[210px]"
                      onChange={(val) => setActiveAgentKey(val as AgentKey)}
                      options={configurableCatalog.map((item) => ({
                        value: item.key,
                        label: item.titleFa,
                      }))}
                    />
                  </Space>
                  <Button
                    type="primary"
                    size="small"
                    icon={<SaveOutlined />}
                    loading={savingPermissions}
                    disabled={dirtyPermissionKeys.size === 0}
                    onClick={() => void handleSavePermissions()}
                  >
                    ذخیره دسترسی‌ها {dirtyPermissionKeys.size > 0 ? `(${toPersianNumber(dirtyPermissionKeys.size)})` : ''}
                  </Button>
                </div>

                {!planFeatures.ai_staff_bot ? (
                  <Alert
                    type="warning"
                    showIcon
                    message="قابلیت «بات هوشمند همکار (تلگرام/بله/روبیکا)» در پلن فعلی سازمان فعال نیست؛ امکان فعال‌سازی دسترسی وب همچنان برقرار است."
                  />
                ) : null}

                <Table
                  rowKey="id"
                  size="small"
                  dataSource={subjects}
                  pagination={{ pageSize: 10 }}
                  locale={{ emptyText: <Empty description="موردی برای نمایش پیدا نشد." /> }}
                  scroll={{ x: 760 }}
                  columns={[
                    {
                      title: subjectMode === 'role' ? 'نقش سازمانی' : 'همکار / کاربر',
                      dataIndex: 'title',
                      render: (_: unknown, row: any) => (
                        <div>
                          <div className="text-xs font-bold">{row.title}</div>
                          {row.subtitle ? <div className="text-[11px] text-slate-400">{row.subtitle}</div> : null}
                        </div>
                      ),
                    },
                    {
                      title: `استفاده از ${activeAgentDef.shortTitleFa}`,
                      width: 145,
                      render: (_: unknown, row: any) => {
                        const entry = getPermEntry(subjectMode, row.id, activeAgentKey);
                        return (
                          <Switch
                            size="small"
                            checked={entry.canUse}
                            checkedChildren="مجاز"
                            unCheckedChildren="مسدود"
                            onChange={(checked) => updatePermEntry(subjectMode, row.id, activeAgentKey, { canUse: checked })}
                          />
                        );
                      },
                    },
                    {
                      title: 'بات همکار سراسری',
                      width: 135,
                      render: (_: unknown, row: any) => {
                        const globalEntry = getPermEntry(subjectMode, row.id, '__staff_bot');
                        return (
                          <Tooltip title={!planFeatures.ai_staff_bot ? 'خارج از پلن فعلی' : 'اجازه اتصال پیام‌رسان به دستیار سازمان'}>
                            <Switch
                              size="small"
                              disabled={!planFeatures.ai_staff_bot}
                              checked={globalEntry.staffBotEnabled}
                              checkedChildren="فعال"
                              unCheckedChildren="خاموش"
                              onChange={(checked) => updatePermEntry(subjectMode, row.id, '__staff_bot', {
                                canUse: true,
                                staffBotEnabled: checked,
                              })}
                            />
                          </Tooltip>
                        );
                      },
                    },
                    {
                      title: `در بات برای ${activeAgentDef.shortTitleFa}`,
                      width: 150,
                      render: (_: unknown, row: any) => {
                        const entry = getPermEntry(subjectMode, row.id, activeAgentKey);
                        return (
                          <Checkbox
                            disabled={!planFeatures.ai_staff_bot || !activeAgentDef.supportsStaffBot}
                            checked={entry.staffBotEnabled}
                            onChange={(e) => updatePermEntry(subjectMode, row.id, activeAgentKey, {
                              staffBotEnabled: e.target.checked,
                            })}
                          >
                            <span className="text-[11px]">پاسخ در بات</span>
                          </Checkbox>
                        );
                      },
                    },
                    {
                      title: 'سطح استقلال اجرا',
                      width: 170,
                      render: (_: unknown, row: any) => {
                        const entry = getPermEntry(subjectMode, row.id, activeAgentKey);
                        return (
                          <Select
                            size="small"
                            className="w-full"
                            value={entry.autonomyMode}
                            options={[
                              { value: 'confirm', label: 'همیشه با تایید کاربر' },
                              { value: 'auto_low_risk', label: 'خودکار در کارهای کم‌ریسک' },
                            ]}
                            onChange={(val) => updatePermEntry(subjectMode, row.id, activeAgentKey, {
                              autonomyMode: val as 'confirm' | 'auto_low_risk',
                            })}
                          />
                        );
                      },
                    },
                    {
                      title: 'لحن اختصاصی (اختیاری)',
                      width: 145,
                      render: (_: unknown, row: any) => {
                        const entry = getPermEntry(subjectMode, row.id, activeAgentKey);
                        return (
                          <Select
                            size="small"
                            allowClear
                            className="w-full"
                            placeholder="پیش‌فرض ایجنت"
                            value={entry.toneStyle || undefined}
                            options={AGENT_TONE_STYLES.map((item) => ({ value: item.value, label: item.labelFa }))}
                            onChange={(val) => updatePermEntry(subjectMode, row.id, activeAgentKey, {
                              toneStyle: val ? (val as AgentToneStyle) : null,
                            })}
                          />
                        );
                      },
                    },
                  ]}
                />
              </div>
            ),
          }] : []),
        ]}
      />

      <AiAgentOnboardingWizard
        open={Boolean(wizardAgentKey)}
        agentKey={wizardAgentKey}
        onClose={() => setWizardAgentKey(null)}
        onCompleted={async () => {
          await reloadAll();
        }}
      />

      <WorkflowEditorModal
        open={workflowEditorOpen}
        onClose={() => {
          setWorkflowEditorOpen(false);
          setEditingWorkflowRecord(null);
          setWorkflowDraftAgentKey(null);
        }}
        onSaved={() => {
          setWorkflowEditorOpen(false);
          setEditingWorkflowRecord(null);
          setWorkflowDraftAgentKey(null);
          void reloadAll();
        }}
        record={editingWorkflowRecord}
        canEdit={activeCanEdit}
        initialModuleId={activeAgentDef?.primaryModules?.[0] || workflowModuleOptions[0]?.value || 'customers'}
        initialAgentKey={workflowDraftAgentKey || activeAgentKey}
        moduleOptions={workflowModuleOptions}
        initialDraft={!editingWorkflowRecord && workflowDraftAgentKey ? {
          moduleId: activeAgentDef?.primaryModules?.[0] || workflowModuleOptions[0]?.value || 'customers',
          agentKey: workflowDraftAgentKey,
          name: `وظیفه خودکار ${activeAgentDef.shortTitleFa}`,
          triggerType: 'interval',
          actions: [{
            id: createWorkflowId(),
            type: 'run_ai_prompt',
            config: {
              prompt_template: `بررسی موارد مرتبط در حوزه ${activeAgentDef.titleFa} و ارائه گزارش یا پیشنهاد اقدام دقیق`,
              output_mode: 'text',
              delivery_channels: ['note'],
            },
          }],
        } : null}
      />
    </div>
  );
};

export default AiAgentConfigPanel;
