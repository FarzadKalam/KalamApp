import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, App, Badge, Button, Card, Col, Empty, Modal, Progress, Row, Skeleton, Drawer,
  Space, Statistic, Table, Tag, Tooltip, Typography, InputNumber, Select,
} from 'antd';
import {
  AppstoreOutlined, BulbOutlined, CloudOutlined, CreditCardOutlined, DatabaseOutlined,
  InstagramOutlined, PlusOutlined, RocketOutlined, ShoppingCartOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { SAAS_FEATURE_LABELS, SAAS_MODULE_LABELS } from '../../utils/saasOfferingCatalog';
import DemoDataCard from '../../components/saas/DemoDataCard';
import AccountPlanCards from '../../components/saas/AccountPlanCards';
import TazeSystemAttribution from '../../components/common/TazeSystemAttribution';
import PriceAmountInput from '../../components/PriceAmountInput';
import { CheckoutDiscounts, TERM_OPTIONS, planCheckoutTotal } from '../../utils/saasCheckoutPricing';

const { Text, Title } = Typography;

const formatIrt = (value: unknown) => `${Math.round(Number(value || 0)).toLocaleString('fa-IR')} تومان`;
const formatIrtCard = (value: unknown) => <span dir="ltr" className="inline-flex items-baseline gap-1"><span>{Math.round(Number(value || 0)).toLocaleString('fa-IR')}</span><span dir="rtl" className="text-sm font-normal">تومان</span></span>;
const titleForHistory = (item: any) => item?.title || 'تغییر حساب';
const invokeSaasPayment = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('payment-gateway', { body });
  if (error) {
    let payload: { message?: string } | null = null;
    try { payload = await error.context?.json(); } catch { /* پاسخ غیر JSON */ }
    throw new Error(payload?.message || toFaErrorMessage(error, 'اتصال به درگاه پرداخت ناموفق بود.'));
  }
  return data;
};

