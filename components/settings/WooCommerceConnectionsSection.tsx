import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Form, Input, Modal, Space, Switch, Table, Tag, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type WooConnection = {
  id: string;
  name: string;
  base_url: string;
  is_active: boolean;
  webhook_key: string;
  last_checked_at: string | null;
  last_check_status: string | null;
};
type InboxOrder = {
  external_id: string;
  external_status: string | null;
  received_at: string;
  processing_status: string;
};
const functionUrl = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/external-connectors`;

const WooCommerceConnectionsSection: React.FC<{ orgId: string | null }> = ({ orgId }) => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [connections, setConnections] = useState<WooConnection[]>([]);
  const [orders, setOrders] = useState<InboxOrder[]>([]);
  const [selected, setSelected] = useState<WooConnection | null>(null);
  const [editing, setEditing] = useState<WooConnection | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const call = useCallback(async (body: Record<string, unknown>) => {
    if (!orgId) throw new Error('سازمان جاری مشخص نیست.');
    const { data, error } = await supabase.functions.invoke('external-connectors', {
      body: { ...body, orgId },
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.message || 'عملیات اتصال ناموفق بود.'));
    return data;
  }, [orgId]);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await call({ action: 'list' });
      setConnections(data.connections || []);
    } catch (error) {
      message.error(toFaErrorMessage(error, 'بارگذاری اتصال‌های فروشگاه ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  }, [call, message, orgId]);

  useEffect(() => { void load(); }, [load]);

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
      if (action === 'sync_orders') message.success(`${data.received} سفارش در صندوق ورودی دریافت شد.`);
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

  return <Card className="mt-6" title="اتصال فروشگاه‌های ووکامرس" extra={
    <Space>
      <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>بازخوانی</Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm(null)} disabled={!orgId}>افزودن فروشگاه</Button>
    </Space>
  }>
    <Alert showIcon type="info" className="mb-4" message="مرحلهٔ اول اتصال"
      description="سفارش‌ها در صندوق ورودی امن دریافت می‌شوند. تبدیل آن‌ها به فاکتور و تغییر موجودی تا تعیین نگاشت و مرجع داده انجام نمی‌شود." />
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
          <Button size="small" disabled={!row.is_active || busy} onClick={() => void run(row, 'sync_orders')}>دریافت ۵۰ سفارش تازه</Button>
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
      <Alert className="mb-3" type="info" message="این سفارش‌ها هنوز به فاکتور تبدیل نشده‌اند." />
      <Table<InboxOrder> rowKey="external_id" dataSource={orders} size="small" pagination={{ pageSize: 10 }}
        columns={[
          { title: 'شماره سفارش فروشگاه', dataIndex: 'external_id' },
          { title: 'وضعیت فروشگاه', dataIndex: 'external_status' },
          { title: 'دریافت', dataIndex: 'received_at', render: (value: string) => new Date(value).toLocaleString('fa-IR') },
        ]} />
    </Modal>
  </Card>;
};

export default WooCommerceConnectionsSection;
