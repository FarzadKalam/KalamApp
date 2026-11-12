import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Form, Input, Modal, Space, Switch, Table, Tag, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { supabase, SUPABASE_URL } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import WooCommerceSyncModal from './WooCommerceSyncModal';

type WooConnection = {
  id: string;
  name: string;
  base_url: string;
  is_active: boolean;
  webhook_key: string;
  last_checked_at: string | null;
  last_check_status: string | null;
  sync_policy?: { products: string; customers: string; invoices: string };
};
type InboxOrder = {
  external_id: string;
  external_status: string | null;
  received_at: string;
  processing_status: string;
};
const functionUrl = `${SUPABASE_URL}/functions/v1/external-connectors`;

const WooCommerceConnectionsSection: React.FC<{ orgId: string | null }> = ({ orgId }) => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [connections, setConnections] = useState<WooConnection[]>([]);
  const [orders, setOrders] = useState<InboxOrder[]>([]);
  const [selected, setSelected] = useState<WooConnection | null>(null);
  const [syncConnection, setSyncConnection] = useState<WooConnection | null>(null);
  const [featureAllowed, setFeatureAllowed] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WooConnection | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const call = useCallback(async (body: Record<string, unknown>) => {
    if (!orgId) throw new Error('سازمان جاری مشخص نیست.');
    const { data, error } = await supabase.functions.invoke('external-connectors', {
      body: { ...body, orgId },
    });
    if (error) {
      let payload: { error?: string; message?: string } | null = null;
      try { payload = await error.context?.json(); } catch { /* پاسخ غیر JSON */ }
      const requestError = new Error(payload?.message || 'ارتباط با سرویس اتصال ناموفق بود.') as Error & { code?: string };
      requestError.code = payload?.error;
      throw requestError;
    }
    if (data?.error) throw new Error(String(data.message || 'عملیات اتصال ناموفق بود.'));
    return data;
  }, [orgId]);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await call({ action: 'list' });
      setConnections(data.connections || []);
      setFeatureAllowed(true);
      setLoadError(null);
    } catch (error) {
      if ((error as { code?: string })?.code === 'plan_feature_disabled') {
        setFeatureAllowed(false);
        setLoadError(null);
      } else {
        setFeatureAllowed(null);
        setLoadError(toFaErrorMessage(error, 'بارگذاری اتصال‌های فروشگاه ناموفق بود.'));
      }
    } finally {
      setLoading(false);
    }
  }, [call, orgId]);

  useEffect(() => {
    setFeatureAllowed(null);
    setLoadError(null);
    setConnections([]);
    if (orgId) void load();
  }, [load, orgId]);

  const openForm = (connection: WooConnection | null) => {
    setEditing(connection);
    form.setFieldsValue({
      name: connection?.name || '', baseUrl: connection?.base_url || '',
      consumerKey: '', consumerSecret: '', isActive: connection?.is_active ?? false,
    });
    setOpen(true);
  };

  const showWebhookInstructions = (connection: WooConnection, webhookSecret?: string) => {
    const webhookUrl = `${functionUrl}?webhook=${connection.webhook_key}`;
    modal.info({
      title: 'تنظیم وب‌هوک سفارش در ووکامرس',
      width: 650,
      content: <div className="space-y-3" dir="rtl">
        <p>برای رویدادهای «ایجاد سفارش» و «ویرایش سفارش» دو وب‌هوک با این آدرس ثبت کنید.</p>
        <Typography.Paragraph copyable={{ text: webhookUrl }} className="break-all" dir="ltr">{webhookUrl}</Typography.Paragraph>
        {webhookSecret ? <>
          <p>این رمز را برای هر دو وب‌هوک وارد کنید؛ فقط همین‌بار نمایش داده می‌شود.</p>
          <Typography.Paragraph copyable={{ text: webhookSecret }} className="break-all" dir="ltr">{webhookSecret}</Typography.Paragraph>
        </> : <p>اگر رمز قبلی را در اختیار ندارید، با «ساخت رمز تازه» آن را عوض کنید و وب‌هوک‌های فروشگاه را نیز به‌روزرسانی کنید.</p>}
      </div>,
      okText: 'متوجه شدم',
    });
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      setBusy(true);
      const data = await call({ action: 'save', id: editing?.id, ...values });
      setOpen(false);
      await load();
      if (data.webhookSecret) {
        showWebhookInstructions(data.connection, data.webhookSecret);
      } else {
        message.success('اتصال فروشگاه ذخیره شد.');
      }
    } catch (error: any) {
      if (!error?.errorFields) message.error(toFaErrorMessage(error, 'ذخیرهٔ اتصال ناموفق بود.'));
    } finally {
      setBusy(false);
    }
  };

  const rotateWebhook = async (connection: WooConnection) => {
    setBusy(true);
    try {
      const data = await call({ action: 'rotate_webhook_secret', id: connection.id });
      showWebhookInstructions(connection, data.webhookSecret);
    } catch (error) {
      message.error(toFaErrorMessage(error, 'تغییر رمز وب‌هوک ناموفق بود.'));
    } finally {
      setBusy(false);
    }
  };

  const run = async (connection: WooConnection, action: 'test' | 'sync_orders' | 'list_orders') => {
    setBusy(true);
    try {
      const data = await call({ action, id: connection.id });
      if (action === 'test') message.success('اتصال به سفارش‌های ووکامرس برقرار است.');
      if (action === 'sync_orders') {
        if (data.failed?.length) message.warning(`${data.imported} سفارش به فاکتور تبدیل شد؛ ${data.failed.length} سفارش نیاز به بررسی دارد.`);
        else message.success(`${data.imported} سفارش بررسی و در فاکتورها ثبت شد.`);
      }
      if (action === 'list_orders') {
        setSelected(connection);
        setOrders(data.orders || []);
      }
      if (action !== 'list_orders') await load();
    } catch (error) {
      message.error(toFaErrorMessage(error, 'ارتباط با فروشگاه ناموفق بود.'));
    } finally {
      setBusy(false);
    }
  };

  if (featureAllowed === false) return <Alert className="mt-6" type="info" showIcon
    message="اتصال به وردپرس و ووکامرس در پلن این سازمان فعال نیست."
    description="این ویژگی از پلن رشد در دسترس است و مدیر سازمان می‌تواند آن را از صفحه حساب بررسی کند."
    action={<Button size="small" onClick={() => void load()}>بررسی دوباره</Button>} />;

  if (loadError) return <Alert className="mt-6" type="error" showIcon
    message="وضعیت اتصال فروشگاه بارگذاری نشد" description={loadError}
    action={<Button size="small" onClick={() => void load()}>تلاش دوباره</Button>} />;

  return <Card className="mt-6" loading={loading || (featureAllowed === null && !!orgId)} title="اتصال فروشگاه‌های ووکامرس" extra={
    <Space>
      <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>بازخوانی</Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm(null)} disabled={!orgId || featureAllowed !== true}>افزودن فروشگاه</Button>
    </Space>
  }>
    <Alert showIcon type="info" className="mb-4" message="همگام‌سازی فروشگاه"
      description="کالاها و مشتریان را در پنجره همگام‌سازی بررسی کنید. سفارش‌های دریافتی به فاکتور با منبع فروش فروشگاه وردپرسی تبدیل می‌شوند؛ سفارش نامعتبر در صندوق ورودی برای بررسی باقی می‌ماند." />
    <Table<WooConnection> rowKey="id" dataSource={connections} loading={loading} pagination={false} scroll={{ x: 760 }}
      columns={[
        { title: 'فروشگاه', dataIndex: 'name' },
        { title: 'آدرس', dataIndex: 'base_url', render: (value: string) => <Typography.Text copyable={{ text: value }}>{value}</Typography.Text> },
        { title: 'وضعیت', render: (_, row) => <Tag color={row.is_active ? 'green' : 'default'}>{row.is_active ? 'فعال' : 'غیرفعال'}</Tag> },
        { title: 'عملیات', render: (_, row) => <Space wrap>
          <Button size="small" onClick={() => openForm(row)}>ویرایش</Button>
          <Button size="small" onClick={() => showWebhookInstructions(row)}>آدرس وب‌هوک</Button>
          <Button size="small" disabled={busy} onClick={() => void rotateWebhook(row)}>ساخت رمز تازه</Button>
          <Button size="small" disabled={!row.is_active || busy} onClick={() => void run(row, 'test')}>آزمون اتصال</Button>
          <Button size="small" type="primary" disabled={!row.is_active || busy} onClick={() => setSyncConnection(row)}>همگام‌سازی</Button>
          <Button size="small" onClick={() => void run(row, 'list_orders')}>صندوق ورودی</Button>
        </Space> },
      ]} />
    <Modal title={editing ? 'ویرایش فروشگاه' : 'افزودن فروشگاه'} open={open} onCancel={() => setOpen(false)}
      onOk={() => void save()} okText="ذخیره" cancelText="انصراف" confirmLoading={busy} destroyOnClose>
      <Form form={form} layout="vertical" dir="rtl">
        <Form.Item label="نام فروشگاه" name="name"><Input /></Form.Item>
        <Form.Item label="آدرس اصلی فروشگاه (HTTPS)" name="baseUrl" rules={[{ required: true, message: 'آدرس فروشگاه را وارد کنید.' }]}>
          <Input dir="ltr" placeholder="https://shop.example.com" />
        </Form.Item>
        <Form.Item label="Consumer Key" name="consumerKey" rules={editing ? [] : [{ required: true, message: 'کلید ووکامرس را وارد کنید.' }]}>
          <Input.Password dir="ltr" autoComplete="off" placeholder={editing ? 'برای نگه‌داشتن کلید فعلی خالی بگذارید' : ''} />
        </Form.Item>
        <Form.Item label="Consumer Secret" name="consumerSecret" rules={editing ? [] : [{ required: true, message: 'رمز ووکامرس را وارد کنید.' }]}>
          <Input.Password dir="ltr" autoComplete="off" placeholder={editing ? 'برای نگه‌داشتن رمز فعلی خالی بگذارید' : ''} />
        </Form.Item>
        <Form.Item label="فعال" name="isActive" valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Modal>
    <Modal title={`صندوق ورودی ${selected?.name || ''}`} open={!!selected} onCancel={() => setSelected(null)} footer={null} width={700}>
      <Alert className="mb-3" type="info" message="وضعیت پردازش سفارش‌های دریافتی" />
      <Table<InboxOrder> rowKey="external_id" dataSource={orders} size="small" pagination={{ pageSize: 10 }}
        columns={[
          { title: 'شماره سفارش فروشگاه', dataIndex: 'external_id' },
          { title: 'وضعیت فروشگاه', dataIndex: 'external_status' },
          { title: 'پردازش', dataIndex: 'processing_status', render: (value: string) => value === 'processed' ? 'ثبت‌شده در فاکتورها' : value === 'error' ? 'نیازمند بررسی' : 'در انتظار' },
          { title: 'دریافت', dataIndex: 'received_at', render: (value: string) => new Date(value).toLocaleString('fa-IR') },
        ]} />
    </Modal>
    <WooCommerceSyncModal connection={syncConnection} onClose={() => setSyncConnection(null)} call={call}
      onPolicySaved={(connection) => {
        setSyncConnection((current) => current ? { ...current, ...connection } : null);
        setConnections((current) => current.map((item) => item.id === connection.id ? { ...item, ...connection } : item));
      }} />
  </Card>;
};

export default WooCommerceConnectionsSection;