const AccountStatusTab: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any | null>(null);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [publicPlans, setPublicPlans] = useState<any[]>([]);
  const [planFeaturesError, setPlanFeaturesError] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [termMonths, setTermMonths] = useState(1);
  const [discounts, setDiscounts] = useState<CheckoutDiscounts>({ users: [], terms: [] });
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [editingOrder, setEditingOrder] = useState(false);
  const [orderItems, setOrderItems] = useState<{ code: string; quantity: number; term_months?: number }[]>([]);
  const [orderActionLoading, setOrderActionLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [walletAction, setWalletAction] = useState<'topup' | 'sms_topup' | 'ai_topup' | 'ai_transfer' | 'sms_transfer' | null>(null);
  const [smsWallet, setSmsWallet] = useState<any>({});
  const [storageUsage, setStorageUsage] = useState<any>({});
  const [walletAmount, setWalletAmount] = useState<number | null>(null);
  const [walletActionLoading, setWalletActionLoading] = useState(false);
  const [accessDrawer, setAccessDrawer] = useState<'modules' | 'features' | null>(null);
  const [, setClock] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accountResult, catalogResult, publicPlansResult, pendingOrdersResult, smsWalletResult, storageResult, discountsResult] = await Promise.all([
        supabase.rpc('get_current_saas_account_overview'),
        supabase.rpc('get_current_saas_store_catalog'),
        supabase.rpc('get_public_plans'),
        supabase.rpc('get_current_saas_pending_orders'),
        supabase.from('org_sms_wallets').select('balance_irt,included_quota_irt,reserved_irt,status').maybeSingle(),
        supabase.rpc('get_current_saas_storage_usage'),
        supabase.rpc('get_current_saas_checkout_discounts'),
      ]);
      if (accountResult.error) throw accountResult.error;
      if (catalogResult.error) throw catalogResult.error;
      if (pendingOrdersResult.error) throw pendingOrdersResult.error;
      setOverview(accountResult.data || null);
      setCatalog(Array.isArray(catalogResult.data) ? catalogResult.data : []);
      setPublicPlans(publicPlansResult.error ? [] : (Array.isArray(publicPlansResult.data) ? publicPlansResult.data : []));
      setPlanFeaturesError(Boolean(publicPlansResult.error));
      setPendingOrders(Array.isArray(pendingOrdersResult.data) ? pendingOrdersResult.data : []);
      setSmsWallet(smsWalletResult.data || {});
      setStorageUsage(storageResult.error ? {} : (storageResult.data || {}));
      setDiscounts(discountsResult.error ? { users: [], terms: [] } : {
        users: Array.isArray(discountsResult.data?.users) ? discountsResult.data.users : [],
        terms: Array.isArray(discountsResult.data?.terms) ? discountsResult.data.terms : [],
      });
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'دریافت وضعیت حساب ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const cartItems = useMemo(
    () => catalog.filter((item) => cart[item.code]).map((item) => ({ ...item, quantity: cart[item.code], ...(item.item_kind === 'plan' ? { term_months: termMonths } : {}) })),
    [cart, catalog, termMonths],
  );
  const planItems = useMemo(() => catalog.filter((item) => item.item_kind === 'plan'), [catalog]);
  const extraItems = useMemo(() => catalog.filter((item) => item.item_kind !== 'plan'), [catalog]);
  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => {
      if (item.item_kind !== 'plan') return sum + Number(item.price_irt || 0) * Number(item.quantity || 1);
      const publicPlan = publicPlans.find((plan) => plan.code === item.entitlement_code);
      return sum + planCheckoutTotal(Number(item.quantity), termMonths, Number(item.price_irt || 0), Number(publicPlan?.price_yearly || 0), discounts);
    }, 0),
    [cartItems, discounts, publicPlans, termMonths],
  );

  const changeCart = (code: string, delta: number) => {
    setCart((current) => {
      const minimum = code.startsWith('plan:') ? Math.max(3, Number(overview?.quotas?.users_used || 0)) : 1;
      const next = Math.max(0, Math.min(1000, Number(current[code] || 0) + delta));
      const quantity = next > 0 ? Math.max(minimum, next) : 0;
      if (!quantity) {
        const { [code]: _removed, ...rest } = current;
        return rest;
      }
      const otherItems = code.startsWith('plan:')
        ? Object.fromEntries(Object.entries(current).filter(([itemCode]) => !itemCode.startsWith('plan:')))
        : current;
      return { ...otherItems, [code]: quantity };
    });
  };

  const checkout = async () => {
    if (!cartItems.length) return;
    setCheckoutLoading(true);
    try {
      const data = await invokeSaasPayment({
        action: 'create_saas_account_order',
        items: cartItems.map((item) => ({ code: item.code, quantity: item.quantity, ...(item.item_kind === 'plan' ? { term_months: termMonths } : {}) })),
        return_origin: window.location.origin,
      });
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
        p_items: cartItems.map((item) => ({ code: item.code, quantity: item.quantity, ...(item.item_kind === 'plan' ? { term_months: termMonths } : {}) })),
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

  const checkoutPendingOrder = async (orderId: string) => {
    if (!orderId) return;
    setCheckoutLoading(true);
    try {
      const data = await invokeSaasPayment({ action: 'create_saas_account_order', order_id: orderId, return_origin: window.location.origin });
      if (!data?.success || !data?.payment_url) throw new Error(String(data?.message || 'ساخت پرداخت ناموفق بود.'));
      window.location.href = data.payment_url;
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'پرداخت سفارش آماده ناموفق بود.'));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const openOrder = (order: any) => {
    setSelectedOrder(order);
    setEditingOrder(false);
    setOrderItems((Array.isArray(order.items) ? order.items : []).map((item: any) => ({
      code: String(item.code), quantity: Number(item.purchase_quantity || item.quantity || 1),
      ...(item.item_kind === 'plan' ? { term_months: Number(item.metadata?.term_months || 1) } : {}),
    })));
  };

  const saveOrder = async () => {
    if (!selectedOrder || orderItems.length === 0) return;
    setOrderActionLoading(true);
    try {
      const { error } = await supabase.rpc('update_current_saas_pending_order', { p_order_id: selectedOrder.id, p_items: orderItems });
      if (error) throw error;
      setSelectedOrder(null);
      message.success('سفارش با قیمت روز دوباره محاسبه و ذخیره شد.');
      await load();
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'ویرایش سفارش ناموفق بود.'));
    } finally { setOrderActionLoading(false); }
  };

  const deleteOrder = async () => {
    if (!selectedOrder) return;
    setOrderActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('delete_current_saas_pending_order', { p_order_id: selectedOrder.id });
      if (error) throw error;
      if (!data) throw new Error('سفارش دیگر آماده حذف نیست.');
      setSelectedOrder(null);
      message.success('سفارش حذف شد.');
      await load();
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'حذف سفارش ناموفق بود.'));
    } finally { setOrderActionLoading(false); }
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
      const data = await invokeSaasPayment({ action: 'create_saas_subscription_invoice_payment', invoice_id: invoiceId, return_origin: window.location.origin });
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
      if (walletAction === 'topup' || walletAction === 'sms_topup' || walletAction === 'ai_topup') {
        const data = await invokeSaasPayment(walletAction === 'ai_topup'
          ? { action: 'create_ai_credit_topup', amount_irt: amountIrt, return_origin: window.location.origin, return_to_account: true }
          : { action: 'create_saas_billing_wallet_topup', amount_irt: amountIrt, wallet_target: walletAction === 'sms_topup' ? 'sms' : 'billing', return_origin: window.location.origin });
        if (!data?.success || !data?.payment_url) throw new Error(String(data?.message || 'ساخت پرداخت ناموفق بود.'));
        window.location.href = data.payment_url;
        return;
      }
      const { error } = await supabase.rpc(walletAction === 'sms_transfer' ? 'transfer_current_billing_wallet_to_sms' : 'transfer_current_billing_wallet_to_ai', { p_amount_irt: amountIrt });
      if (error) throw error;
      message.success(walletAction === 'sms_transfer' ? 'اعتبار به کیف پول پیامک منتقل شد.' : 'اعتبار به کیف پول هوش مصنوعی منتقل شد.');
      setWalletAction(null);
      setWalletAmount(null);
      await load();
    } catch (error) {
      message.error(toFaErrorMessage(error as any, walletAction === 'ai_topup' ? 'شارژ مستقیم هوش مصنوعی ناموفق بود.' : walletAction === 'topup' || walletAction === 'sms_topup' ? 'شارژ کیف پول ناموفق بود.' : 'انتقال اعتبار ناموفق بود.'));
    } finally {
      setWalletActionLoading(false);
    }
  };

  if (loading && !overview) return <Skeleton active paragraph={{ rows: 10 }} />;
  if (!overview?.is_saas_org) {
    return <Empty description="این سازمان هنوز حساب اشتراکی تازه سیستم ندارد." />;
  }

  const plan = overview.plan || {};
  const quotas = overview.quotas || {};
  const access = overview.access || {};
  const hasFullPlanAccess = access.full_access === true;
  const isReadOnly = !hasFullPlanAccess && (Boolean(overview.organization?.billing_readonly)
    || (Boolean(overview.organization?.is_demo) && Boolean(overview.organization?.trial_ends_at)
      && new Date(overview.organization.trial_ends_at).getTime() < Date.now()));
  const minimumUsers = Math.max(3, Number(plan.minimum_users || quotas.users_included || 3));
  const usersAllowed = hasFullPlanAccess ? null : Math.max(minimumUsers, Number(quotas.users_included || 0) + Number(quotas.users_extra || 0));
  const monthlyTotal = Number(quotas.monthly_total_irt || 0);
  const userPercent = usersAllowed ? Math.min(100, Math.round((Number(quotas.users_used || 0) / usersAllowed) * 100)) : 0;
  const trialEndsAt = overview.organization?.trial_ends_at ? new Date(overview.organization.trial_ends_at).toLocaleDateString('fa-IR') : null;
  const trialRemainingDays = overview.organization?.trial_ends_at ? Math.max(0, Math.ceil((new Date(overview.organization.trial_ends_at).getTime() - Date.now()) / 86400000)) : null;
  const enabledModules = Object.values(access.modules || {}).filter(Boolean).length;
  const enabledFeatures = Object.entries(access.features || {}).filter(([code, enabled]) => code !== 'support_tickets' && enabled).length;
  const aiWallet = overview.ai_wallet || {};
  const billingWallet = overview.billing_wallet || {};
  const subscriptionInvoices = Array.isArray(overview.subscription_invoices) ? overview.subscription_invoices : [];
  const payableInvoices = subscriptionInvoices.filter((invoice: any) => ['issued', 'overdue'].includes(String(invoice?.status || '')));
  const aiRemaining = Math.max(0, Number(aiWallet.balance_irt || 0) + Number(aiWallet.included_quota_irt || 0) - Number(aiWallet.reserved_irt || 0));
  const smsRemaining = Math.max(0, Number(smsWallet.balance_irt || 0) + Number(smsWallet.included_quota_irt || 0) - Number(smsWallet.reserved_irt || 0));
  const aiWalletTarget = Math.max(aiRemaining, Number(aiWallet.included_quota_irt || 0), 100000);
  const smsWalletTarget = Math.max(smsRemaining, Number(smsWallet.included_quota_irt || 0), 100000);
  const walletPercent = (remaining: number, target: number) => Math.min(100, Math.max(0, Math.round((remaining / Math.max(target, 1)) * 100)));
  const storageLimitGb = Math.max(0, Number(quotas.storage_gb || 0));
  const storageUsedGb = Math.max(0, Number(storageUsage.gb || 0));
  const storagePercent = storageLimitGb > 0 ? Math.min(100, Math.round((storageUsedGb / storageLimitGb) * 100)) : 0;

  return (
    <div className="space-y-6 pb-8">
      <TazeSystemAttribution variant="account" />
      <DemoDataCard />
      <div className="rounded-3xl bg-gradient-to-l from-slate-950 via-slate-800 to-indigo-900 p-5 text-white shadow-lg md:p-7">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <Space size={8} wrap>
              <Tag color="geekblue" className="!m-0 !border-0 !px-3 !py-1">حساب تازه سیستم</Tag>
              {overview.organization?.is_demo && !isReadOnly ? <Tag color="purple" className="!m-0 !border-0 !px-3 !py-1">نسخه آزمایشی</Tag> : null}
              <Tag color={isReadOnly ? 'red' : overview.organization?.status === 'active' ? 'green' : 'blue'} className="!m-0 !border-0 !px-3 !py-1">{isReadOnly ? 'دوره پایان یافته · فقط خواندنی' : overview.organization?.status === 'active' ? 'فعال' : 'در حال استفاده'}</Tag>
            </Space>
            <Title level={3} className="!mb-1 !mt-4 !text-white">{plan.title || 'پلن انتخاب‌نشده'}</Title>
            <Text className="!text-slate-300">مدیریت متمرکز دسترسی‌ها، اعتبارها و خریدهای سازمان</Text>
            {plan.short_description || plan.description ? <div className="mt-2 max-w-2xl text-sm text-slate-300">{plan.short_description || plan.description}</div> : null}
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-right backdrop-blur">
            <div className="text-xs text-slate-300">{trialEndsAt ? 'پایان دوره آزمایشی' : 'هزینه ماهانه پلن'}</div>
            <div className="mt-1 text-lg font-black">{trialEndsAt || (hasFullPlanAccess ? 'نامحدود' : formatIrt(monthlyTotal || Number(plan.price_per_user_monthly || plan.price_monthly || 0)))}</div>
            {trialEndsAt ? <div className="mt-1 text-xs text-slate-300">{trialRemainingDays ? `${trialRemainingDays} روز باقی‌مانده` : 'دوره آزمایشی به پایان رسیده است'}</div> : null}
            {!trialEndsAt && !hasFullPlanAccess ? <div className="mt-1 text-xs text-slate-300">{formatIrt(Number(plan.price_per_user_monthly || plan.price_monthly || 0))} به‌ازای هر کاربر · حداقل {minimumUsers} کاربر</div> : null}
          </div>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}><Card className="h-full rounded-2xl"><Statistic title="کاربران فعال" value={Number(quotas.users_used || 0)} suffix={hasFullPlanAccess ? ' / نامحدود' : ` / ${usersAllowed}`} prefix={<TeamOutlined className="text-indigo-600" />} /><Progress className="mt-3" percent={hasFullPlanAccess ? 0 : userPercent} showInfo={false} /></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card className="h-full rounded-2xl"><Statistic title="فضای ذخیره‌سازی" value={hasFullPlanAccess ? 'نامحدود' : storageUsedGb} precision={hasFullPlanAccess ? undefined : 3} suffix={hasFullPlanAccess ? '' : `/ ${storageLimitGb} GB`} prefix={<CloudOutlined className="text-sky-600" />} /><Progress className="mt-2" percent={hasFullPlanAccess ? 0 : storagePercent} status={storagePercent >= 90 ? 'exception' : storagePercent >= 75 ? 'active' : 'normal'} showInfo={false} /><Text type="secondary" className="text-xs">{hasFullPlanAccess ? 'بدون سقف تخصیص' : `${Number(storageUsage.files || 0).toLocaleString('fa-IR')} فایل · ${Math.max(0, storageLimitGb - storageUsedGb).toFixed(3)} GB باقی‌مانده`}</Text></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card className="h-full rounded-2xl"><Statistic title="اعتبار هوش مصنوعی" value={aiRemaining} formatter={formatIrtCard} prefix={<BulbOutlined className="text-violet-600" />} /><Progress className="mt-2" percent={walletPercent(aiRemaining, aiWalletTarget)} strokeColor="#7c3aed" showInfo={false} /><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><Tag color={aiWallet.status === 'active' || !aiWallet.status ? 'green' : 'red'}>{aiWallet.status === 'blocked' ? 'مسدود' : 'فعال'}</Tag><Space size={0} wrap><Button size="small" type="link" onClick={() => { setWalletAmount(null); setWalletAction('ai_transfer'); }}>از کیف پول</Button><Button size="small" type="link" onClick={() => { setWalletAmount(null); setWalletAction('ai_topup'); }}>شارژ مستقیم</Button></Space></div></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card className="h-full rounded-2xl"><Statistic title="کیف پول پیامک" value={smsRemaining} formatter={formatIrtCard} prefix={<DatabaseOutlined className="text-cyan-600" />} /><Progress className="mt-2" percent={walletPercent(smsRemaining, smsWalletTarget)} strokeColor="#0891b2" showInfo={false} /><div className="mt-2 flex items-center justify-between"><Tag color={smsRemaining <= 100000 ? 'gold' : 'green'}>{smsRemaining <= 100000 ? 'نیازمند شارژ' : 'فعال'}</Tag><Space size={0}><Button size="small" type="link" onClick={() => { setWalletAmount(null); setWalletAction('sms_transfer'); }}>از کیف پول</Button><Button size="small" type="link" onClick={() => { setWalletAmount(null); setWalletAction('sms_topup'); }}>شارژ مستقیم</Button></Space></div></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card className="h-full rounded-2xl"><Statistic title="زمان‌بندی خودکار" value={Number(quotas.scheduled_runs || 0)} suffix="فعال" prefix={<RocketOutlined className="text-orange-600" />} /><Text type="secondary" className="mt-2 block text-xs">گردش‌کار زمان‌دار، ارسال برنامه حضور و گزارش‌ها؛ بدون محدودیت مصنوعیِ فاصلهٔ اجرا.</Text></Card></Col>
        <Col xs={24} sm={12} lg={12}><Card className="h-full rounded-2xl border-emerald-400 bg-gradient-to-l from-emerald-50 to-white shadow-md dark:from-emerald-950/40 dark:to-slate-900"><Statistic title={<span className="font-bold text-emerald-800 dark:text-emerald-200">کیف پول سازمان</span>} value={Number(billingWallet.balance_irt || 0)} formatter={formatIrtCard} prefix={<CreditCardOutlined className="text-emerald-600" />} /><Text type="secondary" className="mt-2 block text-xs">برای تمدید اشتراک و خرید امکانات قابل استفاده است.</Text><Button className="mt-3" type="primary" onClick={() => { setWalletAmount(null); setWalletAction('topup'); }}>شارژ کیف پول</Button></Card></Col>
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

      {pendingOrders.length > 0 && <Card className="rounded-2xl border-indigo-300" title="سفارش‌های آماده پرداخت">
        <div className="space-y-3">
          {pendingOrders.map((order: any) => <div key={String(order.id)} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between dark:border-slate-700">
            <div><Text strong>سفارش مدیریت حساب</Text><div className="mt-1 text-xs text-slate-500">{order.created_at ? new Date(order.created_at).toLocaleDateString('fa-IR') : '—'} · {formatIrt(order.total_irt)}</div></div>
            <Space wrap><Button onClick={() => openOrder(order)}>مشاهده و ویرایش</Button><Button type="primary" icon={<CreditCardOutlined />} loading={checkoutLoading} onClick={() => openOrder(order)}>بررسی و پرداخت</Button></Space>
          </div>)}
        </div>
      </Card>}

      <Modal open={!!selectedOrder} title="جزئیات سفارش آماده پرداخت" onCancel={() => { if (!orderActionLoading) setSelectedOrder(null); }} footer={[
        <Button key="close" onClick={() => setSelectedOrder(null)}>بستن</Button>,
        <Button key="delete" danger loading={orderActionLoading} onClick={() => Modal.confirm({ title: 'این سفارش حذف شود؟', content: 'فقط سفارش پرداخت‌نشده حذف می‌شود.', okText: 'حذف سفارش', okButtonProps: { danger: true }, cancelText: 'انصراف', onOk: () => void deleteOrder() })}>حذف سفارش</Button>,
        editingOrder ? <Button key="save" type="primary" loading={orderActionLoading} disabled={orderItems.length === 0} onClick={() => void saveOrder()}>ذخیره تغییرات</Button>
          : <Button key="edit" onClick={() => setEditingOrder(true)}>ویرایش</Button>,
        !editingOrder ? <Button key="pay" type="primary" icon={<CreditCardOutlined />} loading={checkoutLoading} onClick={() => void checkoutPendingOrder(String(selectedOrder?.id || ''))}>پرداخت این سفارش</Button> : null,
      ]}>
        {selectedOrder ? <div className="space-y-3">
          <Text type="secondary" className="block">مبلغ ثبت‌شده: {formatIrt(selectedOrder.total_irt)} · {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleDateString('fa-IR') : '—'}</Text>
          {orderItems.map((item, index) => {
            const original = (Array.isArray(selectedOrder.items) ? selectedOrder.items : []).find((row: any) => row.code === item.code);
            return <div key={`${item.code}-${index}`} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex items-center justify-between gap-2"><Text strong>{original?.title || catalog.find((row) => row.code === item.code)?.title || 'مورد سفارش'}</Text>{editingOrder ? <Button size="small" danger onClick={() => setOrderItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}>حذف مورد</Button> : null}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><Text type="secondary">{item.code.startsWith('plan:') ? 'تعداد کاربران' : 'تعداد'}:</Text>{editingOrder ? <InputNumber min={item.code.startsWith('plan:') ? Math.max(3, Number(quotas.users_used || 0)) : 1} max={1000} value={item.quantity} onChange={(value) => setOrderItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: Number(value || 1) } : row))} /> : <Text>{item.quantity.toLocaleString('fa-IR')}</Text>}</div>
              {item.code.startsWith('plan:') ? <div className="mt-2 flex items-center gap-2"><Text type="secondary">دوره پرداخت:</Text>{editingOrder ? <Select value={item.term_months || 1} options={TERM_OPTIONS} onChange={(value) => setOrderItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, term_months: value } : row))} /> : <Text>{TERM_OPTIONS.find((option) => option.value === (item.term_months || 1))?.label || '۱ ماهه'}</Text>}</div> : null}
              {!editingOrder ? <Text type="secondary" className="mt-1 block text-xs">مبلغ: {formatIrt(original?.line_total_irt)}</Text> : null}
            </div>;
          })}
          {editingOrder ? <Select showSearch className="w-full" placeholder="افزودن مورد دیگر" options={catalog.filter((row) => !orderItems.some((item) => item.code === row.code) && (row.item_kind !== 'plan' || !orderItems.some((item) => item.code.startsWith('plan:')))).map((row) => ({ value: row.code, label: row.title }))} onChange={(code?: string) => { if (!code) return; setOrderItems((current) => [...current, { code, quantity: code.startsWith('plan:') ? Math.max(3, Number(quotas.users_used || 0)) : 1, ...(code.startsWith('plan:') ? { term_months: 1 } : {}) }]); }} value={undefined} /> : null}
          {editingOrder ? <Alert type="info" showIcon message="مبلغ نهایی هنگام ذخیره با قیمت‌های روز و تخفیف‌ها در سرور محاسبه می‌شود." /> : null}
        </div> : null}
      </Modal>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Card title={<Space><AppstoreOutlined /> {isReadOnly ? 'دسترسی‌های فقط خواندنی' : 'دسترسی‌های فعال'}</Space>} className="rounded-2xl h-full" extra={isReadOnly ? <Tag color="red">پایان دوره</Tag> : hasFullPlanAccess ? <Tag color="gold">دسترسی کامل</Tag> : <Badge count={enabledModules + enabledFeatures} showZero color="#4f46e5" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button type="text" className="!h-auto !p-0 !text-right" onClick={() => setAccessDrawer('modules')}><div className="rounded-xl bg-indigo-50 p-4 text-right dark:bg-slate-800"><div className="text-sm text-slate-500">ماژول‌های {isReadOnly ? 'قابل مشاهده' : 'فعال'}</div><div className="mt-1 text-2xl font-black text-indigo-700 dark:text-indigo-300">{hasFullPlanAccess ? 'همه' : enabledModules}</div><div className="mt-1 text-xs text-indigo-600">{isReadOnly ? 'برای فعال‌سازی، اشتراک را تمدید کنید' : 'برای مشاهده و خرید کلیک کنید'}</div></div></Button>
              <Button type="text" className="!h-auto !p-0 !text-right" onClick={() => setAccessDrawer('features')}><div className="rounded-xl bg-violet-50 p-4 text-right dark:bg-slate-800"><div className="text-sm text-slate-500">امکانات {isReadOnly ? 'قابل مشاهده' : 'فعال'}</div><div className="mt-1 text-2xl font-black text-violet-700 dark:text-violet-300">{hasFullPlanAccess ? 'همه' : enabledFeatures}</div><div className="mt-1 text-xs text-violet-600">{isReadOnly ? 'برای فعال‌سازی، اشتراک را تمدید کنید' : 'برای مشاهده و خرید کلیک کنید'}</div></div></Button>
            </div>
            <Alert className="mt-4" type={isReadOnly ? 'warning' : 'info'} showIcon message={isReadOnly ? 'دوره اشتراک پایان یافته است. اطلاعات قبلی فقط قابل مشاهده‌اند؛ با تمدید، دسترسی کامل برمی‌گردد.' : 'دسترسی نهایی از پلن، خریدهای موفق و تنظیمات سازمان محاسبه می‌شود.'} />
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title={<Space><DatabaseOutlined /> سهمیهٔ پیامک</Space>} className="rounded-2xl h-full">
            <Statistic value={smsRemaining} formatter={formatIrtCard} />
            <Text type="secondary" className="mt-2 block text-xs">اعتبار واقعی کیف پول پیامک پس از کسر هزینهٔ provider نمایش داده می‌شود.</Text>
          </Card>
        </Col>
      </Row>

      <Drawer open={!!accessDrawer} onClose={() => setAccessDrawer(null)} title={accessDrawer === 'modules' ? 'ماژول‌های سازمان' : 'امکانات سازمان'} placement="left" width="min(480px, 100vw)">
        <div className="space-y-3">
          {isReadOnly ? <Alert type="warning" showIcon message="دوره اشتراک پایان یافته و این دسترسی‌ها اکنون فقط خواندنی هستند." /> : null}
          {hasFullPlanAccess ? <Alert type="success" showIcon message={accessDrawer === 'modules' ? 'همهٔ ماژول‌ها بدون سقف فعال هستند.' : 'همهٔ امکانات بدون سقف فعال هستند.'} /> : null}
          {Object.entries(accessDrawer === 'modules' ? (access.modules || {}) : (access.features || {})).filter(([code, value]) => value === true && code !== 'support_tickets').map(([code]) => {
            const purchasable = catalog.find((item) => item.entitlement_code === code);
            const label = accessDrawer === 'modules' ? (SAAS_MODULE_LABELS[code] || code) : (SAAS_FEATURE_LABELS[code] || code);
            return <div key={code} className="flex items-center justify-between gap-3 rounded-xl border p-3"><Text>{label}</Text>{isReadOnly ? <Tag color="orange">فقط خواندنی</Tag> : purchasable ? <Button size="small" onClick={() => changeCart(purchasable.code, 1)}>افزودن به سبد</Button> : <Tag color="green">فعال</Tag>}</div>;
          })}
        </div>
      </Drawer>

      <Card className="rounded-2xl" title="پلن‌های اشتراک">
        {planFeaturesError ? <Alert className="mb-4" type="warning" showIcon message="فهرست امکانات پلن‌ها بارگذاری نشد." action={<Button size="small" onClick={() => void load()}>تلاش دوباره</Button>} /> : null}
        {planItems.length === 0 ? <Empty description="در حال حاضر پلنی برای خرید فعال نیست." /> : <AccountPlanCards
          plans={planItems} publicPlans={publicPlans} cart={cart} usersUsed={Number(quotas.users_used || 0)} termMonths={termMonths} discounts={discounts} onTermChange={setTermMonths}
          onSelect={(code, minimum) => changeCart(code, minimum)}
          onRemove={(code) => setCart((current) => { const next = { ...current }; delete next[code]; return next; })}
          onQuantityChange={(code, quantity) => setCart((current) => ({ ...current, [code]: quantity }))}
        />}
      </Card>

      <Card className="rounded-2xl" title={<Space><ShoppingCartOutlined /> امکانات و سهمیه‌های افزوده</Space>} extra={<Tooltip title="فقط اقلامی که مدیر تازه سیستم قیمت‌گذاری و فعال کرده است نمایش داده می‌شوند."><Text type="secondary" className="text-xs">پرداخت امن آنلاین</Text></Tooltip>}>
        {extraItems.length === 0 ? <Empty description="در حال حاضر امکان یا سهمیهٔ افزوده‌ای برای خرید فعال نیست." /> : (
          <Row gutter={[14, 14]}>
            {extraItems.map((item) => {
              const count = Number(cart[item.code] || 0);
              return <Col xs={24} md={12} xl={8} key={item.code}><Card size="small" className="h-full rounded-xl border-slate-200" title={item.title} extra={<Tag color="blue">{formatIrt(item.price_irt)}</Tag>}>
                <Text type="secondary" className="block min-h-10 text-xs">{item.description || 'افزودن به حساب سازمان'}</Text>
                <div className="mt-4 flex items-center justify-between gap-2"><Tag>{item.item_kind === 'bundle' ? 'بسته کاربردی' : item.item_kind === 'quota' ? 'سهمیه' : 'دسترسی'}</Tag><Space size={4}>{count ? <Button size="small" onClick={() => changeCart(item.code, -1)}>−</Button> : null}{count ? <Text strong>{count}</Text> : null}<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => changeCart(item.code, 1)}>{count ? '' : 'افزودن'}</Button></Space></div>
              </Card></Col>;
            })}
          </Row>
        )}
      </Card>
      {cartItems.length ? <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-lg md:flex-row md:items-center md:justify-between dark:bg-slate-800"><div><Text type="secondary">{cartItems.length} قلم در سبد</Text><div className="text-xl font-black">{formatIrt(cartTotal)}</div></div><Space wrap><Button size="large" loading={checkoutLoading} disabled={Number(billingWallet.balance_irt || 0) < cartTotal} onClick={() => void checkoutWithWallet()}>پرداخت از کیف پول</Button><Button type="primary" size="large" icon={<CreditCardOutlined />} loading={checkoutLoading} onClick={() => void checkout()}>پرداخت آنلاین</Button></Space></div> : null}

      <Modal
        open={walletAction !== null}
        title={walletAction === 'topup' ? 'شارژ کیف پول سازمان' : walletAction === 'sms_topup' ? 'شارژ مستقیم کیف پول پیامک' : walletAction === 'ai_topup' ? 'شارژ مستقیم اعتبار هوش مصنوعی' : walletAction === 'sms_transfer' ? 'انتقال به کیف پول پیامک' : 'انتقال به اعتبار هوش مصنوعی'}
        okText={walletAction === 'topup' || walletAction === 'sms_topup' || walletAction === 'ai_topup' ? 'ادامه و پرداخت' : 'انتقال اعتبار'}
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
            : walletAction === 'sms_topup' ? 'مبلغ پرداختی با ۱۰٪ ارزش افزوده محاسبه می‌شود و مبلغ خالص پس از کسر ارزش افزوده به کیف پول پیامک اضافه خواهد شد.'
            : walletAction === 'ai_topup' ? 'مبلغ از درگاه پرداخت می‌شود و مستقیم به اعتبار هوش مصنوعی همین سازمان افزوده خواهد شد.'
            : walletAction === 'sms_transfer' ? 'این مبلغ از کیف پول سازمان کم و فقط برای ارسال پیامک با سرشماره تازه سیستم قابل استفاده می‌شود.' : 'این مبلغ از کیف پول سازمان کم و فقط برای مصرف هوش مصنوعی قابل استفاده می‌شود.'}
        </Text>
        <PriceAmountInput
          min={10000}
          max={100000000}
          step={10000}
          value={walletAmount ?? undefined}
          onChange={(value) => setWalletAmount(value === null ? null : Number(value))}
          currencyLabel="تومان"
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
