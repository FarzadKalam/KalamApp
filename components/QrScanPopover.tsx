import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Popover, Input, Button } from 'antd';
import type { ButtonProps } from 'antd';
import { QrcodeOutlined } from '@ant-design/icons';
import { Html5Qrcode } from 'html5-qrcode';

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
  const mergedClassName = [buttonProps?.className, buttonClassName].filter(Boolean).join(' ');
  const scannerId = useMemo(() => `qr-reader-${Math.random().toString(36).slice(2)}`, []);
  const qrRef = useRef<Html5Qrcode | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!value.trim()) return;
    const parsed = parseQr(value);
    onScan(parsed);
    setValue('');
    setOpen(false);
  };

  const stopScanner = async () => {
    if (!qrRef.current) return;
    try {
      const isScanning = qrRef.current.isScanning;
      if (isScanning) {
        await qrRef.current.stop();
      }
      await qrRef.current.clear();
    } catch {
      // ignore
    } finally {
      qrRef.current = null;
    }
  };

  useEffect(() => {
    if (!open) {
      stopScanner();
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
            const parsed = parseQr(decodedText);
            onScan(parsed);
            setOpen(false);
          },
          () => undefined
        );
      } catch (err: any) {
        if (cancelled) return;
        setCameraError(err?.message || 'دسترسی به دوربین ممکن نیست');
      }
    };

    const timer = window.setTimeout(startScanner, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stopScanner();
    };
  }, [open, scannerId, onScan]);

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      getPopupContainer={() => document.body}
      overlayStyle={{ zIndex: 6000 }}
      content={
        <div className="w-72">
          <div className="rounded-lg overflow-hidden border border-gray-200 bg-black/90">
            <div id={scannerId} className="w-full h-56" />
          </div>
          {cameraError && (
            <div className="mt-2 text-xs text-red-500">{cameraError}</div>
          )}
          <div className="mt-3">
            <Input
              placeholder="اگر لازم شد، کد را دستی وارد کنید..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onPressEnter={handleSubmit}
            />
            <div className="mt-2 flex justify-end">
              <Button size="small" type="primary" onClick={handleSubmit}>تایید</Button>
            </div>
          </div>
        </div>
      }
    >
      <Button icon={<QrcodeOutlined />} {...buttonProps} className={mergedClassName}>
        {label}
      </Button>
    </Popover>
  );
};

export default QrScanPopover;