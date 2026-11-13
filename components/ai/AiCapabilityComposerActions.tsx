import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Drawer, Grid, Popover, Select, Tag, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import {
  AudioOutlined,
  DollarOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  CloseOutlined,
  PlusOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  PictureOutlined,
  SoundOutlined,
  VideoCameraOutlined,
  FileWordOutlined,
  MessageOutlined,
  SnippetsOutlined,
} from '@ant-design/icons';
import AiFileUploadButton, { type AiUploadedFilePrompt } from './AiFileUploadButton';
const MessageComposerModal = lazy(() => import('../MessageComposerModal'));
import AiVoiceRecorder, { type RecordedVoice } from './AiVoiceRecorder';
import AiMediaSettingsPopover, { type AiMediaSettings } from './AiMediaSettingsPopover';
import { getAiAgent, getAiAgentLabel, type AiComposerAgentId } from '../../supabase/functions/_shared/ai-agents';
import { scheduleOverlayLockRelease } from '../../utils/overlayLocks';
import {
  AGENT_TONE_STYLES,
  AI_AGENT_CATALOG,
  PRICING_ADJUSTMENT_SKILL_META,
  getAgentDefinition,
  normalizeSelectedAgents,
  type AgentKey,
  type AgentToneStyle,
  type ClientAgentAccessEvaluation,
} from '../../utils/aiAgentCatalog';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import AiAgentIcon, { AiAgentAvatar } from './AiAgentIcon';

/** Compatibility alias for persisted composer preferences and existing callers. */
export type AiComposerCapability = AiComposerAgentId | 'pricing_adjustment';

type CapabilityAvailability = Record<string, { enabled?: boolean; planAvailable?: boolean; tenantReady?: boolean; hasReadyModel?: boolean } | undefined>;

type AiCapabilityComposerActionsProps = {
  selected: AiComposerCapability[];
  autoSuggested?: AiComposerCapability[];
  onChange: (next: AiComposerCapability[]) => void;
  capabilityAvailability?: CapabilityAvailability;
  selectedAgents?: AgentKey[];
  onAgentsChange?: (next: AgentKey[]) => void;
  agentAccessMap?: Partial<Record<AgentKey, ClientAgentAccessEvaluation>> | null;
  toneStyle?: AgentToneStyle;
  onToneStyleChange?: (next: AgentToneStyle) => void;
  showAgentPicker?: boolean;
  disabled?: boolean;
  loading?: boolean;
  size?: ButtonProps['size'];
  compact?: boolean;
  moduleId?: string | null;
  recordId?: string | null;
  onVoiceSend: (voice: RecordedVoice) => void | Promise<void>;
  onMoveTranscriptToComposer?: (transcript: string) => void;
  onFilePrepared: (filePrompt: AiUploadedFilePrompt) => void | Promise<void>;
  onFilesPrepared?: (filePrompts: AiUploadedFilePrompt[]) => void | Promise<void>;
  voiceLoading?: boolean;
  fileLoading?: boolean;
  directFileUpload?: boolean;
  allowMultipleFiles?: boolean;
  recordCreationModuleOptions?: Array<{ label: string; value: string }>;
  recordCreationTargetModuleId?: string | null;
  onRecordCreationTargetModuleChange?: (moduleId: string | null) => void;
  mediaSettings?: AiMediaSettings;
  onMediaSettingsChange?: (next: AiMediaSettings) => void;
  mediaModelId?: string | null;
  onApplyPrompt?: (text: string) => void;
  promptRecord?: Record<string, any> | null;
};

