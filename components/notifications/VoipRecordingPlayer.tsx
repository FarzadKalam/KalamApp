import React, { useEffect, useRef, useState } from 'react';
import { App, Button, Slider, Spin, Typography } from 'antd';
import {
  DownloadOutlined,
  FastBackwardOutlined,
  FastForwardOutlined,
  ForwardOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  AudioOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { useNavigate } from 'react-router-dom';
import type { NoteAttachment } from '../../utils/noteContent';
import {
  getVoipRecordingFileName,
  hasVoipRecording,
  loadVoipRecordingBlob,
  persistVoipRecordingAttachment,
  type VoipRecordingCall,
} from '../../utils/voipRecording';
import VoipCallDetailsButton from './VoipCallDetailsButton';
import { supabase } from '../../supabaseClient';
import { blobToBase64 } from '../../utils/blobBase64';

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
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [audioUrl, setAudioUrl] = useState(String(call.recording_url || '').trim());
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [forwarding, setForwarding] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState(String((call as any)?.transcript || '').trim());

  useEffect(() => {
    setTranscript(String((call as any)?.transcript || '').trim());
  }, [(call as any)?.id, (call as any)?.transcript]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  if (!hasVoipRecording(call)) {
    return (
      <div className="flex items-center">
        <VoipCallDetailsButton call={call} compact={compact} />
      </div>
    );
  }

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

  const transcribeRecording = async (force = false): Promise<string> => {
    if (transcript && !force) return transcript;
    const callId = String(call.id || '').trim();
    if (!callId) throw new Error('شناسه تماس معتبر نیست.');
    setTranscribing(true);
    try {
      const { error: processingError } = await supabase
        .from('voip_call_logs')
        .update({ transcript_status: 'processing', transcript_error: null })
        .eq('id', callId);
      if (processingError) throw processingError;
      const blob = await loadVoipRecordingBlob(call);
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'transcribe_voice',
          context: { mode: 'record', moduleId: 'voip_call_reports', recordId: callId },
          audio: { data: await blobToBase64(blob), mimeType: blob.type || 'audio/mpeg', filename: getVoipRecordingFileName(call) },
        },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(String(data?.message || 'تبدیل صوت به متن ناموفق بود.'));
      const nextTranscript = String(data?.transcript || '').trim();
      if (!nextTranscript) throw new Error('متنی از فایل صوتی دریافت نشد.');
      const { error: saveError } = await supabase
        .from('voip_call_logs')
        .update({ transcript: nextTranscript, transcript_status: 'ready', transcript_error: null, transcript_at: new Date().toISOString(), transcript_model: String(data?.model || '').trim() || null })
        .eq('id', callId);
      if (saveError) throw saveError;
      setTranscript(nextTranscript);
      message.success('متن مکالمه آماده شد.');
      return nextTranscript;
    } catch (error: any) {
      await supabase.from('voip_call_logs').update({ transcript_status: 'failed', transcript_error: String(error?.message || error || 'خطا').slice(0, 1000) }).eq('id', String(call.id || '').trim());
      throw error;
    } finally {
      setTranscribing(false);
    }
  };

  const copyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      message.success('متن مکالمه کپی شد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'کپی‌کردن متن ناموفق بود.'));
    }
  };

  const analyzeRecording = async () => {
    setAnalyzing(true);
    try {
      const callTranscript = await transcribeRecording();
      const callLogId = String(call.id || '').trim() || null;
      navigate('/ai', {
        state: {
          forceNewThread: true,
          aiAutoSubmitInitial: true,
          aiInitialInputKind: 'voice_transcript',
          aiInitialVoipCallLogId: callLogId,
          aiInitialPrompt: `متن مکالمهٔ تماس زیر را تحلیل کن. خلاصه، موضوعات مهم، تعهدها، احساس کلی و اقدام‌های پیشنهادی را به فارسی آماده کن. اگر برای نتیجهٔ دقیق به اطلاعات بیشتری نیاز داری، پیش از حدس‌زدن سوال کوتاه بپرس.\n\nمتن مکالمه:\n${callTranscript}`,
        },
      });
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'آماده‌سازی صوت تماس برای گفت‌وگوی هوش مصنوعی ناموفق بود.'));
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
          <VoipCallDetailsButton call={call} compact={compact} />
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => void downloadRecording()}>دانلود</Button>
          <Button type="link" size="small" icon={<AudioOutlined />} loading={transcribing} onClick={() => void transcribeRecording(true).catch((error) => message.error(toFaErrorMessage(error, 'تبدیل صوت به متن ناموفق بود.')))}>{transcript ? 'بازسازی متن' : 'تبدیل به متن'}</Button>
          <Button type="link" size="small" icon={<RobotOutlined />} loading={analyzing} onClick={() => void analyzeRecording()}>تحلیل با AI</Button>
          {onForward ? (
            <Button type="link" size="small" icon={<ForwardOutlined />} loading={forwarding} onClick={() => void forwardRecording()}>فوروارد</Button>
          ) : null}
        </div>
        {transcript ? (
          <div className="mt-3 rounded-lg border border-indigo-100 bg-white/80 p-2.5 dark:border-indigo-400/20 dark:bg-white/[0.04]">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-200">متن مکالمه</span>
              <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void copyTranscript()} title="کپی متن مکالمه" />
            </div>
            <Typography.Paragraph className="!mb-0 whitespace-pre-wrap text-xs leading-6 text-slate-700 dark:text-slate-200" ellipsis={{ rows: compact ? 4 : 8, expandable: 'collapsible', symbol: 'بیشتر' }}>
              {transcript}
            </Typography.Paragraph>
          </div>
        ) : null}
      </div>
    </>
  );
};

export default React.memo(VoipRecordingPlayer);
