import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Avatar, Button, Empty, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Tooltip } from 'antd';
import { CopyOutlined, DeleteOutlined, InstagramOutlined, LinkOutlined, PlusOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { normalizePublicAssetUrl } from '../../utils/assetUrl';

type ProviderAccount = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  profile_photo_url?: string | null;
  is_active?: boolean;
  expires_at?: string | null;
};
type Provider = {
  id: string;
  name: string;
  providerKey: string;
  providerLabel?: string;
  apiBaseUrl?: string;
  isActive: boolean;
  hasApiKey: boolean;
  webhookUrl: string;
  redirectUrl: string;
  domain: string;
  lastWebhook?: WebhookEventDiagnostic | null;
  accounts: ProviderAccount[];
};
type SupportedProvider = { key: string; label: string; defaultBaseUrl?: string; apiKeyLabel?: string; apiBaseUrlRequired?: boolean; apiBaseUrlPlaceholder?: string };
type WebhookEventDiagnostic = { event_type?: string; processing_status?: 'received' | 'processed' | 'ignored' | 'failed'; error_message?: string | null; received_at?: string | null; processed_at?: string | null; payload_summary?: { data_kind?: string; data_keys?: string[]; array_counts?: Record<string, number>; has_account_reference?: boolean } };

const copy = async (value: string, label: string, message: any) => {
  if (!String(value || '').trim()) return message.warning(`${label} آماده نیست.`);
  try { await navigator.clipboard.writeText(value); message.success(`${label} کپی شد.`); }
  catch { message.error(`کپی ${label} ناموفق بود.`); }
};

