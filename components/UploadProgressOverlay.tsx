import React, { useMemo, useState } from 'react';
import { Button, Progress, theme } from 'antd';
import {
  BellOutlined,
  CheckCircleFilled,
  CheckOutlined,
  CloseCircleFilled,
  CloseOutlined,
  LoadingOutlined,
  MessageOutlined,
  MinusOutlined,
  PhoneOutlined,
  ReloadOutlined,
  RobotOutlined,
  OpenAIOutlined,
  StopFilled,
  TeamOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { cancelUploadTask, retryUploadTask, useUploadTasks } from '../utils/uploadProgressStore';
import { dismissUiNotificationOverlayItem, useUiNotificationOverlayItems } from '../utils/uiNotificationOverlayStore';
import { safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** exponent;
  const digits = size >= 100 || exponent === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[exponent]}`;
};

const statusMeta = {
  uploading: {
    icon: <LoadingOutlined spin />,
    label: 'در حال آپلود',
  },
  success: {
    icon: <CheckCircleFilled />,
    label: 'آپلود شد',
  },
  error: {
    icon: <CloseCircleFilled />,
    label: 'خطا',
  },
  canceled: {
    icon: <StopFilled />,
    label: 'لغو شد',
  },
} as const;

type PresencePhase = 'enter' | 'visible' | 'exit';

type PresenceEntry<T> = {
  id: string;
  item: T;
  phase: PresencePhase;
};

const ENTER_FRAME_MS = 20;
const EXIT_ANIMATION_MS = 180;

const getNotificationId = (item: { id: string }) => item.id;
const getTaskId = (item: { id: string }) => item.id;

const usePresenceList = <T,>(items: T[], getId: (item: T) => string) => {
  const [entries, setEntries] = useState<PresenceEntry<T>[]>([]);

  React.useEffect(() => {
    const nextIds = new Set(items.map((item) => String(getId(item) || '').trim()).filter(Boolean));

    setEntries((prev) => {
      const previousById = new Map(prev.map((entry) => [entry.id, entry]));
      const nextEntries: PresenceEntry<T>[] = [];

      items.forEach((item) => {
        const id = String(getId(item) || '').trim();
        if (!id) return;
        const previous = previousById.get(id);
        nextEntries.push({
          id,
          item,
          phase: previous && previous.phase !== 'exit' ? previous.phase : 'enter',
        });
      });

      prev.forEach((entry) => {
        if (!nextIds.has(entry.id)) {
          nextEntries.push({ ...entry, phase: 'exit' });
        }
      });

      return nextEntries;
    });

    const enterTimer = window.setTimeout(() => {
      setEntries((prev) => prev.map((entry) => (
        entry.phase === 'enter' ? { ...entry, phase: 'visible' } : entry
      )));
    }, ENTER_FRAME_MS);

    const exitTimer = window.setTimeout(() => {
      setEntries((prev) => prev.filter((entry) => entry.phase !== 'exit'));
    }, EXIT_ANIMATION_MS);

    return () => {
      window.clearTimeout(enterTimer);
      window.clearTimeout(exitTimer);
    };
  }, [getId, items]);

  return entries;
};

const getPresenceClassName = (phase: PresencePhase) => (
  phase === 'exit'
    ? 'max-h-0 translate-y-2 scale-[0.98] opacity-0'
    : phase === 'enter'
      ? 'max-h-64 translate-y-2 scale-[0.98] opacity-0'
      : 'max-h-64 translate-y-0 scale-100 opacity-100'
);

const UploadProgressOverlay: React.FC = () => {
  const tasks = useUploadTasks();
  const notifications = useUiNotificationOverlayItems();
  const { token } = theme.useToken();
  const [minimized, setMinimized] = useState(false);
  const renderedNotifications = usePresenceList(notifications, getNotificationId);
  const renderedTasks = usePresenceList(tasks, getTaskId);

  const activeCount = useMemo(
    () => tasks.filter((task) => task.status === 'uploading').length,
    [tasks],
  );

  const notificationCount = notifications.length;
  const hasUploads = tasks.length > 0;
  const hasNotifications = notificationCount > 0;
  const hasRenderedUploads = renderedTasks.length > 0;
  const hasRenderedNotifications = renderedNotifications.length > 0;
  const displayUploadCount = hasUploads ? tasks.length : renderedTasks.length;
  const displayNotificationCount = hasNotifications ? notificationCount : renderedNotifications.length;
  const hasDisplayedUploads = hasUploads || hasRenderedUploads;
  const hasDisplayedNotifications = hasNotifications || hasRenderedNotifications;
  const overlayTitle = hasDisplayedUploads && hasDisplayedNotifications
    ? 'آپلودها و اعلان‌ها'
    : hasDisplayedNotifications
      ? 'اعلان‌های جدید'
      : 'آپلود فایل';
  const overlaySubtitle = hasDisplayedUploads && hasDisplayedNotifications
    ? `${toPersianNumber(String(displayNotificationCount))} اعلان و ${toPersianNumber(String(displayUploadCount))} مورد آپلود`
    : hasDisplayedNotifications
      ? `${toPersianNumber(String(displayNotificationCount))} اعلان در انتظار بررسی`
      : activeCount > 0
        ? `${toPersianNumber(String(activeCount))} مورد در حال آپلود`
        : `${toPersianNumber(String(displayUploadCount))} مورد در صف نمایش`;

  if (!hasDisplayedUploads && !hasDisplayedNotifications) return null;

  if (minimized) {
    return (
      <div
        className="pointer-events-none fixed inset-x-3 bottom-3 md:left-auto md:right-4 md:w-[320px]"
        style={{ zIndex: 2147483000 }}
      >
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="pointer-events-auto flex w-full items-center justify-between rounded-full border px-4 py-3 text-right shadow-2xl backdrop-blur"
          style={{
            background: token.colorBgElevated,
            borderColor: token.colorBorderSecondary,
            boxShadow: token.boxShadowSecondary,
          }}
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold" style={{ color: token.colorTextHeading }}>
              {overlayTitle}
            </div>
            <div className="text-xs" style={{ color: token.colorTextSecondary }}>
              {overlaySubtitle}
            </div>
          </div>
          <UpOutlined style={{ color: token.colorTextTertiary, fontSize: 12 }} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-3 bottom-3 md:left-auto md:right-4 md:w-[420px]"
      style={{ zIndex: 2147483000 }}
    >
      <div
        className="pointer-events-auto overflow-hidden rounded-[24px] border shadow-2xl backdrop-blur"
        style={{
          background: token.colorBgElevated,
          borderColor: token.colorBorderSecondary,
          boxShadow: token.boxShadowSecondary,
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold" style={{ color: token.colorTextHeading }}>
              {overlayTitle}
            </div>
            <div className="text-xs" style={{ color: token.colorTextTertiary }}>
              {overlaySubtitle}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="flex h-7 w-7 items-center justify-center rounded-full transition-opacity hover:opacity-80"
            style={{ color: token.colorTextTertiary }}
            aria-label="کوچک کردن پنجره"
          >
            <MinusOutlined style={{ fontSize: 12 }} />
          </button>
        </div>

        <div
          className="max-h-[55vh] overflow-y-auto px-3 py-3"
          style={{ scrollbarGutter: 'stable both-edges', overscrollBehavior: 'contain' }}
        >
          <div className="flex flex-col gap-2.5">
            {renderedNotifications.map((entry) => {
              const item = entry.item;
              const icon = item.kind === 'note'
                ? <BellOutlined />
                : item.kind === 'task'
                  ? <CheckOutlined />
                  : item.kind === 'bot'
                    ? <RobotOutlined />
                    : item.kind === 'assistant'
                      ? <OpenAIOutlined />
                      : item.kind === 'sms'
                        ? <MessageOutlined />
                        : item.kind === 'voip_call'
                          ? <PhoneOutlined />
                          : <TeamOutlined />;
              const accentColor = item.kind === 'note'
                ? '#2563eb'
                : item.kind === 'task'
                  ? token.colorSuccess
                  : item.kind === 'bot'
                    ? '#2563eb'
                    : item.kind === 'assistant'
                      ? '#be185d'
                      : item.kind === 'sms'
                        ? '#d97706'
                        : item.kind === 'voip_call'
                          ? '#0f766e'
                          : '#d97706';

              return (
                <div
                  key={entry.id}
                  className={`transform-gpu overflow-hidden transition-[max-height,opacity,transform,margin] duration-200 ease-out will-change-transform ${getPresenceClassName(entry.phase)}`}
                >
                  <div
                    className="rounded-[18px] border px-3 py-3"
                    style={{
                      borderColor: token.colorBorderSecondary,
                      background: token.colorFillTertiary,
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                        style={{
                          color: accentColor,
                          background: token.colorBgElevated,
                        }}
                      >
                        {icon}
                      </div>
                      <button
                        type="button"
                        onClick={item.onOpen}
                        className="min-w-0 flex-1 text-right"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: token.colorTextSecondary }}>
                          <span>{item.kindLabel || (item.kind === 'note' ? 'پیام' : item.kind === 'task' ? 'فعالیت' : item.kind === 'bot' ? 'پیام بات' : item.kind === 'assistant' ? 'هوش مصنوعی' : item.kind === 'sms' ? 'پیامک' : item.kind === 'voip_call' ? 'تماس ورودی' : 'مسئولیت')}</span>
                          <span>{safeJalaliFormat(item.createdAt, 'YYYY/MM/DD HH:mm')}</span>
                        </div>
                        <div className="mt-1 truncate text-sm font-medium" style={{ color: token.colorTextHeading }}>
                          {item.title}
                        </div>
                        <div className="mt-1 line-clamp-2 text-[12px] leading-5" style={{ color: token.colorTextSecondary }}>
                          {item.body}
                        </div>
                        {item.hasAttachments ? (
                          <div className="mt-2 text-[11px]" style={{ color: token.colorTextTertiary }}>
                            دارای پیوست
                          </div>
                        ) : null}
                      </button>
                      <Button
                        type="text"
                        size="small"
                        icon={<CloseOutlined />}
                        onClick={() => dismissUiNotificationOverlayItem(item.id)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {renderedTasks.map((entry) => {
              const task = entry.item;
              const meta = statusMeta[task.status];
              const percentLabel = task.total > 0 ? `${task.progress}%` : '';
              const canCancel = task.status === 'uploading';
              const canRetry = task.status === 'error' || task.status === 'canceled';

              return (
                <div
                  key={entry.id}
                  className={`transform-gpu overflow-hidden transition-[max-height,opacity,transform,margin] duration-200 ease-out will-change-transform ${getPresenceClassName(entry.phase)}`}
                >
                  <div
                    className="rounded-[18px] border px-3 py-3"
                    style={{
                      borderColor: token.colorBorderSecondary,
                      background: token.colorFillTertiary,
                    }}
                  >
                    <div className="mb-2 flex items-start gap-2">
                      <div
                        className="mt-0.5 text-sm"
                        style={{
                          color:
                            task.status === 'error'
                              ? token.colorError
                              : task.status === 'success'
                                ? token.colorSuccess
                                : token.colorPrimary,
                        }}
                      >
                        {meta.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium" style={{ color: token.colorTextHeading }}>
                          {task.name}
                        </div>
                        <div className="flex items-center gap-2 text-[11px]" style={{ color: token.colorTextSecondary }}>
                          <span>{meta.label}</span>
                          {task.detail ? <span className="truncate">{task.detail}</span> : null}
                        </div>
                      </div>
                      {canRetry ? (
                        <button
                          type="button"
                          onClick={() => retryUploadTask(task.id)}
                          className="mr-1 flex h-6 w-6 items-center justify-center rounded-full transition-opacity hover:opacity-80"
                          style={{ color: token.colorPrimary }}
                          aria-label="تلاش دوباره"
                        >
                          <ReloadOutlined style={{ fontSize: 12 }} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => cancelUploadTask(task.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-full transition-opacity hover:opacity-80"
                        style={{ color: token.colorTextTertiary }}
                        aria-label={canCancel ? 'لغو آپلود' : 'بستن'}
                      >
                        <CloseOutlined style={{ fontSize: 11 }} />
                      </button>
                    </div>

                    <Progress
                      percent={task.progress}
                      showInfo={false}
                      strokeColor={
                        task.status === 'error'
                          ? token.colorError
                          : task.status === 'success'
                            ? token.colorSuccess
                            : token.colorPrimary
                      }
                      trailColor={token.colorFillSecondary}
                      size="small"
                      status={task.status === 'error' ? 'exception' : task.status === 'success' ? 'success' : 'active'}
                    />

                    <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: token.colorTextSecondary }}>
                      <span dir="ltr">
                        {formatBytes(task.loaded)} / {formatBytes(task.total)}
                      </span>
                      <span>{percentLabel || meta.label}</span>
                    </div>

                    {task.errorMessage && task.status !== 'uploading' ? (
                      <div
                        className="mt-2 line-clamp-2 text-[11px]"
                        style={{ color: task.status === 'error' ? token.colorError : token.colorTextTertiary }}
                      >
                        {task.errorMessage}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadProgressOverlay;
