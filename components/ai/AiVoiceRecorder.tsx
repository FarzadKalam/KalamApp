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
  onerror: ((event: { error?: string }) => void) | null;
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
  onTranscribe?: (voice: RecordedVoice) => Promise<string>;
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
  onTranscribe,
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
  const recordedUrlRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [recorded, setRecorded] = useState<RecordedVoice | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [editableTranscript, setEditableTranscript] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [speechUnavailable, setSpeechUnavailable] = useState(false);

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
    const speech = speechRef.current;
    speechRef.current = null;
    try { speech?.stop(); } catch { /* already stopped */ }
  };

  useEffect(() => () => {
    generationRef.current += 1;
    clearTimer();
    if (recorderRef.current) recorderRef.current.onstop = null;
    stopSpeechRecognition();
    cleanupStream();
    if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
  }, []);

  const startRecording = async () => {
    if (disabled || loading || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      message.warning('مرورگر شما از ضبط فایل صوتی پشتیبانی نمی‌کند.');
      return;
    }
    const generation = ++generationRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generationRef.current !== generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const preferredMimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferredMimeType ? { mimeType: preferredMimeType } : undefined);
      const mimeType = recorder.mimeType || preferredMimeType || 'audio/webm';
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      setRecorded(null);
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
      recordedUrlRef.current = null;
      setRecordedUrl(null);
      setDurationMs(0);
      setLiveTranscript('');
      setEditableTranscript('');
      setTranscribing(false);
      const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      setSpeechUnavailable(!SpeechRecognitionCtor);
      let completedSegments = '';
      let finalSegment = '';
      let hasInterim = false;
      let speechFailed = false;
      recorder.start();
      if (SpeechRecognitionCtor) {
        const speech = new SpeechRecognitionCtor() as SpeechRecognitionLike;
        speech.lang = 'fa-IR';
        speech.continuous = true;
        speech.interimResults = true;
        speech.onresult = (event) => {
          if (generationRef.current !== generation) return;
          finalSegment = '';
          let interim = '';
          for (let index = 0; index < event.results.length; index += 1) {
            const transcript = event.results[index][0]?.transcript || '';
            if (event.results[index].isFinal) finalSegment += `${transcript} `;
            else interim += `${transcript} `;
          }
          hasInterim = Boolean(interim.trim());
          setLiveTranscript(`${completedSegments} ${finalSegment} ${interim}`.trim());
        };
        speech.onerror = (event) => {
          if (generationRef.current !== generation || ['no-speech', 'aborted'].includes(event.error || '')) return;
          speechFailed = true;
          setSpeechUnavailable(true);
        };
        speech.onend = () => {
          if (generationRef.current !== generation) return;
          if (speechRef.current === speech && recorder.state === 'recording' && !speechFailed) {
            completedSegments = `${completedSegments} ${finalSegment}`.trim();
            finalSegment = '';
            try { speech.start(); } catch { speechFailed = true; setSpeechUnavailable(true); }
          }
        };
        speechRef.current = speech;
        try { speech.start(); } catch { speechRef.current = null; speechFailed = true; setSpeechUnavailable(true); }
      }
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (generationRef.current !== generation) return;
        clearTimer();
        stopSpeechRecognition();
        const finalDuration = Date.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecording(false);
        cleanupStream();
        if (blob.size > 0) {
          const previewUrl = URL.createObjectURL(blob);
          const finalTranscript = !speechFailed && !hasInterim ? `${completedSegments} ${finalSegment}`.trim() : '';
          const voice = {
            blob,
            mimeType,
            durationMs: finalDuration,
            filename: `فایل صوتی-${Date.now()}.${mimeType.includes('mp4') ? 'm4a' : 'webm'}`,
            previewUrl,
            transcript: finalTranscript || undefined,
          };
          setEditableTranscript(finalTranscript);
          setRecorded(voice);
          recordedUrlRef.current = previewUrl;
          setRecordedUrl(previewUrl);
          if (!finalTranscript && onTranscribe) {
            setTranscribing(true);
            void onTranscribe(voice).then((transcript) => {
              if (generationRef.current === generation) setEditableTranscript((current) => current || transcript.trim());
            }).catch(() => {
              if (generationRef.current === generation) setSpeechUnavailable(true);
            }).finally(() => {
              if (generationRef.current === generation) setTranscribing(false);
            });
          }
        }
      };
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
    generationRef.current += 1;
    stopSpeechRecognition();
    setRecorded(null);
    if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    recordedUrlRef.current = null;
    setRecordedUrl(null);
    setDurationMs(0);
    setLiveTranscript('');
    setEditableTranscript('');
    setTranscribing(false);
  };

  const send = async () => {
    if (!recorded || loading || transcribing) return;
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
            <Button size="small" type="primary" aria-label="ارسال فایل صوتی" icon={<SendOutlined />} loading={loading || transcribing} onClick={() => void send()} />
          </Tooltip>
        </div>
        {(editableTranscript || onMoveTranscriptToComposer) ? (
          <div aria-busy={transcribing} className="flex flex-col gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 dark:border-white/10 dark:bg-black/20">
            <Input.TextArea
              variant="borderless"
              autoSize={{ minRows: 1, maxRows: 5 }}
              aria-label="متن پیام صوتی"
              value={editableTranscript}
              onChange={(event) => setEditableTranscript(event.target.value)}
              placeholder={transcribing ? 'در حال تبدیل صدا به متن…' : 'متن تبدیل‌شدهٔ صدا'}
              className="!p-0 !text-[13px] !leading-6 text-slate-800 dark:text-slate-100"
              onPressEnter={(event) => {
                if (event.shiftKey || event.nativeEvent.isComposing) return;
                if (onMoveTranscriptToComposer && editableTranscript.trim()) {
                  event.preventDefault();
                  moveToComposer();
                }
              }}
            />
            {!transcribing && !editableTranscript && onTranscribe ? (
              <span className="text-xs text-slate-600 dark:text-slate-300">متن آماده نیست. می‌توانید آن را بنویسید یا خود فایل را بفرستید.</span>
            ) : null}
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
        <div role="status" className="w-full min-w-0 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-white/75 px-2.5 py-1.5 text-[13px] leading-6 text-slate-700 dark:bg-black/25 dark:text-slate-200">
          {liveTranscript || (speechUnavailable ? 'متن پس از پایان ضبط آماده می‌شود.' : 'صحبت کنید تا متن همین‌جا نمایش داده شود…')}
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
