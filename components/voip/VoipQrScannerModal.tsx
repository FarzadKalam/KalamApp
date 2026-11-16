import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Modal, Tabs, Button, Upload, Input, Alert, Space, Typography } from 'antd';
import type { UploadProps } from 'antd';
import { parseVoipQrConfig, type ParsedVoipConfig } from '../../utils/voipQr';

const { Text } = Typography;

interface VoipQrScannerModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (config: ParsedVoipConfig) => void;
}

type Html5QrcodeInstance = import('html5-qrcode').Html5Qrcode;

export const VoipQrScannerModal: React.FC<VoipQrScannerModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const {message}=App.useApp();
  const [activeTab, setActiveTab] = useState<'camera' | 'file' | 'text'>('camera');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualText, setManualText] = useState('');
  const [processing, setProcessing] = useState(false);
  const scannerId = useMemo(() => `voip-qr-reader-${Math.random().toString(36).slice(2, 9)}`, []);
  const qrRef = useRef<Html5QrcodeInstance | null>(null);

  const stopScanner = async () => {
    if (!qrRef.current) return;
    try {
      if (qrRef.current.isScanning) {
        await qrRef.current.stop();
      }
      await qrRef.current.clear();
    } catch {
      // ignore cleanup errors
    } finally {
      qrRef.current = null;
    }
  };

  const handleResult = (raw: string) => {
    const parsed = parseVoipQrConfig(raw);
    if (parsed.extension || parsed.password || parsed.serverUrl) {
      const summaryParts: string[] = [];
      if (parsed.extension) summaryParts.push(`داخلی: ${parsed.extension}`);
      if (parsed.serverUrl) summaryParts.push(`سرور: ${parsed.sipDomain || parsed.serverUrl}`);
      if (parsed.password) summaryParts.push('رمز عبور تنظیم شد');

      message.success(`اطلاعات با موفقیت دریافت شد (${summaryParts.join('، ')})`);
      onSuccess(parsed);
      onClose();
    } else {
      message.warning('کد QR خوانده شد اما اطلاعات معتبر داخلی یا سرور VoIP در آن یافت نشد.');
    }
  };

  // Start / stop camera when tab or modal state changes
  useEffect(() => {
    if (!open || activeTab !== 'camera') {
      void stopScanner();
      setCameraError(null);
      return;
    }

    let cancelled = false;
    const startScanner = async () => {
      try {
        const element = document.getElementById(scannerId);
        if (!element) return;
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        const scanner = new Html5Qrcode(scannerId);
        qrRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            if (cancelled) return;
            handleResult(decodedText);
          },
          () => undefined
        );
      } catch (err: any) {
        if (cancelled) return;
        setCameraError(err?.message || 'امکان دسترسی به دوربین وجود ندارد. از تب آپلود تصویر یا ورود مستقیم استفاده کنید.');
      }
    };

    const timer = window.setTimeout(() => {
      void startScanner();
    }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      void stopScanner();
    };
  }, [open, activeTab, scannerId]);

  // Handle image upload scanning
  const handleFileUpload: UploadProps['beforeUpload'] = async (file) => {
    setProcessing(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode(`temp-file-scanner-${Date.now()}`);
      try {
        const decoded = await scanner.scanFile(file, true);
        handleResult(decoded);
      } catch (scanErr: any) {
        message.error('بارکد QR در تصویر پیدا نشد. لطفاً تصویر واضح‌تری انتخاب کنید.');
      } finally {
        try {
          await scanner.clear();
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      message.error('خطا در پردازش تصویر: ' + (err?.message || 'ناشناخته'));
    } finally {
      setProcessing(false);
    }
    return false; // prevent automatic upload
  };

  const handleManualProcess = () => {
    if (!manualText.trim()) {
      message.warning('متن یا لینک پیکربندی را وارد کنید.');
      return;
    }
    handleResult(manualText.trim());
  };

  return (
    <Modal
      open={open}
      onCancel={() => {
        void stopScanner();
        onClose();
      }}
      title="اسکن و دریافت تنظیمات از کد QR تلفنچی / PortSIP"
      footer={null}
      destroyOnClose
      centered
      width={480}
    >
      <div className="space-y-4 pt-2">
        <Alert
          type="info"
          showIcon
          message="تنظیم خودکار خط داخلی"
          description="با اسکن کد QR ارائه‌شده توسط تلفنچی یا نرم‌افزار PortSIP، شماره داخلی، رمز عبور و آدرس اینترنتی سرور به صورت خودکار در فرم تکمیل خواهند شد."
        />

        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as any)}
          items={[
            {
              key: 'camera',
              label: 'اسکن با دوربین',
              children: (
                <div className="flex flex-col items-center justify-center p-2">
                  {cameraError ? (
                    <div className="w-full text-center p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs">
                      <p className="font-semibold mb-2">عدم دسترسی به دوربین</p>
                      <p>{cameraError}</p>
                      <Button
                        type="primary"
                        size="small"
                        className="mt-3"
                        onClick={() => setActiveTab('file')}
                      >
                        استفاده از آپلود عکس
                      </Button>
                    </div>
                  ) : (
                    <div className="w-full flex flex-col items-center">
                      <div
                        id={scannerId}
                        className="w-[260px] h-[260px] overflow-hidden rounded-2xl border-2 border-dashed border-sky-400 bg-slate-900"
                      />
                      <Text type="secondary" className="text-xs mt-3">
                        کد QR را روبروی دوربین بگیرید
                      </Text>
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'file',
              label: 'آپلود تصویر / اسکرین‌شات',
              children: (
                <div className="p-2">
                  <Upload.Dragger
                    accept="image/*"
                    beforeUpload={handleFileUpload}
                    showUploadList={false}
                    disabled={processing}
                    className="p-4"
                  >
                    <div className="space-y-2 text-center">
                      <div className="text-3xl text-sky-500">📷</div>
                      <p className="text-sm font-semibold">تصویر یا اسکرین‌شات کد QR را انتخاب یا رها کنید</p>
                      <p className="text-xs text-slate-400">پشتیبانی از فرمت‌های PNG، JPG و WEBP</p>
                    </div>
                  </Upload.Dragger>
                </div>
              ),
            },
            {
              key: 'text',
              label: 'ورود دستی متن یا لینک',
              children: (
                <div className="space-y-3 p-2">
                  <Input.TextArea
                    rows={4}
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    placeholder="متن JSON، لینک SIP (مثال: sip:101:pass@sip.telefonchy.com) یا متن دریافتی از تلفنچی را اینجا پیست کنید..."
                    dir="ltr"
                    className="font-mono text-xs"
                  />
                  <Button type="primary" block onClick={handleManualProcess}>
                    پردازش و استخراج اطلاعات
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </div>
    </Modal>
  );
};
