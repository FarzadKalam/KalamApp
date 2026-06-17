import React, { useEffect, useRef, useState } from 'react';
import { Button, Spin, Tooltip } from 'antd';
import { CloseOutlined, ReloadOutlined } from '@ant-design/icons';

export type AiGenerationKind =
  | 'image_generation'
  | 'voice_output'
  | 'video_generation'
  | 'document_generation'
  | 'document_analysis';

const KIND_LABEL: Record<AiGenerationKind, string> = {
  image_generation: 'در حال ساخت تصویر',
  voice_output: 'در حال تولید صدا',
  video_generation: 'در حال ساخت ویدیو',
  document_generation: 'در حال ساخت فایل',
  document_analysis: 'در حال تحلیل سند',
};

const KIND_HINT: Record<AiGenerationKind, string> = {
  image_generation: 'معمولاً چند ثانیه طول می‌کشد.',
  voice_output: 'معمولاً چند ثانیه طول می‌کشد.',
  video_generation: 'ساخت ویدیو ممکن است چند دقیقه طول بکشد.',
  document_generation: 'در حال آماده‌سازی فایل خروجی…',
  document_analysis: 'در حال خواندن و تحلیل سند…',
};

const RECHECK_ENABLE_MS = 5000;     // manual button becomes active after 5s
const AUTO_POLL_MS = 5000;          // background re-check cadence
const AUTO_POLL_MAX_MS = 240000;    // stop background polling after 4 min (manual button stays)

const formatElapsed = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = minutes.toLocaleString('fa-IR', { minimumIntegerDigits: 2, useGrouping: false });
  const ss = seconds.toLocaleString('fa-IR', { minimumIntegerDigits: 2, useGrouping: false });
  return `${mm}:${ss}`;
};

type AiGenerationStatusCardProps = {
  kind: AiGenerationKind;
  startedAtMs: number;
  onRecheck: () => void | Promise<void>;
  checking?: boolean;
  failedNote?: string | null;
  onDismiss?: () => void;
  autoPoll?: boolean;
};

const AiGenerationStatusCard: React.FC<AiGenerationStatusCardProps> = ({
  kind,
  startedAtMs,
  onRecheck,
  checking = false,
  failedNote = null,
  onDismiss,
  autoPoll = true,
}) => {
  const [now, setNow] = useState(() => Date.now());
  const recheckRef = useRef(onRecheck);
  recheckRef.current = onRecheck;

  // 1s ticker for the live timer.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Background auto re-check, so the user usually never needs the manual button.
  // Stops after AUTO_POLL_MAX_MS so a genuinely-failed request doesn't poll forever.
  useEffect(() => {
    if (!autoPoll) return undefined;
    const id = window.setInterval(() => {
      if (Date.now() - startedAtMs > AUTO_POLL_MAX_MS) { window.clearInterval(id); return; }
      void recheckRef.current();
    }, AUTO_POLL_MS);
    return () => window.clearInterval(id);
  }, [autoPoll, startedAtMs]);

  const elapsed = now - startedAtMs;
  const canRecheck = elapsed >= RECHECK_ENABLE_MS && !checking;

  return (
    <div className="w-full max-w-[320px] rounded-2xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.85)] p-3 dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.9)]">
      <div className="flex items-center gap-2">
        <Spin size="small" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[rgb(var(--brand-800-rgb))] dark:text-[rgb(var(--brand-100-rgb))]">
            {KIND_LABEL[kind]}…
          </div>
          <div className="text-[10px] leading-4 text-gray-500 dark:text-gray-400">{KIND_HINT[kind]}</div>
        </div>
        <span className="shrink-0 rounded-md bg-white/70 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-gray-600 dark:bg-black/20 dark:text-gray-300">
          {formatElapsed(elapsed)}
        </span>
      </div>

      {failedNote ? (
        <div className="mt-2 text-[10px] leading-4 text-amber-700 dark:text-amber-400">{failedNote}</div>
      ) : null}

      <div className="mt-2 flex items-center justify-end gap-1">
        {onDismiss ? (
          <Tooltip title="بستن این کارت">
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={onDismiss} className="!text-gray-400" />
          </Tooltip>
        ) : null}
        <Tooltip title={canRecheck ? 'بررسی وضعیت ساخت' : 'چند لحظه صبر کنید…'}>
          <Button
            size="small"
            icon={<ReloadOutlined spin={checking} />}
            loading={checking}
            disabled={!canRecheck}
            onClick={() => void onRecheck()}
          >
            بررسی مجدد
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

export default AiGenerationStatusCard;