const CopyOnlyTransferLink: React.FC<{ label: string; value: string; message: any; emptyText?: string }> = ({ label, value, message, emptyText = 'پس از ذخیره حساب آماده می‌شود.' }) => (
  <div>
    <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{label}</div>
    {value ? <div className="flex gap-2">
      <Input dir="ltr" value={value} readOnly aria-label={label} />
      <Tooltip title={`کپی ${label}`}><Button icon={<CopyOutlined />} aria-label={`کپی ${label}`} onClick={() => void copy(value, label, message)} /></Tooltip>
    </div> : <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-gray-500 dark:border-slate-700 dark:bg-white/5">{emptyText}</div>}
  </div>
);

const InstagramProviderConnectionsSection: React.FC = () => {
  const { message } = App.useApp();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [supportedProviders, setSupportedProviders] = useState<SupportedProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [checkingWebhookId, setCheckingWebhookId] = useState<string | null>(null);
  const [webhookDiagnostics, setWebhookDiagnostics] = useState<Record<string, WebhookEventDiagnostic[]>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [form] = Form.useForm();

  const invoke = useCallback(async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('instagram-boxapi', { body });
    if (error) throw error;
    if (!data?.success) throw new Error(String(data?.message || 'عملیات اتصال اینستاگرام ناموفق بود.'));
    return data;
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke({ action: 'list' });
      setProviders(Array.isArray(data.providers) ? data.providers : []);
      setSupportedProviders(Array.isArray(data.supportedProviders) ? data.supportedProviders : []);
    }
    catch (error) { message.error(toFaErrorMessage(error, 'بارگذاری اتصال‌های اینستاگرام ناموفق بود.')); }
    finally { setLoading(false); }
  }, [invoke, message]);
  useEffect(() => { void load(); }, [load]);
  const providerDefinition = (providerKey?: string) => supportedProviders.find((provider) => provider.key === providerKey);
  const providerLabel = (providerKey?: string) => providerDefinition(providerKey)?.label || providerKey || 'سرویس‌دهنده';

  const openCreate = () => {
    const defaultProvider = supportedProviders[0];
    if (!defaultProvider) { message.warning('فهرست سرویس‌دهندگان اینستاگرام هنوز آماده نشده است.'); return; }
    setEditing(null);
    form.setFieldsValue({ provider: defaultProvider.key, name: defaultProvider.label, apiKey: '', baseUrl: defaultProvider.defaultBaseUrl || '', isActive: false });
    setModalOpen(true);
  };
  const openEdit = (provider: Provider) => {
    setEditing(provider);
    form.setFieldsValue({ provider: provider.providerKey, name: provider.name, apiKey: '', baseUrl: provider.apiBaseUrl || providerDefinition(provider.providerKey)?.defaultBaseUrl || '', isActive: provider.isActive });
    setModalOpen(true);
  };
  const save = async () => {
    try {
      const value = await form.validateFields();
      setSaving(true);
      const saved = await invoke({
        action: 'save_provider',
        providerId: editing?.id,
        providerKey: value.provider,
        name: value.name,
        apiKey: value.apiKey,
        baseUrl: value.baseUrl,
        isActive: editing ? value.isActive : false,
        domain: editing?.domain || window.location.origin,
        redirectUrl: editing?.redirectUrl || `${window.location.origin}/settings`,
      });
      if (!editing && saved?.provider) {
        setEditing(saved.provider as Provider);
        form.setFieldsValue({ provider: saved.provider.providerKey, name: saved.provider.name, apiKey: '', baseUrl: saved.provider.apiBaseUrl || providerDefinition(saved.provider.providerKey)?.defaultBaseUrl || '', isActive: false });
        message.success(`آدرس وب‌هوک ساخته شد. آن را در ${providerLabel(saved.provider.providerKey)} ثبت کنید و سپس اتصال را فعال کنید.`);
      } else {
        setModalOpen(false);
        message.success('اتصال سرویس‌دهنده ذخیره شد.');
      }
      await load();
    } catch (error) { message.error(toFaErrorMessage(error, 'ذخیره اتصال اینستاگرام ناموفق بود.')); }
    finally { setSaving(false); }
  };
  const sync = async (providerId: string) => {
    setSyncingId(providerId);
    try { const data = await invoke({ action: 'sync_accounts', providerId }); message.success(`${Number(data.syncedCount || 0).toLocaleString('fa-IR')} پیج همگام شد.`); await load(); }
    catch (error) { message.error(toFaErrorMessage(error, 'همگام‌سازی پیج‌ها ناموفق بود.')); }
    finally { setSyncingId(null); }
  };
  const connect = async (providerId: string) => {
    setConnectingId(providerId);
    try {
      const data = await invoke({ action: 'get_connect_url', providerId });
      const url = String(data.connectUrl || '').trim();
      if (!url) throw new Error('لینک ورود رسمی اینستاگرام از سرویس‌دهنده دریافت نشد.');
      window.open(url, '_blank', 'noopener,noreferrer');
      message.info('پس از اتصال پیج، برای دریافت وضعیت جدید روی «همگام‌سازی پیج‌ها» بزنید.');
    } catch (error) { message.error(toFaErrorMessage(error, 'دریافت لینک اتصال پیج ناموفق بود.')); }
    finally { setConnectingId(null); }
  };
  const remove = async (providerId: string) => {
    try { await invoke({ action: 'delete_provider', providerId }); message.success('اتصال و پیج‌های وابسته حذف شد.'); await load(); }
    catch (error) { message.error(toFaErrorMessage(error, 'حذف اتصال ناموفق بود.')); }
  };
  const checkWebhook = async (providerId: string) => {
    setCheckingWebhookId(providerId);
    try {
      const data = await invoke({ action: 'webhook_diagnostics', providerId });
      const events = Array.isArray(data.events) ? data.events as WebhookEventDiagnostic[] : [];
      setWebhookDiagnostics((current) => ({ ...current, [providerId]: events }));
      if (events.length) message.success('وضعیت آخرین وب‌هوک دریافت شد.');
      else message.warning('هنوز هیچ وب‌هوکی از این سرویس‌دهنده به سامانه نرسیده است.');
    } catch (error) { message.error(toFaErrorMessage(error, 'بررسی وب‌هوک ناموفق بود.')); }
    finally { setCheckingWebhookId(null); }
  };
  const formatDateTime = (value?: string | null) => value ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '—';
  const webhookStatusLabel = (status?: WebhookEventDiagnostic['processing_status']) => {
    if (status === 'received') return 'در انتظار پردازش';
    if (status === 'processed') return 'پردازش شد';
    if (status === 'ignored') return 'نادیده گرفته شد';
    if (status === 'failed') return 'خطای پردازش';
    return 'نامشخص';
  };
  return (
    <div className="space-y-4">
      <Alert
        showIcon
        type="info"
        message="اتصال رسمی اینستاگرام از طریق سرویس‌دهنده‌ها"
        description="می‌توانید چند اتصال از سرویس‌دهنده‌های پشتیبانی‌شده اضافه کنید. همه پیج‌های متصل‌شده به این اتصال‌ها در صندوق اینستاگرام یکجا دیده می‌شوند؛ کلید هر حساب فقط به شکل رمزنگاری‌شده در سرور نگهداری می‌شود."
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">سرویس‌دهندگان و پیج‌های متصل</div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>به‌روزرسانی</Button>
          <Button type="primary" icon={<PlusOutlined />} disabled={supportedProviders.length === 0} onClick={openCreate}>افزودن سرویس‌دهنده</Button>
        </Space>
      </div>
      {providers.length === 0 && !loading ? <Empty description="هنوز اتصال اینستاگرامی اضافه نشده است." /> : providers.map((provider) => (
        <div key={provider.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[rgba(var(--brand-500-rgb),0.10)] text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--brand-300-rgb),0.12)] dark:text-[rgb(var(--brand-200-rgb))]"><InstagramOutlined /></span><span className="font-semibold">{provider.name}</span><Tag>{provider.providerLabel || providerLabel(provider.providerKey)}</Tag><Tag color={provider.isActive ? 'green' : 'default'}>{provider.isActive ? 'فعال' : 'غیرفعال'}</Tag></div>
            <Space wrap>
              <Button size="small" icon={<LinkOutlined />} loading={connectingId === provider.id} disabled={!provider.isActive || !provider.hasApiKey} onClick={() => void connect(provider.id)}>اتصال پیج</Button>
              <Button size="small" icon={<SyncOutlined />} loading={syncingId === provider.id} disabled={!provider.isActive || !provider.hasApiKey} onClick={() => void sync(provider.id)}>همگام‌سازی پیج‌ها</Button>
              <Button size="small" loading={checkingWebhookId === provider.id} onClick={() => void checkWebhook(provider.id)}>بررسی وب‌هوک</Button>
              <Button size="small" onClick={() => openEdit(provider)}>ویرایش</Button>
              <Popconfirm title="این اتصال و پیج‌های وابسته حذف شوند؟" okText="حذف" cancelText="انصراف" onConfirm={() => void remove(provider.id)}><Button size="small" danger icon={<DeleteOutlined />}>حذف</Button></Popconfirm>
            </Space>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-2 dark:bg-white/5"><span className="text-gray-500">دامنه برای ثبت در سرویس‌دهنده: </span><span dir="ltr">{provider.domain || 'ثبت نشده'}</span><Tooltip title="کپی دامنه"><Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void copy(provider.domain, 'دامنه', message)} /></Tooltip></div>
            <div className="rounded-lg bg-slate-50 p-2 dark:bg-white/5"><span className="text-gray-500">آدرس بازگشت: </span><span dir="ltr">{provider.redirectUrl || 'ثبت نشده'}</span><Tooltip title="کپی آدرس بازگشت"><Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void copy(provider.redirectUrl, 'آدرس بازگشت', message)} /></Tooltip></div>
            <div className="rounded-lg bg-slate-50 p-2 dark:bg-white/5 md:col-span-2"><span className="text-gray-500">Webhook: </span><span dir="ltr" className="break-all">{provider.webhookUrl}</span><Tooltip title="کپی آدرس وب‌هوک"><Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void copy(provider.webhookUrl, 'آدرس وب‌هوک', message)} /></Tooltip></div>
          </div>
          {webhookDiagnostics[provider.id] || provider.lastWebhook ? <div className="mt-3 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700">
            <div className="mb-2 font-medium">وضعیت دریافت وب‌هوک</div>
            {(() => { const events = webhookDiagnostics[provider.id] || (provider.lastWebhook ? [provider.lastWebhook] : []); return events.length === 0 ? <div className="text-gray-500">هنوز رویدادی دریافت نشده است. در این حالت ثبت آدرس وب‌هوک در سرویس‌دهنده و دسترسی عمومی آن را بررسی کنید.</div> : <div className="space-y-2">{events.map((event, index) => <div key={`${event.received_at || index}-${event.event_type || ''}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-white/5"><span>نوع: <span dir="ltr">{event.event_type || 'unknown'}</span></span><Tag color={event.processing_status === 'failed' ? 'error' : event.processing_status === 'processed' ? 'success' : 'default'}>{webhookStatusLabel(event.processing_status)}</Tag><span className="text-gray-500">دریافت: {formatDateTime(event.received_at)}</span>{event.payload_summary ? <span className="w-full text-gray-500">ساختار امن داده: <span dir="ltr">{event.payload_summary.data_kind || 'unknown'}</span>{event.payload_summary.data_keys?.length ? ` · ${event.payload_summary.data_keys.join(', ')}` : ''}</span> : null}{event.error_message ? <span className="w-full text-red-600 dark:text-red-300">خطا: {event.error_message}</span> : null}</div>)}</div>; })()}
          </div> : null}
          <Table
            className="mt-3"
            size="small"
            rowKey="id"
            pagination={false}
            locale={{ emptyText: 'پیجی برای این حساب ثبت نشده است.' }}
            dataSource={provider.accounts || []}
            columns={[
              { title: 'پیج', render: (_: unknown, account: ProviderAccount) => <span className="inline-flex items-center gap-2">{account.profile_photo_url ? <Avatar size={28} src={normalizePublicAssetUrl(account.profile_photo_url) || undefined} /> : <Avatar size={28}>I</Avatar>}<span>{account.display_name || `@${account.username || 'بدون‌نام'}`}</span></span> },
              { title: 'نام کاربری', render: (_: unknown, account: ProviderAccount) => <span dir="ltr">{account.username ? `@${account.username.replace(/^@+/, '')}` : '—'}</span> },
              { title: 'وضعیت', render: (_: unknown, account: ProviderAccount) => <Tag color={account.is_active ? 'green' : 'default'}>{account.is_active ? 'فعال' : 'غیرفعال'}</Tag> },
            ]}
          />
        </div>
      ))}
      <Modal title={editing ? `فعال‌سازی یا ویرایش ${providerLabel(editing.providerKey)}` : 'افزودن اتصال اینستاگرام'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => void save()} confirmLoading={saving} okText={editing ? 'ذخیره تغییرات' : 'ایجاد آدرس وب‌هوک'} cancelText="انصراف" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="provider" label="سرویس‌دهنده" rules={[{ required: true, message: 'سرویس‌دهنده را انتخاب کنید.' }]}>
            <Select disabled={Boolean(editing)} options={supportedProviders.map((provider) => ({ value: provider.key, label: provider.label }))} />
          </Form.Item>
          <Form.Item name="name" label="نام اتصال" rules={[{ required: true, message: 'نام اتصال را وارد کنید.' }]}><Input placeholder="مثلا حساب فروش" /></Form.Item>
          {!editing ? <Alert showIcon type="warning" message="گام اول: ساخت آدرس وب‌هوک" description="ابتدا این اتصال به‌صورت غیرفعال ذخیره می‌شود تا آدرس وب‌هوک اختصاصی و امن آن ساخته شود. در گام بعد آن را در سرویس‌دهنده ثبت و اتصال را فعال می‌کنید." /> : <>
            <Alert className="mb-4" showIcon type="info" message={`گام دوم: ثبت در ${providerLabel(editing.providerKey)} و فعال‌سازی`} description="نشانی‌های زیر را فقط کپی کنید و در سرویس‌دهنده ثبت کنید. سپس کلید API را وارد کرده و وضعیت اتصال را فعال کنید." />
            <div className="mb-4 space-y-3">
              <CopyOnlyTransferLink label="دامنه ثبت‌شونده در سرویس‌دهنده" value={editing.domain || window.location.origin} message={message} />
              <CopyOnlyTransferLink label="آدرس بازگشت پس از ورود اینستاگرام" value={editing.redirectUrl || `${window.location.origin}/settings`} message={message} />
              <CopyOnlyTransferLink label="آدرس وب‌هوک" value={editing.webhookUrl} message={message} />
            </div>
            <Form.Item name="baseUrl" label={`آدرس پایهٔ API ${providerLabel(editing.providerKey)}`} rules={[{ required: providerDefinition(editing.providerKey)?.apiBaseUrlRequired === true, type: 'url', message: 'آدرس معتبر API را وارد کنید.' }]} extra="این آدرسِ فنی را از پنل یا پشتیبانی سرویس‌دهنده بگیرید؛ دامنهٔ سایت معرفی سرویس نیست.">
              <Input dir="ltr" placeholder={providerDefinition(editing.providerKey)?.apiBaseUrlPlaceholder || 'https://api.example.com'} />
            </Form.Item>
            <Form.Item name="apiKey" label={providerDefinition(editing.providerKey)?.apiKeyLabel || 'کلید API سرویس‌دهنده'} extra="اگر کلید تغییر نکرده، این فیلد را خالی بگذارید."><Input.Password autoComplete="new-password" /></Form.Item>
            <Form.Item name="isActive" label="فعال‌سازی اتصال" valuePropName="checked"><Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" /></Form.Item>
          </>}
        </Form>
      </Modal>
    </div>
  );
};

export default InstagramProviderConnectionsSection;
