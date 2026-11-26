import React, { useEffect, useState } from 'react';
import { BellOutlined, LoadingOutlined, StopOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { appFeedback } from '../../utils/appFeedback';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { disableWebPush, enableWebPush, getWebPushState, type WebPushState } from '../../utils/webPush';

const labelByState: Record<WebPushState, string> = {
  unsupported: 'این مرورگر از اعلان روی دستگاه پشتیبانی نمی‌کند',
  unconfigured: 'ارسال اعلان روی دستگاه هنوز آماده نشده است',
  denied: 'مجوز اعلان در تنظیمات مرورگر مسدود شده است',
  prompt: 'فعال‌کردن اعلان روی دستگاه',
  enabled: 'غیرفعال‌کردن اعلان روی این دستگاه',
  disabled: 'فعال‌کردن اعلان روی دستگاه',
};

const WebPushPermissionControl: React.FC = () => {
  const [state, setState] = useState<WebPushState>('unsupported');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getWebPushState().then((next) => { if (!cancelled) setState(next); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const actionable = state === 'prompt' || state === 'disabled' || state === 'enabled';
  const toggle = async () => {
    if (!actionable || loading) return;
    setLoading(true);
    try {
      const next = state === 'enabled' ? await disableWebPush() : await enableWebPush();
      setState(next as WebPushState);
      appFeedback.success(next === 'enabled' ? 'اعلان روی این دستگاه فعال شد.' : 'اعلان روی این دستگاه غیرفعال شد.');
    } catch (error) {
      appFeedback.error({
        title: toFaErrorMessage(error, 'تغییر وضعیت اعلان روی این دستگاه انجام نشد.'),
        description: 'دوباره تلاش کنید یا تنظیمات اعلان مرورگر را بررسی کنید.',
      });
      setState(await getWebPushState());
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip title={labelByState[state]}>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!actionable || loading}
        className="flex h-11 w-11 items-center justify-center rounded-full transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-45 md:h-8 md:w-8"
        aria-label={labelByState[state]}
        aria-pressed={state === 'enabled'}
      >
        {loading ? <LoadingOutlined /> : state === 'denied' ? <StopOutlined /> : <BellOutlined />}
      </button>
    </Tooltip>
  );
};

export default WebPushPermissionControl;
