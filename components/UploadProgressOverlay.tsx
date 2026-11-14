import { lazy, Suspense, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import theme from 'antd/es/theme';
import Grid from 'antd/es/grid';
import BellOutlined from '@ant-design/icons/BellOutlined';
import CloudUploadOutlined from '@ant-design/icons/CloudUploadOutlined';
import { useUploadTasks } from '../utils/uploadProgressStore';
import {
  claimFreshOverlayAnnouncements,
  setUiNotificationOverlayExpanded,
  useUiNotificationOverlayExpanded,
  useUiNotificationOverlayItems,
  useUiNotificationOverlayUnreadSummary,
} from '../utils/uiNotificationOverlayStore';
import { appFeedback } from '../utils/appFeedback';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import { isPublicOverlaySuppressedPath } from '../utils/publicOverlay';
import './notifications/notificationOverlay.css';
import { FEEDBACK_POLICY } from '../utils/feedbackPolicy';

const NotificationOverlayPanel = lazy(() => import('./notifications/NotificationOverlayPanel'));

const UploadProgressOverlay = () => {
  const { pathname } = useLocation();
  const tasks = useUploadTasks();
  const items = useUiNotificationOverlayItems();
  const unreadSummary = useUiNotificationOverlayUnreadSummary();
  const expanded = useUiNotificationOverlayExpanded();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const suppressed = isPublicOverlaySuppressedPath(pathname);
  useEffect(() => {
    if (suppressed || expanded || !items.length) return;
    const timer = setTimeout(() => {
      const fresh = claimFreshOverlayAnnouncements(items);
      if (!fresh.length) return;
      appFeedback.info({ title: fresh.length > 1 ? `${toPersianNumber(String(fresh.length))} اعلان تازه` : fresh[0].title,
        key: 'notification-heads-up', durationMs: FEEDBACK_POLICY.notificationHeadsUpMs,
        actions: [{ key: 'open-notifications', label: 'مشاهدهٔ اعلان‌ها', onClick: () => setUiNotificationOverlayExpanded(true) }],
      });
    }, FEEDBACK_POLICY.announcementDebounceMs);
    return () => clearTimeout(timer);
  }, [items, expanded, suppressed]);
  const centralTotal = unreadSummary.ready
    ? (unreadSummary.communicationUnread + unreadSummary.alertsUnread)
    : items.length;
  const effectiveUnread = centralTotal > 0 ? centralTotal : items.length;
  if (suppressed || (!tasks.length && !effectiveUnread && !items.length)) return null;
  if (expanded) return <Suspense fallback={null}><NotificationOverlayPanel /></Suspense>;
  const uploadCount = tasks.filter(task => task.status === 'uploading').length;
  const totalCount = (effectiveUnread || items.length) + tasks.length;
  return <button type="button" className="notification-overlay-dock" aria-label="نمایش اعلان‌ها و آپلودها" aria-expanded={false}
    onClick={() => setUiNotificationOverlayExpanded(true)} style={{
      bottom: screens.md ? '20px' : 'calc(var(--app-mobile-footer-height, 64px) + 14px + env(safe-area-inset-bottom, 0px))',
      right: screens.md ? 'calc(var(--workspace-sidebar-rail-width, 80px) + 16px)' : '16px',
      background: token.colorTextHeading, color: token.colorBgContainer, borderColor: token.colorPrimary,
    }}>
    {uploadCount ? <CloudUploadOutlined aria-hidden="true" /> : <BellOutlined aria-hidden="true" />}
    <span>{uploadCount ? 'آپلودها و اعلان‌ها' : 'اعلان‌ها'}</span>
    <span className="notification-overlay-count">{toPersianNumber(String(totalCount))}</span>
  </button>;
};
export default UploadProgressOverlay;
