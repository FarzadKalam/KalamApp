import React, { useMemo, useRef } from 'react';
import { Button, Input, Select, Tag } from 'antd';
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
}

const formatFileSize = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
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
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentLabel = useMemo(() => attachments.map((file) => ({
    name: file.name,
    meta: formatFileSize(file.size),
  })), [attachments]);

  return (
    <div className="border-t border-[rgba(var(--brand-200-rgb),0.7)] dark:border-[rgba(var(--brand-300-rgb),0.25)] bg-[rgba(var(--brand-50-rgb),0.72)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.9)] px-4 py-3">
      {header ? <div className="mb-2">{header}</div> : null}

      <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-white/90 p-3 shadow-sm dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.72)]">
        <Input.TextArea
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoSize={{ minRows: 2, maxRows: 5 }}
          className="!border-0 !shadow-none !bg-transparent"
        />

        {mentionPickerOpen && (
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
        )}

        {attachmentLabel.length > 0 && (
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
        )}

        {replyActive && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <EnterOutlined />
            <span>پاسخ به یادداشت انتخاب شده</span>
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClearReply} />
          </div>
        )}

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
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                const nextFiles = Array.from(event.target.files || []);
                onFilesSelected(nextFiles);
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
  );
};

export default SharedNoteComposer;
