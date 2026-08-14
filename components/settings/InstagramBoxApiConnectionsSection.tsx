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
  settings?: { catalog_id?: string | null; default_buttons?: Array<{ title?: string; url?: string }> } | null;
};
type Provider = {
  id: string;
  name: string;
  isActive: boolean;
  hasApiKey: boolean;
  webhookUrl: string;
  redirectUrl: string;
  domain: string;
  accounts: ProviderAccount[];
};
type CatalogOption = { id: string; title: string };

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

const InstagramBoxApiConnectionsSection: React.FC = () => {
  const { message } = App.useApp();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [settingAccount, setSettingAccount] = useState<ProviderAccount | null>(null);
  const [catalogs, setCatalogs] = useState<CatalogOption[]>([]);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [form] = Form.useForm();
  const [accountSettingsForm] = Form.useForm();

  const invoke = useCallback(async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('instagram-boxapi', { body });
    if (error) throw error;
    if (!data?.success) throw new Error(String(data?.message || 'عملیات BoxAPI ناموفق بود.'));
    return data;
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await invoke({ action: 'list' }); setProviders(Array.isArray(data.providers) ? data.providers : []); }
    catch (error) { message.error(toFaErrorMessage(error, 'بارگذاری اتصال‌های اینستاگرام ناموفق بود.')); }
    finally { setLoading(false); }
  }, [invoke, message]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void supabase.from('online_catalogs').select('id,title').eq('is_active', true).order('title').limit(100)
      .then(({ data }) => setCatalogs((data || []) as CatalogOption[]));
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({ provider: 'boxapi', name: 'BoxAPI', apiKey: '', isActive: false });
    setModalOpen(true);
  };
  const openEdit = (provider: Provider) => {
    setEditing(provider);
    form.setFieldsValue({ provider: 'boxapi', name: provider.name, apiKey: '', isActive: provider.isActive });
    setModalOpen(true);
  };
  const save = async () => {
    try {
      const value = await form.validateFields();
      setSaving(true);
      const saved = await invoke({
        action: 'save_provider',
        providerId: editing?.id,
        name: value.name,
        apiKey: value.apiKey,
        isActive: editing ? value.isActive : false,
        baseUrl: 'https://boxapi.ir',
        domain: editing?.domain || window.location.origin,
        redirectUrl: editing?.redirectUrl || `${window.location.origin}/settings`,
      });
      if (!editing && saved?.provider) {
        setEditing(saved.provider as Provider);
        form.setFieldsValue({ provider: 'boxapi', name: saved.provider.name, apiKey: '', isActive: false });
        message.success('آدرس وب‌هوک ساخته شد. آن را در BoxAPI ثبت کنید و سپس اتصال را فعال کنید.');
      } else {
        setModalOpen(false);
        message.success('اتصال BoxAPI ذخیره شد.');
      }
      await load();
    } catch (error) { message.error(toFaErrorMessage(error, 'ذخیره اتصال BoxAPI ناموفق بود.')); }
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
      if (!url) throw new Error('لینک ورود رسمی اینستاگرام از BoxAPI دریافت نشد.');
      window.open(url, '_blank', 'noopener,noreferrer');
      message.info('پس از اتصال پیج، برای دریافت وضعیت جدید روی «همگام‌سازی پیج‌ها» بزنید.');
    } catch (error) { message.error(toFaErrorMessage(error, 'دریافت لینک اتصال پیج ناموفق بود.')); }
    finally { setConnectingId(null); }
  };
  const remove = async (providerId: string) => {
    try { await invoke({ action: 'delete_provider', providerId }); message.success('اتصال و پیج‌های وابسته حذف شد.'); await load(); }
    catch (error) { message.error(toFaErrorMessage(error, 'حذف اتصال ناموفق بود.')); }
  };
  const openAccountSettings = (account: ProviderAccount) => {
    setSettingAccount(account);
    accountSettingsForm.setFieldsValue({ catalogId: account.settings?.catalog_id || undefined, buttons: account.settings?.default_buttons || [] });
    setAccountSettingsOpen(true);
  };
  const saveAccountSettings = async () => {
    if (!settingAccount) return;
    try {
      const value = await accountSettingsForm.validateFields();
      setSaving(true);
      await invoke({ action: 'save_account_config', accountId: settingAccount.id, catalogId: value.catalogId, buttons: value.buttons || [] });
      setAccountSettingsOpen(false); message.success('تنظیمات ویترین و دکمه‌های این پیج ذخیره شد.'); await load();
    } catch (error) { message.error(toFaErrorMessage(error, 'ذخیره تنظیمات پیج ناموفق بود.')); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Alert
        showIcon
        type="info"
        message="اتصال رسمی اینستاگرام از طریق BoxAPI"
        description="می‌توانید چند حساب BoxAPI اضافه کنید. همه پیج‌های متصل‌شده به این حساب‌ها در صندوق اینستاگرام یکجا دیده می‌شوند؛ کلید هر حساب فقط به شکل رمزنگاری‌شده در سرور نگهداری می‌شود."
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">ارائه‌دهندگان BoxAPI و پیج‌های متصل</div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>به‌روزرسانی</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>افزودن حساب BoxAPI</Button>
        </Space>
      </div>
      {providers.length === 0 && !loading ? <Empty description="هنوز حساب BoxAPI اضافه نشده است." /> : providers.map((provider) => (
        <div key={provider.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[rgba(var(--brand-500-rgb),0.10)] text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--brand-300-rgb),0.12)] dark:text-[rgb(var(--brand-200-rgb))]"><InstagramOutlined /></span><span className="font-semibold">{provider.name}</span><Tag color={provider.isActive ? 'green' : 'default'}>{provider.isActive ? 'فعال' : 'غیرفعال'}</Tag></div>
            <Space wrap>
              <Button size="small" icon={<LinkOutlined />} loading={connectingId === provider.id} disabled={!provider.isActive || !provider.hasApiKey} onClick={() => void connect(provider.id)}>اتصال پیج</Button>
              <Button size="small" icon={<SyncOutlined />} loading={syncingId === provider.id} disabled={!provider.isActive || !provider.hasApiKey} onClick={() => void sync(provider.id)}>همگام‌سازی پیج‌ها</Button>
              <Button size="small" onClick={() => openEdit(provider)}>ویرایش</Button>
              <Popconfirm title="این اتصال و پیج‌های وابسته حذف شوند؟" okText="حذف" cancelText="انصراف" onConfirm={() => void remove(provider.id)}><Button size="small" danger icon={<DeleteOutlined />}>حذف</Button></Popconfirm>
            </Space>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-2 dark:bg-white/5"><span className="text-gray-500">دامنه برای ثبت در BoxAPI: </span><span dir="ltr">{provider.domain || 'ثبت نشده'}</span><Tooltip title="کپی دامنه"><Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void copy(provider.domain, 'دامنه', message)} /></Tooltip></div>
            <div className="rounded-lg bg-slate-50 p-2 dark:bg-white/5"><span className="text-gray-500">آدرس بازگشت: </span><span dir="ltr">{provider.redirectUrl || 'ثبت نشده'}</span><Tooltip title="کپی آدرس بازگشت"><Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void copy(provider.redirectUrl, 'آدرس بازگشت', message)} /></Tooltip></div>
            <div className="rounded-lg bg-slate-50 p-2 dark:bg-white/5 md:col-span-2"><span className="text-gray-500">Webhook: </span><span dir="ltr" className="break-all">{provider.webhookUrl}</span><Tooltip title="کپی آدرس وب‌هوک"><Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void copy(provider.webhookUrl, 'آدرس وب‌هوک', message)} /></Tooltip></div>
          </div>
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
              { title: 'ویترین و دکمه‌ها', render: (_: unknown, account: ProviderAccount) => <Button size="small" onClick={() => openAccountSettings(account)}>تنظیمات پیج</Button> },
            ]}
          />
        </div>
      ))}
      <Modal title={editing ? 'فعال‌سازی یا ویرایش حساب BoxAPI' : 'افزودن حساب BoxAPI'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => void save()} confirmLoading={saving} okText={editing ? 'ذخیره تغییرات' : 'ایجاد آدرس وب‌هوک'} cancelText="انصراف" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="provider" label="سرویس‌دهنده" rules={[{ required: true, message: 'سرویس‌دهنده را انتخاب کنید.' }]}>
            <Select options={[{ value: 'boxapi', label: 'BoxAPI' }]} />
          </Form.Item>
          <Form.Item name="name" label="نام اتصال" rules={[{ required: true, message: 'نام اتصال را وارد کنید.' }]}><Input placeholder="مثلا حساب فروش" /></Form.Item>
          {!editing ? <Alert showIcon type="warning" message="گام اول: ساخت آدرس وب‌هوک" description="ابتدا این اتصال به‌صورت غیرفعال ذخیره می‌شود تا آدرس وب‌هوک اختصاصی و امن آن ساخته شود. در گام بعد آن را در BoxAPI ثبت و اتصال را فعال می‌کنید." /> : <>
            <Alert className="mb-4" showIcon type="info" message="گام دوم: ثبت در BoxAPI و فعال‌سازی" description="نشانی‌های زیر را فقط کپی کنید و در BoxAPI ثبت کنید. سپس کلید API را وارد کرده و وضعیت اتصال را فعال کنید." />
            <div className="mb-4 space-y-3">
              <CopyOnlyTransferLink label="دامنه ثبت‌شونده در BoxAPI" value={editing.domain || window.location.origin} message={message} />
              <CopyOnlyTransferLink label="آدرس بازگشت پس از ورود اینستاگرام" value={editing.redirectUrl || `${window.location.origin}/settings`} message={message} />
              <CopyOnlyTransferLink label="آدرس وب‌هوک" value={editing.webhookUrl} message={message} />
            </div>
            <Form.Item name="apiKey" label="کلید API BoxAPI" extra="اگر کلید تغییر نکرده، این فیلد را خالی بگذارید."><Input.Password autoComplete="new-password" /></Form.Item>
            <Form.Item name="isActive" label="فعال‌سازی اتصال" valuePropName="checked"><Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" /></Form.Item>
          </>}
        </Form>
      </Modal>
      <Modal title={`تنظیمات پیج ${settingAccount?.username ? `@${settingAccount.username}` : ''}`} open={accountSettingsOpen} onCancel={() => setAccountSettingsOpen(false)} onOk={() => void saveAccountSettings()} confirmLoading={saving} okText="ذخیره" cancelText="انصراف" destroyOnHidden>
        <Form form={accountSettingsForm} layout="vertical">
          <Form.Item name="catalogId" label="ویترین پیش‌فرض محصولات" extra="از کاتالوگ‌های آنلاین و لیست‌های قیمت موجود استفاده می‌شود."><Select allowClear placeholder="انتخاب ویترین" options={catalogs.map((catalog) => ({ value: catalog.id, label: catalog.title }))} /></Form.Item>
          <div className="mb-2 text-xs text-gray-500">دکمه‌های پیش‌فرض پیام (حداکثر ۳ دکمه)</div>
          <Form.List name="buttons">
            {(fields, { add, remove: removeButton }) => <div className="space-y-2">{fields.map((field) => <div key={field.key} className="flex gap-2"><Form.Item className="mb-0 flex-1" name={[field.name, 'title']} rules={[{ required: true, message: 'عنوان دکمه را وارد کنید.' }]}><Input placeholder="عنوان دکمه" /></Form.Item><Form.Item className="mb-0 flex-[1.4]" name={[field.name, 'url']} rules={[{ required: true, type: 'url', message: 'لینک معتبر وارد کنید.' }]}><Input dir="ltr" placeholder="https://..." /></Form.Item><Button danger type="text" onClick={() => removeButton(field.name)}>حذف</Button></div>)}{fields.length < 3 ? <Button type="dashed" block onClick={() => add()}>افزودن دکمه</Button> : null}</div>}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
};

export default InstagramBoxApiConnectionsSection;
