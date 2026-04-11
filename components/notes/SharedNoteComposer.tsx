import React, { useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Input, Modal, Select, Tag } from 'antd';
import {
  CloseOutlined,
  EnterOutlined,
  PaperClipOutlined,
  SendOutlined,
} from '@ant-design/icons';

interface SharedNoteComposerProps {
  header?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  mentionOptions: Array<{ label: string; value: string }>;
  mentionValues: string[];
  onMentionChange: (values: string[]) => void;
  mentionsLoading?: boolean;
  mentionPickerOpen: boolean;
  onToggleMentionPicker: () => void;
  attachments: File[];
  onFilesSelected: (files: File[]) => void;
  onRemoveAttachment: (fileName: string) => void;
  replyActive?: boolean;
  onClearReply?: () => void;
  submitDisabled?: boolean;
  smsNotificationEnabled?: boolean;
  onSmsNotificationChange?: (value: boolean) => void;
}

type PendingFilePrompt = {
  original: File;
  suggestedName: string;
};

const formatFileSize = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
};

const splitFileName = (fileName: string) => {
  const normalized = String(fileName || '').trim();
  const lastDot = normalized.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === normalized.length - 1) {
    return {
      name: normalized || 'file',
      extension: '',
    };
  }
  return {
    name: normalized.slice(0, lastDot),
    extension: normalized.slice(lastDot + 1),
  };
};

const renameFile = (file: File, nextBaseName: string) => {
  const { extension } = splitFileName(file.name);
  const cleanedBase = String(nextBaseName || '').trim() || splitFileName(file.name).name || 'file';
  const nextName = extension ? `${cleanedBase}.${extension}` : cleanedBase;
  return new File([file], nextName, {
    type: file.type,
    lastModified: file.lastModified,
  });
};

