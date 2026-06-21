import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Spin, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { supabasePublic } from '../supabaseClient';

const { Text, Title } = Typography;

const PaymentCallbackPage = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
  const [message, setMessage] = useState('در حال بررسی نتیجه پرداخت...');
  const [returnUrl, setReturnUrl] = useState('/tazesystem');

  const params = useMemo(() => new URLSearchParams(window.location.search), []);

  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      try {
        const { data, error } = await supabasePublic.functions.invoke('payment-gateway', {
          body: {
            action: 'verify_callback',
            tx: params.get('tx') || '',
            authority: params.get('Authority') || params.get('authority') || '',
            status: params.get('Status') || params.get('status') || '',
          },
        });
        if (cancelled) return;
        const nextReturnUrl = String(data?.return_url || '/tazesystem').trim() || '/tazesystem';
        setReturnUrl(nextReturnUrl);
        if (error || data?.success === false) {
          setStatus('failed');
          setMessage(String(data?.message || 'پرداخت ناموفق بود یا تأیید نشد.'));
          return;
        }
        setStatus('success');
        setMessage('پرداخت با موفقیت تأیید و ثبت شد.');
        window.setTimeout(() => {
          window.location.replace(nextReturnUrl);
        }, 1200);
      } catch (err: any) {
        if (cancelled) return;
        setStatus('failed');
        setMessage(String(err?.message || 'بررسی پرداخت ناموفق بود.'));
      }
    };

    void verify();
    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <div dir="rtl" className="min-h-screen bg-zinc-50 px-4 py-12 font-[Vazirmatn]">
      <Card className="mx-auto max-w-md rounded-2xl border-0 shadow-sm">
        <div className="flex flex-col items-center text-center">
          {status === 'loading' ? (
            <Spin size="large" />
          ) : status === 'success' ? (
            <CheckCircleOutlined className="text-5xl text-green-600" />
          ) : (
            <CloseCircleOutlined className="text-5xl text-red-600" />
          )}
          <Title level={4} className="!mt-5 !mb-2">
            نتیجه پرداخت
          </Title>
          <Text className="leading-7 text-zinc-600">{message}</Text>
          {status === 'failed' ? (
            <Alert
              type="warning"
              showIcon
              className="mt-5 w-full text-right"
              message="اگر مبلغ از حساب شما کم شده، وضعیت نهایی از طریق پیگیری تراکنش بررسی می‌شود."
            />
          ) : null}
          <Button
            type="primary"
            className="mt-6"
            onClick={() => window.location.replace(returnUrl)}
          >
            بازگشت
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default PaymentCallbackPage;
