import React, { useEffect, useRef, useState } from 'react';
import { App, Button, Tooltip } from 'antd';
import {
  AudioOutlined,
  CheckOutlined,
  CloseOutlined,
  PauseOutlined,
  PlayCircleFilled,
  StopOutlined,
} from '@ant-design/icons';
import { FILE_STORAGE_BUCKET, fileStorageClient } from '../../utils/storageClient';
import { uploadFileWithProgress, isUploadCanceledError } from '../../utils/uploadFileWithProgress';
import { normalizePublicAssetUrl } from '../../utils/assetUrl';
import { sanitizeStorageFileName } from '../../utils/storagePath';
import { createWorkflowId as createId } from '../../utils/workflowTypes';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import type { SelectedStoryMediaResult } from './StoryMediaUploadTrigger';
import { readMediaDurationSeconds } from './StoryMediaUploadTrigger';

interface StoryAudioRecorderInlineProps {
  orgId: string;
  onRecorded: (result: SelectedStoryMediaResult) => void;
}

const formatClock = (ms: number) => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return toPersianNumber(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
};

export const StoryAudioRecorderInline: React.FC<StoryAudioRecorderInlineProps> = ({
  orgId,
  onRecorded,
}) => {
  const { message } = App.useApp();
  const [recording, setRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: 16 }, () => 0.18));
  const [recordedBlob, setRecordedBlob] = useState<{ blob: Blob; url: string; mimeType: string; durationSec: number } | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [uploading, setUploading] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopMonitoring = () => {
    if (timerRef.current !== null && typeof window !== 'undefined') {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        // noop
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopMonitoring();
      if (recordedBlob?.url) {
        URL.revokeObjectURL(recordedBlob.url);
      }
      previewAudioRef.current?.pause();
    };
  }, [recordedBlob]);

  const clearRecorded = () => {
    previewAudioRef.current?.pause();
    setPreviewPlaying(false);
    setRecordedBlob((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const stopRecording = () => {
    try {
      recorderRef.current?.stop();
    } catch {
      setRecording(false);
      stopMonitoring();
    }
  };

  const startRecording = async () => {
    if (recording) {
      stopRecording();
      return;
    }
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      message.warning('ضبط صدا در این مرورگر پشتیبانی نمی‌شود.');
      return;
    }
    try {
      clearRecorded();
      setDurationMs(0);
      setLevels(Array.from({ length: 16 }, () => 0.18));
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      chunksRef.current = chunks;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        message.error('ضبط صدا با خطا مواجه شد.');
        setRecording(false);
        stopMonitoring();
      };
      recorder.onstop = () => {
        setRecording(false);
        stopMonitoring();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
        const elapsedSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        if (blob.size > 0) {
          setRecordedBlob({
            blob,
            url: URL.createObjectURL(blob),
            mimeType,
            durationSec: elapsedSec,
          });
        }
      };

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        const pump = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i += 1) {
            const c = (buffer[i] - 128) / 128;
            sum += c * c;
          }
          const rms = Math.sqrt(sum / buffer.length);
          const norm = Math.min(1, Math.max(0.12, rms * 3.5));
          setLevels((prev) => [...prev.slice(1), norm]);
          rafRef.current = window.requestAnimationFrame(pump);
        };
        rafRef.current = window.requestAnimationFrame(pump);
      }

      startedAtRef.current = Date.now();
      recorder.start();
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setDurationMs(elapsed);
        if (elapsed >= 60_000) {
          stopRecording();
        }
      }, 200);
      setRecording(true);
    } catch {
      message.error('دسترسی میکروفون داده نشد یا دستگاه ضبط در دسترس نیست.');
      setRecording(false);
      stopMonitoring();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const confirmAndUpload = async () => {
    if (!recordedBlob) return;
    setUploading(true);
    try {
      const extRaw = String((recordedBlob.mimeType.split('/')[1] || 'webm').split(';')[0] || 'webm');
      const file = new File([recordedBlob.blob], `voice-${Date.now()}.${extRaw}`, {
        type: recordedBlob.mimeType,
        lastModified: Date.now(),
      });
      const safeName = sanitizeStorageFileName(file.name, 'audio');
      const uniquePrefix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : createId();
      const storagePath = `stories/${orgId}/audio/${uniquePrefix}_${safeName}`;

      await uploadFileWithProgress({
        client: fileStorageClient,
        bucket: FILE_STORAGE_BUCKET,
        path: storagePath,
        file,
        cacheControl: '31536000',
        contentType: file.type,
        label: 'صدای ضبط‌شده استوری',
        detail: 'صدای استوری',
      });

      const { data: urlData } = fileStorageClient.storage
        .from(FILE_STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      const publicUrl = normalizePublicAssetUrl(urlData?.publicUrl) || urlData?.publicUrl;
      if (!publicUrl) throw new Error('آدرس فایل صوتی دریافت نشد.');

      const realDuration = await readMediaDurationSeconds(file, 'audio');

      onRecorded({
        kind: 'audio',
        url: publicUrl,
        name: 'صدای ضبط‌شده',
        fileId: null,
        durationSec: realDuration || recordedBlob.durationSec,
        mimeType: file.type,
      });
      clearRecorded();
    } catch (err: any) {
      if (!isUploadCanceledError(err)) {
        message.error(String(err?.message || 'آپلود صدای ضبط‌شده ناموفق بود.'));
      }
    } finally {
      setUploading(false);
    }
  };

  if (recording) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-950/20 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
          <span className="text-xs font-semibold text-rose-700 dark:text-rose-300 font-mono">
            {formatClock(durationMs)}
          </span>
          <div className="flex items-center gap-0.5 h-5 flex-1 overflow-hidden">
            {levels.map((lvl, idx) => (
              <span
                key={idx}
                className="w-1 rounded-full bg-rose-500/80 transition-all"
                style={{ height: `${Math.round(lvl * 100)}%` }}
              />
            ))}
          </div>
        </div>
        <Button
          size="small"
          danger
          type="primary"
          icon={<StopOutlined />}
          onClick={stopRecording}
        >
          توقف ضبط
        </Button>
      </div>
    );
  }

  if (recordedBlob) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-white/5 px-3 py-2">
        <audio
          ref={previewAudioRef}
          src={recordedBlob.url}
          onEnded={() => setPreviewPlaying(false)}
          className="hidden"
        />
        <div className="flex items-center gap-2 min-w-0">
          <Button
            size="small"
            type="text"
            icon={previewPlaying ? <PauseOutlined /> : <PlayCircleFilled />}
            onClick={() => {
              const el = previewAudioRef.current;
              if (!el) return;
              if (el.paused) {
                void el.play().catch(() => undefined);
                setPreviewPlaying(true);
              } else {
                el.pause();
                setPreviewPlaying(false);
              }
            }}
          />
          <span className="text-xs text-slate-700 dark:text-slate-200 truncate">
            صدای ضبط‌شده ({toPersianNumber(recordedBlob.durationSec)} ثانیه)
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip title="حذف ضبط">
            <Button size="small" type="text" icon={<CloseOutlined />} onClick={clearRecorded} />
          </Tooltip>
          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            loading={uploading}
            onClick={() => void confirmAndUpload()}
          >
            افزودن صدا
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      size="small"
      icon={<AudioOutlined />}
      onClick={() => void startRecording()}
      className="!rounded-lg"
    >
      ضبط صدا با میکروفون
    </Button>
  );
};
