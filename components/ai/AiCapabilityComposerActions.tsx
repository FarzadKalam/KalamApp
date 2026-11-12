import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Drawer, Grid, Popover, Select, Tag, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import {
  AudioOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  PlusOutlined,
  CloseOutlined,
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

/** Compatibility alias for persisted composer preferences and existing callers. */
export type AiComposerCapability = AiComposerAgentId;

type CapabilityAvailability = Record<string, { enabled?: boolean; planAvailable?: boolean; tenantReady?: boolean; hasReadyModel?: boolean } | undefined>;

type AiCapabilityComposerActionsProps = {
  selected: AiComposerCapability[];
  autoSuggested?: AiComposerCapability[];
  onChange: (next: AiComposerCapability[]) => void;
  capabilityAvailability?: CapabilityAvailability;
  disabled?: boolean;
  loading?: boolean;
  size?: ButtonProps['size'];
  compact?: boolean;
  moduleId?: string | null;
  recordId?: string | null;
  onVoiceSend: (voice: RecordedVoice) => void | Promise<void>;
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
  disabled = false,
  loading = false,
  size,
  compact: _compact = false,
  moduleId,
  recordId,
  onVoiceSend,
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
    if (disabled || loading) setOpen(false);
  }, [disabled, loading]);

  useEffect(() => () => {
    scheduleOverlayLockRelease(0);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) scheduleOverlayLockRelease();
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
    <div className="w-full space-y-2 md:grid md:w-[min(92vw,640px)] md:grid-cols-2 md:gap-2 md:space-y-0" dir="rtl">
      {CAPABILITY_META.map((item) => {
        const usable = isCapabilityUsable(capabilityAvailability, item.key);
        const checked = effectiveSelectedSet.has(item.key);
        const autoChecked = autoMode && autoSuggestedSet.has(item.key);
        return (
          <label
            key={item.key}
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-right transition ${
              checked
                ? 'border-leather-300 bg-leather-50 dark:border-leather-700 dark:bg-leather-900/20'
                : 'border-gray-100 hover:border-gray-200 dark:border-white/10'
            } ${!usable ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <Checkbox
              checked={checked}
              disabled={!usable || disabled || loading}
              onChange={(event) => setCapability(item.key, event.target.checked)}
            />
            <span className="mt-0.5 text-base text-gray-500">{item.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-sm font-semibold text-gray-800 dark:text-gray-100">
                <span>{item.label}</span>
                {autoChecked ? <Tag color="processing" className="m-0 text-[10px]">تشخیص خودکار</Tag> : null}
              </span>
              <span className="block text-xs leading-5 text-gray-500">{item.description}</span>
            </span>
          </label>
        );
      })}
    </div>
  );

  const activeOperatorMetas = useMemo(() => {
    return effectiveSelected
      .map((key) => CAPABILITY_META.find((item) => item.key === key))
      .filter((meta): meta is (typeof CAPABILITY_META)[number] => Boolean(meta));
  }, [effectiveSelected]);

  const triggerButton = (
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

  return (
    <div className="ai-composer-actions" dir="rtl">
      {isMobile ? (
        <>
          {triggerButton}
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
          {triggerButton}
        </Popover>
      )}

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
              aria-label="پرامپت‌های آماده"
              size={actionSize}
              className={iconActionClass}
              disabled={disabled || loading}
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
        <AiVoiceRecorder buttonType="text" disabled={disabled} loading={voiceLoading} size={actionSize} className={iconActionClass} onSend={onVoiceSend} />
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

    </div>
  );
};

export default AiCapabilityComposerActions;
