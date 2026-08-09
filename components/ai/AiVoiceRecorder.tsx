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
  const [recording, setRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [recorded, setRecorded] = useState<RecordedVoice | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);

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

  useEffect(() => () => {
    clearTimer();
    cleanupStream();
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
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        clearTimer();
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
    setRecorded(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setDurationMs(0);
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
