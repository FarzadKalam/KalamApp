import React, { useState } from 'react';
import { Button, Modal } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { hasVoipRecording, type VoipRecordingCall } from '../../utils/voipRecording';

type VoipCallDetailsButtonProps = {
  call: VoipRecordingCall & Record<string, any>;
  compact?: boolean;
};

const DIRECTION_LABELS: Record<string, string> = {
  incoming: 'ورودی',
  outgoing: 'خروجی',
  internal: 'داخلی',
};

const STATUS_LABELS: Record<string, string> = {
  answered: 'پاسخ داده شده',
  missed: 'بی‌پاسخ',
  failed: 'ناموفق',
  ringing: 'در حال زنگ‌خوردن',
  completed: 'پایان یافته',
  unknown: 'نامشخص',
};

const providerLabel = (value: unknown) => {
  const provider = String(value || '').trim().toLowerCase();
  if (provider === 'telefonchy') return 'تلفنچی';
  return String(value || '').trim() || 'ثبت نشده';
};

const formatDuration = (value: unknown) => {
  if (value === null || value === undefined || String(value).trim() === '') return 'ثبت نشده';
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return '۰ ثانیه';
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  if (!minutes) return `${toPersianNumber(remainder)} ثانیه`;
  if (!remainder) return `${toPersianNumber(minutes)} دقیقه`;
  return `${toPersianNumber(minutes)} دقیقه و ${toPersianNumber(remainder)} ثانیه`;
};

const displayValue = (value: unknown, fallback = 'ثبت نشده') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const VoipCallDetailsButton: React.FC<VoipCallDetailsButtonProps> = ({ call, compact = false }) => {
  const [open, setOpen] = useState(false);
  const direction = String(call?.direction || '').trim().toLowerCase();
  const recordingUnavailableByProvider = !String(call?.recording_url || '').trim()
    && String(call?.file_id || '').trim() === '0';
  const recordingLabel = recordingUnavailableByProvider
    ? 'برای این تماس ثبت نشده'
    : hasVoipRecording(call)
      ? 'موجود است'
      : 'ثبت نشده';
  const startedAt = safeJalaliFormat(call?.started_at || call?.created_at, 'YYYY/MM/DD HH:mm');
  const endedAt = safeJalaliFormat(call?.ended_at, 'YYYY/MM/DD HH:mm');

  const rows = [
    ['نوع تماس', DIRECTION_LABELS[direction] || 'نامشخص'],
    ['وضعیت', STATUS_LABELS[String(call?.status || '').trim().toLowerCase()] || displayValue(call?.status, 'نامشخص')],
    ['شماره تماس‌گیرنده', displayValue(call?.source_number)],
    ['شماره دریافت‌کننده', displayValue(call?.destination_number)],
    ['داخلی مقصد', displayValue(call?.extension)],
    ['کد اپراتور', displayValue(call?.operator_code)],
    ['سرویس‌دهنده', providerLabel(call?.provider)],
    ['شروع تماس', startedAt || 'ثبت نشده'],
    ['پایان تماس', endedAt || 'ثبت نشده'],
    ['زمان انتظار', formatDuration(call?.wait_seconds)],
    ['مدت مکالمه', formatDuration(call?.talk_seconds)],
    ['فایل صوتی', recordingLabel],
  ];

  return (
    <>
      <Button
        type="link"
        size="small"
        className="!px-0"
        icon={<InfoCircleOutlined />}
        title="جزئیات تماس"
        aria-label="جزئیات تماس"
        onClick={() => setOpen(true)}
      >
        {compact ? 'جزئیات' : 'اطلاعات تماس'}
      </Button>
      <Modal
        open={open}
        title="اطلاعات تماس"
        footer={null}
        onCancel={() => setOpen(false)}
        centered
        destroyOnHidden
        width={520}
        style={{ maxWidth: 'calc(100vw - 1rem)' }}
        styles={{ body: { paddingTop: 8 } }}
      >
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 text-sm dark:divide-white/[0.08] dark:border-white/[0.1]">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[minmax(104px,0.8fr)_minmax(0,1.2fr)] gap-3 px-3 py-2.5 dark:bg-white/[0.025]">
              <span className="text-slate-500 dark:text-slate-400">{label}</span>
              <span className="min-w-0 break-words text-right font-medium text-slate-800 dark:text-slate-100" dir={label.includes('شماره') ? 'ltr' : undefined}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
};

export default React.memo(VoipCallDetailsButton);
