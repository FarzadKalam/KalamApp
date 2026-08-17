import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Drawer, Grid, Popover, Select, Space, Tag, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import {
  AudioOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  PlusOutlined,
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
import { scheduleOverlayLockRelease } from '../../utils/overlayLocks';

export type AiComposerCapability =
  | 'text_chat'
  | 'document_analysis'
  | 'voice_input'
  | 'voice_output'
  | 'image_generation'
  | 'video_generation'
  | 'document_generation'
  | 'web_search'
  | 'deep_reasoning'
  | 'legal_assistant'
  | 'record_creation'
  | 'process_operation';

type CapabilityAvailability = Record<string, { enabled?: boolean; planAvailable?: boolean; tenantReady?: boolean; hasReadyModel?: boolean } | undefined>;

type AiCapabilityComposerActionsProps = {
  selected: AiComposerCapability[];
  autoSuggested?: AiComposerCapability[];
  onChange: (next: AiComposerCapability[]) => void;
  capabilityAvailability?: CapabilityAvailability;
  disabled?: boolean;
  loading?: boolean;
  size?: ButtonProps['size'];
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
  { key: 'text_chat', label: 'گفتگوی آزاد', description: 'گفتگوی خام با هوش مصنوعی بدون استفاده از دانش سازمان', icon: <MessageOutlined />, kind: 'toggle' },
  { key: 'document_analysis', label: 'تحلیل اسناد', description: 'تحلیل فایل، رسید، عکس یا سند', icon: <FileSearchOutlined />, kind: 'inline' },
  { key: 'voice_input', label: 'تحلیل صدا', description: 'ضبط و تبدیل فایل صوتی به متن', icon: <AudioOutlined />, kind: 'inline' },
  { key: 'voice_output', label: 'تولید صدا', description: 'تبدیل متن به فایل صوتی', icon: <SoundOutlined />, kind: 'toggle' },
  { key: 'image_generation', label: 'ساخت تصویر', description: 'ارسال متن برای تولید تصویر', icon: <PictureOutlined />, kind: 'toggle' },
  { key: 'video_generation', label: 'ساخت ویدیو', description: 'تولید ویدیو از متن یا تصویر', icon: <VideoCameraOutlined />, kind: 'toggle' },
  { key: 'document_generation', label: 'ساخت فایل', description: 'ساخت فایل Word، Excel، PDF یا CSV', icon: <FileWordOutlined />, kind: 'toggle' },
  { key: 'web_search', label: 'جستجوی گوگل', description: 'استفاده از اطلاعات بروز وب', icon: <GlobalOutlined />, kind: 'toggle' },
  { key: 'deep_reasoning', label: 'تفکر عمیق', description: 'استفاده از مدل reasoning سازمان', icon: <ThunderboltOutlined />, kind: 'toggle' },
  { key: 'legal_assistant', label: 'دستیار حقوقی', description: 'پاسخ حقوقی با تکیه بر اسناد و وب', icon: <SafetyCertificateOutlined />, kind: 'toggle' },
  { key: 'record_creation', label: 'ایجاد/ویرایش رکورد', description: 'پیشنهاد ایجاد یا ویرایش فاکتور، هزینه، مشتری، محصول و...', icon: <PlusOutlined />, kind: 'toggle' },
  { key: 'process_operation', label: 'اقدام فرآیندی', description: 'پیشنهاد اجرای فرآیند یا تغییر مرحله', icon: <ThunderboltOutlined />, kind: 'toggle' },
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
  const iconActionClass = '!flex !h-7 !w-7 !items-center !justify-center !rounded-lg !p-0';
  const capabilityTagClass = 'm-0 !inline-flex !h-7 !items-center !rounded-md !px-2 !text-[11px]';
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
    let next = key === 'text_chat' && checked
      ? ['text_chat'] as AiComposerCapability[]
      : checked
      ? normalizeAiComposerCapabilities([...base.filter((item) => item !== 'text_chat'), key])
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

  const triggerButton = (
    <Tooltip title="انتخاب عملکرد هوش مصنوعی">
      <Button icon={<PlusOutlined />} disabled={disabled || loading} size={actionSize} className={iconActionClass} onClick={() => handleOpenChange(true)} aria-label="انتخاب عملکرد هوش مصنوعی" />
    </Tooltip>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5" dir="rtl">
      {isMobile ? (
        <>
          {triggerButton}
          <Drawer
            title="عملکردهای هوش مصنوعی"
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

      <Space size={[4, 4]} wrap>
        {autoMode ? (
          <Tag className={capabilityTagClass}>تصمیم‌گیری خودکار</Tag>
        ) : null}
        {effectiveSelected
          .filter((key) => CAPABILITY_META.some((item) => item.key === key))
          .map((key) => {
            const meta = CAPABILITY_META.find((item) => item.key === key);
            if (!meta) return null;
            return (
              <Tag
                key={key}
                color={autoMode ? 'processing' : undefined}
                closable={!autoMode}
                onClose={(event) => {
                  event.preventDefault();
                  setCapability(key, false);
                }}
                className={capabilityTagClass}
              >
                {autoMode ? `تشخیص: ${meta.label}` : meta.label}
              </Tag>
            );
          })}
      </Space>

      {activeMediaCapability && onMediaSettingsChange ? (
        <AiMediaSettingsPopover
          capability={activeMediaCapability}
          settings={mediaSettings}
          onSettingsChange={onMediaSettingsChange}
          disabled={disabled || loading}
          size={actionSize}
          modelId={mediaModelId}
        />
      ) : null}

      {onApplyPrompt ? (
        <>
          <Tooltip title="پرامپت‌های آماده">
            <Button
              icon={<SnippetsOutlined />}
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
        <AiVoiceRecorder disabled={disabled} loading={voiceLoading} size={actionSize} className={iconActionClass} onSend={onVoiceSend} />
      ) : null}

      <AiFileUploadButton
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
          disabled={disabled || loading}
          onChange={(value) => onRecordCreationTargetModuleChange(value ? String(value) : null)}
        />
      ) : null}

    </div>
  );
};

export default AiCapabilityComposerActions;
