import React, { useEffect, useRef, useState } from 'react';
import { Button, Slider, Tooltip } from 'antd';
import { DownloadOutlined, FastBackwardOutlined, FastForwardOutlined, PauseOutlined, PlayCircleOutlined, SoundOutlined } from '@ant-design/icons';

type AiAudioPlayerProps = {
  src?: string | null;
  title?: string | null;
  subtitle?: string | null;
  downloadName?: string | null;
  compact?: boolean;
};

const formatTime = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '۰:۰۰';
  const total = Math.floor(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes.toLocaleString('fa-IR')}:${seconds.toString().padStart(2, '0')}`;
};

const AiAudioPlayer: React.FC<AiAudioPlayerProps> = ({
  src,
  title = 'پیام صوتی',
  subtitle,
  downloadName,
  compact = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);
  }, [src]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (audio.paused) {
      await audio.play();
    } else {
      audio.pause();
    }
  };

  const seekBy = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    audio.currentTime = Math.min(Math.max(audio.currentTime + seconds, 0), duration || audio.duration || 0);
  };

  const seekTo = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    audio.currentTime = Number(value || 0);
  };

  return (
    <div className={`w-full ${compact ? 'max-w-[330px]' : 'max-w-[430px]'} rounded-2xl border border-slate-200 bg-white/92 px-3 py-2.5 text-slate-700 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.055] dark:text-slate-100`} dir="rtl">
      <audio
        ref={audioRef}
        src={src || undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(event) => setDuration(Number(event.currentTarget.duration || 0))}
        onTimeUpdate={(event) => setCurrentTime(Number(event.currentTarget.currentTime || 0))}
      />
      <div className="flex items-center gap-2">
        <Button
          type="primary"
          shape="circle"
          size={compact ? 'small' : 'middle'}
          icon={playing ? <PauseOutlined /> : <PlayCircleOutlined />}
          disabled={!src}
          onClick={() => void toggle()}
          aria-label={playing ? 'توقف پخش صوت' : 'پخش صوت'}
        />
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(var(--brand-500-rgb),0.10)] text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--brand-300-rgb),0.14)] dark:text-[rgb(var(--brand-200-rgb))]">
          <SoundOutlined />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate font-bold">{title || 'پیام صوتی'}</span>
            <span className="shrink-0 font-mono text-[10px] text-slate-400">{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
          {subtitle ? <div className="truncate text-[10px] text-slate-400">{subtitle}</div> : null}
        </div>
        <Tooltip title="۱۰ ثانیه عقب">
          <Button type="text" size="small" icon={<FastBackwardOutlined />} disabled={!src} onClick={() => seekBy(-10)} />
        </Tooltip>
        <Tooltip title="۱۰ ثانیه جلو">
          <Button type="text" size="small" icon={<FastForwardOutlined />} disabled={!src} onClick={() => seekBy(10)} />
        </Tooltip>
        <Tooltip title={src ? 'دانلود صوت' : 'فایل صوتی در دسترس نیست'}>
          <a
            href={src || undefined}
            download={src ? (downloadName || title || 'ai-audio') : undefined}
            target="_blank"
            rel="noreferrer"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-white/[0.08] ${src ? '' : 'pointer-events-none opacity-45'}`}
            aria-label="دانلود صوت"
          >
            <DownloadOutlined />
          </a>
        </Tooltip>
      </div>
      <Slider
        className="!mb-0 !mt-1.5"
        min={0}
        max={Math.max(duration, 0)}
        value={Math.min(currentTime, duration || currentTime)}
        step={0.1}
        tooltip={{ open: false }}
        disabled={!src || duration <= 0}
        onChange={seekTo}
      />
    </div>
  );
};

export default AiAudioPlayer;
