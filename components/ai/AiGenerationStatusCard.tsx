import React, { useEffect, useRef, useState } from 'react';
import { Button, Tooltip } from 'antd';
import { CloseOutlined, ReloadOutlined, PictureOutlined, SoundOutlined, VideoCameraOutlined, FileTextOutlined, FileSearchOutlined } from '@ant-design/icons';
import { getAiAgent } from '../../supabase/functions/_shared/ai-agents';
import './AiChatPresentation.css';

export type AiGenerationKind =
  | 'image_generation'
  | 'voice_output'
  | 'video_generation'
  | 'document_generation'
  | 'document_analysis';

const KIND_ICON: Record<AiGenerationKind, React.ReactNode> = {
  image_generation: <PictureOutlined />,
  voice_output: <SoundOutlined />,
  video_generation: <VideoCameraOutlined />,
  document_generation: <FileTextOutlined />,
  document_analysis: <FileSearchOutlined />,
};

const KIND_HINT: Record<AiGenerationKind, string> = {
  image_generation: 'تصویر به‌محض آماده‌شدن در همین گفتگو نمایش داده می‌شود.',
  voice_output: 'پاسخ صوتی به‌محض آماده‌شدن اینجا نمایش داده می‌شود.',
  video_generation: 'ساخت ویدیو ممکن است چند دقیقه طول بکشد.',
  document_generation: 'در حال آماده‌سازی فایل خروجی…',
  document_analysis: 'در حال خواندن و تحلیل سند…',
};

const RECHECK_ENABLE_MS = 5000;     // manual button becomes active after 5s
const AUTO_POLL_MS = 5000;          // background re-check cadence
const AUTO_POLL_MAX_MS_BY_KIND: Record<AiGenerationKind, number> = {
  image_generation: 900000,
  voice_output: 180000,
  video_generation: 900000,
  document_generation: 300000,
  document_analysis: 300000,
};

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
  providerRaw?: any;
  onDismiss?: () => void;
  autoPoll?: boolean;
};

const AiGenerationStatusCard: React.FC<AiGenerationStatusCardProps> = ({
  kind,
  startedAtMs,
  onRecheck,
  checking = false,
  failedNote = null,
  providerRaw = null,
  onDismiss,
  autoPoll = true,
}) => {
  const [now, setNow] = useState(() => Date.now());
  const recheckRef = useRef(onRecheck);
  const checkingRef = useRef(checking);
  recheckRef.current = onRecheck;
  checkingRef.current = checking;

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
      const maxMs = AUTO_POLL_MAX_MS_BY_KIND[kind] || 300000;
      if (Date.now() - startedAtMs > maxMs) { window.clearInterval(id); return; }
      if (checkingRef.current) return;
      void recheckRef.current();
    }, AUTO_POLL_MS);
    return () => window.clearInterval(id);
  }, [autoPoll, kind, startedAtMs]);

  const elapsed = now - startedAtMs;
  const canRecheck = elapsed >= RECHECK_ENABLE_MS && !checking;
  const providerRawText = providerRaw
    ? (typeof providerRaw === 'string' ? providerRaw : JSON.stringify(providerRaw, null, 2))
    : '';

  return (
    <div className={`ai-chat-theme ai-generation-card${failedNote ? ' has-note' : ''}`} aria-label={getAiAgent(kind).label}>
      <div className="ai-generation-heading">
        <span className="ai-generation-icon" aria-hidden="true">{KIND_ICON[kind]}</span>
        <div className="ai-generation-copy" role="status" aria-live="polite">
          <strong>{getAiAgent(kind).label}</strong>
          <div>{failedNote ? 'نیازمند بررسی وضعیت' : `${getAiAgent(kind).activity}…`}</div>
        </div>
        <span className="ai-generation-timer" aria-label="زمان سپری‌شده" dir="ltr">
          {formatElapsed(elapsed)}
        </span>
      </div>

      {['image_generation', 'video_generation'].includes(kind) && <div className="ai-generation-preview" aria-hidden="true">{KIND_ICON[kind]}</div>}
      <div className="ai-generation-track" aria-hidden="true" />
      <div className="ai-generation-hint mt-2">{KIND_HINT[kind]}</div>

      {failedNote ? (
        <div className="ai-generation-note" role="status">{failedNote}</div>
      ) : null}

      {providerRawText ? (
        <details className="ai-chat-details" dir="ltr">
          <summary dir="rtl">
            جزئیات پاسخ سرویس‌دهنده
          </summary>
          <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words font-mono">
            {providerRawText.slice(0, 4000)}
          </pre>
        </details>
      ) : null}

      <div className="ai-generation-actions">
        {onDismiss ? (
          <Tooltip title="بستن این کارت">
            <Button type="text" className="ai-chat-icon" icon={<CloseOutlined />} onClick={onDismiss} aria-label="بستن کارت ساخت خروجی" />
          </Tooltip>
        ) : null}
        <Tooltip title={canRecheck ? 'بررسی وضعیت ساخت' : 'چند لحظه صبر کنید…'}>
          <Button
            size="small"
            type="text"
            aria-label="بررسی مجدد"
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
