import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Input, Modal, Tag } from 'antd';
import {
  AudioOutlined,
  CaretRightOutlined,
  CloseOutlined,
  DeleteOutlined,
  EnterOutlined,
  PaperClipOutlined,
  SendOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { NoteAttachment } from '../../utils/noteContent';
import FileManagerPickerModal from '../files/FileManagerPickerModal';
import AdaptiveSelectField from '../AdaptiveSelectField';

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
  surfaceVariant?: 'default' | 'omni';
}

type PendingFilePrompt = {
  original: File;
  suggestedName: string;
};

type PendingVoiceClip = {
  file: File;
  url: string;
  durationMs: number;
  levels: number[];
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

const formatDuration = (valueMs: number) => {
  const totalSeconds = Math.max(0, Math.floor((Number(valueMs) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
  surfaceVariant = 'default',
}) => {
  const lastExternalValueRef = useRef(value);
  const [pendingPrompts, setPendingPrompts] = useState<PendingFilePrompt[]>([]);
  const [preparedFiles, setPreparedFiles] = useState<File[]>([]);
  const [pendingFileName, setPendingFileName] = useState('');
  const [draftValue, setDraftValue] = useState(value);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [recordingError, setRecordingError] = useState('');
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [recordingLevels, setRecordingLevels] = useState<number[]>(() => Array.from({ length: 20 }, () => 0.16));
  const [pendingVoiceClip, setPendingVoiceClip] = useState<PendingVoiceClip | null>(null);
  const isOmniSurface = surfaceVariant === 'omni';
  const shellClassName = isOmniSurface
    ? 'border-t border-slate-200/55 bg-[rgba(248,250,252,0.78)] px-3 py-2.5 pb-[max(10px,env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-white/[0.06] dark:!bg-[rgba(21,23,26,0.96)]'
    : 'border-t border-slate-200/45 bg-white/82 px-2.5 py-2 dark:border-white/[0.07] dark:bg-[#1a1518]/95';
  const panelClassName = isOmniSurface
    ? 'rounded-2xl bg-white/95 p-2.5 shadow-[0_16px_38px_rgba(15,23,42,0.10)] dark:!bg-[rgba(28,33,40,0.96)] dark:shadow-[0_16px_38px_rgba(0,0,0,0.30)]'
    : 'rounded-[0.95rem] border border-slate-200/60 bg-white/90 p-2 shadow-[0_4px_14px_rgba(15,23,42,0.045)] dark:border-white/[0.09] dark:bg-white/[0.035] dark:shadow-[0_4px_14px_rgba(0,0,0,0.18)]';
  const inputClassName = isOmniSurface
    ? '!border-0 !bg-transparent !px-1 !text-[13px] !leading-6 !shadow-none placeholder:!text-slate-400 dark:placeholder:!text-slate-500'
    : '!border-0 !bg-transparent !text-[12px] !leading-5 !shadow-none';
  const controlRailClassName = isOmniSurface
    ? 'mt-2 flex items-center justify-between gap-2 rounded-xl bg-slate-50/82 px-1.5 py-1 dark:!bg-[rgba(8,13,20,0.42)]'
    : 'mt-2 flex items-center justify-between gap-2';
  const iconButtonClassName = isOmniSurface
    ? '!h-8 !w-8 !min-w-8 !rounded-full !text-slate-600 hover:!bg-white hover:!text-slate-900 dark:!text-slate-300 dark:hover:!bg-white/[0.08] dark:hover:!text-white'
    : undefined;
  const submitButtonClassName = isOmniSurface
    ? '!h-8 !min-w-8 !rounded-full !px-3 shadow-[0_8px_18px_rgba(var(--brand-700-rgb),0.18)]'
    : 'shrink-0';
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef<number>(0);
  const recordingTimerRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recordingAnimationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === lastExternalValueRef.current) return;
    lastExternalValueRef.current = value;
    setDraftValue(value);
  }, [value]);

  useEffect(() => () => {
    mediaRecorderRef.current?.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (recordingTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearInterval(recordingTimerRef.current);
    }
    if (recordingAnimationFrameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(recordingAnimationFrameRef.current);
    }
    audioSourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
    }
    if (pendingVoiceClip?.url) {
      URL.revokeObjectURL(pendingVoiceClip.url);
    }
  }, [pendingVoiceClip]);

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

  const resetRecordingMonitoring = () => {
    if (recordingTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recordingAnimationFrameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(recordingAnimationFrameRef.current);
      recordingAnimationFrameRef.current = null;
    }
    audioSourceRef.current?.disconnect();
    audioSourceRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  };

  const clearPendingVoiceClip = () => {
    setPendingVoiceClip((prev) => {
      if (prev?.url) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
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
      clearPendingVoiceClip();
      setRecordingDurationMs(0);
      setRecordingLevels(Array.from({ length: 20 }, () => 0.16));
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
        resetRecordingMonitoring();
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
          const nextUrl = URL.createObjectURL(blob);
          setPendingVoiceClip({
            file,
            url: nextUrl,
            durationMs: Math.max(0, Date.now() - recordingStartedAtRef.current),
            levels: recordingLevels.slice(),
          });
        }
        recordingChunksRef.current = [];
        setRecordingDurationMs(0);
      };

      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextCtor) {
        const context = new AudioContextCtor();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        audioContextRef.current = context;
        audioSourceRef.current = source;
        analyserRef.current = analyser;

        const timeData = new Uint8Array(analyser.frequencyBinCount);
        const updateLevels = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(timeData);
          let sum = 0;
          for (let index = 0; index < timeData.length; index += 1) {
            const centered = (timeData[index] - 128) / 128;
            sum += centered * centered;
          }
          const rms = Math.sqrt(sum / timeData.length);
          const normalizedLevel = Math.min(1, Math.max(0.08, rms * 3.8));
          setRecordingLevels((prev) => [...prev.slice(1), normalizedLevel]);
          recordingAnimationFrameRef.current = window.requestAnimationFrame(updateLevels);
        };
        recordingAnimationFrameRef.current = window.requestAnimationFrame(updateLevels);
      }

      recorder.start();
      recordingStartedAtRef.current = Date.now();
      if (typeof window !== 'undefined') {
        recordingTimerRef.current = window.setInterval(() => {
          setRecordingDurationMs(Date.now() - recordingStartedAtRef.current);
        }, 200);
      }
      setRecordingAudio(true);
    } catch (error) {
      console.warn('Could not start voice recording', error);
      setRecordingError('دسترسی میکروفون یا ضبط صدا در دسترس نیست.');
      resetRecordingMonitoring();
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      mediaRecorderRef.current = null;
      setRecordingAudio(false);
    }
  };

  const attachPendingVoiceClip = () => {
    if (!pendingVoiceClip) return;
    const voiceFile = pendingVoiceClip.file as File & { fileType?: string; file_type?: string };
    voiceFile.fileType = 'voice';
    voiceFile.file_type = 'voice';
    onFilesSelected([voiceFile]);
    clearPendingVoiceClip();
  };

  return (
    <>
      <div className={shellClassName}>
        {header ? <div className="mb-1.5">{header}</div> : null}

        <div className={panelClassName}>
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
            className={inputClassName}
          />

          {allowMentions && mentionPickerOpen ? (
            <div className="mt-2">
              <AdaptiveSelectField
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
                overlayZIndexBase={2400}
                pickerTitle="منشن عضو یا تیم"
                sheetSubtitle="اعضا یا تیم‌هایی را که باید از این یادداشت مطلع شوند انتخاب کنید."
                popupMatchSelectWidth={false}
                placement="topRight"
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

          {recordingAudio ? (
            <div className="mt-2 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-3 py-2 dark:border-rose-400/20 dark:bg-rose-500/10">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 dark:text-rose-200">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" />
                  <span>در حال ضبط پیام صوتی</span>
                </div>
                <div className="text-xs font-mono text-rose-700 dark:text-rose-200">
                  {formatDuration(recordingDurationMs)}
                </div>
              </div>
              <div className="mt-2 flex h-11 items-end gap-1 rounded-xl bg-white/80 px-2 py-1 dark:bg-black/20">
                {recordingLevels.map((level, index) => (
                  <span
                    key={`recording-level-${index}`}
                    className="flex-1 rounded-full bg-gradient-to-t from-rose-500 via-rose-400 to-amber-300 transition-all duration-100"
                    style={{ height: `${Math.max(18, Math.round(level * 100))}%` }}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-end">
                <Button
                  type="primary"
                  danger
                  size="small"
                  icon={<StopOutlined />}
                  onClick={stopAudioRecording}
                >
                  پایان ضبط
                </Button>
              </div>
            </div>
          ) : null}

          {!recordingAudio && pendingVoiceClip ? (
            <div className="mt-2 rounded-2xl border border-slate-200/70 bg-slate-50/85 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  پیش‌نمایش پیام صوتی
                </div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {formatDuration(pendingVoiceClip.durationMs)}
                </div>
              </div>
              <div className="mt-2 flex h-10 items-end gap-1 rounded-xl bg-white/80 px-2 py-1 dark:bg-black/20">
                {pendingVoiceClip.levels.map((level, index) => (
                  <span
                    key={`voice-preview-level-${index}`}
                    className="flex-1 rounded-full bg-gradient-to-t from-slate-500 via-slate-400 to-slate-200"
                    style={{ height: `${Math.max(16, Math.round(level * 92))}%` }}
                  />
                ))}
              </div>
              <audio controls src={pendingVoiceClip.url} className="mt-2 w-full" />
              <div className="mt-2 flex items-center justify-end gap-2">
                <Button
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={clearPendingVoiceClip}
                >
                  حذف
                </Button>
                <Button
                  type="primary"
                  size="small"
                  icon={<CaretRightOutlined />}
                  onClick={attachPendingVoiceClip}
                >
                  افزودن به پیام
                </Button>
              </div>
            </div>
          ) : null}

          {recordingError ? (
            <div className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">
              {recordingError}
            </div>
          ) : null}

          <div className={controlRailClassName}>
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
              {allowMentions ? (
                <Button
                  type={mentionPickerOpen || mentionValues.length > 0 ? 'primary' : 'text'}
                  size="small"
                  shape={isOmniSurface ? 'circle' : undefined}
                  icon={<span className="text-sm font-bold leading-none">@</span>}
                  onClick={onToggleMentionPicker}
                  aria-label="منشن عضو یا نقش"
                  title="منشن عضو یا نقش"
                  className={iconButtonClassName}
                />
              ) : null}
              {allowAttachments ? (
                <Button
                  type={attachmentLabel.length > 0 ? 'primary' : 'text'}
                  size="small"
                  shape={isOmniSurface ? 'circle' : undefined}
                  icon={<PaperClipOutlined />}
                  onClick={() => setFilePickerOpen(true)}
                  aria-label="افزودن پیوست"
                  title="افزودن پیوست"
                  className={iconButtonClassName}
                />
              ) : null}
              {allowAttachments ? (
                <Button
                  type={recordingAudio ? 'primary' : 'text'}
                  danger={recordingAudio}
                  size="small"
                  shape={isOmniSurface ? 'circle' : undefined}
                  icon={<AudioOutlined />}
                  onClick={() => void startAudioRecording()}
                  aria-label="ضبط صدا"
                  title="ضبط صدا"
                  className={iconButtonClassName}
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
              className={submitButtonClassName}
              aria-label="ارسال پیام"
              title="ارسال پیام"
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
