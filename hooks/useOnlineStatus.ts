import { useCallback, useEffect, useRef, useState } from 'react';
import { SUPABASE_URL } from '../supabaseClient';

const PROBE_TIMEOUT_MS = 5000;
const OFFLINE_RECHECK_INTERVAL_MS = 15000;

async function probeConnectivity(): Promise<boolean> {
  try {
    await fetch(SUPABASE_URL, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

export interface OnlineStatusResult {
  isOnline: boolean;
  isChecking: boolean;
  retry: () => void;
}

export function useOnlineStatus(): OnlineStatusResult {
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);
  const [isChecking, setIsChecking] = useState(false);
  const probeInFlightRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runProbe = useCallback(async () => {
    if (probeInFlightRef.current) return;
    probeInFlightRef.current = true;
    setIsChecking(true);
    try {
      const ok = await probeConnectivity();
      setIsOnline(ok);
    } finally {
      probeInFlightRef.current = false;
      setIsChecking(false);
    }
  }, []);

  const retry = useCallback(() => {
    void runProbe();
  }, [runProbe]);

  // مدیریت interval بررسی مجدد بر اساس وضعیت اتصال
  useEffect(() => {
    if (isOnline) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } else {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => void runProbe(), OFFLINE_RECHECK_INTERVAL_MS);
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isOnline, runProbe]);

  // گوش دادن به رویدادهای مرورگر
  useEffect(() => {
    const handleOffline = () => setIsOnline(false);
    const handleOnline = () => void runProbe();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [runProbe]);

  return { isOnline, isChecking, retry };
}
