import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, App, Badge, Button, Card, Col, Empty, InputNumber, List, Modal, Progress, Row, Skeleton,
  Space, Statistic, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  AppstoreOutlined, BulbOutlined, CloudOutlined, CreditCardOutlined, DatabaseOutlined,
  InstagramOutlined, PlusOutlined, RocketOutlined, ShoppingCartOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

const { Text, Title } = Typography;

const formatIrt = (value: unknown) => `${Math.round(Number(value || 0)).toLocaleString('fa-IR')} تومان`;
const titleForHistory = (item: any) => item?.title || 'تغییر حساب';

const AccountStatusTab: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any | null>(null);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [walletAction, setWalletAction] = useState<'topup' | 'ai_transfer' | null>(null);
  const [walletAmount, setWalletAmount] = useState<number | null>(null);
  const [walletActionLoading, setWalletActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accountResult, catalogResult] = await Promise.all([
        supabase.rpc('get_current_saas_account_overview'),
        supabase.rpc('get_current_saas_store_catalog'),
      ]);
      if (accountResult.error) throw accountResult.error;
      if (catalogResult.error) throw catalogResult.error;
      setOverview(accountResult.data || null);
      setCatalog(Array.isArray(catalogResult.data) ? catalogResult.data : []);
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'دریافت وضعیت حساب ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { void load(); }, [load]);

  const cartItems = useMemo(
    () => catalog.filter((item) => cart[item.code]).map((item) => ({ ...item, quantity: cart[item.code] })),
    [cart, catalog],
  );
  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item.price_irt || 0) * Number(item.quantity || 1), 0),
    [cartItems],
  );

  const changeCart = (code: string, delta: number) => {
    setCart((current) => {
      const next = Math.max(0, Math.min(100, Number(current[code] || 0) + delta));
      if (!next) {
        const { [code]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [code]: next };
    });
  };

  const checkout = async () => {
    if (!cartItems.length) return;
    setCheckoutLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('payment-gateway', {
        body: {
          action: 'create_saas_account_order',
          items: cartItems.map((item) => ({ code: item.code, quantity: item.quantity })),
          return_origin: window.location.origin,
        },
      });
      if (error) throw error;
      if (!data?.success || !data?.payment_url) throw new Error(String(data?.message || 'ساخت پرداخت ناموفق بود.'));
      window.location.href = data.payment_url;
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'اتصال به درگاه پرداخت ناموفق بود.'));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const checkoutWithWallet = async () => {
    if (!cartItems.length) return;
    setCheckoutLoading(true);
    try {
      const { data: order, error: orderError } = await supabase.rpc('create_current_saas_order', {
        p_items: cartItems.map((item) => ({ code: item.code, quantity: item.quantity })),
      });
      if (orderError) throw orderError;
      const { error: paymentError } = await supabase.rpc('pay_current_saas_order_from_billing_wallet', { p_order_id: order?.order_id });
      if (paymentError) throw paymentError;
      message.success('سفارش از کیف پول سازمان پرداخت و فعال شد.');
      setCart({});
      await load();
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'پرداخت از کیف پول ناموفق بود.'));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const paySubscriptionInvoice = async (invoice: any, method: 'wallet' | 'online') => {
    const invoiceId = String(invoice?.id || '').trim();
    if (!invoiceId) return;
    setCheckoutLoading(true);
    try {
      if (method === 'wallet') {
        const { data, error } = await supabase.rpc('pay_current_saas_subscription_invoice_from_billing_wallet', { p_invoice_id: invoiceId });
        if (error) throw error;
        if (data?.success === false) throw new Error(data?.reason === 'billing_wallet_insufficient' ? 'موجودی کیف پول برای پرداخت این صورت‌حساب کافی نیست.' : 'پرداخت صورت‌حساب ناموفق بود.');
        message.success('صورت‌حساب اشتراک از کیف پول پرداخت و دوره تمدید شد.');
        await load();
        return;
      }
      const { data, error } = await supabase.functions.invoke('payment-gateway', {
        body: { action: 'create_saas_subscription_invoice_payment', invoice_id: invoiceId, return_origin: window.location.origin },
      });
      if (error) throw error;
      if (!data?.success || !data?.payment_url) throw new Error(String(data?.message || 'ساخت پرداخت ناموفق بود.'));
      window.location.href = data.payment_url;
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'پرداخت صورت‌حساب اشتراک ناموفق بود.'));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const submitWalletAction = async () => {
    const amountIrt = Math.round(Number(walletAmount || 0));
    if (!walletAction || !Number.isFinite(amountIrt) || amountIrt < 10000) {
      message.warning('حداقل مبلغ ۱۰٬۰۰۰ تومان است.');
      return;
    }
    setWalletActionLoading(true);
    try {
      if (walletAction === 'topup') {
        const { data, error } = await supabase.functions.invoke('payment-gateway', {
          body: { action: 'create_saas_billing_wallet_topup', amount_irt: amountIrt, return_origin: window.location.origin },
        });
        if (error) throw error;
        if (!data?.success || !data?.payment_url) throw new Error(String(data?.message || 'ساخت پرداخت ناموفق بود.'));
        window.location.href = data.payment_url;
        return;
      }
      const { error } = await supabase.rpc('transfer_current_billing_wallet_to_ai', { p_amount_irt: amountIrt });
      if (error) throw error;
      message.success('اعتبار به کیف پول هوش مصنوعی منتقل شد.');
      setWalletAction(null);
      setWalletAmount(null);
      await load();
    } catch (error) {
      message.error(toFaErrorMessage(error as any, walletAction === 'topup' ? 'شارژ کیف پول ناموفق بود.' : 'انتقال اعتبار ناموفق بود.'));
    } finally {
      setWalletActionLoading(false);
    }
  };

  if (loading) return <Skeleton active paragraph={{ rows: 10 }} />;
  if (!overview?.is_saas_org) {
    return <Empty description="این سازمان هنوز حساب اشتراکی تازه سیستم ندارد." />;
  }

  const plan = overview.plan || {};
  const quotas = overview.quotas || {};
  const access = overview.access || {};
  const usersAllowed = Number(quotas.users_included || 0) + Number(quotas.users_extra || 0);
  const userPercent = usersAllowed ? Math.min(100, Math.round((Number(quotas.users_used || 0) / usersAllowed) * 100)) : 0;
  const trialEndsAt = overview.organization?.trial_ends_at ? new Date(overview.organization.trial_ends_at).toLocaleDateString('fa-IR') : null;
  const enabledModules = Object.values(access.modules || {}).filter(Boolean).length;
  const enabledFeatures = Object.values(access.features || {}).filter(Boolean).length;
  const hasFullPlanAccess = access.full_access === true;
  const aiWallet = overview.ai_wallet || {};
  const billingWallet = overview.billing_wallet || {};
  const subscriptionInvoices = Array.isArray(overview.subscription_invoices) ? overview.subscription_invoices : [];
  const payableInvoices = subscriptionInvoices.filter((invoice: any) => ['issued', 'overdue'].includes(String(invoice?.status || '')));
  const aiRemaining = Math.max(0, Number(aiWallet.balance_irt || 0) + Number(aiWallet.included_quota_irt || 0) - Number(aiWallet.reserved_irt || 0));

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-3xl bg-gradient-to-l from-slate-950 via-slate-800 to-indigo-900 p-5 text-white shadow-lg md:p-7">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <Space size={8} wrap>
              <Tag color="geekblue" className="!m-0 !border-0 !px-3 !py-1">حساب تازه سیستم</Tag>
              {overview.organization?.is_demo ? <Tag color="purple" className="!m-0 !border-0 !px-3 !py-1">نسخه آزمایشی</Tag> : null}
              <Tag color={overview.organization?.status === 'active' ? 'green' : 'blue'} className="!m-0 !border-0 !px-3 !py-1">{overview.organization?.status === 'active' ? 'فعال' : 'در حال استفاده'}</Tag>
            </Space>
            <Title level={3} className="!mb-1 !mt-4 !text-white">{plan.title || 'پلن انتخاب‌نشده'}</Title>
            <Text className="!text-slate-300">مدیریت متمرکز دسترسی‌ها، اعتبارها و خریدهای سازمان</Text>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-right backdrop-blur">
            <div className="text-xs text-slate-300">{trialEndsAt ? 'پایان دوره آزمایشی' : 'هزینه ماهانه پلن'}</div>
            <div className="mt-1 text-lg font-black">{trialEndsAt || formatIrt(plan.price_monthly)}</div>
          </div>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}><Card className="h-full rounded-2xl"><Statistic title="کاربران فعال" value={Number(quotas.users_used || 0)} suffix={`/ ${usersAllowed || '—'}`} prefix={<TeamOutlined className="text-indigo-600" />} /><Progress className="mt-3" percent={userPercent} showInfo={false} /></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card className="h-full rounded-2xl"><Statistic title="فضای تخصیص‌یافته" value={Number(quotas.storage_gb || 0)} suffix="GB" prefix={<CloudOutlined className="text-sky-600" />} /><Text type="secondary" className="text-xs">مصرف فضای فایل به‌زودی به همین کارت افزوده می‌شود.</Text></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card className="h-full rounded-2xl"><Statistic title="اعتبار هوش مصنوعی" value={aiRemaining} formatter={(value) => `${Number(value).toLocaleString('fa-IR')} تومان`} prefix={<BulbOutlined className="text-violet-600" />} /><div className="mt-2 flex items-center justify-between"><Tag color={aiWallet.status === 'active' || !aiWallet.status ? 'green' : 'red'}>{aiWallet.status === 'blocked' ? 'مسدود' : 'فعال'}</Tag><Button size="small" type="link" onClick={() => { setWalletAmount(null); setWalletAction('ai_transfer'); }}>از کیف پول</Button></div></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card className="h-full rounded-2xl"><Statistic title="زمان‌بندی خودکار" value={Number(quotas.scheduled_runs || 0)} suffix="فعال" prefix={<RocketOutlined className="text-orange-600" />} /><Text type="secondary" className="mt-2 block text-xs">گردش‌کار زمان‌دار، ارسال برنامه حضور و گزارش‌ها؛ بدون محدودیت مصنوعیِ فاصلهٔ اجرا.</Text></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card className="h-full rounded-2xl"><Statistic title="کیف پول سازمان" value={Number(billingWallet.balance_irt || 0)} formatter={(value) => `${Number(value).toLocaleString('fa-IR')} تومان`} prefix={<CreditCardOutlined className="text-emerald-600" />} /><Button className="mt-2" size="small" type="link" onClick={() => { setWalletAmount(null); setWalletAction('topup'); }}>شارژ دلخواه</Button></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card className="h-full rounded-2xl"><Statistic title="حساب اینستاگرام" value={Number(quotas.instagram_accounts_used || 0)} suffix={`/ ${Number(quotas.instagram_accounts || 0) || '—'}`} prefix={<InstagramOutlined className="text-pink-600" />} /><Text type="secondary" className="text-xs">سقف اتصال از بسته و خریدهای شما محاسبه می‌شود.</Text></Card></Col>
      </Row>

      {payableInvoices.length > 0 && <Card className="rounded-2xl border-amber-300" title="تمدیدهای در انتظار پرداخت">
        <Alert className="mb-4" type={payableInvoices.some((invoice: any) => invoice.status === 'overdue') ? 'error' : 'warning'} showIcon message={payableInvoices.some((invoice: any) => invoice.status === 'overdue') ? 'مهلت تمدید پایان یافته است؛ برای بازگشت کامل دسترسی، صورت‌حساب را پرداخت کنید.' : 'برای تمدید خودکار ابتدا از کیف پول سازمان استفاده می‌شود؛ در صورت کمبود موجودی، از اینجا پرداخت کنید.'} />
        <div className="space-y-3">
          {payableInvoices.map((invoice: any) => <div key={String(invoice.id)} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between dark:border-slate-700">
            <div><Space wrap><Text strong>صورت‌حساب تمدید</Text><Tag color={invoice.status === 'overdue' ? 'red' : 'gold'}>{invoice.status === 'overdue' ? 'مهلت پایان یافته' : 'در انتظار پرداخت'}</Tag></Space><div className="mt-1 text-xs text-slate-500">سررسید: {invoice.due_at ? new Date(invoice.due_at).toLocaleDateString('fa-IR') : '—'} {invoice.grace_ends_at ? ` · پایان مهلت: ${new Date(invoice.grace_ends_at).toLocaleDateString('fa-IR')}` : ''}</div><div className="mt-1 text-lg font-black">{formatIrt(invoice.total_irt)}</div></div>
            <Space wrap><Button loading={checkoutLoading} disabled={Number(billingWallet.balance_irt || 0) < Number(invoice.total_irt || 0)} onClick={() => void paySubscriptionInvoice(invoice, 'wallet')}>پرداخت از کیف پول</Button><Button type="primary" loading={checkoutLoading} icon={<CreditCardOutlined />} onClick={() => void paySubscriptionInvoice(invoice, 'online')}>پرداخت آنلاین</Button></Space>
          </div>)}
        </div>
      </Card>}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Card title={<Space><AppstoreOutlined /> دسترسی‌های فعال</Space>} className="rounded-2xl h-full" extra={hasFullPlanAccess ? <Tag color="gold">دسترسی کامل</Tag> : <Badge count={enabledModules + enabledFeatures} showZero color="#4f46e5" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-indigo-50 p-4 dark:bg-slate-800"><div className="text-sm text-slate-500">ماژول‌های فعال</div><div className="mt-1 text-2xl font-black text-indigo-700 dark:text-indigo-300">{hasFullPlanAccess ? 'همه' : enabledModules}</div></div>
              <div className="rounded-xl bg-violet-50 p-4 dark:bg-slate-800"><div className="text-sm text-slate-500">امکانات فعال</div><div className="mt-1 text-2xl font-black text-violet-700 dark:text-violet-300">{hasFullPlanAccess ? 'همه' : enabledFeatures}</div></div>
            </div>
            <Alert className="mt-4" type="info" showIcon message="دسترسی نهایی از پلن، خریدهای موفق و تنظیمات سازمان محاسبه می‌شود." />
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title={<Space><DatabaseOutlined /> اعتبار پیامک</Space>} className="rounded-2xl h-full">
            <Statistic value={Number(quotas.sms_credit || 0)} suffix="پیامک" />
            <Text type="secondary" className="mt-2 block text-xs">اعتبار خریداری‌شده برای ارسال پیامک از اینجا نمایش داده می‌شود.</Text>
          </Card>
        </Col>
      </Row>

      <Card className="rounded-2xl" title={<Space><ShoppingCartOutlined /> فروشگاه حساب</Space>} extra={<Tooltip title="فقط اقلامی که مدیر تازه سیستم قیمت‌گذاری و فعال کرده است نمایش داده می‌شوند."><Text type="secondary" className="text-xs">پرداخت امن آنلاین</Text></Tooltip>}>
        {catalog.length === 0 ? <Empty description="در حال حاضر آیتم قابل خریدی برای این حساب فعال نشده است." /> : (
          <Row gutter={[14, 14]}>
            {catalog.map((item) => {
              const count = Number(cart[item.code] || 0);
              return <Col xs={24} md={12} xl={8} key={item.code}><Card size="small" className="h-full rounded-xl border-slate-200" title={item.title} extra={<Tag color="blue">{formatIrt(item.price_irt)}</Tag>}>
                <Text type="secondary" className="block min-h-10 text-xs">{item.description || 'افزودن به حساب سازمان'}</Text>
                <div className="mt-4 flex items-center justify-between gap-2"><Tag>{item.item_kind === 'plan' ? 'ارتقای پلن' : item.item_kind === 'quota' ? 'سهمیه' : 'دسترسی'}</Tag><Space size={4}>{count ? <Button size="small" onClick={() => changeCart(item.code, -1)}>−</Button> : null}{count ? <Text strong>{count}</Text> : null}<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => changeCart(item.code, 1)}>{count ? '' : 'افزودن'}</Button></Space></div>
              </Card></Col>;
            })}
          </Row>
        )}
        {cartItems.length ? <div className="sticky bottom-3 mt-5 flex flex-col gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 md:flex-row md:items-center md:justify-between dark:bg-slate-800"><div><Text type="secondary">{cartItems.length} قلم در سبد</Text><div className="text-xl font-black">{formatIrt(cartTotal)}</div></div><Space wrap><Button size="large" loading={checkoutLoading} disabled={Number(billingWallet.balance_irt || 0) < cartTotal} onClick={() => void checkoutWithWallet()}>پرداخت از کیف پول</Button><Button type="primary" size="large" icon={<CreditCardOutlined />} loading={checkoutLoading} onClick={() => void checkout()}>پرداخت آنلاین</Button></Space></div> : null}
      </Card>

      <Modal
        open={walletAction !== null}
        title={walletAction === 'topup' ? 'شارژ کیف پول سازمان' : 'انتقال به اعتبار هوش مصنوعی'}
        okText={walletAction === 'topup' ? 'ادامه و پرداخت' : 'انتقال اعتبار'}
        cancelText="انصراف"
        confirmLoading={walletActionLoading}
        onOk={() => void submitWalletAction()}
        onCancel={() => {
          if (walletActionLoading) return;
          setWalletAction(null);
          setWalletAmount(null);
        }}
      >
        <Text type="secondary" className="mb-4 block">
          {walletAction === 'topup'
            ? 'مبلغ دلخواه را وارد کنید. اعتبار کیف پول برای تمدید پلن، خرید امکانات و شارژها قابل استفاده است.'
            : 'این مبلغ از کیف پول سازمان کم و فقط برای مصرف هوش مصنوعی قابل استفاده می‌شود.'}
        </Text>
        <InputNumber
          className="w-full"
          min={10000}
          max={100000000}
          step={10000}
          value={walletAmount ?? undefined}
          onChange={(value) => setWalletAmount(typeof value === 'number' ? value : null)}
          placeholder="مبلغ به تومان؛ مثلاً ۵۰۰٬۰۰۰"
        />
        <Text type="secondary" className="mt-2 block text-xs">حداقل مبلغ شارژ ۱۰٬۰۰۰ تومان است.</Text>
      </Modal>

      <Card className="rounded-2xl" title="سوابق حساب">
        <Table size="small" pagination={false} rowKey={(_, index) => String(index)} dataSource={overview.history || []} columns={[
          { title: 'عنوان', render: (_, row) => titleForHistory(row) },
          { title: 'وضعیت', dataIndex: 'status', render: (status) => <Tag color={status === 'paid' ? 'green' : status === 'failed' ? 'red' : 'blue'}>{status === 'paid' ? 'پرداخت‌شده' : status === 'pending_payment' ? 'در انتظار پرداخت' : status || '—'}</Tag> },
          { title: 'مبلغ', dataIndex: 'amount_irt', render: (value) => formatIrt(value) },
          { title: 'تاریخ', dataIndex: 'created_at', render: (value) => value ? new Date(value).toLocaleDateString('fa-IR') : '—' },
        ]} locale={{ emptyText: 'هنوز سابقه‌ای ثبت نشده است.' }} />
      </Card>
    </div>
  );
};

export default AccountStatusTab;
