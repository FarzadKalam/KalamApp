import React, { useMemo, useState } from 'react';
import { Button, Checkbox, Popover, Select, Space, Tag, Tooltip } from 'antd';
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
} from '@ant-design/icons';
import AiFileUploadButton, { type AiUploadedFilePrompt } from './AiFileUploadButton';
import AiVoiceRecorder, { type RecordedVoice } from './AiVoiceRecorder';

export type AiComposerCapability =
  | 'document_analysis'
  | 'voice_input'
  | 'voice_output'
  | 'image_generation'
  | 'web_search'
  | 'deep_reasoning'
  | 'legal_assistant'
  | 'record_creation'
  | 'process_operation';

type CapabilityAvailability = Record<string, { enabled?: boolean; planAvailable?: boolean; tenantReady?: boolean; hasReadyModel?: boolean } | undefined>;

type AiCapabilityComposerActionsProps = {
  selected: AiComposerCapability[];
  onChange: (next: AiComposerCapability[]) => void;
  capabilityAvailability?: CapabilityAvailability;
  disabled?: boolean;
  loading?: boolean;
  size?: ButtonProps['size'];
  moduleId?: string | null;
  recordId?: string | null;
  onVoiceSend: (voice: RecordedVoice) => void | Promise<void>;
  onFilePrepared: (filePrompt: AiUploadedFilePrompt) => void | Promise<void>;
  voiceLoading?: boolean;
  fileLoading?: boolean;
  recordCreationModuleOptions?: Array<{ label: string; value: string }>;
  recordCreationTargetModuleId?: string | null;
  onRecordCreationTargetModuleChange?: (moduleId: string | null) => void;
};

const CAPABILITY_META: Array<{
  key: AiComposerCapability;
  label: string;
  description: string;
  icon: React.ReactNode;
  kind: 'toggle' | 'inline';
}> = [
  { key: 'document_analysis', label: 'تحلیل اسناد', description: 'تحلیل فایل، رسید، عکس یا سند', icon: <FileSearchOutlined />, kind: 'inline' },
  { key: 'voice_input', label: 'تحلیل صدا', description: 'ضبط و تبدیل ویس به متن', icon: <AudioOutlined />, kind: 'inline' },
  { key: 'voice_output', label: 'تولید صدا', description: 'تبدیل متن به فایل صوتی', icon: <SoundOutlined />, kind: 'toggle' },
  { key: 'image_generation', label: 'ساخت تصویر', description: 'ارسال متن برای تولید تصویر', icon: <PictureOutlined />, kind: 'toggle' },
  { key: 'web_search', label: 'جستجوی گوگل', description: 'استفاده از اطلاعات بروز وب', icon: <GlobalOutlined />, kind: 'toggle' },
  { key: 'deep_reasoning', label: 'تفکر عمیق', description: 'استفاده از مدل reasoning سازمان', icon: <ThunderboltOutlined />, kind: 'toggle' },
  { key: 'legal_assistant', label: 'دستیار حقوقی', description: 'پاسخ حقوقی با تکیه بر اسناد و وب', icon: <SafetyCertificateOutlined />, kind: 'toggle' },
  { key: 'record_creation', label: 'ساخت رکورد', description: 'پیشنهاد ساخت فاکتور، مشتری، محصول و...', icon: <PlusOutlined />, kind: 'toggle' },
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

const normalizeSelected = (items: AiComposerCapability[]) => Array.from(new Set(items));

const AiCapabilityComposerActions: React.FC<AiCapabilityComposerActionsProps> = ({
  selected,
  onChange,
  capabilityAvailability,
  disabled = false,
  loading = false,
  size,
  moduleId,
  recordId,
  onVoiceSend,
  onFilePrepared,
  voiceLoading = false,
  fileLoading = false,
  recordCreationModuleOptions = [],
  recordCreationTargetModuleId,
  onRecordCreationTargetModuleChange,
}) => {
  const [open, setOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const setCapability = (key: AiComposerCapability, checked: boolean) => {
    let next = checked
      ? normalizeSelected([...selected, key])
      : selected.filter((item) => item !== key);
    if (key === 'legal_assistant' && checked) {
      next = normalizeSelected([...next, 'web_search', 'deep_reasoning']);
    }
    if (key === 'record_creation' && checked) {
      next = next.filter((item) => item !== 'process_operation');
    }
    if (key === 'process_operation' && checked) {
      next = next.filter((item) => item !== 'record_creation');
      onRecordCreationTargetModuleChange?.(null);
    }
    if (key === 'record_creation' && !checked) {
      onRecordCreationTargetModuleChange?.(null);
    }
    onChange(next);
  };

  const content = (
    <div className="w-72 space-y-2" dir="rtl">
      {CAPABILITY_META.map((item) => {
        const usable = isCapabilityUsable(capabilityAvailability, item.key);
        const checked = selectedSet.has(item.key);
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
              <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">{item.label}</span>
              <span className="block text-xs leading-5 text-gray-500">{item.description}</span>
            </span>
          </label>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover
        open={open}
        onOpenChange={setOpen}
        placement="topRight"
        trigger="click"
        content={content}
      >
        <Tooltip title="انتخاب عملکرد هوش مصنوعی">
          <Button icon={<PlusOutlined />} disabled={disabled || loading} size={size} />
        </Tooltip>
      </Popover>

      <Space size={[4, 4]} wrap>
        {selected
          .filter((key) => CAPABILITY_META.some((item) => item.key === key))
          .map((key) => {
            const meta = CAPABILITY_META.find((item) => item.key === key);
            if (!meta) return null;
            return (
              <Tag
                key={key}
                closable
                onClose={(event) => {
                  event.preventDefault();
                  setCapability(key, false);
                }}
                className="m-0"
              >
                {meta.label}
              </Tag>
            );
          })}
      </Space>

      {selectedSet.has('voice_input') && isCapabilityUsable(capabilityAvailability, 'voice_input') ? (
        <AiVoiceRecorder disabled={disabled} loading={voiceLoading} onSend={onVoiceSend} />
      ) : null}

      {selectedSet.has('document_analysis') && isCapabilityUsable(capabilityAvailability, 'document_analysis') ? (
        <AiFileUploadButton
          disabled={disabled}
          loading={fileLoading}
          onPrepared={onFilePrepared}
          moduleId={moduleId}
          recordId={recordId}
          size={size}
        />
      ) : null}

      {selectedSet.has('record_creation') && onRecordCreationTargetModuleChange ? (
        <Select
          allowClear
          showSearch
          className="min-w-[210px]"
          size={size}
          value={recordCreationTargetModuleId || undefined}
          options={recordCreationModuleOptions}
          optionFilterProp="label"
          placeholder="نوع رکورد"
          disabled={disabled || loading}
          onChange={(value) => onRecordCreationTargetModuleChange(value ? String(value) : null)}
        />
      ) : null}
    </div>
  );
};

export default AiCapabilityComposerActions;