const CAPABILITY_META: Array<{
  key: AiComposerCapability;
  label: string;
  description: string;
  icon: React.ReactNode;
  kind: 'toggle' | 'inline';
}> = [
  { key: 'text_chat', label: getAiAgentLabel('text_chat'), description: getAiAgent('text_chat').description, icon: <MessageOutlined />, kind: 'toggle' },
  { key: 'document_analysis', label: getAiAgentLabel('document_analysis'), description: getAiAgent('document_analysis').description, icon: <FileSearchOutlined />, kind: 'inline' },
  { key: 'voice_input', label: getAiAgentLabel('voice_input'), description: getAiAgent('voice_input').description, icon: <AudioOutlined />, kind: 'inline' },
  { key: 'voice_output', label: getAiAgentLabel('voice_output'), description: getAiAgent('voice_output').description, icon: <SoundOutlined />, kind: 'toggle' },
  { key: 'image_generation', label: getAiAgentLabel('image_generation'), description: getAiAgent('image_generation').description, icon: <PictureOutlined />, kind: 'toggle' },
  { key: 'video_generation', label: getAiAgentLabel('video_generation'), description: getAiAgent('video_generation').description, icon: <VideoCameraOutlined />, kind: 'toggle' },
  { key: 'document_generation', label: getAiAgentLabel('document_generation'), description: getAiAgent('document_generation').description, icon: <FileWordOutlined />, kind: 'toggle' },
  { key: 'web_search', label: getAiAgentLabel('web_search'), description: getAiAgent('web_search').description, icon: <GlobalOutlined />, kind: 'toggle' },
  { key: 'deep_reasoning', label: getAiAgentLabel('deep_reasoning'), description: getAiAgent('deep_reasoning').description, icon: <ThunderboltOutlined />, kind: 'toggle' },
  { key: 'legal_assistant', label: getAiAgentLabel('legal_assistant'), description: getAiAgent('legal_assistant').description, icon: <SafetyCertificateOutlined />, kind: 'toggle' },
  { key: 'record_creation', label: getAiAgentLabel('record_creation'), description: getAiAgent('record_creation').description, icon: <PlusOutlined />, kind: 'toggle' },
  { key: 'process_operation', label: getAiAgentLabel('process_operation'), description: getAiAgent('process_operation').description, icon: <ThunderboltOutlined />, kind: 'toggle' },
  { key: 'pricing_adjustment', label: PRICING_ADJUSTMENT_SKILL_META.labelFa, description: PRICING_ADJUSTMENT_SKILL_META.descriptionFa, icon: <DollarOutlined />, kind: 'toggle' },
  { key: 'free_chat', label: getAiAgentLabel('free_chat'), description: getAiAgent('free_chat').description, icon: <MessageOutlined />, kind: 'toggle' },
];

const isCapabilityUsable = (availability: CapabilityAvailability | undefined, key: AiComposerCapability) => {
  const item = availability?.[key];
  if (!item) return true;
  return item.enabled !== false
    && item.planAvailable !== false
    && item.tenantReady !== false
    && item.hasReadyModel !== false;
};

export const normalizeAiComposerCapabilities = (items: AiComposerCapability[]): AiComposerCapability[] => {
  const normalized = Array.from(new Set((items || []).filter(Boolean)));
  if (normalized.includes('free_chat')) return ['free_chat'];
  return normalized.includes('text_chat') ? ['text_chat'] : normalized;
};

