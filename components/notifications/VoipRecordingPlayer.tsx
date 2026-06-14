import React, { useEffect, useRef, useState } from 'react';
import { App, Button, Modal, Slider, Spin } from 'antd';
import {
  DownloadOutlined,
  FastBackwardOutlined,
  FastForwardOutlined,
  ForwardOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { buildAiUploadedFilePrompt } from '../../utils/aiUploadedFilePrompt';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import type { NoteAttachment } from '../../utils/noteContent';
import {
  getVoipRecordingFileName,
  hasVoipRecording,
  loadVoipRecordingBlob,
  persistVoipRecordingAttachment,
  type VoipRecordingCall,
} from '../../utils/voipRecording';

type VoipRecordingPlayerProps = {
  call: VoipRecordingCall;
  compact?: boolean;
  onForward?: (attachment: NoteAttachment) => void | Promise<void>;
};

const formatDuration = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return '۰:۰۰';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes.toLocaleString('fa-IR')}:${seconds.toLocaleString('fa-IR', { minimumIntegerDigits: 2 })}`;
};

const VoipRecordingPlayer: React.FC<VoipRecordingPlayerProps> = ({ call, compact = false, onForward }) => {
  const { message } = App.useApp();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [audioUrl, setAudioUrl] = useState(String(call.recording_url || '').trim());
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [forwarding, setForwarding] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState('');

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  if (!hasVoipRecording(call)) return null;

  const ensureAudioUrl = async () => {
    if (audioUrl) return audioUrl;
    setLoading(true);
    try {
      const blob = await loadVoipRecordingBlob(call);
      const nextUrl = URL.createObjectURL(blob);
      objectUrlRef.current = nextUrl;
      setAudioUrl(nextUrl);
      return nextUrl;
    } finally {
      setLoading(false);
    }
  };

  const togglePlayback = async () => {
    try {
      await ensureAudioUrl();
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'پخش فایل صوتی تماس ناموفق بود.'));
    }
  };

  const seekBy = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(audio.currentTime + seconds, 0), duration || audio.duration || 0);
  };

  const downloadRecording = async () => {
    try {
      const url = await ensureAudioUrl();
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = getVoipRecordingFileName(call);
      anchor.click();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'دانلود فایل صوتی تماس ناموفق بود.'));
    }
  };

  const forwardRecording = async () => {
    if (!onForward) return;
    setForwarding(true);
    try {
      const attachment = await persistVoipRecordingAttachment(call);
      await onForward(attachment);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'آماده‌سازی صوت تماس برای فوروارد ناموفق بود.'));
    } finally {
      setForwarding(false);
    }
  };

  const analyzeRecording = async () => {
    setAnalyzing(true);
    try {
      const blob = await loadVoipRecordingBlob(call);
      const file = new File([blob], getVoipRecordingFileName(call), { type: blob.type || 'audio/mpeg' });
      const prepared = await buildAiUploadedFilePrompt(file);
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'chat_with_file',
          capabilities: ['document_analysis'],
          message: 'این مکالمه تلفنی را تحلیل کن؛ خلاصه، موضوعات مهم، تعهدها، احساس کلی و اقدام‌های پیشنهادی را به فارسی بنویس.',
          file: {
            filename: prepared.fileName,
            mimeType: prepared.mimeType,
            size: prepared.size,
            data: prepared.data || null,
          },
          context: {
            mode: 'record',
            moduleId: 'voip_call_reports',
            recordId: String(call.id || '').trim() || null,
          },
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'تحلیل صوت تماس ناموفق بود.'));
      setAnalysis(String(data?.answer || '').trim() || 'نتیجه‌ای برای نمایش دریافت نشد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'تحلیل صوت تماس با هوش مصنوعی ناموفق بود.'));
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <>
      <div className={`rounded-xl border border-slate-200/60 bg-slate-50/75 dark:border-white/10 dark:bg-white/[0.035] ${compact ? 'p-2' : 'p-3'}`}>
        <audio
          ref={audioRef}
          src={audioUrl || undefined}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        />
        <div className="flex items-center gap-2">
          <Button type="text" size="small" icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />} onClick={() => void togglePlayback()} />
          <Button type="text" size="small" icon={<FastBackwardOutlined />} onClick={() => seekBy(-10)} disabled={!audioUrl} />
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="flex h-8 items-center justify-center"><Spin size="small" /></div>
            ) : (
              <Slider
                min={0}
                max={duration || 1}
                step={0.1}
                value={Math.min(currentTime, duration || 1)}
                tooltip={{ formatter: (value) => formatDuration(Number(value || 0)) }}
                onChange={(value) => {
                  if (audioRef.current) audioRef.current.currentTime = Number(value || 0);
                  setCurrentTime(Number(value || 0));
                }}
              />
            )}
          </div>
          <span className="w-[76px] text-left text-[10px] text-gray-500" dir="ltr">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </span>
          <Button type="text" size="small" icon={<FastForwardOutlined />} onClick={() => seekBy(10)} disabled={!audioUrl} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => void downloadRecording()}>دانلود</Button>
          <Button type="link" size="small" icon={<RobotOutlined />} loading={analyzing} onClick={() => void analyzeRecording()}>تحلیل با AI</Button>
          {onForward ? (
            <Button type="link" size="small" icon={<ForwardOutlined />} loading={forwarding} onClick={() => void forwardRecording()}>فوروارد</Button>
          ) : null}
        </div>
      </div>
      <Modal open={Boolean(analysis)} title="تحلیل هوش مصنوعی مکالمه" footer={null} onCancel={() => setAnalysis('')}>
        <div className="whitespace-pre-wrap text-sm leading-7 text-gray-700 dark:text-gray-200">{analysis}</div>
      </Modal>
    </>
  );
};

export default React.memo(VoipRecordingPlayer);