const SharedNoteComposer: React.FC<SharedNoteComposerProps> = ({
  header,
  value,
  onChange,
  onSubmit,
  placeholder = 'یادداشت جدید...',
  mentionOptions,
  mentionValues,
  onMentionChange,
  mentionsLoading = false,
  mentionPickerOpen,
  onToggleMentionPicker,
  attachments,
  onFilesSelected,
  onRemoveAttachment,
  replyActive = false,
  onClearReply,
  submitDisabled = false,
  smsNotificationEnabled = false,
  onSmsNotificationChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingPrompts, setPendingPrompts] = useState<PendingFilePrompt[]>([]);
  const [preparedFiles, setPreparedFiles] = useState<File[]>([]);
  const [pendingFileName, setPendingFileName] = useState('');

  const attachmentLabel = useMemo(() => attachments.map((file) => ({
    name: file.name,
    meta: formatFileSize(file.size),
  })), [attachments]);

  const activePrompt = pendingPrompts[0] || null;
  const activePromptExtension = activePrompt ? splitFileName(activePrompt.original.name).extension : '';

  const handleFilesPicked = (files: File[]) => {
    if (!files.length) return;
    setPreparedFiles([]);
    const prompts = files.map((file) => ({
      original: file,
      suggestedName: splitFileName(file.name).name || 'file',
    }));
    setPendingPrompts(prompts);
    setPendingFileName(prompts[0]?.suggestedName || '');
  };

  const closePrompt = () => {
    setPendingPrompts([]);
    setPreparedFiles([]);
    setPendingFileName('');
  };

  const moveToNextPrompt = (nextPreparedFiles: File[], remainingPrompts: PendingFilePrompt[]) => {
    if (remainingPrompts.length === 0) {
      if (nextPreparedFiles.length > 0) {
        onFilesSelected(nextPreparedFiles);
      }
      closePrompt();
      return;
    }
    setPreparedFiles(nextPreparedFiles);
    setPendingPrompts(remainingPrompts);
    setPendingFileName(remainingPrompts[0]?.suggestedName || '');
  };

  const confirmPrompt = () => {
    if (!activePrompt) return;
    const renamedFile = renameFile(activePrompt.original, pendingFileName);
    const nextPreparedFiles = [...preparedFiles, renamedFile];
    moveToNextPrompt(nextPreparedFiles, pendingPrompts.slice(1));
  };

  const skipPrompt = () => {
    if (!activePrompt) return;
    const nextPreparedFiles = [...preparedFiles, activePrompt.original];
    moveToNextPrompt(nextPreparedFiles, pendingPrompts.slice(1));
  };

  return (
    <>
      <div className="border-t border-[rgba(var(--brand-200-rgb),0.7)] dark:border-[rgba(var(--brand-300-rgb),0.25)] bg-[rgba(var(--brand-50-rgb),0.72)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.9)] px-4 py-3">
        {header ? <div className="mb-2">{header}</div> : null}

        <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-white/90 p-3 shadow-sm dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.72)]">
          <Input.TextArea
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoSize={{ minRows: 2, maxRows: 5 }}
            className="!border-0 !bg-transparent !shadow-none"
          />

          {mentionPickerOpen ? (
            <div className="mt-3">
              <Select
                mode="multiple"
                allowClear
                showSearch
                placeholder="منشن عضو یا تیم"
                value={mentionValues}
                onChange={(nextValues) => onMentionChange(nextValues || [])}
                options={mentionOptions}
                loading={mentionsLoading}
                optionFilterProp="label"
                className="w-full"
                getPopupContainer={(node) => node.parentElement || document.body}
                styles={{ popup: { root: { zIndex: 1100, minWidth: 240 } } }}
              />
            </div>
          ) : null}

          {attachmentLabel.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {attachmentLabel.map((file) => (
                <Tag
                  key={file.name}
                  closable
                  onClose={(event) => {
                    event.preventDefault();
                    onRemoveAttachment(file.name);
                  }}
                  className="!m-0 !rounded-full !px-2 !py-1"
                >
                  {file.name}{file.meta ? ` (${file.meta})` : ''}
                </Tag>
              ))}
            </div>
          ) : null}

          {replyActive ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <EnterOutlined />
              <span>پاسخ به یادداشت انتخاب شده</span>
              <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClearReply} />
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button
                type={mentionPickerOpen || mentionValues.length > 0 ? 'primary' : 'text'}
                size="small"
                icon={<span className="text-sm font-bold leading-none">@</span>}
                onClick={onToggleMentionPicker}
              />
              <Button
                type={attachments.length > 0 ? 'primary' : 'text'}
                size="small"
                icon={<PaperClipOutlined />}
                onClick={() => fileInputRef.current?.click()}
              />
              {onSmsNotificationChange ? (
                <Checkbox
                  checked={smsNotificationEnabled}
                  onChange={(event) => onSmsNotificationChange(event.target.checked)}
                  className="mr-2 text-xs"
                >
                  اطلاع‌رسانی پیامکی
                </Checkbox>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  const nextFiles = Array.from(event.target.files || []);
                  handleFilesPicked(nextFiles);
                  event.target.value = '';
                }}
              />
            </div>

            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={onSubmit}
              disabled={submitDisabled}
            >
              ارسال
            </Button>
          </div>
        </div>
      </div>

      <Modal
        title="نام فایل پیوست"
        open={Boolean(activePrompt)}
        onOk={confirmPrompt}
        onCancel={closePrompt}
        okText={pendingPrompts.length > 1 ? 'تایید و بعدی' : 'تایید'}
        cancelText="انصراف"
        destroyOnHidden
      >
        <div className="space-y-3">
          <div className="text-xs text-gray-500">
            {pendingPrompts.length > 1
              ? `فایل ${preparedFiles.length + 1} از ${pendingPrompts.length + preparedFiles.length}`
              : 'نام نمایش فایل را مشخص کنید'}
          </div>
          <Input
            autoFocus
            value={pendingFileName}
            onChange={(event) => setPendingFileName(event.target.value)}
            placeholder="نام فایل را وارد کنید"
            onPressEnter={confirmPrompt}
          />
          {activePromptExtension ? (
            <div className="text-xs text-gray-500">پسوند فایل: .{activePromptExtension}</div>
          ) : null}
          <div className="flex justify-end">
            <Button type="link" size="small" onClick={skipPrompt}>
              استفاده از نام فعلی
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default SharedNoteComposer;
