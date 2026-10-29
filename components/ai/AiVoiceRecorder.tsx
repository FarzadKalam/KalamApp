import React, { useEffect, useRef, useState } from 'react';
import { App, Button, Space, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { AudioOutlined, CloseOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
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
  onSend: (voice: RecordedVoice) => void | Promise<void>;
};

const formatSeconds = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes.toLocaleString('fa-IR')}:${seconds.toString().padStart(2, '0')}`;
};

const AiVoiceRecorder: React.FC<AiVoiceRecorderProps> = ({ disabled = false, loading = false, size, className, onSend }) => {
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
          setRecorded({
            blob,
            mimeType,
            durationMs: finalDuration,
            filename: `فایل صوتی-${Date.now()}.webm`,
            previewUrl,
              transcript: liveTranscriptRef.current || undefined,
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
    liveTranscriptRef.current = '';
  };

  const send = async () => {
    if (!recorded || loading) return;
    const queuedPreviewUrl = URL.createObjectURL(recorded.blob);
    await onSend({ ...recorded, previewUrl: queuedPreviewUrl });
    discard();
  };

  if (recorded) {
    return (
      <Space size={4} className="shrink-0 rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 dark:border-blue-900/50 dark:bg-blue-900/20">
        <div className="w-[min(72vw,320px)]">
          <AiAudioPlayer src={recordedUrl} title="فایل صوتی آماده ارسال" subtitle={formatSeconds(recorded.durationMs)} downloadName={recorded.filename} compact />
        </div>
        <Tooltip title="حذف فایل صوتی">
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={discard} disabled={loading} />
        </Tooltip>
        <Tooltip title="ارسال فایل صوتی">
          <Button size="small" type="primary" icon={<SendOutlined />} loading={loading} onClick={() => void send()} />
        </Tooltip>
      </Space>
    );
  }

  if (recording) {
    return (
      <div className={[className, 'flex min-h-11 w-full min-w-[220px] items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/60 dark:bg-red-950/30'].filter(Boolean).join(' ')}>
        <Button
          danger
          type="primary"
          shape="circle"
          icon={<StopOutlined />}
          onClick={stopRecording}
          aria-label="توقف ضبط صدا"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
            <span className="font-medium">در حال دریافت صدا</span>
            <span className="tabular-nums">{formatSeconds(durationMs)}</span>
            <span className="flex h-5 items-center gap-0.5 overflow-hidden" aria-hidden="true">
              {Array.from({ length: 24 }, (_, index) => (
                <span key={index} className="w-1 rounded-full bg-red-400 animate-pulse" style={{ height: `${6 + ((index * 7) % 13)}px`, animationDelay: `${index * 35}ms` }} />
              ))}
            </span>
          </div>
          <div className="min-h-5 truncate text-sm text-slate-700 dark:text-slate-200">
            {liveTranscript || 'صحبت کنید؛ متن تشخیص‌داده‌شده همین‌جا نمایش داده می‌شود…'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Tooltip title={recording ? 'توقف ضبط فایل صوتی' : 'ضبط فایل صوتی'}>
      <Button
        icon={recording ? <StopOutlined /> : <AudioOutlined />}
        danger={recording}
        disabled={disabled || loading}
        loading={loading && !recording}
        size={size}
        onClick={recording ? stopRecording : () => void startRecording()}
        className={[className, recording ? 'animate-pulse' : ''].filter(Boolean).join(' ')}
      >
        {recording ? formatSeconds(durationMs) : null}
      </Button>
    </Tooltip>
  );
};

export type { RecordedVoice };
export default AiVoiceRecorder;
