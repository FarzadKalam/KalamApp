import React, { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AiComposerSlots } from './AiComposerSlots';
import { App, Button, Input, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { ArrowDownOutlined, AudioOutlined, CloseOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import AiAudioPlayer from './AiAudioPlayer';

type RecordedVoice = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  filename: string;
  previewUrl?: string;
  transcript?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type AiVoiceRecorderProps = {
  disabled?: boolean;
  loading?: boolean;
  size?: ButtonProps['size'];
  className?: string;
  buttonType?: ButtonProps['type'];
  onSend: (voice: RecordedVoice) => void | Promise<void>;
  onMoveTranscriptToComposer?: (transcript: string) => void;
};

const formatSeconds = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes.toLocaleString('fa-IR')}:${seconds.toString().padStart(2, '0')}`;
};

const EQUALIZER_BARS = [7, 13, 9, 16, 11, 18, 10, 15, 8, 17, 12, 14, 9, 16, 10, 13];

const AiVoiceRecorder: React.FC<AiVoiceRecorderProps> = ({
  disabled = false,
  loading = false,
  size,
  className,
  buttonType,
  onSend,
  onMoveTranscriptToComposer,
}) => {
  const slots = useContext(AiComposerSlots);
  const renderTransient = (node: React.ReactNode) => slots.transient ? createPortal(node, slots.transient) : node;
  const { message } = App.useApp();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);
  const [recording, setRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [recorded, setRecorded] = useState<RecordedVoice | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [editableTranscript, setEditableTranscript] = useState('');
  const liveTranscriptRef = useRef('');

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopSpeechRecognition = () => {
    try { speechRef.current?.stop(); } catch { /* already stopped */ }
    speechRef.current = null;
  };

  useEffect(() => () => {
    clearTimer();
    cleanupStream();
    stopSpeechRecognition();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  }, [recordedUrl]);

  const startRecording = async () => {
    if (disabled || loading || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      message.warning('مرورگر شما از ضبط فایل صوتی پشتیبانی نمی‌کند.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      setRecorded(null);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
      setDurationMs(0);
      setLiveTranscript('');
      setEditableTranscript('');
      liveTranscriptRef.current = '';
      const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        const speech = new SpeechRecognitionCtor() as SpeechRecognitionLike;
        speech.lang = 'fa-IR';
        speech.continuous = true;
        speech.interimResults = true;
        speech.onresult = (event) => {
          let transcript = '';
          for (let index = 0; index < event.results.length; index += 1) {
            transcript += `${event.results[index][0]?.transcript || ''} `;
          }
          liveTranscriptRef.current = transcript.trim();
          setLiveTranscript(liveTranscriptRef.current);
        };
        speech.onerror = () => undefined;
        speech.onend = () => {
          if (recording && recorderRef.current?.state === 'recording') {
            try { speech.start(); } catch { /* browser may reject a restart */ }
          }
        };
        speechRef.current = speech;
        try { speech.start(); } catch { speechRef.current = null; }
      }
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        clearTimer();
        stopSpeechRecognition();
        const finalDuration = Date.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecording(false);
        cleanupStream();
        if (blob.size > 0) {
          const previewUrl = URL.createObjectURL(blob);
          const finalTranscript = liveTranscriptRef.current.trim();
          setEditableTranscript(finalTranscript);
          setRecorded({
            blob,
            mimeType,
            durationMs: finalDuration,
            filename: `فایل صوتی-${Date.now()}.webm`,
            previewUrl,
            transcript: finalTranscript || undefined,
          });
          setRecordedUrl(previewUrl);
        }
      };
      recorder.start();
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setDurationMs(Date.now() - startedAtRef.current);
      }, 250);
    } catch (error: any) {
      cleanupStream();
      setRecording(false);
      message.error(toFaErrorMessage(error, 'اجازه دسترسی به میکروفون داده نشد.'));
    }
  };

  const stopRecording = () => {
    if (!recording) return;
    recorderRef.current?.stop();
  };

  const discard = () => {
    stopSpeechRecognition();
    setRecorded(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setDurationMs(0);
    setLiveTranscript('');
    setEditableTranscript('');
    liveTranscriptRef.current = '';
  };

  const send = async () => {
    if (!recorded || loading) return;
    const queuedPreviewUrl = URL.createObjectURL(recorded.blob);
    const finalTranscript = editableTranscript.trim() || recorded.transcript;
    await onSend({ ...recorded, transcript: finalTranscript, previewUrl: queuedPreviewUrl });
    discard();
  };

  const moveToComposer = () => {
    const text = editableTranscript.trim();
    if (!text || !onMoveTranscriptToComposer) return;
    onMoveTranscriptToComposer(text);
    discard();
  };

  if (recorded) {
    return renderTransient(
      <div className="flex w-full min-w-0 flex-col gap-2 rounded-xl border border-slate-200/80 bg-slate-50/90 p-2.5 dark:border-white/10 dark:bg-white/[0.04]" dir="rtl">
        <div className="flex w-full min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <AiAudioPlayer src={recordedUrl} title="فایل صوتی آماده ارسال" subtitle={formatSeconds(recorded.durationMs)} downloadName={recorded.filename} compact />
          </div>
          <Tooltip title="حذف فایل صوتی">
            <Button size="small" type="text" aria-label="حذف فایل صوتی" icon={<CloseOutlined />} onClick={discard} disabled={loading} />
          </Tooltip>
          <Tooltip title="ارسال فایل صوتی">
            <Button size="small" type="primary" aria-label="ارسال فایل صوتی" icon={<SendOutlined />} loading={loading} onClick={() => void send()} />
          </Tooltip>
        </div>
        {(editableTranscript || onMoveTranscriptToComposer) ? (
          <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 dark:border-white/10 dark:bg-black/20">
            <Input.TextArea
              variant="borderless"
              autoSize={{ minRows: 1, maxRows: 5 }}
              value={editableTranscript}
              onChange={(event) => setEditableTranscript(event.target.value)}
              placeholder="متن تبدیل‌شده صدا (اینتر بزنید تا به کادر پیام منتقل شود)…"
              className="!p-0 !text-[13px] !leading-6 text-slate-800 dark:text-slate-100"
              onPressEnter={(event) => {
                if (event.shiftKey || event.nativeEvent.isComposing) return;
                if (onMoveTranscriptToComposer && editableTranscript.trim()) {
                  event.preventDefault();
                  moveToComposer();
                }
              }}
            />
            {onMoveTranscriptToComposer && editableTranscript.trim() ? (
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-1 text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400">
                <span>برای انتقال به کادر پیام و ویرایش نهایی، کلید Enter را بزنید</span>
                <Button
                  type="link"
                  size="small"
                  icon={<ArrowDownOutlined />}
                  onClick={moveToComposer}
                  className="!h-auto !p-0 !text-[11px]"
                >
                  انتقال به کادر پیام
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (recording) {
    return renderTransient(
      <div className="flex w-full min-w-0 flex-col gap-2 rounded-xl border border-red-200 bg-red-50/95 px-3 py-2.5 dark:border-red-900/60 dark:bg-red-950/35" dir="rtl">
        <div className="flex w-full min-w-0 items-center gap-2.5">
          <Button
            danger
            type="primary"
            shape="circle"
            size="middle"
            icon={<StopOutlined />}
            onClick={stopRecording}
            aria-label="توقف ضبط صدا"
            className="shrink-0"
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-red-700 dark:text-red-300">
            <div className="flex items-center gap-2 shrink-0">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
              <span className="font-semibold whitespace-nowrap">در حال ضبط صدا</span>
              <span className="tabular-nums font-medium">{formatSeconds(durationMs)}</span>
            </div>
            <div className="flex h-5 min-w-0 max-w-full flex-1 items-center justify-end gap-[2px] overflow-hidden" aria-hidden="true">
              {EQUALIZER_BARS.map((height, index) => (
                <span
                  key={index}
                  className="w-[3px] shrink-0 rounded-full bg-red-400/90 animate-pulse"
                  style={{ height: `${height}px`, animationDelay: `${index * 45}ms` }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="w-full min-w-0 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-white/75 px-2.5 py-1.5 text-[13px] leading-6 text-slate-700 dark:bg-black/25 dark:text-slate-200">
          {liveTranscript || 'صحبت کنید؛ متن تشخیص‌داده‌شده به‌صورت کامل همین‌جا نمایش داده می‌شود…'}
        </div>
      </div>
    );
  }

  return (
    <Tooltip title="ضبط پیام صوتی">
      <Button
        type={buttonType}
        aria-label="ضبط فایل صوتی"
        icon={<AudioOutlined />}
        disabled={disabled || loading}
        loading={loading}
        size={size}
        onClick={() => void startRecording()}
        className={className}
      />
    </Tooltip>
  );
};

export type { RecordedVoice };
export default AiVoiceRecorder;
