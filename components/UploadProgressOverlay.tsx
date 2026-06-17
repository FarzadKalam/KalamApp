import React, { useMemo, useState } from 'react';
import App from 'antd/es/app';
import Badge from 'antd/es/badge';
import Button from 'antd/es/button';
import Input from 'antd/es/input';
import Progress from 'antd/es/progress';
import theme from 'antd/es/theme';
import BellOutlined from '@ant-design/icons/BellOutlined';
import CheckCircleFilled from '@ant-design/icons/CheckCircleFilled';
import CheckOutlined from '@ant-design/icons/CheckOutlined';
import CloseCircleFilled from '@ant-design/icons/CloseCircleFilled';
import CloseOutlined from '@ant-design/icons/CloseOutlined';
import ClockCircleOutlined from '@ant-design/icons/ClockCircleOutlined';
import DownOutlined from '@ant-design/icons/DownOutlined';
import LoadingOutlined from '@ant-design/icons/LoadingOutlined';
import MessageOutlined from '@ant-design/icons/MessageOutlined';
import MinusOutlined from '@ant-design/icons/MinusOutlined';
import PhoneOutlined from '@ant-design/icons/PhoneOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import RobotOutlined from '@ant-design/icons/RobotOutlined';
import RollbackOutlined from '@ant-design/icons/RollbackOutlined';
import SendOutlined from '@ant-design/icons/SendOutlined';
import StopFilled from '@ant-design/icons/StopFilled';
import TeamOutlined from '@ant-design/icons/TeamOutlined';
import CloudUploadOutlined from '@ant-design/icons/CloudUploadOutlined';
import NotificationOutlined from '@ant-design/icons/NotificationOutlined';
import SoundOutlined from '@ant-design/icons/SoundOutlined';
import UpOutlined from '@ant-design/icons/UpOutlined';
import AiSparkleIcon from './ai/AiSparkleIcon';
import { cancelUploadTask, retryUploadTask, useUploadTasks } from '../utils/uploadProgressStore';
import {
  dismissUiNotificationOverlayItem,
  removeUiNotificationOverlayItem,
  snoozeUiNotificationOverlayItem,
  useUiNotificationOverlayPagination,
  useUiNotificationOverlayItems,
} from '../utils/uiNotificationOverlayStore';
import type { OverlayNotificationChannel, UiNotificationOverlayItem } from '../utils/uiNotificationOverlayStore';
import { safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import ProfileAvatar from './common/ProfileAvatar';

const SnoozeScheduleModal = React.lazy(() => import('./notifications/SnoozeScheduleModal'));

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

type OverlayFilterTab = 'all' | 'internal' | 'activities' | 'responsibilities' | 'system' | 'bot' | 'sms' | 'voip' | 'uploads';

const resolveNotificationTab = (item: UiNotificationOverlayItem): Exclude<OverlayFilterTab, 'uploads' | 'all'> => {
  const channel = String(item.channel || '').trim() as OverlayNotificationChannel;
  if (item.kind === 'task') return 'activities';
  if (item.kind === 'responsibility') return 'responsibilities';
  if (channel === 'internal' || channel === 'system' || channel === 'bot' || channel === 'sms') return channel;
  if (channel === 'voip') return 'voip';
  if (item.kind === 'bot') return 'bot';
  if (item.kind === 'sms') return 'sms';
  if (item.kind === 'voip_call') return 'voip';
  if (item.kind === 'assistant') return 'system';
  return 'internal';
};

const ExpandableNotificationText: React.FC<{ text: string }> = ({ text }) => {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  React.useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return undefined;
    const measure = () => {
      if (!expanded) {
        setOverflowing(node.scrollHeight > node.clientHeight + 1);
      }
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [expanded, text]);

  return (
    <div className="mt-1">
      <div
        ref={contentRef}
        className={`${expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'} break-words text-[12px] leading-5`}
      >
        {text}
      </div>
      {(overflowing || expanded) ? (
        <Button
          size="small"
          type="text"
          icon={expanded ? <UpOutlined /> : <DownOutlined />}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
          className="mt-1 px-0 text-xs text-gray-500 hover:!text-leather-600"
          aria-expanded={expanded}
        >
          {expanded ? 'جمع کردن' : 'مشاهده بیشتر'}
        </Button>
      ) : null}
    </div>
  );
};

const UploadProgressOverlay: React.FC = () => {
  const tasks = useUploadTasks();
  const notifications = useUiNotificationOverlayItems();
  const overlayPagination = useUiNotificationOverlayPagination();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [minimized, setMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<OverlayFilterTab>('all');
  const [hiddenSignature, setHiddenSignature] = useState<string | null>(null);
  const [snoozeItemId, setSnoozeItemId] = useState<string | null>(null);
  const [replyItemId, setReplyItemId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);

  const activeCount = useMemo(
    () => tasks.filter((task) => task.status === 'uploading').length,
    [tasks],
  );

  const tabCounts = useMemo(() => {
    const counts: Record<OverlayFilterTab, number> = {
      all: tasks.length,
      internal: 0,
      activities: 0,
      responsibilities: 0,
      system: 0,
      bot: 0,
      sms: 0,
      voip: 0,
      uploads: tasks.length,
    };
    notifications.forEach((item) => {
      counts.all += 1;
      counts[resolveNotificationTab(item)] += 1;
    });
    return counts;
  }, [notifications, tasks.length]);
  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all' || activeTab === 'uploads') return notifications;
    return notifications.filter((item) => resolveNotificationTab(item) === activeTab);
  }, [activeTab, notifications]);
  const filteredTasks = useMemo(() => {
    if (activeTab === 'all' || activeTab === 'uploads') return tasks;
    return [];
  }, [activeTab, tasks]);
  const renderedNotifications = usePresenceList(filteredNotifications, getNotificationId);
  const renderedTasks = usePresenceList(filteredTasks, getTaskId);
  const notificationCount = notifications.length;
  const hasUploads = tasks.length > 0;
  const hasNotifications = notificationCount > 0;
  const hasRenderedUploads = renderedTasks.length > 0;
  const hasRenderedNotifications = renderedNotifications.length > 0;
  const displayUploadCount = hasUploads ? tasks.length : renderedTasks.length;
  const displayNotificationCount = hasNotifications ? notificationCount : renderedNotifications.length;
  const hasDisplayedUploads = hasUploads || hasRenderedUploads;
  const hasDisplayedNotifications = hasNotifications || hasRenderedNotifications;
  const tabOptions = useMemo(() => ([
    { key: 'all', label: 'همه', icon: <NotificationOutlined />, count: tabCounts.all },
    { key: 'internal', label: 'داخلی', icon: <TeamOutlined />, count: tabCounts.internal },
    { key: 'activities', label: 'فعالیت', icon: <SoundOutlined />, count: tabCounts.activities },
    { key: 'responsibilities', label: 'مسئولیت', icon: <BellOutlined />, count: tabCounts.responsibilities },
    { key: 'system', label: 'سیستم', icon: <BellOutlined />, count: tabCounts.system },
    { key: 'bot', label: 'بات', icon: <RobotOutlined />, count: tabCounts.bot },
    { key: 'sms', label: 'پیامک', icon: <MessageOutlined />, count: tabCounts.sms },
    { key: 'voip', label: 'تماس', icon: <PhoneOutlined />, count: tabCounts.voip },
    { key: 'uploads', label: 'آپلود', icon: <CloudUploadOutlined />, count: tabCounts.uploads },
  ] as Array<{ key: OverlayFilterTab; label: string; icon: React.ReactNode; count: number }>), [tabCounts]);
  const displaySignature = useMemo(
    () => [
      notifications.map((item) => `n:${item.id}`).join(','),
      tasks.map((task) => `u:${task.id}:${task.status}`).join(','),
    ].join('|'),
    [notifications, tasks],
  );
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
  const activeTabMeta = tabOptions.find((item) => item.key === activeTab) || tabOptions[0];
  const activeTabSubtitle = activeTab === 'uploads'
    ? (
      activeCount > 0
        ? `${toPersianNumber(String(activeCount))} مورد در حال آپلود`
        : `${toPersianNumber(String(activeTabMeta?.count || 0))} مورد آپلود`
    )
    : `${toPersianNumber(String(activeTabMeta?.count || 0))} مورد خوانده‌نشده`;

  React.useEffect(() => {
    if (tabCounts[activeTab] > 0) return;
    if (tabCounts.all > 0) {
      setActiveTab('all');
    }
  }, [activeTab, tabCounts]);

  React.useEffect(() => {
    if (hiddenSignature && displaySignature && hiddenSignature !== displaySignature) {
      setHiddenSignature(null);
      setMinimized(false);
    }
  }, [displaySignature, hiddenSignature]);

  if (!hasDisplayedUploads && !hasDisplayedNotifications) return null;
  if (hiddenSignature && hiddenSignature === displaySignature) return null;

  if (minimized) {
    return (
      <div
        className="pointer-events-none fixed bottom-[calc(var(--app-mobile-footer-height,64px)+0.75rem+env(safe-area-inset-bottom,0px))] right-3 flex items-center gap-2 md:bottom-3 md:right-4"
        style={{ zIndex: 2147483000 }}
      >
        {hasDisplayedNotifications ? (
          <Badge count={displayNotificationCount ? toPersianNumber(String(displayNotificationCount)) : 0} size="small" color="#2563eb">
            <button
              type="button"
              onClick={() => setMinimized(false)}
              className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border text-base shadow-2xl backdrop-blur transition-transform hover:scale-105"
              style={{
                background: token.colorBgElevated,
                borderColor: token.colorBorderSecondary,
                boxShadow: token.boxShadowSecondary,
                color: '#2563eb',
              }}
              aria-label="نمایش اعلان‌ها"
            >
              <BellOutlined />
            </button>
          </Badge>
        ) : null}
        {hasDisplayedUploads ? (
          <Badge count={displayUploadCount ? toPersianNumber(String(displayUploadCount)) : 0} size="small" color={activeCount > 0 ? token.colorPrimary : token.colorSuccess}>
            <button
              type="button"
              onClick={() => setMinimized(false)}
              className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border text-base shadow-2xl backdrop-blur transition-transform hover:scale-105"
              style={{
                background: token.colorBgElevated,
                borderColor: token.colorBorderSecondary,
                boxShadow: token.boxShadowSecondary,
                color: activeCount > 0 ? token.colorPrimary : token.colorSuccess,
              }}
              aria-label="نمایش آپلودها"
            >
              <LoadingOutlined spin={activeCount > 0} />
            </button>
          </Badge>
        ) : null}
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
              {activeTab === 'all' ? overlayTitle : activeTabMeta?.label}
            </div>
            <div className="text-xs" style={{ color: token.colorTextTertiary }}>
              {activeTab === 'all' ? overlaySubtitle : activeTabSubtitle}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="flex h-7 w-7 items-center justify-center rounded-full transition-opacity hover:opacity-80"
              style={{ color: token.colorTextTertiary }}
              aria-label="کوچک کردن پنجره"
            >
              <MinusOutlined style={{ fontSize: 12 }} />
            </button>
            <button
              type="button"
              onClick={() => setHiddenSignature(displaySignature)}
              className="flex h-7 w-7 items-center justify-center rounded-full transition-opacity hover:opacity-80"
              style={{ color: token.colorTextTertiary }}
              aria-label="بستن پنجره"
            >
              <CloseOutlined style={{ fontSize: 12 }} />
            </button>
          </div>
        </div>

        <div
          className="overflow-x-auto px-3 py-2"
          style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}
        >
          <div className="flex min-w-max items-center gap-2">
            {tabOptions.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all"
                  style={{
                    borderColor: isActive ? token.colorPrimary : token.colorBorderSecondary,
                    background: isActive ? token.colorPrimaryBg : token.colorFillTertiary,
                    color: isActive ? token.colorPrimary : token.colorTextSecondary,
                  }}
                >
                  <span className="text-sm leading-none">{tab.icon}</span>
                  <span>{tab.label}</span>
                  <Badge
                    count={tab.count > 0 ? toPersianNumber(String(tab.count)) : 0}
                    size="small"
                    color={isActive ? token.colorPrimary : token.colorTextTertiary}
                    styles={{ indicator: { boxShadow: 'none' } }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="max-h-[55vh] overflow-y-auto px-3 py-3"
          style={{ scrollbarGutter: 'stable both-edges', overscrollBehavior: 'contain' }}
        >
          <div className="flex flex-col gap-2.5">
            {renderedNotifications.length > 0 ? (
              <div
                className="max-h-[330px] overflow-y-auto pr-1"
                style={{ scrollbarGutter: 'stable', overscrollBehavior: 'contain' }}
                onScroll={(event) => {
                  const node = event.currentTarget;
                  if (
                    activeTab !== 'uploads'
                    && overlayPagination.hasMore
                    && !overlayPagination.loading
                    && node.scrollHeight - node.scrollTop - node.clientHeight < 80
                  ) {
                    overlayPagination.loadMore?.();
                  }
                }}
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
                      ? <AiSparkleIcon className="h-4 w-4" />
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
                      <ProfileAvatar
                        size={32}
                        src={item.avatarUrl || null}
                        name={item.avatarName || item.title}
                        fallback={icon}
                        preset="avatar"
                        preload={Boolean(item.avatarUrl)}
                        className="mt-0.5 shrink-0"
                        style={{
                          color: accentColor,
                          background: token.colorBgElevated,
                        }}
                      />
                      <div className="min-w-0 flex-1 text-right">
                        <button type="button" onClick={item.onOpen} className="w-full text-right">
                          <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: token.colorTextSecondary }}>
                            <span>{item.kindLabel || (item.kind === 'note' ? 'پیام' : item.kind === 'task' ? 'فعالیت' : item.kind === 'bot' ? 'پیام بات' : item.kind === 'assistant' ? 'هوش مصنوعی' : item.kind === 'sms' ? 'پیامک' : item.kind === 'voip_call' ? 'تماس ورودی' : 'مسئولیت')}</span>
                            <span>{safeJalaliFormat(item.createdAt, 'YYYY/MM/DD HH:mm')}</span>
                          </div>
                          <div className="mt-1 line-clamp-2 break-words text-sm font-medium leading-5" style={{ color: token.colorTextHeading }}>
                            {item.title}
                          </div>
                          {item.subtitle ? (
                            <div className="mt-0.5 line-clamp-1 break-words text-[11px] leading-4" style={{ color: token.colorTextTertiary }}>
                              {item.subtitle}
                            </div>
                          ) : null}
                        </button>
                        <div style={{ color: token.colorTextSecondary }}>
                          <ExpandableNotificationText text={item.body} />
                        </div>
                        {item.hasAttachments ? (
                          <div className="mt-2 text-[11px]" style={{ color: token.colorTextTertiary }}>
                            دارای پیوست
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        {item.onSnooze ? (
                          <Button
                            type="text"
                            size="small"
                            icon={<ClockCircleOutlined />}
                            aria-label="تعویق اعلان"
                            onClick={() => setSnoozeItemId(item.id)}
                          />
                        ) : null}
                        <Button
                          type="text"
                          size="small"
                          icon={<CloseOutlined />}
                          aria-label="بستن اعلان"
                          onClick={() => dismissUiNotificationOverlayItem(item.id)}
                        />
                      </div>
                    </div>
                    {item.onReply ? (
                      <div className="mt-2 flex items-center gap-1 border-t pt-2" style={{ borderColor: token.colorBorderSecondary }}>
                        <Button
                          type="text"
                          size="small"
                          icon={<RollbackOutlined />}
                          onClick={() => {
                            setReplyItemId((current) => current === item.id ? null : item.id);
                            setReplyText('');
                          }}
                        >
                          پاسخ
                        </Button>
                      </div>
                    ) : null}
                    {replyItemId === item.id && item.onReply ? (
                      <div className="mt-2 flex items-end gap-2">
                        <Input.TextArea
                          autoFocus
                          value={replyText}
                          onChange={(event) => setReplyText(event.target.value)}
                          autoSize={{ minRows: 1, maxRows: 4 }}
                          placeholder="پاسخ خود را بنویسید..."
                        />
                        <Button
                          type="primary"
                          shape="circle"
                          icon={<SendOutlined />}
                          loading={replySending}
                          disabled={!replyText.trim()}
                          aria-label="ارسال پاسخ"
                          onClick={async () => {
                            const text = replyText.trim();
                            if (!text || replySending) return;
                            setReplySending(true);
                            try {
                              await item.onReply?.(text);
                              removeUiNotificationOverlayItem(item.id);
                              setReplyItemId(null);
                              setReplyText('');
                              message.success('پاسخ ارسال شد.');
                            } catch (error) {
                              message.error(toFaErrorMessage(error as any, 'ارسال پاسخ ناموفق بود.'));
                            } finally {
                              setReplySending(false);
                            }
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
                </div>
              </div>
            ) : null}
            {overlayPagination.hasMore && activeTab !== 'uploads' ? (
              <div className="flex justify-start">
                <Button
                  size="small"
                  type="text"
                  icon={overlayPagination.loading ? undefined : <DownOutlined />}
                  loading={overlayPagination.loading}
                  onClick={() => overlayPagination.loadMore?.()}
                  className="px-0 text-xs text-gray-500 hover:!text-leather-600"
                >
                  مشاهده پیام‌های بیشتر
                </Button>
              </div>
            ) : null}
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
                        <div className="line-clamp-2 break-words text-sm font-medium leading-5" style={{ color: token.colorTextHeading }}>
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
            {renderedNotifications.length === 0 && renderedTasks.length === 0 ? (
              <div
                className="rounded-[18px] border px-4 py-6 text-center text-xs"
                style={{
                  borderColor: token.colorBorderSecondary,
                  background: token.colorFillTertiary,
                  color: token.colorTextTertiary,
                }}
              >
                موردی در این بخش وجود ندارد.
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <React.Suspense fallback={null}>
        <SnoozeScheduleModal
          open={Boolean(snoozeItemId)}
          title="تعویق نمایش اعلان"
          confirmText="تعویق اعلان"
          zIndex={2147483100}
          onCancel={() => setSnoozeItemId(null)}
          onConfirm={(until) => {
            if (snoozeItemId) snoozeUiNotificationOverlayItem(snoozeItemId, until);
            setSnoozeItemId(null);
          }}
        />
      </React.Suspense>
    </div>
  );
};

export default UploadProgressOverlay;