const AiCapabilityComposerActions: React.FC<AiCapabilityComposerActionsProps> = ({
  selected,
  autoSuggested = [],
  onChange,
  capabilityAvailability,
  selectedAgents = [],
  onAgentsChange,
  agentAccessMap = null,
  toneStyle = 'friendly_warm',
  onToneStyleChange,
  showAgentPicker = true,
  disabled = false,
  loading = false,
  size,
  compact: _compact = false,
  moduleId,
  recordId,
  onVoiceSend,
  onMoveTranscriptToComposer,
  onFilePrepared,
  onFilesPrepared,
  voiceLoading = false,
  fileLoading = false,
  directFileUpload = false,
  allowMultipleFiles = false,
  recordCreationModuleOptions = [],
  recordCreationTargetModuleId,
  onRecordCreationTargetModuleChange,
  mediaSettings = {},
  onMediaSettingsChange,
  mediaModelId,
  onApplyPrompt,
  promptRecord = null,
}) => {
  const [open, setOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const autoMode = selectedSet.size === 0;
  const autoSuggestedSet = useMemo(() => new Set(autoSuggested), [autoSuggested]);
  const actionSize = size || 'small';
  const iconActionClass = 'ai-composer-icon';
  const effectiveSelected = autoMode && autoSuggested.length > 0 ? autoSuggested : selected;
  const effectiveSelectedSet = useMemo(() => new Set(effectiveSelected), [effectiveSelected]);
  const isFreeChatMode = effectiveSelectedSet.has('free_chat');
  const normalizedSelectedAgents = useMemo(() => normalizeSelectedAgents(selectedAgents), [selectedAgents]);
  const selectedAgentSet = useMemo(() => new Set(normalizedSelectedAgents), [normalizedSelectedAgents]);
  const visibleAgents = useMemo(() => {
    const hasAccessMap = Boolean(agentAccessMap && typeof agentAccessMap === 'object');
    return AI_AGENT_CATALOG.filter((agent) => {
      const access = agentAccessMap?.[agent.key];
      if (!access) return !hasAccessMap;
      return (access.canView ?? access.canUse) !== false && (access.canChat ?? access.canUse) !== false;
    });
  }, [agentAccessMap]);
  const agentPickerEnabled = Boolean(onAgentsChange) && showAgentPicker !== false && !isFreeChatMode && visibleAgents.length > 0;
  // Only one media-generation capability is active at a time.
  const activeMediaCapability = selectedSet.has('image_generation')
    ? 'image_generation' as const
    : selectedSet.has('video_generation')
      ? 'video_generation' as const
      : selectedSet.has('document_generation')
        ? 'document_generation' as const
        : selectedSet.has('voice_output')
          ? 'voice_output' as const
          : null;

  useEffect(() => {
    if (!agentAccessMap || !onAgentsChange || normalizedSelectedAgents.length === 0) return;
    const allowedSet = new Set(visibleAgents.map((item) => item.key));
    const filtered = normalizedSelectedAgents.filter((key) => allowedSet.has(key));
    if (filtered.length !== normalizedSelectedAgents.length) {
      onAgentsChange(filtered);
    }
  }, [agentAccessMap, normalizedSelectedAgents, onAgentsChange, visibleAgents]);

  useEffect(() => {
    if (disabled || loading) {
      setOpen(false);
      setAgentsOpen(false);
    }
  }, [disabled, loading]);

  useEffect(() => () => {
    scheduleOverlayLockRelease(0);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) scheduleOverlayLockRelease();
  };

  const handleAgentsOpenChange = (nextOpen: boolean) => {
    setAgentsOpen(nextOpen);
    if (!nextOpen) scheduleOverlayLockRelease();
  };

  const toggleAgent = (agentKey: AgentKey, checked: boolean) => {
    if (!onAgentsChange) return;
    if (checked) {
      onAgentsChange(normalizeSelectedAgents([...normalizedSelectedAgents, agentKey]));
      return;
    }
    onAgentsChange(normalizedSelectedAgents.filter((item) => item !== agentKey));
  };

  const setCapability = (key: AiComposerCapability, checked: boolean) => {
    const base = autoMode && autoSuggested.length > 0 ? autoSuggested : selected;
    const isExclusiveChatMode = key === 'text_chat' || key === 'free_chat';
    let next = isExclusiveChatMode && checked
      ? [key] as AiComposerCapability[]
      : checked
      ? normalizeAiComposerCapabilities([...base.filter((item) => item !== 'text_chat' && item !== 'free_chat'), key])
      : base.filter((item) => item !== key);
    if (key === 'legal_assistant' && checked) {
      next = normalizeAiComposerCapabilities([...next, 'web_search', 'deep_reasoning']);
    }
    if (key === 'record_creation' && !checked) {
      onRecordCreationTargetModuleChange?.(null);
    }
    onChange(next);
  };

  const content = (
    <div className="w-full space-y-2.5 md:w-[min(92vw,660px)]" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2 dark:border-white/10">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-teal-800 dark:text-teal-200">
            <ThunderboltOutlined />
            <span>مهارت‌ها و ابزارهای اجرایی (چه کاری انجام شود؟)</span>
          </div>
          <div className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
            ابزار یا نوع خروجی همین پیام را مشخص کنید (مثل تنظیم قیمت، تحلیل سند یا ساخت تصویر) — با ایجنت انتخابی ترکیب می‌شود.
          </div>
        </div>
        {selected.length > 0 ? (
          <Button
            type="link"
            size="small"
            className="!h-auto !shrink-0 !p-0 !text-[11px]"
            onClick={() => {
              onRecordCreationTargetModuleChange?.(null);
              onChange([]);
            }}
          >
            پاک کردن (تشخیص خودکار)
          </Button>
        ) : (
          <span className="shrink-0 rounded-md bg-teal-50 px-2 py-0.5 text-[10.5px] font-medium text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
            حالت خودکار فعال است
          </span>
        )}
      </div>

      <div className="grid max-h-[60vh] grid-cols-1 gap-1.5 overflow-y-auto pb-0.5 md:grid-cols-2">
        {CAPABILITY_META.map((item) => {
          const usable = isCapabilityUsable(capabilityAvailability, item.key);
          const checked = effectiveSelectedSet.has(item.key);
          const autoChecked = autoMode && autoSuggestedSet.has(item.key);
          return (
            <label
              key={item.key}
              title={item.description}
              className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2 text-right transition ${
                checked
                  ? 'border-teal-300 bg-teal-50/75 dark:border-teal-500/40 dark:bg-teal-500/15'
                  : 'border-slate-200/80 bg-white hover:border-teal-200 dark:border-white/10 dark:bg-white/[0.02]'
              } ${!usable ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <Checkbox
                checked={checked}
                disabled={!usable || disabled || loading}
                onChange={(event) => setCapability(item.key, event.target.checked)}
              />
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-sm ${
                checked
                  ? 'bg-teal-100/90 text-teal-700 dark:bg-teal-500/20 dark:text-teal-200'
                  : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'
              }`}>
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                  <span>{item.label}</span>
                  {autoChecked ? <Tag color="processing" className="m-0 text-[10px]">تشخیص خودکار</Tag> : null}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{item.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );

  const agentsContent = (
    <div className="w-full space-y-2.5 md:w-[min(92vw,640px)]" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2 dark:border-white/10">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-800 dark:text-indigo-200">
            <RobotOutlined />
            <span>ایجنت‌های تخصصی (چه کسی پاسخ دهد؟)</span>
          </div>
          <div className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
            هر ایجنت نقش یک همکار تخصصی (فروش، خرید، اینستاگرام، راهنما...) با قوانین و دسترسی همان بخش است.
          </div>
        </div>
        {normalizedSelectedAgents.length > 0 ? (
          <Button
            type="link"
            size="small"
            className="!h-auto !shrink-0 !p-0 !text-[11px]"
            onClick={() => onAgentsChange?.([])}
          >
            پاک کردن (انتخاب خودکار راهبر)
          </Button>
        ) : (
          <span className="shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-[10.5px] font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
            پیش‌فرض: انتخاب هوشمند راهبر
          </span>
        )}
      </div>
      <div className="grid max-h-[58vh] grid-cols-1 gap-1.5 overflow-y-auto pb-0.5 sm:grid-cols-2">
        {visibleAgents.map((agent) => {
          const checked = selectedAgentSet.has(agent.key);
          return (
            <div
              key={agent.key}
              role="button"
              tabIndex={disabled || loading ? -1 : 0}
              onClick={() => {
                if (disabled || loading) return;
                toggleAgent(agent.key, !checked);
              }}
              onKeyDown={(event) => {
                if ((event.key !== 'Enter' && event.key !== ' ') || disabled || loading) return;
                event.preventDefault();
                toggleAgent(agent.key, !checked);
              }}
              className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2 text-right transition ${
                checked
                  ? 'border-indigo-300 bg-indigo-50/75 dark:border-indigo-400/40 dark:bg-indigo-500/15'
                  : 'border-slate-200/80 bg-white hover:border-indigo-200 dark:border-white/10 dark:bg-white/[0.02]'
              } ${disabled || loading ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <Checkbox
                checked={checked}
                disabled={disabled || loading}
                onChange={(event) => {
                  event.stopPropagation();
                  toggleAgent(agent.key, event.target.checked);
                }}
              />
              <AiAgentAvatar
                agentKey={agent.key}
                color={agent.badgeColor}
                size={30}
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{agent.titleFa}</div>
                <div className="line-clamp-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{agent.subtitleFa}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const hasDualCapsules = Boolean(onAgentsChange) && showAgentPicker !== false && !isFreeChatMode;

  const activeOperatorMetas = useMemo(() => {
    return effectiveSelected
      .map((key) => CAPABILITY_META.find((item) => item.key === key))
      .filter((meta): meta is (typeof CAPABILITY_META)[number] => Boolean(meta));
  }, [effectiveSelected]);

  const legacyTriggerButton = (
    <div className={`ai-composer-operator-pill ${!autoMode ? 'is-custom' : 'is-auto'}`}>
      <Tooltip title={autoMode ? 'ایجنت راهبر؛ انتخاب خودکار ایجنت فعال است' : 'انتخاب ایجنت هوش مصنوعی'}>
        <Button
          type="text"
          disabled={disabled || loading}
          size={actionSize}
          className="ai-composer-operator-trigger"
          onClick={() => handleOpenChange(true)}
          aria-label="انتخاب ایجنت هوش مصنوعی"
          aria-expanded={open}
        >
          <span className="ai-composer-operator-icon">
            <PlusOutlined />
          </span>
          <span className="ai-composer-operator-label">
            {autoMode ? (
              autoSuggested.length > 0 ? (
                <>
                  <span className="ai-composer-operator-auto-text">ایجنت راهبر</span>
                  {activeOperatorMetas.map((meta) => (
                    <span key={meta.key} className="ai-composer-operator-chip">
                      {`تشخیص: ${meta.label}`}
                    </span>
                  ))}
                </>
              ) : (
                <span className="ai-composer-operator-auto-text">ایجنت راهبر</span>
              )
            ) : (
              activeOperatorMetas.map((meta) => (
                <span key={meta.key} className="ai-composer-operator-chip">
                  <span>{meta.label}</span>
                </span>
              ))
            )}
          </span>
        </Button>
      </Tooltip>
      {!autoMode && (
        <Tooltip title="بازگشت به حالت خودکار">
          <Button
            type="text"
            size="small"
            className="ai-composer-operator-reset"
            aria-label="بازگشت به حالت خودکار"
            icon={<CloseOutlined />}
            onClick={(event) => {
              event.stopPropagation();
              onChange([]);
            }}
          />
        </Tooltip>
      )}
    </div>
  );

  const skillTriggerButton = (
    <Tooltip title={open ? undefined : 'انتخاب مهارت‌ها و ابزارهای اجرایی برای همین پیام (مانند تنظیم قیمت، تحلیل سند یا ساخت تصویر)'}>
      <Button
        icon={<ThunderboltOutlined />}
        disabled={disabled || loading}
        size={actionSize}
        className="!inline-flex !h-6 !items-center !gap-1 !rounded-lg !border-teal-200/90 !bg-white !px-2 !text-[11px] !font-bold !text-teal-700 !shadow-sm hover:!border-teal-400 hover:!text-teal-800 dark:!border-teal-400/30 dark:!bg-slate-900/90 dark:!text-teal-200"
        onClick={isMobile ? () => handleOpenChange(true) : undefined}
        aria-label="انتخاب عملکرد هوش مصنوعی"
      >
        <span>مهارت‌ها</span>
        {selected.length > 0 ? (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-600 px-1 text-[10px] font-bold text-white">
            {toPersianNumber(selected.length)}
          </span>
        ) : null}
      </Button>
    </Tooltip>
  );

  const agentTriggerButton = (
    <Tooltip title={agentsOpen ? undefined : 'انتخاب همکار هوشمند (چه ایجنتی مسئول پاسخ و اجرای همین درخواست باشد؟)'}>
      <Button
        icon={<RobotOutlined />}
        disabled={disabled || loading}
        size={actionSize}
        onClick={isMobile ? () => handleAgentsOpenChange(true) : undefined}
        className="!inline-flex !h-6 !items-center !gap-1 !rounded-lg !border-indigo-200/90 !bg-white !px-2 !text-[11px] !font-bold !text-indigo-700 !shadow-sm hover:!border-indigo-400 hover:!text-indigo-800 dark:!border-indigo-400/30 dark:!bg-slate-900/90 dark:!text-indigo-200"
        aria-label="انتخاب ایجنت‌های تخصصی"
      >
        <span>ایجنت‌ها</span>
        {normalizedSelectedAgents.length > 0 ? (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
            {toPersianNumber(normalizedSelectedAgents.length)}
          </span>
        ) : null}
      </Button>
    </Tooltip>
  );

  const activeSkillEntries = effectiveSelected
    .map((key) => CAPABILITY_META.find((item) => item.key === key))
    .filter((item): item is (typeof CAPABILITY_META)[number] => Boolean(item));

  return (
    <div className="ai-composer-actions flex flex-wrap items-center gap-1.5" dir="rtl">
      {hasDualCapsules ? (
        <>
          {agentPickerEnabled ? (
            <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-indigo-200/80 bg-indigo-50/50 px-1.5 py-0.5 dark:border-indigo-400/20 dark:bg-indigo-500/[0.08]">
              {isMobile ? (
                <>
                  {agentTriggerButton}
                  <Drawer
                    title="ایجنت‌های تخصصی (چه کسی؟)"
                    open={agentsOpen}
                    onClose={() => handleAgentsOpenChange(false)}
                    placement="bottom"
                    height="min(82vh, 620px)"
                    classNames={{ body: '!p-3' }}
                    destroyOnHidden
                    getContainer={typeof document === 'undefined' ? undefined : () => document.body}
                    afterOpenChange={(nextOpen) => {
                      if (!nextOpen) scheduleOverlayLockRelease();
                    }}
                  >
                    {agentsContent}
                  </Drawer>
                </>
              ) : (
                <Popover
                  open={agentsOpen}
                  onOpenChange={handleAgentsOpenChange}
                  placement="top"
                  trigger="click"
                  content={agentsContent}
                  getPopupContainer={() => document.body}
                  destroyOnHidden
                  autoAdjustOverflow
                  overlayStyle={{ maxWidth: 'calc(100vw - 24px)' }}
                >
                  {agentTriggerButton}
                </Popover>
              )}

              {normalizedSelectedAgents.map((agentKey) => {
                const def = getAgentDefinition(agentKey);
                if (!def) return null;
                return (
                  <span
                    key={`agent-${agentKey}`}
                    className="inline-flex h-6 items-center gap-1 rounded-lg border border-indigo-200/80 bg-white px-2 text-[11px] font-semibold text-slate-700 shadow-sm dark:border-indigo-400/25 dark:bg-slate-900/90 dark:text-slate-100"
                  >
                    <AiAgentIcon agentKey={agentKey} size={13} color={def.badgeColor} />
                    <span>{def.shortTitleFa}</span>
                    <button
                      type="button"
                      disabled={disabled || loading}
                      onClick={() => toggleAgent(agentKey, false)}
                      aria-label={`حذف ایجنت ${def.shortTitleFa}`}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-xs leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-slate-200"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          ) : null}

          <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-dashed border-teal-300/85 bg-teal-50/40 px-1.5 py-0.5 dark:border-teal-400/25 dark:bg-teal-500/[0.06]">
            {isMobile ? (
              <>
                {skillTriggerButton}
                <Drawer
                  title="مهارت‌ها و ابزارها (چه کاری؟)"
                  open={open}
                  onClose={() => handleOpenChange(false)}
                  placement="bottom"
                  height="min(82vh, 620px)"
                  classNames={{ body: '!p-3' }}
                  destroyOnHidden
                  getContainer={typeof document === 'undefined' ? undefined : () => document.body}
                  afterOpenChange={(nextOpen) => {
                    if (!nextOpen) scheduleOverlayLockRelease();
                  }}
                >
                  {content}
                </Drawer>
              </>
            ) : (
              <Popover
                open={open}
                onOpenChange={handleOpenChange}
                placement="top"
                trigger="click"
                content={content}
                getPopupContainer={() => document.body}
                destroyOnHidden
                autoAdjustOverflow
                overlayStyle={{ maxWidth: 'calc(100vw - 24px)' }}
              >
                {skillTriggerButton}
              </Popover>
            )}

            {activeSkillEntries.map((meta) => (
              <span
                key={meta.key}
                className={`inline-flex h-6 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold shadow-sm ${
                  autoMode
                    ? 'border-sky-200/90 bg-sky-50/90 text-sky-800 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-200'
                    : 'border-teal-200/85 bg-white text-teal-900 dark:border-teal-400/25 dark:bg-slate-900/90 dark:text-teal-100'
                }`}
              >
                <span className="text-[11px] text-teal-600 dark:text-teal-300">{meta.icon}</span>
                <span>{autoMode ? `تشخیص: ${meta.label}` : meta.label}</span>
                {!autoMode ? (
                  <button
                    type="button"
                    disabled={disabled || loading}
                    onClick={() => setCapability(meta.key, false)}
                    aria-label={`حذف مهارت ${meta.label}`}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-xs leading-none text-slate-400 transition hover:bg-teal-50 hover:text-teal-800 disabled:opacity-40 dark:hover:bg-white/10"
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}

            {selectedSet.has('record_creation') && onRecordCreationTargetModuleChange ? (
              <Select
                allowClear
                showSearch
                className="min-w-[185px]"
                size={actionSize}
                value={recordCreationTargetModuleId || undefined}
                options={recordCreationModuleOptions}
                optionFilterProp="label"
                placeholder="نوع رکورد برای ایجاد/ویرایش"
                aria-label="نوع رکورد برای ایجاد یا ویرایش"
                disabled={disabled || loading}
                onChange={(value) => onRecordCreationTargetModuleChange(value ? String(value) : null)}
              />
            ) : null}
          </div>
        </>
      ) : (
        <>
          {isMobile ? (
            <>
              {legacyTriggerButton}
              <Drawer
                title="ایجنت‌های هوش مصنوعی"
                open={open}
                onClose={() => handleOpenChange(false)}
                placement="bottom"
                height="min(82vh, 620px)"
                classNames={{ body: '!p-3' }}
                destroyOnHidden
                getContainer={typeof document === 'undefined' ? undefined : () => document.body}
                afterOpenChange={(nextOpen) => {
                  if (!nextOpen) scheduleOverlayLockRelease();
                }}
              >
                {content}
              </Drawer>
            </>
          ) : (
            <Popover
              open={open}
              onOpenChange={handleOpenChange}
              placement="top"
              trigger="click"
              content={content}
              getPopupContainer={() => document.body}
              destroyOnHidden
              autoAdjustOverflow
              overlayStyle={{ maxWidth: 'calc(100vw - 24px)' }}
            >
              {legacyTriggerButton}
            </Popover>
          )}
          {selectedSet.has('record_creation') && onRecordCreationTargetModuleChange ? (
            <Select
              allowClear
              showSearch
              className="min-w-[210px]"
              size={actionSize}
              value={recordCreationTargetModuleId || undefined}
              options={recordCreationModuleOptions}
              optionFilterProp="label"
              placeholder="نوع رکورد برای ایجاد/ویرایش"
              aria-label="نوع رکورد برای ایجاد یا ویرایش"
              disabled={disabled || loading}
              onChange={(value) => onRecordCreationTargetModuleChange(value ? String(value) : null)}
            />
          ) : null}
        </>
      )}

      {onToneStyleChange && !isFreeChatMode ? (
        <Tooltip title="لحن پاسخ ایجنت">
          <div className="inline-flex h-6 items-center gap-1 rounded-lg border border-slate-200/85 bg-slate-50/75 px-1.5 dark:border-white/10 dark:bg-white/[0.04]">
            <span className="text-[10.5px] font-medium text-slate-400">لحن:</span>
            <Select
              size={actionSize}
              variant="borderless"
              value={toneStyle || 'friendly_warm'}
              disabled={disabled || loading}
              popupMatchSelectWidth={false}
              className="min-w-[96px] !text-[11px]"
              aria-label="لحن پاسخ ایجنت"
              options={AGENT_TONE_STYLES.map((item) => ({
                value: item.value,
                label: item.labelFa,
              }))}
              onChange={(value) => onToneStyleChange(String(value || 'friendly_warm') as AgentToneStyle)}
            />
          </div>
        </Tooltip>
      ) : null}

      {activeMediaCapability && onMediaSettingsChange ? (
        <AiMediaSettingsPopover
          capability={activeMediaCapability}
          settings={mediaSettings}
          onSettingsChange={onMediaSettingsChange}
          disabled={disabled || loading}
          size={actionSize}
          iconOnly
          modelId={mediaModelId}
        />
      ) : null}

      {onApplyPrompt ? (
        <>
          <Tooltip title="پرامپت‌های آماده">
            <Button
              type="text"
              icon={<SnippetsOutlined />}
              size={actionSize}
              className={iconActionClass}
              disabled={disabled || loading}
              aria-label="پرامپت‌های آماده"
              onClick={() => setPromptModalOpen(true)}
            />
          </Tooltip>
          {promptModalOpen ? (
            <Suspense fallback={null}>
              <MessageComposerModal
                open
                mode="template"
                moduleId={moduleId}
                record={promptRecord}
                readyTextScope="ai"
                templateOnlyTitle="پرامپت‌های آماده هوش مصنوعی"
                onApplyTemplate={(content) => {
                  const text = String(content || '').trim();
                  if (text) onApplyPrompt(text);
                }}
                onCancel={() => setPromptModalOpen(false)}
              />
            </Suspense>
          ) : null}
        </>
      ) : null}

      {(selectedSet.has('voice_input') || autoMode) && isCapabilityUsable(capabilityAvailability, 'voice_input') ? (
        <AiVoiceRecorder buttonType="text" disabled={disabled} loading={voiceLoading} size={actionSize} className={iconActionClass} onSend={onVoiceSend} onMoveTranscriptToComposer={onMoveTranscriptToComposer} />
      ) : null}

      <AiFileUploadButton
        buttonType="text"
        disabled={disabled}
        loading={fileLoading}
        onPrepared={onFilePrepared}
        onPreparedMany={onFilesPrepared}
        directUpload={directFileUpload}
        multiple={allowMultipleFiles}
        moduleId={moduleId}
        recordId={recordId}
        size={actionSize}
        className={iconActionClass}
      />
    </div>
  );
};

export default AiCapabilityComposerActions;
