import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Tag, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import {
  AudioOutlined,
  FileSearchOutlined,
  GlobalOutlined,
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
import AdaptivePickerSurface from '../AdaptivePickerSurface';
import AiFileUploadButton, { type AiUploadedFilePrompt } from './AiFileUploadButton';
const MessageComposerModal = lazy(() => import('../MessageComposerModal'));
import AiVoiceRecorder, { type RecordedVoice } from './AiVoiceRecorder';
import AiMediaSettingsPopover, { type AiMediaSettings } from './AiMediaSettingsPopover';
import { getAiAgent, getAiAgentLabel, type AiComposerAgentId } from '../../supabase/functions/_shared/ai-agents';
import { scheduleOverlayLockRelease } from '../../utils/overlayLocks';
import {
  AI_AGENT_CATALOG,
  getAgentDefinition,
  normalizeSelectedAgents,
  type AgentKey,
  type ClientAgentAccessEvaluation,
} from '../../utils/aiAgentCatalog';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { AiAgentAvatar, AiAgentCameoFigure } from './AiAgentIcon';

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
  { key: 'document_analysis', label: getAiAgentLabel('document_analysis'), description: getAiAgent('document_analysis').description, icon: <FileSearchOutlined />, kind: 'inline' },
  { key: 'voice_input', label: getAiAgentLabel('voice_input'), description: getAiAgent('voice_input').description, icon: <AudioOutlined />, kind: 'inline' },
  { key: 'voice_output', label: getAiAgentLabel('voice_output'), description: getAiAgent('voice_output').description, icon: <SoundOutlined />, kind: 'toggle' },
  { key: 'image_generation', label: getAiAgentLabel('image_generation'), description: getAiAgent('image_generation').description, icon: <PictureOutlined />, kind: 'toggle' },
  { key: 'video_generation', label: getAiAgentLabel('video_generation'), description: getAiAgent('video_generation').description, icon: <VideoCameraOutlined />, kind: 'toggle' },
  { key: 'document_generation', label: getAiAgentLabel('document_generation'), description: getAiAgent('document_generation').description, icon: <FileWordOutlined />, kind: 'toggle' },
  { key: 'web_search', label: getAiAgentLabel('web_search'), description: getAiAgent('web_search').description, icon: <GlobalOutlined />, kind: 'toggle' },
  { key: 'legal_assistant', label: getAiAgentLabel('legal_assistant'), description: getAiAgent('legal_assistant').description, icon: <SafetyCertificateOutlined />, kind: 'toggle' },
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
  const agentPickerEnabled = Boolean(onAgentsChange) && showAgentPicker !== false;
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
      if (isFreeChatMode || selectedSet.has('text_chat')) onChange([]);
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
      next = normalizeAiComposerCapabilities([...next, 'web_search']);
    }
    if (key === 'record_creation' && !checked) {
      onRecordCreationTargetModuleChange?.(null);
    }
    onChange(next);
  };

  const content = (
    <div className="w-full space-y-2.5 " dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2 dark:border-white/10">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-teal-800 dark:text-teal-200">
            <ThunderboltOutlined />
            <span>مهارت‌ها و ابزارهای اجرایی (چه کاری انجام شود؟)</span>
          </div>
          <div className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
            نوع خروجی یا ابزار موردنیاز را انتخاب کنید. ثبت اطلاعات، فرآیند و کار زمان‌دار را مستقیماً از ایجنت بخواهید؛ میزان تفکر در منوی مدل تنظیم می‌شود.
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
    <div className="w-full space-y-2.5 " dir="rtl">
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
        {normalizedSelectedAgents.length > 0 || isFreeChatMode ? (
          <Button
            type="link"
            size="small"
            className="!h-auto !shrink-0 !p-0 !text-[11px]"
            onClick={() => { if(isFreeChatMode) onChange([]); onAgentsChange?.([]); }}
          >
            بازگشت به راهبر
          </Button>
        ) : (
          <span className="shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-[10.5px] font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
            پیش‌فرض: انتخاب هوشمند راهبر
          </span>
        )}
      </div>
      <button type="button" aria-pressed={isFreeChatMode} disabled={disabled || loading}
        onClick={() => { onChange(['free_chat']);onAgentsChange?.([]); }}
        className={`flex w-full items-center gap-2 rounded-xl border p-3 text-right ${isFreeChatMode ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/15' : 'border-slate-200 dark:border-white/10'}`}>
        <MessageOutlined /><span><span className="block text-xs font-bold">بدون ایجنت</span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">گفتگوی آزاد و متنی، بدون اطلاعات سازمان؛ در گفتگویی جدا ادامه می‌یابد.</span></span>
      </button>
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

  const portraitAgents = normalizedSelectedAgents.length ? normalizedSelectedAgents : ['lead_orchestrator'] as AgentKey[];
  return (
    <div className="ai-composer-actions flex flex-wrap items-center gap-1.5" dir="rtl">
      {agentPickerEnabled ? <>
        <Tooltip title={isFreeChatMode ? 'بدون ایجنت؛ گفتگوی آزاد' : portraitAgents.map(key => getAgentDefinition(key)?.titleFa).join('، ')}>
          <Button type="text" disabled={disabled || loading} size={actionSize} className="ai-composer-icon ai-composer-agent-trigger"
            aria-label="انتخاب ایجنت‌های تخصصی" aria-expanded={agentsOpen} onClick={() => handleAgentsOpenChange(true)}>
            {isFreeChatMode ? <MessageOutlined /> : <span className="ai-composer-agent-portraits">
              {portraitAgents.slice(0,3).map(key => <span key={key} data-agent-key={key}><AiAgentCameoFigure agentKey={key} size={28} /></span>)}
              {portraitAgents.length>3 ? <span className="ai-composer-agent-more">{toPersianNumber(portraitAgents.length)}</span> : null}
            </span>}
          </Button>
        </Tooltip>
        <AdaptivePickerSurface open={agentsOpen} title="انتخاب ایجنت" closeLabel="بستن" onClose={() => handleAgentsOpenChange(false)}>
          {agentsContent}
        </AdaptivePickerSurface>
      </> : null}
      <Tooltip title="مهارت‌ها و ابزارها">
        <Button type="text" disabled={disabled || loading || isFreeChatMode} size={actionSize} icon={<ThunderboltOutlined />}
          className="ai-composer-icon ai-composer-skill-trigger" aria-label="انتخاب عملکرد هوش مصنوعی" aria-expanded={open} onClick={() => handleOpenChange(true)} />
      </Tooltip>
      <AdaptivePickerSurface open={open} title="مهارت‌ها و ابزارها" closeLabel="بستن" onClose={() => handleOpenChange(false)}>
        {content}
      </AdaptivePickerSurface>

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
