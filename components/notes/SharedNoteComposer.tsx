import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Input, Modal, Select, Tag } from 'antd';
import {
  AudioOutlined,
  CloseOutlined,
  EnterOutlined,
  PaperClipOutlined,
  SendOutlined,
} from '@ant-design/icons';
import type { NoteAttachment } from '../../utils/noteContent';
import FileManagerPickerModal from '../files/FileManagerPickerModal';

interface SharedNoteComposerProps {
  header?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  submitText?: string;
  mentionOptions?: Array<{ label: string; value: string }>;
  mentionValues?: string[];
  onMentionChange?: (values: string[]) => void;
  mentionsLoading?: boolean;
  mentionPickerOpen?: boolean;
  onToggleMentionPicker?: () => void;
  allowMentions?: boolean;
  attachments?: File[];
  linkedAttachments?: NoteAttachment[];
  onFilesSelected?: (files: File[]) => void;
  onLinkedAttachmentsSelected?: (attachments: NoteAttachment[]) => void;
  onRemoveAttachment?: (fileName: string) => void;
  onRemoveLinkedAttachment?: (url: string) => void;
  allowAttachments?: boolean;
  filePickerModuleId?: string | null;
  filePickerRecordId?: string | null;
  replyActive?: boolean;
  onClearReply?: () => void;
  submitDisabled?: boolean;
  submitLoading?: boolean;
  smsNotificationEnabled?: boolean;
  onSmsNotificationChange?: (value: boolean) => void;
  extraActions?: React.ReactNode;
  enableImagePasteAndDrop?: boolean;
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
  submitText = 'ارسال',
  mentionOptions = [],
  mentionValues = [],
  onMentionChange = () => undefined,
  mentionsLoading = false,
  mentionPickerOpen = false,
  onToggleMentionPicker = () => undefined,
  allowMentions = true,
  attachments = [],
  linkedAttachments = [],
  onFilesSelected = () => undefined,
  onLinkedAttachmentsSelected = () => undefined,
  onRemoveAttachment = () => undefined,
  onRemoveLinkedAttachment = () => undefined,
  allowAttachments = true,
  filePickerModuleId = null,
  filePickerRecordId = null,
  replyActive = false,
  onClearReply,
  submitDisabled = false,
  submitLoading = false,
  smsNotificationEnabled = false,
  onSmsNotificationChange,
  extraActions,
  enableImagePasteAndDrop = false,
}) => {
  const lastExternalValueRef = useRef(value);
  const [pendingPrompts, setPendingPrompts] = useState<PendingFilePrompt[]>([]);
  const [preparedFiles, setPreparedFiles] = useState<File[]>([]);
  const [pendingFileName, setPendingFileName] = useState('');
  const [draftValue, setDraftValue] = useState(value);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [recordingError, setRecordingError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    if (value === lastExternalValueRef.current) return;
    lastExternalValueRef.current = value;
    setDraftValue(value);
  }, [value]);

  useEffect(() => () => {
    mediaRecorderRef.current?.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const attachmentLabel = useMemo(() => [
    ...attachments.map((file) => ({
      key: `upload:${file.name}`,
      kind: 'upload' as const,
      name: file.name,
      meta: formatFileSize(file.size),
      removeKey: file.name,
    })),
    ...linkedAttachments.map((attachment) => ({
      key: `linked:${attachment.url}`,
      kind: 'linked' as const,
      name: attachment.name || 'فایل',
      meta: 'فایل موجود',
      removeKey: attachment.url,
    })),
  ], [attachments, linkedAttachments]);

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

  const collectImageFilesFromDataTransfer = (dataTransfer: DataTransfer | null | undefined) => {
    if (!dataTransfer) return [] as File[];
    const files = Array.from(dataTransfer.files || []);
    return files.filter((file) => String(file.type || '').toLowerCase().startsWith('image/'));
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

  const stopAudioRecording = () => {
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      // noop
    }
  };

  const startAudioRecording = async () => {
    if (recordingAudio) {
      stopAudioRecording();
      return;
    }
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecordingError('ضبط صدا در این مرورگر پشتیبانی نمی‌شود.');
      return;
    }

    try {
      setRecordingError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recordingChunksRef.current = chunks;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onerror = () => {
        setRecordingError('ضبط صدا ناموفق بود.');
      };
      recorder.onstop = () => {
        setRecordingAudio(false);
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 0) {
          const extension = String((recorder.mimeType || 'audio/webm').split('/')[1] || 'webm').split(';')[0] || 'webm';
          const file = new File([blob], `voice-${Date.now()}.${extension}`, {
            type: recorder.mimeType || 'audio/webm',
            lastModified: Date.now(),
          });
          handleFilesPicked([file]);
        }
        recordingChunksRef.current = [];
      };

      recorder.start();
      setRecordingAudio(true);
    } catch (error) {
      console.warn('Could not start voice recording', error);
      setRecordingError('دسترسی میکروفون یا ضبط صدا در دسترس نیست.');
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      mediaRecorderRef.current = null;
      setRecordingAudio(false);
    }
  };

  return (
    <>
      <div className="border-t border-slate-200/45 bg-white/82 px-2.5 py-2 dark:border-white/[0.07] dark:bg-[#1a1518]/95">
        {header ? <div className="mb-1.5">{header}</div> : null}

        <div className="rounded-[0.95rem] border border-slate-200/60 bg-white/90 p-2 shadow-[0_4px_14px_rgba(15,23,42,0.045)] dark:border-white/[0.09] dark:bg-white/[0.035] dark:shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
          <Input.TextArea
            placeholder={placeholder}
            value={draftValue}
            onChange={(event) => {
              const nextValue = event.target.value;
              setDraftValue(nextValue);
              onChange(nextValue);
            }}
            onPaste={(event) => {
              if (!enableImagePasteAndDrop || !allowAttachments) return;
              const imageFiles = collectImageFilesFromDataTransfer(event.clipboardData);
              if (!imageFiles.length) return;
              event.preventDefault();
              handleFilesPicked(imageFiles);
            }}
            onDragOver={(event) => {
              if (!enableImagePasteAndDrop || !allowAttachments) return;
              const imageFiles = collectImageFilesFromDataTransfer(event.dataTransfer);
              if (!imageFiles.length) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              if (!enableImagePasteAndDrop || !allowAttachments) return;
              const imageFiles = collectImageFilesFromDataTransfer(event.dataTransfer);
              if (!imageFiles.length) return;
              event.preventDefault();
              handleFilesPicked(imageFiles);
            }}
            autoSize={{ minRows: 1, maxRows: 12 }}
            className="!border-0 !bg-transparent !text-[12px] !leading-5 !shadow-none"
          />

          {allowMentions && mentionPickerOpen ? (
            <div className="mt-2">
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
            <div className="mt-2 flex flex-wrap gap-1.5">
              {attachmentLabel.map((file) => (
                <Tag
                  key={file.key}
                  closable
                  onClose={(event) => {
                    event.preventDefault();
                    if (file.kind === 'linked') {
                      onRemoveLinkedAttachment(file.removeKey);
                    } else {
                      onRemoveAttachment(file.removeKey);
                    }
                  }}
                  className="!m-0 !rounded-full !px-2 !py-0.5 !text-[11px]"
                >
                  {file.name}{file.meta ? ` (${file.meta})` : ''}
                </Tag>
              ))}
            </div>
          ) : null}

          {replyActive ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <EnterOutlined />
              <span>پاسخ به یادداشت انتخاب شده</span>
              <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClearReply} />
            </div>
          ) : null}

          {recordingError ? (
            <div className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">
              {recordingError}
            </div>
          ) : null}

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
              {allowMentions ? (
                <Button
                  type={mentionPickerOpen || mentionValues.length > 0 ? 'primary' : 'text'}
                  size="small"
                  icon={<span className="text-sm font-bold leading-none">@</span>}
                  onClick={onToggleMentionPicker}
                />
              ) : null}
              {allowAttachments ? (
                <Button
                  type={attachmentLabel.length > 0 ? 'primary' : 'text'}
                  size="small"
                  icon={<PaperClipOutlined />}
                  onClick={() => setFilePickerOpen(true)}
                />
              ) : null}
              {allowAttachments ? (
                <Button
                  type={recordingAudio ? 'primary' : 'text'}
                  danger={recordingAudio}
                  size="small"
                  icon={<AudioOutlined />}
                  onClick={() => void startAudioRecording()}
                />
              ) : null}
              {extraActions}
              {onSmsNotificationChange ? (
                <Checkbox
                  checked={smsNotificationEnabled}
                  onChange={(event) => onSmsNotificationChange(event.target.checked)}
                  className="mr-2 whitespace-nowrap text-[11px]"
                >
                  اطلاع‌رسانی پیامکی
                </Checkbox>
              ) : null}
            </div>

            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={onSubmit}
              loading={submitLoading}
              disabled={submitDisabled}
              size="small"
              className="shrink-0"
            >
              {submitText}
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

      <FileManagerPickerModal
        open={filePickerOpen}
        onClose={() => setFilePickerOpen(false)}
        moduleId={filePickerModuleId}
        recordId={filePickerRecordId}
        multiple
        onSelect={(selectedAttachments) => onLinkedAttachmentsSelected(selectedAttachments)}
        onUploadFiles={handleFilesPicked}
      />
    </>
  );
};

export default SharedNoteComposer;
