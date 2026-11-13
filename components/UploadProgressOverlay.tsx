import { lazy, Suspense, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import theme from 'antd/es/theme';
import Grid from 'antd/es/grid';
import BellOutlined from '@ant-design/icons/BellOutlined';
import CloudUploadOutlined from '@ant-design/icons/CloudUploadOutlined';
import { useUploadTasks } from '../utils/uploadProgressStore';
import { claimFreshOverlayAnnouncements, setUiNotificationOverlayExpanded, useUiNotificationOverlayExpanded, useUiNotificationOverlayItems } from '../utils/uiNotificationOverlayStore';
import { appFeedback } from '../utils/appFeedback';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import { isPublicOverlaySuppressedPath } from '../utils/publicOverlay';
import './notifications/notificationOverlay.css';

const NotificationOverlayPanel = lazy(() => import('./notifications/NotificationOverlayPanel'));

const UploadProgressOverlay = () => {
  const { pathname } = useLocation();
  const tasks = useUploadTasks();
  const items = useUiNotificationOverlayItems();
  const expanded = useUiNotificationOverlayExpanded();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const suppressed = isPublicOverlaySuppressedPath(pathname);
  useEffect(() => {
    const fresh = claimFreshOverlayAnnouncements(items);
    if (suppressed || expanded || !fresh.length) return;
    const timer = setTimeout(() => {
      appFeedback.info({ title: fresh.length > 1 ? `${toPersianNumber(String(fresh.length))} اعلان تازه` : fresh[0].title,
        key: 'notification-heads-up', durationMs: 5000,
        actions: [{ key: 'open-notifications', label: 'مشاهدهٔ اعلان‌ها', onClick: () => setUiNotificationOverlayExpanded(true) }],
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [items, expanded, suppressed]);
  if (suppressed || (!tasks.length && !items.length)) return null;
  if (expanded) return <Suspense fallback={null}><NotificationOverlayPanel /></Suspense>;
  const uploadCount = tasks.filter(task => task.status === 'uploading').length;
  return <button type="button" className="notification-overlay-dock" aria-label="نمایش اعلان‌ها و آپلودها" aria-expanded={false}
    onClick={() => setUiNotificationOverlayExpanded(true)} style={{
      bottom: screens.md ? '20px' : 'calc(var(--app-mobile-footer-height, 64px) + 14px + env(safe-area-inset-bottom, 0px))',
      background: token.colorTextHeading, color: token.colorBgContainer, borderColor: token.colorPrimary,
    }}>
    {uploadCount ? <CloudUploadOutlined aria-hidden="true" /> : <BellOutlined aria-hidden="true" />}
    <span>{uploadCount ? 'آپلودها و اعلان‌ها' : 'اعلان‌ها'}</span>
    <span className="notification-overlay-count">{toPersianNumber(String(items.length + tasks.length))}</span>
  </button>;
};
export default UploadProgressOverlay;
