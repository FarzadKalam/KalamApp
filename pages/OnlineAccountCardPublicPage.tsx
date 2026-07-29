import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, ConfigProvider, Spin, Table, Tag, Typography, theme as antdTheme } from 'antd';
import { CreditCardOutlined, WalletOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { supabasePublic } from '../supabaseClient';
import { getPublicOnlineAccountCard } from '../utils/onlineAccountCard';
import { formatPersianPrice, safeJalaliFormat } from '../utils/persianNumberFormatter';
import { OPERATIONAL_FINANCIAL_ROW_TYPE_COLOR, OPERATIONAL_FINANCIAL_ROW_TYPE_LABEL } from '../utils/operationalFinancialOverview';
import { usePublicTimeTheme } from '../components/public/PublicThemeBoundary';

type CardRow = {
  key: string;
  row_type: string;
  source_label: string;
  date: string | null;
  debit: number;
  credit: number;
  balance: number;
  description?: string | null;
  status?: string | null;
  payment_type?: string | null;
};

const buildPublicTheme = (isDark: boolean) => ({
  algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: '#2563eb',
    colorBgBase: isDark ? '#0f172a' : '#ffffff',
    colorTextBase: isDark ? '#e2e8f0' : '#1e293b',
    fontFamily: 'Peyda, Tahoma, Arial, sans-serif',
  },
  components: {
    Table: {
      headerBg: isDark ? '#1e293b' : '#f8fafc',
      headerColor: isDark ? '#e2e8f0' : '#475569',
    },
  },
});

