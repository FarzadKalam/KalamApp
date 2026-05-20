import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, App, Progress, Tag } from 'antd';
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
  isNewerAppVersion,
  prepareAppRefresh,
  type AppVersionManifest,
} from '../utils/appVersionUpdate';

const POLL_INTERVAL_MS = 60_000;
const INITIAL_CHECK_DELAY_MS = 8_000;
const DEFAULT_COUNTDOWN_SECONDS = 20;

const getLocationSignature = (location: ReturnType<typeof useLocation>) =>
  `${location.pathname}${location.search}${location.hash}`;

const AppVersionUpdateBanner: React.FC = () => {
  const { message } = App.useApp();
  const location = useLocation();
  const locationSignature = getLocationSignature(location);
  const previousLocationSignatureRef = useRef(locationSignature);
  const refreshStartedRef = useRef(false);
  const [manifest, setManifest] = useState<AppVersionManifest | null>(null);
  const [countdown, setCountdown] = useState(DEFAULT_COUNTDOWN_SECONDS);
  const [expanded, setExpanded] = useState(false);
  const [deferredUntilNavigation, setDeferredUntilNavigation] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const visibleChanges = useMemo(
    () => (manifest?.changes || []).map((item) => item.trim()).filter(Boolean),
    [manifest?.changes]
  );
  const releasedAtLabel = useMemo(
    () => manifest?.releasedAt ? safeJalaliFormat(manifest.releasedAt, 'YYYY/MM/DD HH:mm') : '',
    [manifest?.releasedAt]
  );

  useEffect(() => {
    const completedVersion = consumeCompletedAppRefreshIntent(CURRENT_APP_VERSION);
    if (completedVersion) {
      message.success(`بروزرسانی نسخه ${completedVersion} با موفقیت انجام شد.`);
    }
  }, [message]);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;

    const checkVersion = async () => {
      if (disposed) return;
      controller?.abort();
      controller = new AbortController();

      try {
        const nextManifest = await fetchAppVersionManifest(controller.signal);
        if (disposed) return;

        if (isNewerAppVersion(nextManifest.version, CURRENT_APP_VERSION)) {
          setManifest((prev) => {
            if (prev?.version === nextManifest.version) return prev;
            setCountdown(DEFAULT_COUNTDOWN_SECONDS);
            setExpanded(false);
            setDeferredUntilNavigation(false);
            return nextManifest;
          });
        } else {
          setManifest(null);
          setExpanded(false);
          setDeferredUntilNavigation(false);
        }
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          console.warn('App version check failed', error);
        }
      }
    };

    const initialTimer = window.setTimeout(() => {
      void checkVersion();
    }, INITIAL_CHECK_DELAY_MS);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void checkVersion();
    }, POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkVersion();
    };

    window.addEventListener('focus', checkVersion);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      controller?.abort();
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener('focus', checkVersion);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const refreshApp = useCallback(async (force = false) => {
    if (!manifest || refreshStartedRef.current) return;
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
  }, [manifest, message]);

  useEffect(() => {
    if (!manifest || deferredUntilNavigation || refreshing) return undefined;
    const timer = window.setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deferredUntilNavigation, manifest, refreshing]);

  useEffect(() => {
    if (!manifest || deferredUntilNavigation || refreshing || countdown > 0) return;
    if (hasReachedRefreshAttemptLimit(manifest.version)) return;
    void refreshApp(false);
  }, [countdown, deferredUntilNavigation, manifest, refreshApp, refreshing]);

  useEffect(() => {
    const previous = previousLocationSignatureRef.current;
    previousLocationSignatureRef.current = locationSignature;
    if (!manifest || refreshing || previous === locationSignature) return;
    if (hasReachedRefreshAttemptLimit(manifest.version)) return;
    void refreshApp(false);
  }, [locationSignature, manifest, refreshApp, refreshing]);

  if (!manifest) return null;

  const countdownPercent = Math.max(0, Math.min(100, (countdown / DEFAULT_COUNTDOWN_SECONDS) * 100));
  const autoRefreshDisabled = hasReachedRefreshAttemptLimit(manifest.version);
  const statusText = deferredUntilNavigation
    ? 'در اولین جابجایی صفحه، بروزرسانی انجام می‌شود.'
    : autoRefreshDisabled
      ? 'بروزرسانی خودکار موقتا متوقف شد. می‌توانید دستی بروزرسانی کنید.'
      : `در حال بروزرسانی تا ${countdown} ثانیه دیگر`;

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
                نسخه {manifest.version} منتشر شد.
              </span>
              <Tag className="m-0 rounded-lg px-2 py-0 text-[10px] font-bold" color="processing">
                نسخه فعلی {CURRENT_APP_VERSION}
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
            {!deferredUntilNavigation && !autoRefreshDisabled && (
              <Progress
                percent={countdownPercent}
                showInfo={false}
                size="small"
                strokeColor="rgb(var(--brand-500-rgb))"
                trailColor="rgba(148, 163, 184, 0.22)"
                className="mt-1 max-w-[360px]"
              />
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            size="small"
            type="primary"
            icon={<ReloadOutlined spin={refreshing} />}
            loading={refreshing}
            onClick={() => void refreshApp(true)}
            className="!h-8 !rounded-xl !px-3 !text-xs !font-bold"
          >
            الان بروزرسانی کن
          </Button>
          <Button
            size="small"
            type="text"
            disabled={refreshing}
            onClick={() => {
              setDeferredUntilNavigation(true);
              setCountdown(DEFAULT_COUNTDOWN_SECONDS);
              message.info('بروزرسانی در اولین جابجایی صفحه انجام می‌شود.');
            }}
            className="!h-8 !rounded-xl !px-3 !text-xs !font-bold !text-gray-600 dark:!text-gray-200"
          >
            بعدا
          </Button>
          {visibleChanges.length > 0 && (
            <Button
              size="small"
              type="text"
              icon={expanded ? <UpOutlined /> : <DownOutlined />}
              onClick={() => setExpanded((prev) => !prev)}
              className="!h-8 !rounded-xl !px-3 !text-xs !font-bold !text-leather-600 dark:!text-leather-300"
            >
              تغییرات این نسخه
            </Button>
          )}
        </div>
      </div>

      {expanded && visibleChanges.length > 0 && (
        <div className="mx-auto mt-2 max-w-[1320px] rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <ul className="m-0 grid list-none gap-1 p-0 text-[11px] font-semibold text-gray-600 dark:text-gray-200 md:grid-cols-2 md:text-xs">
            {visibleChanges.map((change, index) => (
              <li key={`${change}:${index}`} className="flex min-w-0 items-start gap-2">
                <CheckCircleOutlined className="mt-0.5 shrink-0 text-[12px] text-emerald-500" />
                <span className="min-w-0">{change}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AppVersionUpdateBanner;
