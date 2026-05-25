import { useEffect, useMemo, useState } from 'react';
import App from 'antd/es/app';
import { setUiNotificationOverlayItems } from '../utils/uiNotificationOverlayStore';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DISMISS_KEY = 'tazesystem-pwa-install-dismissed-v1';
const OVERLAY_SOURCE = 'pwa_install';
const DISMISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const isMobileUserAgent = () => {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod/i.test(String(navigator.userAgent || '').toLowerCase());
};

const isIosUserAgent = () => {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(String(navigator.userAgent || '').toLowerCase());
};

const isStandaloneMode = () => {
  if (typeof window === 'undefined') return false;
  const byMedia = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const byNavigator = Boolean((window.navigator as any)?.standalone);
  return Boolean(byMedia || byNavigator);
};

const readDismissed = () => {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
};

const writeDismissed = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // ignore localStorage issues
  }
};

const PwaInstallPrompt = () => {
  const { message } = App.useApp();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);
  const [isStandalone, setIsStandalone] = useState<boolean>(isStandaloneMode);

  const isMobile = useMemo(() => isMobileUserAgent(), []);
  const isIos = useMemo(() => isIosUserAgent(), []);

  const shouldShow = isMobile && !isStandalone && !dismissed;

  const dismissPrompt = () => {
    setDismissed(true);
    writeDismissed();
    setUiNotificationOverlayItems([], OVERLAY_SOURCE);
  };

  const handleOpenInstall = async () => {
    if (isIos) {
      message.info('برای نصب، در Safari روی Share بزنید و Add to Home Screen را انتخاب کنید.');
      return;
    }

    if (!deferredPrompt) {
      message.info('برای نصب اپ از منوی مرورگر گزینه Install app یا Add to Home Screen را بزنید.');
      return;
    }

    try {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result?.outcome === 'accepted') {
        dismissPrompt();
      }
    } finally {
      setDeferredPrompt(null);
    }
  };

  useEffect(() => {
    const updateStandalone = () => setIsStandalone(isStandaloneMode());
    updateStandalone();

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      dismissPrompt();
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      setUiNotificationOverlayItems([], OVERLAY_SOURCE);
    };
  }, []);

  useEffect(() => {
    if (!shouldShow) {
      setUiNotificationOverlayItems([], OVERLAY_SOURCE);
      return;
    }

    setUiNotificationOverlayItems([
      {
        id: 'pwa-install-mobile',
        kind: 'assistant',
        kindLabel: 'نصب اپ',
        title: isIos ? 'نسخه نصب‌شده TazeSystem را فعال کن' : 'اپ TazeSystem را نصب کن',
        body: isIos
          ? 'برای نصب: Safari > Share > Add to Home Screen'
          : (deferredPrompt
            ? 'برای نصب سریع روی این اعلان بزن.'
            : 'از منوی مرورگر گزینه Install app یا Add to Home Screen را بزن.'),
        createdAt: new Date().toISOString(),
        hasAttachments: false,
        onOpen: () => {
          void handleOpenInstall();
        },
        onDismiss: dismissPrompt,
      },
    ], OVERLAY_SOURCE);
  }, [deferredPrompt, isIos, shouldShow]);

  return null;
};

export default PwaInstallPrompt;
