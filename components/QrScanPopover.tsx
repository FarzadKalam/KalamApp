import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Popover, Input, Button } from 'antd';
import type { ButtonProps } from 'antd';
import { QrcodeOutlined } from '@ant-design/icons';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../supabaseClient';
import { BRANDING_UPDATED_EVENT } from '../theme/brandTheme';

interface QrScanResult {
  raw: string;
  moduleId?: string;
  recordId?: string;
}

interface QrScanPopoverProps {
  onScan: (result: QrScanResult) => void;
  label?: string;
  buttonClassName?: string;
  buttonProps?: ButtonProps;
}

let cachedQrScanEnabled: boolean | null = null;
let qrScanEnabledPromise: Promise<boolean> | null = null;

const loadQrScanEnabled = async (): Promise<boolean> => {
  if (cachedQrScanEnabled !== null) return cachedQrScanEnabled;
  if (!qrScanEnabledPromise) {
    qrScanEnabledPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('company_settings')
          .select('qr_scan_enabled')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          console.warn('Could not read qr_scan_enabled from company settings', error);
          cachedQrScanEnabled = false;
          return false;
        }
        cachedQrScanEnabled = Boolean(data?.qr_scan_enabled);
        return cachedQrScanEnabled;
      } finally {
        qrScanEnabledPromise = null;
      }
    })();
  }
  return qrScanEnabledPromise || false;
};

const parseQr = (raw: string): QrScanResult => {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed, window.location.origin);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return { raw: trimmed, moduleId: parts[0], recordId: parts[1] };
    }
  } catch {
    // fallthrough
  }
  return { raw: trimmed };
};

const QrScanPopover: React.FC<QrScanPopoverProps> = ({ onScan, label = 'اسکن', buttonClassName, buttonProps }) => {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(cachedQrScanEnabled);
  const mergedClassName = [buttonProps?.className, buttonClassName].filter(Boolean).join(' ');
  const scannerId = useMemo(() => `qr-reader-${Math.random().toString(36).slice(2)}`, []);
  const qrRef = useRef<Html5Qrcode | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!value.trim()) return;
    onScan(parseQr(value));
    setValue('');
    setOpen(false);
  };

  const stopScanner = async () => {
    if (!qrRef.current) return;
    try {
      if (qrRef.current.isScanning) {
        await qrRef.current.stop();
      }
      await qrRef.current.clear();
    } catch {
      // ignore cleanup failures
    } finally {
      qrRef.current = null;
    }
  };

  useEffect(() => {
    let mounted = true;
    const syncState = async () => {
      const nextEnabled = await loadQrScanEnabled();
      if (mounted) setEnabled(nextEnabled);
    };
    void syncState();

    const handleSettingsUpdate = () => {
      cachedQrScanEnabled = null;
      qrScanEnabledPromise = null;
      void syncState();
    };

    window.addEventListener(BRANDING_UPDATED_EVENT, handleSettingsUpdate);
    return () => {
      mounted = false;
      window.removeEventListener(BRANDING_UPDATED_EVENT, handleSettingsUpdate);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!open || !enabled) {
      void stopScanner();
      setCameraError(null);
      return;
    }

    let cancelled = false;
    const startScanner = async () => {
      try {
        const element = document.getElementById(scannerId);
        if (!element) return;
        const scanner = new Html5Qrcode(scannerId);
        qrRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            if (cancelled) return;
            onScan(parseQr(decodedText));
            setOpen(false);
          },
          () => undefined
        );
      } catch (error: any) {
        if (cancelled) return;
        setCameraError(error?.message || 'دسترسی به دوربین ممکن نیست');
      }
    };

    const timer = window.setTimeout(() => {
      void startScanner();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      void stopScanner();
    };
  }, [enabled, open, onScan, scannerId]);

  if (!enabled) return null;

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      getPopupContainer={(node) => node?.parentElement || document.body}
      overlayStyle={{ zIndex: 6000 }}
      content={(
        <div className="w-72">
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-black/90">
            <div id={scannerId} className="h-56 w-full" />
          </div>
          {cameraError ? (
            <div className="mt-2 text-xs text-red-500">{cameraError}</div>
          ) : null}
          <div className="mt-3">
            <Input
              placeholder="اگر لازم شد، کد را دستی وارد کنید..."
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onPressEnter={handleSubmit}
            />
            <div className="mt-2 flex justify-end">
              <Button size="small" type="primary" onClick={handleSubmit}>
                تایید
              </Button>
            </div>
          </div>
        </div>
      )}
    >
      <Button icon={<QrcodeOutlined />} {...buttonProps} className={mergedClassName}>
        {label}
      </Button>
    </Popover>
  );
};

export default QrScanPopover;
