import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Collapse,
  Descriptions,
  Divider,
  Drawer,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Select,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, RocketOutlined, SaveOutlined, ShoppingOutlined, WalletOutlined } from '@ant-design/icons';
import { executeSaasModuleAction } from '../../utils/saasAdminModules';
import { supabase } from '../../supabaseClient';
import { SAAS_FEATURE_OPTIONS, SAAS_MODULE_GROUPS } from '../../utils/saasOfferingCatalog';

const { Text } = Typography;

type Props = {
  open: boolean;
  record: Record<string, any>;
  onClose: () => void;
  onChanged: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  active: 'فعال',
  trial: 'آزمایشی',
  suspended: 'تعلیق‌شده',
  draft: 'پیش‌نویس',
  failed: 'ناموفق',
  needs_admin_review: 'نیازمند بررسی',
};

const statusColor = (status: unknown) => {
  switch (String(status || '').trim()) {
    case 'active': return 'green';
    case 'trial': return 'blue';
    case 'suspended': return 'red';
    case 'failed': return 'red';
    case 'needs_admin_review': return 'orange';
    default: return 'default';
  }
};

const displayDate = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fa-IR');
};

const SaasOrgAdminDrawer: React.FC<Props> = ({ open, record, onClose, onChanged }) => {
  const { message } = App.useApp();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [account, setAccount] = useState<any | null>(null);
  const [smsWallet, setSmsWallet] = useState<any | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [quotas, setQuotas] = useState<Record<string, number>>({});
  const [creditDeltas, setCreditDeltas] = useState({ sms: 0, ai: 0, wallet: 0 });
  const [creditReason, setCreditReason] = useState('');
  const sourceKind = String(record?.source_kind || 'org').trim();
  const isDemoOrg = sourceKind === 'org' && record?.is_demo === true;

  const loadAccount = useCallback(async () => {
    const orgId = String(record?.org_id || record?.source_id || '').trim();
    if (!orgId || sourceKind !== 'org') return;
    setAccountLoading(true);
    try {
      const [accountResult, planResult, catalogResult, ordersResult, smsWalletResult] = await Promise.all([
        supabase.rpc('admin_get_saas_org_account', { p_org_id: orgId }),
        supabase.from('saas_plans').select('code,title,price_monthly,short_description,enabled_modules,enabled_features').eq('is_active', true).order('sort_order'),
        supabase.rpc('admin_get_saas_catalog_items'),
        supabase.rpc('admin_list_saas_org_orders', { p_org_id: orgId }),
        supabase.rpc('admin_get_saas_org_sms_wallet', { p_org_id: orgId }),
      ]);
      if (accountResult.error) throw accountResult.error;
      const next = accountResult.data || null;
      setAccount(next);
      const fetchedPlans = planResult.error ? [] : (planResult.data || []);
      const accountPlan = next?.plan?.code ? [{ code: next.plan.code, title: next.plan.title, enabled_modules: next.plan.enabled_modules || {}, enabled_features: next.plan.enabled_features || {} }] : [];
      setPlans(fetchedPlans.length ? fetchedPlans : accountPlan);
      setCatalog(catalogResult.error || !Array.isArray(catalogResult.data) ? [] : catalogResult.data);
      setOrders(ordersResult.error || !Array.isArray(ordersResult.data) ? [] : ordersResult.data);
      setSmsWallet(smsWalletResult.error ? null : (smsWalletResult.data || null));
      setCart({});
      setEditingOrderId(null);
      setSelectedPlan(next?.management?.plan_code || next?.plan?.code || null);
      setSelectedModules(Object.entries(next?.access?.modules || {}).filter(([, enabled]) => enabled === true).map(([key]) => key));
      setSelectedFeatures(Object.entries(next?.access?.features || {}).filter(([, enabled]) => enabled === true).map(([key]) => key));
      const rawQuotas = next?.management?.quota_adjustments || {};
      setQuotas({ users: Number(rawQuotas.users || 0), storage_gb: Number(rawQuotas.storage_gb || 0), scheduled_runs: Number(rawQuotas.scheduled_runs || 0), active_workflows: Number(rawQuotas.active_workflows || 0), sms_credit: Number(rawQuotas.sms_credit || 0), instagram_accounts: Number(rawQuotas.instagram_accounts || 0) });
    } catch (error: any) {
      message.error(error?.message || 'دریافت وضعیت حساب سازمان ناموفق بود.');
    } finally {
      setAccountLoading(false);
    }
  }, [message, record?.org_id, record?.source_id, sourceKind]);

  useEffect(() => { void loadAccount(); }, [loadAccount]);

  const choosePlan = (code: string) => {
    const plan = plans.find((item) => item.code === code);
    setSelectedPlan(code || null);
    if (!plan) return;
    setSelectedModules(Object.entries(plan.enabled_modules || {}).filter(([, enabled]) => enabled === true).map(([key]) => key));
    setSelectedFeatures(Object.entries(plan.enabled_features || {}).filter(([, enabled]) => !!enabled).map(([key]) => key));
  };

  const cartItems = useMemo(() => {
    const all = [
      ...plans.map((plan) => ({ code: `plan:${plan.code}`, title: plan.title, price_irt: plan.price_monthly, item_kind: 'plan' })),
      ...catalog,
    ];
    return all.filter((item) => Number(cart[item.code] || 0) > 0).map((item) => ({ ...item, quantity: Number(cart[item.code]) }));
  }, [catalog, cart, plans]);
  const cartTotal = useMemo(() => cartItems.reduce((sum, item) => sum + Number(item.price_irt || 0) * Number(item.quantity || 1), 0), [cartItems]);
  const addToCart = (code: string, delta = 1) => setCart((current) => {
    const next = Math.max(0, Math.min(100, Number(current[code] || 0) + delta));
    if (!next) { const { [code]: _removed, ...rest } = current; return rest; }
    return { ...current, [code]: next };
  });
  const submitCart = async () => {
    const orgId = String(record?.org_id || record?.source_id || '').trim();
    if (!orgId || !cartItems.length) return;
    setAccountSaving(true);
    try {
      const orderItems = cartItems.map((item) => ({ code: item.code, quantity: item.quantity }));
      const { data, error } = editingOrderId
        ? await supabase.rpc('admin_update_saas_order', { p_order_id: editingOrderId, p_items: orderItems })
        : await supabase.rpc('admin_create_saas_order', { p_org_id: orgId, p_items: orderItems });
      if (error) throw error;
      const savedOrder = { id: data?.order_id, status: data?.status || 'pending_payment', total_irt: data?.total_irt || cartTotal, items: data?.items || cartItems, created_at: new Date().toISOString() };
      setOrders((current) => [savedOrder, ...current.filter((item) => item.id !== editingOrderId)]);
      setCart({});
      message.success(editingOrderId ? 'سبد خرید در سفارش قبلی به‌روزرسانی شد.' : 'سبد خرید برای سازمان ثبت شد و برای پرداخت در حساب آن قرار گرفت.');
      onChanged();
    } catch (error: any) { message.error(error?.message || 'ثبت سبد خرید سازمان ناموفق بود.'); }
    finally { setAccountSaving(false); }
  };

  const saveAccount = async () => {
    const orgId = String(record?.org_id || record?.source_id || '').trim();
    if (!orgId) return;
    setAccountSaving(true);
    try {
      const moduleIds = SAAS_MODULE_GROUPS.flatMap((group) => group.modules.map((item) => item.id));
      const featureIds = SAAS_FEATURE_OPTIONS.map((item) => item.id);
      // مقدار false هم باید ارسال شود؛ حذف گزینه از payload باعث می‌شد true پلن دوباره غالب شود.
      const toMap = (all: string[], selected: string[]) => Object.fromEntries(all.map((item) => [item, selected.includes(item)]));
      const { data, error } = await supabase.rpc('admin_update_saas_org_account', {
        p_org_id: orgId,
        p_plan_code: selectedPlan,
        p_module_overrides: toMap(moduleIds, selectedModules),
        p_feature_overrides: toMap(featureIds, selectedFeatures),
        p_quota_adjustments: quotas,
      });
      if (error) throw error;
      setAccount(data || null);
      message.success('پلن، دسترسی‌ها و سهمیه‌های سازمان ذخیره شد.');
      onChanged();
    } catch (error: any) {
      message.error(error?.message || 'ذخیره تنظیمات حساب ناموفق بود.');
    } finally {
      setAccountSaving(false);
    }
  };

  const adjustCredits = async () => {
    const { sms, ai, wallet } = creditDeltas;
    if (!sms && !ai && !wallet) { message.warning('حداقل یک مقدار شارژ یا کسر وارد کنید.'); return; }
    try {
      setAccountSaving(true);
      const orgId = String(record?.org_id || record?.source_id || '').trim();
      const { data, error } = await supabase.rpc('admin_adjust_saas_org_account', {
        p_org_id: orgId, p_sms_delta: sms, p_ai_delta_irt: ai, p_billing_wallet_delta_irt: wallet, p_reason: creditReason,
      });
      if (error) throw error;
      setAccount(data || null);
      setCreditDeltas({ sms: 0, ai: 0, wallet: 0 });
      message.success('اعتبارها و کیف پول سازمان به‌روزرسانی شد.');
      onChanged();
    } catch (error: any) { message.error(error?.message || 'تغییر اعتبار سازمان ناموفق بود.'); }
    finally { setAccountSaving(false); }
  };

  const accountSummary = useMemo(() => {
    const quota = account?.quotas || {};
    return `کاربر: ${quota.users_used || 0} / ${Number(quota.users_included || 0) + Number(quota.users_extra || 0) || '—'} · ماژول: ${selectedModules.length} · امکانات: ${selectedFeatures.length}`;
  }, [account, selectedFeatures.length, selectedModules.length]);

  const runAction = async (actionId: 'convert_request_to_org' | 'delete_demo_org') => {
    setActionLoading(actionId);
    try {
      const result = await executeSaasModuleAction('saas_orgs', actionId, record);
      message.success(result.message || 'عملیات انجام شد.');
      onChanged();
    } catch (error: any) {
      message.error(error?.message || 'عملیات سازمان ناموفق بود.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Drawer
      title={record?.org_name || 'جزئیات سازمان'}
      open={open}
      onClose={onClose}
      width="min(620px, 100vw)"
      placement="left"
      destroyOnHidden
      footer={cartItems.length ? <div className="flex flex-col gap-2"><div className="flex items-center justify-between"><Text type="secondary">{cartItems.length} قلم در سبد</Text><Text strong className="text-lg">{Number(cartTotal).toLocaleString('fa-IR')} تومان</Text></div><Button type="primary" size="large" block icon={<ShoppingOutlined />} loading={accountSaving} onClick={() => void submitCart()}>ثبت سبد خرید برای سازمان</Button></div> : null}
    >
      <Space direction="vertical" size={16} className="w-full">
        {sourceKind === 'request' ? (
          <Alert
            type="info"
            showIcon
            message="درخواست در انتظار ایجاد سازمان"
            description="این مورد هنوز سازمان فعال نیست و فقط پس از بررسی مدیر قابل ایجاد است."
          />
        ) : null}

        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="نام سازمان">{record?.org_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="آدرس">
            {record?.resolved_host || record?.slug ? (
              <Text className="ltr-text">{record?.resolved_host || `${record.slug}.tazesystem.ir`}</Text>
            ) : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="وضعیت">
            <Tag color={statusColor(record?.status)}>{STATUS_LABELS[String(record?.status || '')] || record?.status || '—'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="وضعیت ایجاد">{record?.provision_state === 'request_pending' ? 'در انتظار ایجاد' : 'ایجاد شده'}</Descriptions.Item>
          <Descriptions.Item label="پلن">{record?.plan_code || '—'}</Descriptions.Item>
          <Descriptions.Item label="دمو">{record?.is_demo ? 'بله' : 'خیر'}</Descriptions.Item>
          <Descriptions.Item label="فقط خواندن">{record?.is_readonly ? 'بله' : 'خیر'}</Descriptions.Item>
          <Descriptions.Item label="پایان دوره آزمایشی">{displayDate(record?.trial_ends_at)}</Descriptions.Item>
        </Descriptions>

        <Divider orientation="right" plain>مالک و اطلاعات تماس</Divider>
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="نام مالک / متقاضی">{record?.owner_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="ایمیل">{record?.owner_email || '—'}</Descriptions.Item>
          <Descriptions.Item label="موبایل">{record?.primary_contact_mobile || '—'}</Descriptions.Item>
          <Descriptions.Item label="زمان ثبت">{displayDate(record?.provisioned_at)}</Descriptions.Item>
        </Descriptions>

        {sourceKind === 'request' ? (
          <Button
            type="primary"
            icon={<RocketOutlined />}
            loading={actionLoading === 'convert_request_to_org'}
            onClick={() => void runAction('convert_request_to_org')}
          >
            ایجاد سازمان از این درخواست
          </Button>
        ) : null}

        {isDemoOrg ? (
          <div className="rounded-xl border border-red-200 p-3">
            <Text strong type="danger">عملیات خطرناک</Text>
            <div className="mt-3">
              <Popconfirm
                title="حذف کامل نسخه دمو"
                description="تمام داده‌های این نسخه دمو حذف می‌شود و قابل بازگشت نیست."
                okText="حذف کامل"
                cancelText="انصراف"
                okButtonProps={{ danger: true, loading: actionLoading === 'delete_demo_org' }}
                onConfirm={() => runAction('delete_demo_org')}
              >
                <Button danger icon={<DeleteOutlined />} loading={actionLoading === 'delete_demo_org'}>
                  حذف کامل نسخه دمو
                </Button>
              </Popconfirm>
            </div>
          </div>
        ) : null}

        {sourceKind === 'org' ? (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Space><ShoppingOutlined className="text-indigo-600" /><Text strong>حساب، پلن و دسترسی‌ها</Text></Space>
              {accountLoading ? <Spin size="small" /> : <Text type="secondary" className="text-xs">{accountSummary}</Text>}
            </div>
            <div className="space-y-4">
              {account ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['کیف پول پیامک', `${Math.max(0, Number(smsWallet?.balance_irt || 0) + Number(smsWallet?.included_quota_irt || 0) - Number(smsWallet?.reserved_irt || 0)).toLocaleString('fa-IR')} تومان`],
                  ['اعتبار AI', `${Number(account?.ai_wallet?.balance_irt || 0).toLocaleString('fa-IR')} تومان`],
                  ['کیف پول', `${Number(account?.billing_wallet?.balance_irt || 0).toLocaleString('fa-IR')} تومان`],
                  ['سوابق', `${Array.isArray(account?.history) ? account.history.length : 0} مورد`],
                ].map(([label, value]) => <div key={label} className="rounded-xl bg-white/70 p-2 text-center dark:bg-slate-700"><Text type="secondary" className="block text-[11px]">{label}</Text><Text strong>{value}</Text></div>)}
              </div> : null}
              <div>
                <Text type="secondary" className="mb-1 block text-xs">پلن پایه</Text>
                <Select className="w-full" allowClear placeholder="پلن را انتخاب کنید" value={selectedPlan || undefined} onChange={choosePlan} options={plans.map((plan) => ({ value: plan.code, label: `${plan.title || plan.code} · ${Number(plan.price_monthly || 0).toLocaleString('fa-IR')} تومان` }))} />
              </div>
              <div className="rounded-xl border border-indigo-200 bg-white/70 p-3 dark:bg-slate-700">
                <div className="mb-2 flex items-center justify-between"><Text strong>اقلام قابل خرید و قیمت</Text><Text type="secondary" className="text-xs">سبد تا زمان ثبت قابل ویرایش است.</Text></div>
                <div className="mb-2 flex flex-wrap gap-2">{plans.filter((plan) => Number(plan.price_monthly || 0) > 0).map((plan) => <Button key={plan.code} size="small" type={cart[`plan:${plan.code}`] ? 'primary' : 'default'} onClick={() => addToCart(`plan:${plan.code}`, cart[`plan:${plan.code}`] ? -1 : 1)}>{plan.title} · {Number(plan.price_monthly).toLocaleString('fa-IR')}</Button>)}</div>
                {catalog.length ? <Select className="w-full" mode="multiple" placeholder="ماژول، امکان یا سهمیه را انتخاب کنید" value={catalog.filter((item) => cart[item.code]).map((item) => item.code)} onChange={(values) => { const next: Record<string, number> = {}; values.forEach((value) => { next[String(value)] = 1; }); setCart((current) => Object.fromEntries(Object.keys(current).filter((key) => key.startsWith('plan:')).map((key) => [key, current[key]]).concat(Object.entries(next)))); }} options={catalog.filter((item) => item.is_active !== false && Number(item.price_irt || 0) > 0).map((item) => ({ value: item.code, label: `${item.title} · ${Number(item.price_irt).toLocaleString('fa-IR')} تومان` }))} /> : <Alert type="info" showIcon message="هنوز افزونه‌ای در کاتالوگ قیمت‌گذاری و فعال نشده است." />}
                {cartItems.length ? <div className="mt-3 space-y-1">{cartItems.map((item) => <div key={item.code} className="flex items-center justify-between text-xs"><Text>{item.title}</Text><Space size={4}><Button size="small" onClick={() => addToCart(item.code, -1)}>−</Button><Text>{item.quantity}</Text><Button size="small" onClick={() => addToCart(item.code, 1)}>+</Button></Space></div>)}</div> : null}
              </div>
              <Collapse ghost items={[
                {
                  key: 'modules', label: `ماژول‌ها (${selectedModules.length})`, children: <div className="space-y-3">{SAAS_MODULE_GROUPS.map((group) => <div key={group.label}><Text strong className="text-xs">{group.label}</Text><Checkbox.Group className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2" value={selectedModules} options={group.modules.map((item) => ({ value: item.id, label: item.label }))} onChange={(values) => {
                    const groupIds = new Set(group.modules.map((item) => item.id));
                    setSelectedModules((current) => [...current.filter((item) => !groupIds.has(item)), ...values.map(String)]);
                  }} /></div>)}</div>,
                },
                {
                  key: 'features', label: `امکانات (${selectedFeatures.length})`, children: <Checkbox.Group className="grid grid-cols-1 gap-1 sm:grid-cols-2" value={selectedFeatures} options={SAAS_FEATURE_OPTIONS.map((item) => ({ value: item.id, label: item.label }))} onChange={(values) => setSelectedFeatures(values.map(String))} />,
                },
                {
                  key: 'quotas', label: 'سهمیه‌های دستی', children: <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[
                    ['users', 'کاربر اضافه'], ['storage_gb', 'فضای اضافه (GB)'], ['scheduled_runs', 'زمان‌بندی خودکار اضافه'], ['active_workflows', 'گردش‌کار فعال اضافه'], ['sms_credit', 'اعتبار پیامک'], ['instagram_accounts', 'اکانت اینستاگرام'],
                  ].map(([key, label]) => <div key={key}><Text type="secondary" className="mb-1 block text-xs">{label}</Text><InputNumber className="w-full" min={0} value={quotas[key] || 0} onChange={(value) => setQuotas((current) => ({ ...current, [key]: Number(value || 0) }))} /></div>)}</div>,
                },
              ]} />
              <Button block type="primary" icon={<SaveOutlined />} loading={accountSaving} onClick={() => void saveAccount()}>ذخیره وضعیت حساب</Button>
              <Divider orientation="right" plain><WalletOutlined /> شارژ دستی</Divider>
              <Text type="secondary" className="text-xs">مقدار مثبت شارژ و مقدار منفی کسر می‌کند. همهٔ تغییرها در سوابق حساب ثبت می‌شوند.</Text>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {([['sms','پیامک'],['ai','اعتبار AI (تومان)'],['wallet','کیف پول (تومان)']] as const).map(([key, label]) => <div key={key}><Text type="secondary" className="mb-1 block text-xs">{label}</Text><InputNumber className="w-full" value={creditDeltas[key]} onChange={(value) => setCreditDeltas((current) => ({ ...current, [key]: Number(value || 0) }))} /></div>)}
              </div>
              <Input placeholder="دلیل تغییر (اختیاری)" value={creditReason} onChange={(event) => setCreditReason(event.target.value)} />
              <Button block icon={<WalletOutlined />} loading={accountSaving} onClick={() => void adjustCredits()}>ثبت شارژ و تغییر دستی</Button>
              <Collapse ghost items={[{
                key: 'history',
                label: `سوابق حساب (${Array.isArray(account?.history) ? account.history.length : 0})`,
                children: <div className="space-y-2">{(Array.isArray(account?.history) ? account.history : []).slice(0, 30).map((item: any, index: number) => <div key={`${String(item?.created_at || '')}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-white/70 p-2 text-xs dark:bg-slate-700"><div><Text strong>{String(item?.title || 'تغییر حساب')}</Text><div className="text-slate-500">{item?.created_at ? new Date(item.created_at).toLocaleDateString('fa-IR') : '—'}</div></div><Text>{item?.amount_irt ? `${Number(item.amount_irt).toLocaleString('fa-IR')} تومان` : '—'}</Text></div>)}</div>,
              }]} />
              <Collapse ghost items={[{ key: 'orders', label: `سفارش‌های این سازمان (${orders.length})`, children: <div className="space-y-2">{orders.slice(0, 20).map((order: any) => <div key={String(order.id)} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 p-2 text-xs dark:bg-slate-700"><Text>{order.status === 'paid' ? 'پرداخت‌شده' : 'در انتظار پرداخت'} · {Number(order.total_irt || 0).toLocaleString('fa-IR')} تومان</Text>{order.status === 'pending_payment' && Array.isArray(order.items) ? <Button size="small" onClick={() => { const next: Record<string, number> = {}; order.items.forEach((item: any) => { if (item?.code) next[String(item.code)] = Number(item.purchase_quantity || item.quantity || 1); }); setCart(next); setEditingOrderId(String(order.id)); }}>ویرایش سبد</Button> : null}</div>)}</div> }]} />
            </div>
          </div>
        ) : null}
      </Space>
    </Drawer>
  );
};

export default SaasOrgAdminDrawer;
