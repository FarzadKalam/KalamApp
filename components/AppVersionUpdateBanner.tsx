import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, App, Tag } from 'antd';
import {
  CheckCircleOutlined,
  DownOutlined,
  ReloadOutlined,
  RocketOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { safeJalaliFormat } from '../utils/persianNumberFormatter';
import {
  CURRENT_APP_VERSION,
  consumeCompletedAppRefreshIntent,
  fetchAppVersionManifest,
  hasReachedRefreshAttemptLimit,
  prepareAppRefresh,
  acknowledgeAppVersion,
  getUnreadInstalledRelease,
  isNewerAppVersion,
  readAcknowledgedAppVersion,
  resolveAppVersionBannerMode,
  type AppVersionManifest,
} from '../utils/appVersionUpdate';

const POLL_INTERVAL_MS = 60_000;
const INITIAL_CHECK_DELAY_MS = 8_000;

const AppVersionUpdateBanner: React.FC<{ accountId: string }> = ({ accountId }) => {
  const { message } = App.useApp();
  const { pathname } = useLocation();
  const previousPathRef = useRef(pathname);
  const refreshStartedRef = useRef(false);
  const [manifest, setManifest] = useState<AppVersionManifest | null>(null);
  const [seenVersion, setSeenVersion] = useState(() => readAcknowledgedAppVersion(accountId));
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const installedRelease = manifest ? getUnreadInstalledRelease(manifest, CURRENT_APP_VERSION, seenVersion) : null;
  const available = !!manifest && isNewerAppVersion(manifest.version, CURRENT_APP_VERSION);
  const mode = manifest ? resolveAppVersionBannerMode(manifest.version, CURRENT_APP_VERSION, installedRelease?.version) : null;
  const displayedRelease = installedRelease || manifest;
  const releaseHistory = useMemo(
    () => manifest?.releases || [],
    [manifest?.releases]
  );
  const releasedAtLabel = useMemo(
    () => displayedRelease?.releasedAt ? safeJalaliFormat(displayedRelease.releasedAt, 'YYYY/MM/DD HH:mm') : '',
    [displayedRelease?.releasedAt]
  );

  useEffect(() => {
    consumeCompletedAppRefreshIntent(CURRENT_APP_VERSION);
  }, []);

  useEffect(() => {
    let disposed = false;
    const checkVersion = async () => {
      if (disposed) return;
      try {
        const nextManifest = await fetchAppVersionManifest();
        if (!disposed) setManifest(nextManifest);
      } catch (error) {
        console.warn('App version check failed', error);
      }
    };

    const initialTimer = window.setTimeout(checkVersion,
      readAcknowledgedAppVersion(accountId) === CURRENT_APP_VERSION ? INITIAL_CHECK_DELAY_MS : 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void checkVersion();
    }, POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkVersion();
    };
    window.addEventListener('focus', checkVersion);
    window.addEventListener('online', checkVersion);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      disposed = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener('focus', checkVersion);
      window.removeEventListener('online', checkVersion);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [accountId]);

  const refreshApp = useCallback(async (force = false) => {
    if (!manifest || !available || refreshStartedRef.current) return;
    refreshStartedRef.current = true;
    setRefreshing(true);

    try {
      await prepareAppRefresh(manifest.version, { force });
      window.location.reload();
    } catch (error) {
      refreshStartedRef.current = false;
      setRefreshing(false);
      message.error((error as Error)?.message || 'بروزرسانی ناموفق بود.');
    }
  }, [available, manifest, message]);

  useEffect(() => {
    const previous = previousPathRef.current;
    previousPathRef.current = pathname;
    if (!manifest || !available || refreshing || previous === pathname || navigator.onLine === false) return;
    if (hasReachedRefreshAttemptLimit(manifest.version)) return;
    void refreshApp(false);
  }, [pathname, available, manifest, refreshApp, refreshing]);

  if (!manifest || !mode || !displayedRelease) return null;
  const statusText = mode === 'completed'
    ? 'نسخهٔ جدید فعال است.'
    : hasReachedRefreshAttemptLimit(manifest.version)
      ? 'می‌توانید به‌روزرسانی را دستی انجام دهید.'
      : 'به‌روزرسانی با انتخاب شما یا در جابه‌جایی بعدی انجام می‌شود.';

  return (
    <div className="app-version-update-banner sticky top-16 z-[980] border-b border-gray-200 bg-white/92 px-3 py-2 shadow-sm backdrop-blur-xl dark:border-dark-border dark:bg-dark-surface/92 md:px-4">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-leather-50 text-leather-600 dark:bg-leather-500/15 dark:text-leather-300">
            <RocketOutlined />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-gray-800 dark:text-gray-100 md:text-sm">
                {mode === 'completed'
                  ? `به‌روزرسانی به نسخهٔ ${displayedRelease.version} انجام شد.`
                  : `نسخه ${manifest.version} منتشر شد.`}
              </span>
              <Tag className="m-0 rounded-lg px-2 py-0 text-[10px] font-bold" color="processing">
                {mode === 'completed' ? `نسخه فعال ${CURRENT_APP_VERSION}` : `نسخه فعلی ${CURRENT_APP_VERSION}`}
              </Tag>
              {releasedAtLabel && (
                <Tag className="m-0 rounded-lg px-2 py-0 text-[10px] font-bold">
                  انتشار: {releasedAtLabel}
                </Tag>
              )}
            </div>
            <div className="mt-1 text-[11px] font-semibold text-gray-500 dark:text-gray-300 md:text-xs">
              {statusText}
            </div>
            {installedRelease && !expanded && installedRelease.changes.length > 0 && (
              <ul className="mt-1 list-disc ps-4 text-xs leading-relaxed text-gray-600 dark:text-gray-200">
                {installedRelease.changes.map((change, index) => <li key={index}>{change}</li>)}
              </ul>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {mode === 'available' ? (
            <>
              <Button
                size="small"
                type="primary"
                icon={<ReloadOutlined spin={refreshing} />}
                loading={refreshing}
                onClick={() => void refreshApp(true)}
                className="!h-8 !rounded-xl !px-3 !text-xs !font-bold"
              >
                به‌روزرسانی
              </Button>
            </>
          ) : (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                acknowledgeAppVersion(accountId, CURRENT_APP_VERSION);
                setSeenVersion(CURRENT_APP_VERSION);
                setExpanded(false);
              }}
              className="!h-8 !rounded-xl !px-3 !text-xs !font-bold"
            >
              متوجه شدم
            </Button>
          )}
          {releaseHistory.length > 0 && (
            <Button
              size="small"
              type="text"
              icon={expanded ? <UpOutlined /> : <DownOutlined />}
              onClick={() => setExpanded((prev) => !prev)}
              className="!h-8 !rounded-xl !px-3 !text-xs !font-bold !text-leather-600 dark:!text-leather-300"
            >
              تغییرات نسخه‌ها
            </Button>
          )}
        </div>
      </div>

      {expanded && releaseHistory.length > 0 && (
        <div className="mx-auto mt-2 max-h-[min(58vh,520px)] max-w-[1320px] overflow-y-auto rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 overscroll-contain dark:border-white/10 dark:bg-white/5">
          <div className="grid gap-3 md:grid-cols-2">
            {releaseHistory.map((release) => {
              const releaseDate = release.releasedAt
                ? safeJalaliFormat(release.releasedAt, 'YYYY/MM/DD HH:mm')
                : '';
              return (
                <section
                  key={release.version}
                  className="rounded-xl border border-gray-100 bg-white/80 p-3 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-gray-800 dark:text-gray-100">
                      نسخه {release.version}
                    </span>
                    {release.version === manifest.version && (
                      <Tag color="processing" className="m-0 rounded-lg text-[10px] font-bold">
                        آخرین نسخه
                      </Tag>
                    )}
                    {releaseDate && (
                      <span className="text-[10px] font-semibold text-gray-400">
                        {releaseDate}
                      </span>
                    )}
                  </div>
                  {release.changes.length > 0 ? (
                    <ul className="m-0 grid list-none gap-1 p-0 text-[11px] font-semibold text-gray-600 dark:text-gray-200 md:text-xs">
                      {release.changes.map((change, index) => (
                        <li key={`${release.version}:${change}:${index}`} className="flex min-w-0 items-start gap-2">
                          <CheckCircleOutlined className="mt-0.5 shrink-0 text-[12px] text-emerald-500" />
                          <span className="min-w-0">{change}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-[11px] font-semibold text-gray-400">
                      تغییر قابل نمایش برای این نسخه ثبت نشده است.
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AppVersionUpdateBanner;