const OnlineAccountCardPublicPage = () => {
  const { token } = useParams<{ token: string }>();
  const isDark = usePublicTimeTheme();
  const [loading, setLoading] = useState(true);
  const [startingPayment, setStartingPayment] = useState(false);
  const [payload, setPayload] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!token) { setError('لینک کارت حساب معتبر نیست.'); setLoading(false); return; }
      try {
        const [cardResult, paymentResult] = await Promise.all([
          getPublicOnlineAccountCard(supabasePublic, token),
          supabasePublic.rpc('get_public_online_account_card_payment_state', { p_token: token }),
        ]);
        if (cancelled) return;
        if (cardResult?.error === 'not_found') throw new Error('کارت حساب پیدا نشد یا دیگر فعال نیست.');
        setPayload({ ...cardResult, payment_state: paymentResult.data || {} });
      } catch (loadError: any) {
        if (!cancelled) setError(String(loadError?.message || 'بارگذاری کارت حساب ناموفق بود.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [token]);

  const card = payload?.card || {};
  const company = payload?.company || {};
  const rows = (Array.isArray(payload?.rows) ? payload.rows : []) as CardRow[];
  const summary = payload?.summary || {};
  const paymentState = payload?.payment_state || {};
  const currencyLabel = String(company?.currency_label || 'ریال');
  const payableAmount = Math.max(0, Number(paymentState?.amount || 0));
  const canPay = card?.entity_type === 'customer' && paymentState?.available === true && payableAmount > 0;
  const publicTheme = useMemo(() => buildPublicTheme(isDark), [isDark]);

  const columns = useMemo(() => [
    {
      title: 'نوع',
      dataIndex: 'row_type',
      width: 115,
      render: (value: string) => <Tag color={OPERATIONAL_FINANCIAL_ROW_TYPE_COLOR[value as keyof typeof OPERATIONAL_FINANCIAL_ROW_TYPE_COLOR] || 'default'}>{OPERATIONAL_FINANCIAL_ROW_TYPE_LABEL[value as keyof typeof OPERATIONAL_FINANCIAL_ROW_TYPE_LABEL] || value || '—'}</Tag>,
    },
    { title: 'منبع', dataIndex: 'source_label', width: 170, render: (value: string) => value || '—' },
    { title: 'تاریخ', dataIndex: 'date', width: 120, render: (value: string) => value ? safeJalaliFormat(value, 'YYYY/MM/DD') : '—' },
    { title: 'بدهکار', dataIndex: 'debit', align: 'right' as const, width: 145, render: (value: number) => <span className="persian-number">{formatPersianPrice(Number(value || 0))}</span> },
    { title: 'بستانکار', dataIndex: 'credit', align: 'right' as const, width: 145, render: (value: number) => <span className="persian-number">{formatPersianPrice(Number(value || 0))}</span> },
    { title: 'مانده', dataIndex: 'balance', align: 'right' as const, width: 165, render: (value: number) => <span className="persian-number font-bold">{formatPersianPrice(Math.abs(Number(value || 0)))}</span> },
    { title: 'توضیحات', dataIndex: 'description', width: 240, render: (value: string) => value || '—' },
  ], []);

  const startPayment = async () => {
    if (!token || !canPay) return;
    setStartingPayment(true);
    try {
      const { data, error: invokeError } = await supabasePublic.functions.invoke('payment-gateway', {
        body: { action: 'create_account_card_payment', account_card_token: token, return_origin: window.location.origin },
      });
      if (invokeError || data?.success === false) throw new Error(String(data?.message || 'شروع پرداخت آنلاین ناموفق بود.'));
      const url = String(data?.payment_url || data?.start_url || '').trim();
      if (!url) throw new Error('آدرس پرداخت از درگاه دریافت نشد.');
      window.location.assign(url);
    } catch (paymentError: any) {
      setError(String(paymentError?.message || 'شروع پرداخت آنلاین ناموفق بود.'));
    } finally {
      setStartingPayment(false);
    }
  };

  if (loading) return <ConfigProvider direction="rtl" theme={publicTheme}><div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950"><Spin size="large" /></div></ConfigProvider>;
  if (error && !payload) return <ConfigProvider direction="rtl" theme={publicTheme}><div dir="rtl" className="mx-auto mt-16 max-w-lg px-4"><Alert type="error" showIcon message="کارت حساب در دسترس نیست" description={error} /></div></ConfigProvider>;

  const finalBalance = Number(summary?.final_balance || 0);
  return (
    <ConfigProvider direction="rtl" theme={publicTheme}>
      <main dir="rtl" className="min-h-screen bg-slate-100 px-3 py-4 text-slate-800 dark:bg-slate-950 dark:text-slate-100 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-7xl">
        {error ? <Alert className="mb-3" type="error" showIcon message={error} /> : null}
        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/85 shadow-[0_26px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95">
          <header className="relative overflow-hidden bg-gradient-to-br from-[rgb(var(--brand-800-rgb,30,58,138))] via-[rgb(var(--brand-600-rgb,37,99,235))] to-[rgb(var(--brand-400-rgb,96,165,250))] px-5 py-7 text-white sm:px-10 sm:py-10">
            <div className="text-sm font-semibold text-white/75">{company?.trade_name || company?.company_name || 'سازمان'}</div>
            <Typography.Title level={1} className="!mb-0 !mt-2 !text-2xl !font-black !text-white sm:!text-4xl">{card?.title || 'کارت حساب آنلاین'}</Typography.Title>
            <div className="mt-3 text-base text-white/90">{card?.entity_name || 'طرف حساب'}</div>
          </header>
          <div className="p-4 sm:p-8">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><div className="text-xs text-slate-500 dark:text-slate-400">جمع بدهکار</div><div className="mt-1 text-lg font-black persian-number">{formatPersianPrice(Number(summary?.total_debit || 0))} {currencyLabel}</div></div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><div className="text-xs text-slate-500 dark:text-slate-400">جمع بستانکار</div><div className="mt-1 text-lg font-black persian-number">{formatPersianPrice(Number(summary?.total_credit || 0))} {currencyLabel}</div></div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><div className="text-xs text-slate-500 dark:text-slate-400">مانده حساب</div><div className="mt-1 text-lg font-black persian-number">{formatPersianPrice(Math.abs(finalBalance))} {finalBalance >= 0 ? 'بدهکار' : 'بستانکار'}</div></div>
            </div>
            <section className="mt-6">
              <h2 className="mb-3 text-lg font-black">سوابق مالی</h2>
              <Table<CardRow>
                rowKey="key"
                className="custom-erp-table"
                dataSource={rows}
                columns={columns as any}
                pagination={{ pageSize: 10, showSizeChanger: false }}
                scroll={{ x: 1100 }}
                locale={{ emptyText: 'سابقه مالی قابل نمایشی وجود ندارد.' }}
                summary={() => (
                  <Table.Summary fixed>
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={3}><span className="font-bold">جمع کل</span></Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="right"><span className="persian-number font-bold">{formatPersianPrice(Number(summary?.total_debit || 0))}</span></Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right"><span className="persian-number font-bold">{formatPersianPrice(Number(summary?.total_credit || 0))}</span></Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="right"><span className="persian-number font-bold">{formatPersianPrice(Math.abs(finalBalance))}</span></Table.Summary.Cell>
                      <Table.Summary.Cell index={6} />
                    </Table.Summary.Row>
                  </Table.Summary>
                )}
              />
            </section>
          </div>
        </section>
        </div>
        {canPay ? <div className="fixed inset-x-0 bottom-0 z-[1000] border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-12px_32px_rgba(15,23,42,.14)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3"><div><div className="text-xs text-slate-500 dark:text-slate-400">مبلغ قابل پرداخت</div><div className="text-lg font-black persian-number">{formatPersianPrice(payableAmount)} {currencyLabel}</div></div><Button type="primary" size="large" icon={<CreditCardOutlined />} loading={startingPayment} onClick={() => void startPayment()}><WalletOutlined /> پرداخت سریع</Button></div></div> : null}
      </main>
    </ConfigProvider>
  );
};

export default OnlineAccountCardPublicPage;
